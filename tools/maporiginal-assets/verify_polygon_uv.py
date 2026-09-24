#!/usr/bin/env python3
"""用仓外原版 ARM64 指令生成/核验雪沙 UV 样本；不把原生二进制入库。

需要隔离 venv 的 unicorn。--native 指向 2084.1768 的 arm64-v8a/libnative-lib.so。
缺省只比较 fixtures/polygon-uv.json；更新样本须显式 --write。
这是 UV 计算核重放，不等同于完整原版游戏的截图验收。唯一 hook 是零角 sincosf；
多边形 UV、纹理尺寸取倒数和 V 翻转均执行原版机器码。
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct

import prefab_bin
from decode_ktx import resolve_by_name

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "polygon-uv.json"
NATIVE_SHA256 = "2948fb4ea6c40e7ced2dad455e5dbae2879790636e103b7aca57cfaf67bca959"
# 地图外边缘、内陆、相邻块、远端：覆盖负坐标、相位与 Float32 大坐标舍入。
BLOCKS = [[0, 0], [40, 40], [41, 40], [140, 10]]


class NativeUv:
    def __init__(self, path: Path):
        from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM, UC_HOOK_CODE
        import unicorn.arm64_const as arm

        self.arm = arm
        blob = path.read_bytes()
        if hashlib.sha256(blob).hexdigest() != NATIVE_SHA256:
            raise ValueError("原生二进制版本不符；不得用另一版本套用固定地址")
        self.u = u = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
        # 只在模拟器内装载 ELF 的 LOAD 段；0 页不映射。
        u.mem_map(0x10000, 0x1900000)
        phoff = struct.unpack_from("<Q", blob, 32)[0]
        phsize, count = struct.unpack_from("<HH", blob, 54)
        for n in range(count):
            typ, _, off, addr, _, size, _, _ = struct.unpack_from("<II6Q", blob, phoff + n * phsize)
            if typ == 1:
                skip = max(0, 0x10000 - addr)
                u.mem_write(addr + skip, blob[off + skip:off + size])
        base = 0x3000000
        u.mem_map(base, 0x1000000)
        self.poly, self.mesh, tex, underlying = [base + i * 0x1000 for i in range(4)]
        self.xyz, self.uv, self.sp = base + 0x10000, base + 0x40000, base + 0x800000
        self.write(self.poly + 0x5bc, "<5f", 1, 1, 0, 0, 0)  # scale, offset, angle
        self.write(self.mesh + 0x40, "<Q", self.uv)
        self.write(self.mesh + 0x98, "<Q", self.xyz)  # world Float32 XYZ
        self.write(tex, "<Q", 0x1608958)  # 原生纹理 vtable，+0x30 -> 0x80eb38 -> 0x822708
        self.write(tex + 0x40, "<Q", underlying)
        self.write(tex + 0x58, "B", 1)  # 原版 0x843bac 构造器的默认 flip
        self.write(underlying + 0x28, "<Ihh", 0, 256, 256)  # 有效纹理句柄和尺寸
        self.write(self.sp + 0x30, "<Q", tex)
        u.reg_write(arm.UC_ARM64_REG_TPIDR_EL0, base + 0x900000)

        def sincos(uc, _address, _size, _data):
            if uc.reg_read(arm.UC_ARM64_REG_S0) != 0:
                raise ValueError("此重放仅支持已核验的 S1 零角 UV")
            self.write(uc.reg_read(arm.UC_ARM64_REG_X0), "<f", 0)
            self.write(uc.reg_read(arm.UC_ARM64_REG_X1), "<f", 1)
            uc.reg_write(arm.UC_ARM64_REG_PC, uc.reg_read(arm.UC_ARM64_REG_LR))

        u.hook_add(UC_HOOK_CODE, sincos, begin=0x169100, end=0x169100)

    def write(self, address, fmt, *values):
        self.u.mem_write(address, struct.pack(fmt, *values))

    def run(self, points):
        if not points or len(points) > 10000:
            raise ValueError("样本顶点数越界")
        self.write(self.mesh + 0x48, "<Q", self.uv + 8 * len(points))
        self.u.mem_write(self.xyz, b"".join(struct.pack("<3f", x, y, 0) for x, y in points))
        for name, value in {"SP": self.sp, "X20": self.poly, "X21": self.mesh,
                            "X22": self.mesh, "X24": self.mesh + 0x40, "X25": self.poly + 0x5bc,
                            "S8": 0xbf000000, "S9": 0x3f000000}.items():
            self.u.reg_write(getattr(self.arm, "UC_ARM64_REG_" + name), value)
        self.u.emu_start(0x696808, 0x6968dc, count=10000000)
        if self.u.reg_read(self.arm.UC_ARM64_REG_PC) != 0x6968dc:
            raise ValueError("原生 UV 重放未正常到达循环出口")
        return list(struct.unpack("<%df" % (2 * len(points)), self.u.mem_read(self.uv, 8 * len(points))))


def generate(native: NativeUv):
    layers = {}
    for kind in ("desert", "snow"):
        paths = json.loads(Path(resolve_by_name("map/s1/cn/ground_%s_path.json" % kind)).read_bytes())
        geos = []
        for entry in paths:
            source = entry[0].removesuffix(".group") + "_polygon_group.prefab.bin"
            blob = Path(resolve_by_name(source)).read_bytes()
            root = prefab_bin.parse(blob)
            poly, = root["children"]
            for node in (root, poly):
                if node["position"] != [0, 0, 0] or node["scale"] != [1, 1, 1] or node["angle"] != [0, 0, 0]:
                    raise ValueError("重放样本不支持节点非单位变换：" + source)
            for key, value in {"simple": False, "calc_uv_in_world": True, "uv_scale": [1, 1],
                               "uv_angle": 0, "uv_offset": [0, 0]}.items():
                if poly[key] != value:
                    raise ValueError("重放样本的 UV 参数不符：" + source + " " + key)
            if not poly["texture"].endswith("underground%s.png" % (3 if kind == "desert" else 2)):
                raise ValueError("重放贴图不符：" + source)
            samples = []
            for i, j in BLOCKS:
                # 原版 10 格 block 的中心（offset=-10），不是调用本仓运行时生成期望值。
                cx, cy = (i - j) * 1500, -(i + j - 1) * 750
                samples.append(native.run([(cx + x, cy + y) for x, y in poly["vertices"]]))
            geos.append({"sourceSha256": hashlib.sha256(blob).hexdigest(), "uvs": samples})
        layers[kind] = geos
    return {"schemaVersion": 1, "nativeSha256": NATIVE_SHA256,
            "scope": "Original ARM64 UV kernel; zero-angle sincosf hook; not a full game render",
            "addresses": {"polygonUv": "0x696808..0x6968dc", "textureUv": "0x845254",
                          "textureSizeReciprocal": "0x822708"},
            "blocks": BLOCKS, "layers": layers}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    fixture = generate(NativeUv(args.native))
    # 紧凑保存 Float32 的精确数值；Node 回归直接读独立样本，不重新计算期望值。
    encoded = json.dumps(fixture, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.write:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(encoded, encoding="utf-8")
    elif json.loads(FIXTURE.read_text()) != fixture:
        raise ValueError("原生 UV 输出与入库样本不符")
    print(json.dumps({"ok": True, "polygons": sum(len(v) for v in fixture["layers"].values()),
                      "vertices": sum(len(g["uvs"][0]) // 2 for v in fixture["layers"].values() for g in v)
                                  * len(BLOCKS), "fixture": str(FIXTURE)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
