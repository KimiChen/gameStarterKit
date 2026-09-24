#!/usr/bin/env python3
"""ejoy2dx 二进制 2D prefab → JSON（字段来自同序列化器 JSON 与原包对照）。

u16 node3dVersion、i32 render_level；字段紧凑，不做字节对齐。
子节点块长不包含 u8 继承深度标记。每层按声明长度校验，拒绝截断、
不支持的节点与未消费数据，不能把强制跳到块尾当作完整解析。
"""
from __future__ import annotations

import argparse
import json
import math
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

    def need(self, n):
        if n < 0 or self.o + n > len(self.b): raise ValueError("读取越界 @%#x +%d" % (self.o, n))

    def u8(self):
        self.need(1)
        v = self.b[self.o]; self.o += 1; return v

    def i16(self):
        v = struct.unpack_from("<h", self.b, self.o)[0]; self.o += 2; return v

    def i32(self):
        v = struct.unpack_from("<i", self.b, self.o)[0]; self.o += 4; return v

    def u16(self):
        v = struct.unpack_from("<H", self.b, self.o)[0]; self.o += 2; return v

    def u32(self):
        v = struct.unpack_from("<I", self.b, self.o)[0]; self.o += 4; return v

    def f32(self):
        v = struct.unpack_from("<f", self.b, self.o)[0]; self.o += 4; return v

    def f(self, n):
        v = struct.unpack_from("<%df" % n, self.b, self.o); self.o += 4 * n; return list(v)

    def rgba(self):
        self.need(4)
        v = tuple(self.b[self.o:self.o + 4]); self.o += 4; return list(v)

    def s(self):
        n = self.u32()
        if n > len(self.b) - self.o:
            raise ValueError("字符串长度 %d 越界 @%#x" % (n, self.o - 4))
        v = self.b[self.o:self.o + n].decode("utf-8"); self.o += n; return v

    def skip(self, n):
        self.need(n)
        raw = self.b[self.o:self.o + n]; self.o += n; return raw.hex()

    def left(self):
        return len(self.b) - self.o


def read_value(r: R):
    kind = r.u8()
    if kind == 0:
        value = struct.unpack_from("<q", r.b, r.o)[0]; r.o += 8; return value
    if kind == 1: return r.f32()
    if kind == 2: return bool(r.u8())
    if kind == 3: return r.s()
    if kind == 6: return r.f(3)
    raise ValueError("未知属性类型 %s @%#x" % (kind, r.o - 1))


def read_component(r: R) -> dict:
    cls, size = r.s(), r.u32()
    end = r.o + size
    if end > len(r.b): raise ValueError("组件块越界: " + cls)
    out = {"class": cls, "version": r.u16()}
    if cls in ("comp_tag_info", "comp_prefab"):
        if cls == "comp_prefab": out["path"] = r.s()
        out["tags"] = {}
        for _ in range(r.u32()):
            key = r.s()
            out["tags"][key] = read_component(r)
    elif cls in ("tag_node_info", "prefab_diff_info"):
        out["infos"] = {}
        for _ in range(r.u32()):
            key = r.s()
            out["infos"][key] = read_value(r)
    elif cls == "comp_timeline":
        resource_class = r.s()
        resource_size = r.u32()
        resource_end = r.o + resource_size
        if resource_class != "timeline_res": raise ValueError(resource_class)
        out["path"] = r.s()
        if r.o != resource_end: raise ValueError("timeline_res 残留")
        out["offsetTime"] = r.f32()
        out["loopTimes"] = r.i32()
        out["speed"] = r.f32()
    else:
        raise ValueError("未支持的组件 " + cls)
    if r.o != end: raise ValueError("组件 %s 残留 %d B" % (cls, end - r.o))
    return out


def read_node(r: R, child: bool = False) -> dict:
    cls = r.s()
    size = r.u32()
    end = r.o + size + int(child)
    if end > len(r.b): raise ValueError("节点块越界: " + cls)
    node = {"class": cls}
    try:
        depth = {"node_2d": 1, "sprite_2d": 3, "polygon_2d": 3, "frame_sprite_2d": 4}.get(cls)
        if depth is None: raise ValueError("不支持的节点类型 " + cls)
        if child and r.u8() != depth: raise ValueError("继承深度不符")
        boundaries = []
        for _ in range(depth):
            length = r.u32()
            boundaries.append(r.o + length)
        base_end = boundaries[-1]
        if not all(r.o <= bound <= end for bound in boundaries): raise ValueError("基类块越界")
        node["node3dVersion"] = r.u16()
        node["tag"] = r.s()
        node["render_level"] = r.i32()
        node["name"] = r.s()
        node["components"] = [read_component(r) for _ in range(r.u32())]
        if any(c["class"] == "comp_prefab" for c in node["components"]):
            node["reference_tail"] = r.skip(end - r.o)
            if node["reference_tail"] != "00" * 8: raise ValueError("未知引用节点尾")
            return node
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
        nkids = r.u32() if r.o < base_end else node["poly_block_size"]
        node["children"] = []
        for _ in range(nkids):
            node["children"].append(read_node(r, child=True))
        if r.o != base_end: raise ValueError("node3d 块边界不符 %s" % (base_end-r.o))
        if cls in (*DRAWABLE, "frame_sprite_2d"):
            read_drawable_tail(r, node)
        elif cls == "node_2d":
            read_node2d_tail(r, node)
        else:
            raise ValueError("未实现节点类型 " + cls)
        if r.o != end:
            raise ValueError("节点 %s 残留 %d B" % (cls, end - r.o))
    except Exception as e:
        raise ValueError("%s/%s @%#x: %s" % (cls, node.get("name", "?"), r.o, e)) from e
    return node


def read_node2d_tail(r: R, node: dict) -> None:
    node["node2dVersion"] = r.u16()
    node["size"] = r.f(2)
    node["mirror_x"] = bool(r.u8())
    node["mirror_y"] = bool(r.u8())
    node["pivot"] = r.f(2)
    node["skew"] = r.f(2)
    node["child_to_pivot"] = bool(r.u8())


def read_drawable_tail(r: R, node: dict) -> None:
    """可绘制节点（`sprite_2d` / `polygon_2d`）的尾块。

    ⚠ 布局（逐字节实证）：
        [u16][2f size][u16][2f pivot][15 B 杂项标志]
        [str "material"][u32 v=4][u32 0][u16 0]
          ★ polygon_2d 在这里多一段**几何**：
            [u32 nv][2f × nv 顶点][u32 ni][u16 × ni 索引]
            [u32 n2][u16 × n2 第二组][u32 nuv][2f × nuv UV][u32 nc][u32 × nc 顶点色]
            [3B has_v_color/simple/calc_uv_in_world][2f uv_scale][f uv_angle][2f uv_offset]
        [str 贴图路径][u16][2f 贴图尺寸][u16][2f 贴图锚点][9 B]
    UV 字段名由原版 ARM64 序列化器 0x694bd8..0x694c90 核验（MAPORIGINAL-2D §1.8）。
    """
    read_node2d_tail(r, node)
    node["graphic2dVersion"] = r.u16()
    node["depthWrite"] = bool(r.u8())
    node["depthTest"] = bool(r.u8())
    node["alphaTest"] = bool(r.u8())
    node["alphaRef"] = r.u8()
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
        node["has_v_color"] = bool(r.u8())
        node["simple"] = bool(r.u8())
        node["calc_uv_in_world"] = bool(r.u8())
        node["uv_scale"] = r.f(2)
        node["uv_angle"] = r.f32()
        node["uv_offset"] = r.f(2)
    node["texture"] = r.s()
    if node["class"] == "frame_sprite_2d":
        node["frameVersion"] = r.u16()
        node["frameStart"] = r.i32()
        node["frameDuration"] = r.f32()
        node["frameLoops"] = r.i32()
        node["frames"] = [r.s() for _ in range(r.u32())]


def parse(blob: bytes) -> dict:
    r = R(blob)
    root = read_node(r)
    if r.left(): raise ValueError("prefab 尾部残留 %d B" % r.left())
    root["_bytes_left"] = 0
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
