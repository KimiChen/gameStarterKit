#!/usr/bin/env python3
"""ejoy2dx ELP 资源名哈希（namehash）—— 纯标准库，⛔ 无外部依赖。

    namehash = SipHash-2-4(key = 16 字节全零, 去掉 "asset/" 前缀的资源路径)

来历（2026-09-22 逆向实测，证据见 README §1）：
  libnative-lib.so(arm64) 0xb0fd18 是「按路径查 ELP 条目」：
      strlen(path) -> func_0xb10860(out, path, len, &栈上 16 字节全零 key)
      -> 在 (end-begin)/24 个 24 字节条目里查
  0xb10860 反编译即标准 SipHash-2-4：2 轮压缩 / 4 轮收尾、v2 ^= 0xff、返回 v0^v1^v2^v3。

⚠ 两条非显然的坑：
  ① 喂进去的是**去掉 `asset/` 前缀**的路径。`ltask_env.get_res_path` 会补 `asset/`，
     配置里写的 `map/s1/cn/res.bytes` 才是哈希的输入。
  ② VFS 里赛季目录名是**小写**（`map/s1/...`），而 `map_path_config.lua` 里写的是大写 `S1`。
  ③ 材质/prefab 里引用的是 `.tga` / `.png` 源名，包里是构建期转出的 `.ktx`
     ⇒ 反查时要换扩展名再试（全量命中的 KTX 绝大多数由此而来）。

⛔ luac 对不上：包内路径 ≠ 其 chunk source 名，`pathmap_verified.json` 不能当 oracle 用。
"""
from __future__ import annotations

import struct

_M = (1 << 64) - 1


def _rol(x: int, b: int) -> int:
    return ((x << b) | (x >> (64 - b))) & _M


def siphash24(data: bytes, k0: int = 0, k1: int = 0) -> int:
    """标准 SipHash-2-4，返回 u64。"""
    v0 = k0 ^ 0x736F6D6570736575
    v1 = k1 ^ 0x646F72616E646F6D
    v2 = k0 ^ 0x6C7967656E657261
    v3 = k1 ^ 0x7465646279746573

    def rnd() -> None:
        nonlocal v0, v1, v2, v3
        v0 = (v0 + v1) & _M
        v1 = _rol(v1, 13)
        v1 ^= v0
        v0 = _rol(v0, 32)
        v2 = (v2 + v3) & _M
        v3 = _rol(v3, 16)
        v3 ^= v2
        v0 = (v0 + v3) & _M
        v3 = _rol(v3, 21)
        v3 ^= v0
        v2 = (v2 + v1) & _M
        v1 = _rol(v1, 17)
        v1 ^= v2
        v2 = _rol(v2, 32)

    n = len(data) // 8 * 8
    for i in range(0, n, 8):
        m = struct.unpack_from("<Q", data, i)[0]
        v3 ^= m
        rnd()
        rnd()
        v0 ^= m
    tail = (len(data) & 0xFF) << 56
    for i, c in enumerate(data[n:]):
        tail |= c << (8 * i)
    v3 ^= tail
    rnd()
    rnd()
    v0 ^= tail
    v2 ^= 0xFF
    rnd()
    rnd()
    rnd()
    rnd()
    return v0 ^ v1 ^ v2 ^ v3


def strip_asset(path: str) -> str:
    """去掉 VFS 的 `asset/` 前缀；已经是相对形态就原样返回。"""
    return path[6:] if path.startswith("asset/") else path


def namehash(path: str) -> int:
    """资源路径 -> ELP namehash（u64）。path 可带或不带 `asset/` 前缀。"""
    return siphash24(strip_asset(path).encode("utf-8"))


def namehash_hex(path: str) -> str:
    """磁盘上 elp-unpacked 的文件名用的就是这个 16 位小写 hex。"""
    return "%016x" % namehash(path)


# ── 自检向量 ──────────────────────────────────────────────────────────────
# 前两条是 SipHash 官方向量（key=000102..0f）；后三条是本工程实测的真实条目，
# 逐条对应 elp-unpacked 里确实存在的文件（README §1 有容器/大小）。
_OFFICIAL_KEY = bytes(range(16))  # SipHash 参考实现的测试 key
_SELFTEST = [
    ("official-empty", b"", _OFFICIAL_KEY, 0x726FDB47DD0E0E31),
    ("official-1byte", bytes(range(1)), _OFFICIAL_KEY, 0x74F839C593DC67FD),
]
_SELFTEST_PATHS = [
    ("map/s1/cn/res.bytes", "cdf32ea1abb191ed"),
    ("map/s1/cn/logic_background.bytes", "78f6c3e7670103eb"),
    ("fairy/atlas_3d/activity.xml", "102fa177732bc9fa"),
]


def selftest() -> int:
    bad = 0
    for name, data, key, want in _SELFTEST:
        k0, k1 = struct.unpack("<QQ", key)  # ⚠ key 是字节串，按小端拆两个 u64
        got = siphash24(data, k0, k1)
        ok = got == want
        bad += 0 if ok else 1
        print("  %-16s %016x %s" % (name, got, "✓" if ok else "✗ 期望 %016x" % want))
    for p, want in _SELFTEST_PATHS:
        got = namehash_hex(p)
        ok = got == want
        bad += 0 if ok else 1
        print("  %-34s %s %s" % (p, got, "✓" if ok else "✗ 期望 %s" % want))
    print("自检：%s" % ("全绿" if bad == 0 else "%d 条失败" % bad))
    return bad


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] != "--selftest":
        for a in sys.argv[1:]:
            print("%s  %s" % (namehash_hex(a), a))
        raise SystemExit(0)
    raise SystemExit(1 if selftest() else 0)
