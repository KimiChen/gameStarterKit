#!/usr/bin/env python3
"""ejoy2dx 二进制 prefab（`<资源路径>.prefab.bin`）解析器 → JSON。

    python3 prefab_bin.py scene/ground/desert/10_1_polygon_group.prefab.bin
    python3 prefab_bin.py --scan scene/ground/          # 批量解并统计成功率

★ 格式是怎么定下来的：包里有 155 个**文本（JSON）形态**的 prefab（`*_easset.prefab` 等），
  它们是**同一个序列化器的文本模式输出** ⇒ 字段顺序逐项照抄即可，⛔ 不用猜。
  二进制侧再用同尺寸对照组（`mountain2m_x_01` vs `_x_02`，502 B 对 502 B）差分定位变量字段。

⚠ **字节紧凑、⛔ 不按 4 字节对齐**：`high_z/low_z/render_level` 是 i16、五个继承开关是 u8，
  所以 f32 常常落在非 4 倍偏移上。按 4 对齐去读会满屏 denormal。
⚠ 字符串 = u32 LE 长度 + ASCII（空串就是长度 0，⛔ 没有终止符）。

节点通用块（已逐字节验证）：
    [str class][类特有前缀][u32 node3dVersion][str tag][i16 render_level][str name]
    [u32 components_size][component…]
    [3f position][3f angle][3f scale][4B color][4B add_color]
    [i16 high_z][i16 low_z][u8 faceToCamera][u8 ignoreParentFTC]
    [u8 inheritColor][u8 inheritAlpha][u8 inheritBlend]
    [u32 blendMode][i16 prefab_type][u32 prefab_id]
    [str render_layer][u8 polygonOffset][u32 poly_block_size][u32 children_size][child…]
⚠ 类特有前缀长度按类分：`node_2d` 8 B（两个 u32 尺寸）、可绘制类（`sprite_2d`/`polygon_2d`）17 B
  （u32 + u8 + 3×u32）。⛔ 别写死成同一个数。
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# 类特有前缀（class 字符串之后、node3dVersion 之前）的字节数
DRAWABLE = ("sprite_2d", "polygon_2d")


class R:
    """字节游标。⚠ 全部小端，⛔ 不做任何对齐。"""

    def __init__(self, b: bytes, o: int = 0):
        self.b, self.o = b, o

    def u8(self):
        v = self.b[self.o]; self.o += 1; return v

    def i16(self):
        v = struct.unpack_from("<h", self.b, self.o)[0]; self.o += 2; return v

    def u16(self):
        v = struct.unpack_from("<H", self.b, self.o)[0]; self.o += 2; return v

    def u32(self):
        v = struct.unpack_from("<I", self.b, self.o)[0]; self.o += 4; return v

    def f32(self):
        v = struct.unpack_from("<f", self.b, self.o)[0]; self.o += 4; return v

    def f(self, n):
        v = struct.unpack_from("<%df" % n, self.b, self.o); self.o += 4 * n; return list(v)

    def rgba(self):
        v = tuple(self.b[self.o:self.o + 4]); self.o += 4; return list(v)

    def s(self):
        n = self.u32()
        if n > len(self.b) - self.o:
            raise ValueError("字符串长度 %d 越界 @%#x" % (n, self.o - 4))
        v = self.b[self.o:self.o + n].decode("utf-8", "replace"); self.o += n; return v

    def skip(self, n):
        raw = self.b[self.o:self.o + n]; self.o += n; return raw.hex()

    def left(self):
        return len(self.b) - self.o


def read_component(r: R) -> dict:
    """组件 = `[str class][u32 blockSize][u16 version][…]`。

    ★ `blockSize` 是「本字段之后还有多少字节」⇒ **未知组件可以整块跳过**，
      ⛔ 不必把每种组件都实现出来（`comp_timeline` / `comp_animator` 等一律跳）。
    """
    cls = r.s()
    size = r.u32()
    end = r.o + size
    out = {"class": cls, "version": r.u16()}
    if cls == "comp_tag_info":
        out["tags"] = {}
        for _ in range(r.u32()):
            out["tags"][r.s()] = read_component(r)          # tag_node_info
    elif cls == "tag_node_info":
        out["infos"] = {}
        for _ in range(r.u32()):
            k = r.s()
            r.u8()                                          # ⚠ 值类型标签（实测恒 0 = int64）
            out["infos"][k] = struct.unpack_from("<q", r.b, r.o)[0]
            r.o += 8
    else:
        out["_skipped"] = size
    r.o = end                                               # ⚠ 一律按 blockSize 对齐，⛔ 不信任逐字段推进
    return out


def _plausible_head(b: bytes, o: int) -> bool:
    """这个偏移能不能读出 [u32 version][str tag][i16 render_level][str name][u32 comps]。"""
    try:
        if struct.unpack_from("<I", b, o)[0] != 1:          # node3dVersion 实测恒 1
            return False
        o += 4
        n = struct.unpack_from("<I", b, o)[0]
        if n > 32 or o + 4 + n > len(b):
            return False
        tag = b[o + 4:o + 4 + n]
        if any(c < 32 or c >= 127 for c in tag):
            return False
        o += 4 + n
        lv = struct.unpack_from("<h", b, o)[0]
        if not -16 <= lv <= 256:
            return False
        o += 2
        n = struct.unpack_from("<I", b, o)[0]
        if n > 96 or o + 4 + n > len(b):
            return False
        nm = b[o + 4:o + 4 + n]
        if any(c < 32 or c >= 127 for c in nm):
            return False
        o += 4 + n
        return struct.unpack_from("<I", b, o)[0] <= 16      # components_size
    except struct.error:
        return False


def _align_to_class(r: R) -> None:
    """把游标对到下一个「合法 class 字符串」的起点。

    ⚠ 实测个别节点在 `children_size` 与首个子节点之间多 1~3 个字节（含义未定）。
    ⛔ 别当成解析错误：不对齐的话读出来的 class 会是 `"\x00polygon_2d…"` 这种带前导空字节的串。
    """
    for d in range(0, 4):
        o = r.o + d
        try:
            n = struct.unpack_from("<I", r.b, o)[0]
        except struct.error:
            return
        if 1 <= n <= 32 and o + 4 + n <= len(r.b):
            t = r.b[o + 4:o + 4 + n]
            if all(48 <= c < 123 for c in t) and (b"_2d" in t or b"_3d" in t or t.endswith(b"sprite")):
                r.o = o
                return


def read_node(r: R) -> dict:
    """节点。

    ★ **class 字符串之后的第一个 u32 就是块长**（本字段之后属于该节点的字节数）——
      实测逐个吻合：下一个兄弟节点就从 `块起点 + 块长` 开始。
      有了块长就能**出错重同步**：某个子树解析失败也不会带歪兄弟。
    ⚠ 文件末尾那 ~30 B 是**根节点的尾巴、整个文件只有一份**，
      ⛔ 别挂到每个可绘制节点上（那样会吃掉下一个兄弟的头，实测 26% 的节点因此错位）。
    ⚠ class 与 `node3dVersion` 之间还有一段类特有前缀，长度按类不同
      （`node_2d` 8 B、可绘制类 17 B，另有变体）⇒ ⛔ 别写死，用 `_plausible_head` 探。
    """
    cls = r.s()
    size = r.u32()
    end = r.o + size
    node = {"class": cls}
    try:
        base = r.o
        for skip in range(0, 33):
            if _plausible_head(r.b, base + skip):
                break
        else:
            raise ValueError("找不到 %r 的通用块入口 @%#x" % (cls, base))
        node["_pre"] = r.skip(skip)
        node["node3dVersion"] = r.u32()
        node["tag"] = r.s()
        node["render_level"] = r.i16()
        node["name"] = r.s()
        node["components"] = [read_component(r) for _ in range(r.u32())]
        node["position"] = r.f(3)
        node["angle"] = r.f(3)
        node["scale"] = r.f(3)
        node["color"] = r.rgba()
        node["add_color"] = r.rgba()
        node["high_z"] = r.i16()
        node["low_z"] = r.i16()
        node["faceToCamera"] = bool(r.u8())
        node["ignore_parent_face_to_camera"] = bool(r.u8())
        node["inheritColor"] = bool(r.u8())
        node["inheritAlpha"] = bool(r.u8())
        node["inheritBlend"] = bool(r.u8())
        node["blendMode"] = r.u32()
        node["prefab_type"] = r.i16()
        node["prefab_id"] = r.u32()
        node["render_layer"] = r.s()
        node["polygonOffset"] = bool(r.u8())
        node["poly_block_size"] = r.u32()
        nkids = r.u32()
        node["children"] = []
        for _ in range(nkids):
            _align_to_class(r)                              # ⚠ 个别节点子项前多 1~3 个字节
            node["children"].append(read_node(r))
        if cls in DRAWABLE:
            read_drawable_tail(r, node)
    except Exception as e:                                  # noqa: BLE001
        # ⚠ 不让局部失败污染整棵树：记下来，用块长跳到边界继续。
        node["_error"] = str(e)[:120]
    r.o = end                                               # ★ 按块长重同步
    return node


def read_drawable_tail(r: R, node: dict) -> None:
    """可绘制节点（`sprite_2d` / `polygon_2d`）的尾块。

    ⚠ 布局（逐字节实证）：
        [u16][2f size][u16][2f pivot][15 B 杂项标志]
        [str "material"][u32 v=4][u32 0][u16 0]
          ★ polygon_2d 在这里多一段**几何**：
            [u32 nv][2f × nv 顶点][u32 ni][u16 × ni 索引]
            [u32 n2][u16 × n2 第二组][u32 nuv][2f × nuv UV][u32 nc][u32 × nc 顶点色]
            [23 B：3 B + 2f uvScale + 12 B 零]
        [str 贴图路径][u16][2f 贴图尺寸][u16][2f 贴图锚点][9 B]
    ⚠ UV 实测**全 0**，靠末尾的 uvScale(1,1) 按世界坐标平铺 —— ⛔ 别当成缺数据。
    """
    r.u16()
    node["size"] = r.f(2)
    r.u16()
    node["pivot"] = r.f(2)
    r.skip(15)
    mat = r.s()
    if mat != "material":
        raise ValueError("期望 material，得到 %r @%#x" % (mat, r.o))
    node["material_version"] = r.u32()
    r.u32(); r.u16()
    if node["class"] == "polygon_2d":
        nv = r.u32()
        node["vertices"] = [r.f(2) for _ in range(nv)]
        node["indices"] = [r.u16() for _ in range(r.u32())]
        node["indices2"] = [r.u16() for _ in range(r.u32())]
        node["uvs"] = [r.f(2) for _ in range(r.u32())]
        node["vcolors"] = [r.u32() for _ in range(r.u32())]
        r.skip(3)
        node["uv_scale"] = r.f(2)
        r.skip(12)
    node["texture"] = r.s()


def parse(blob: bytes) -> dict:
    r = R(blob)
    root = read_node(r)
    # 根节点尾：[u16][2f 尺寸][u16][2f 锚点][余下]
    if r.left() >= 20:
        r.u16(); root["root_size"] = r.f(2)
        r.u16(); root["root_pivot"] = r.f(2)
        r.skip(r.left())
    root["_bytes_left"] = r.left()
    return root


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", help="资源路径（走 name_map）或磁盘路径")
    ap.add_argument("--scan", help="批量解这个前缀下的 *.prefab.bin 并统计")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    from decode_ktx import resolve_by_name

    def load(q):
        return open(q if os.path.exists(q) else resolve_by_name(q), "rb").read()

    if a.scan:
        nm = json.load(open(os.path.join(HERE, "out", "name_map.json"), encoding="utf-8"))
        keys = sorted(k for k in nm if k.startswith(a.scan) and k.endswith(".prefab.bin"))
        if a.limit:
            keys = keys[:a.limit]
        ok, bad, leftover = 0, [], 0
        for k in keys:
            try:
                d = parse(load(k))
            except Exception as e:                      # noqa: BLE001
                bad.append((k, str(e)[:90])); continue
            ok += 1
            leftover += d["_bytes_left"]
        print("解析 %d 个：成功 %d，失败 %d；成功件的剩余字节合计 %d" % (len(keys), ok, len(bad), leftover))
        for k, e in bad[:12]:
            print("   ✘ %-58s %s" % (k[-56:], e))
        return 1 if bad else 0

    d = parse(load(a.path))
    print(json.dumps(d, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
