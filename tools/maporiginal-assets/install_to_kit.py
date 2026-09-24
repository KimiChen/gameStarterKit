#!/usr/bin/env python3
"""把目检通过的内容包装进 kit 与 Cocos 运行时镜像，并确定性铸 `.meta`。

    /tmp/maporiginal-venv/bin/python install_to_kit.py [--map s1] [--check]

`.meta` 的 uuid 由「`mapOriginal::<相对路径>`」的 sha1 派生 ⇒ 重跑不漂移；落盘前全树查重
（uuid 撞车会静默弄坏场景/预制体引用）。

⚠ 与 sgzzmap 的**唯一形态差别**：`terrain.bytes`（16 类显示层）**要进 Cocos**，
   因为它塞不进 shared 模块（一阶熵 2.95 bit/格，varint-RLE 反而胀到 125.6%），
   客户端用 BufferAsset 加载。判据见 `apps/kits/mapOriginal/README.md` 的「地形数据：**两层**」一节。
   4 类通行层走 shared TS，`terrain.pass.bytes` 只留 kit 数据目录供机检比对。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import zlib
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

# out/pack/<id>/ 里的名字 -> 出品名。KIT_ONLY 的不进 Cocos 运行时镜像。
FILES = {
    "overview.png": "overview.png", "overview.info.json": "overview.info.json",
    "mapo-sprite.effect": "mapo-sprite.effect", "mapo-river.effect": "mapo-river.effect",
    "river-mask.png": "river-mask.png", "river-normal.png": "river-normal.png", "grid-line.png": "grid-line.png",
    "surface.info.json": "surface.info.json", "choose.info.json": "choose.info.json",
    "terrain.bytes": "terrain.bytes",              # ⚠ 进两份：权威 + 运行时（BufferAsset）
    "terrain.pass.bytes": "terrain.pass.bytes",
    "terrain.info.json": "terrain.info.json",
    # ★ 地表底：一张 256² POT 底纹，整数次 GL_REPEAT 铺满一块 10×10 格（M2-B1）。
    #   ⛔ 早先这里是 atlas-lod{0,1,2}「8 粗类 × 4 变体的逐格菱形贴片」—— 本仓自创，已删。
    "ground-base.png": "ground-base.png", "ground.info.json": "ground.info.json",
    # ★ snow / desert 的 block 级地貌带（叠在地表底之上，§1.3）
    "desert-base.png": "desert-base.png", "desert-geo.bin": "desert-geo.bin",
    "desert.bin": "desert.bin",
    "snow-base.png": "snow-base.png", "snow-geo.bin": "snow-geo.bin", "snow.bin": "snow.bin",
    "blocks.info.json": "blocks.info.json",
    # ★ cell 级地貌带（N1 选件判据，原版 check_ground_type 同一数据链）：
    #   权威字节只留 kit 数据目录供机检比对；客户端消费的是 shared 的 bands.data.ts（RLE）
    "bands.bytes": "bands.bytes", "bands.info.json": "bands.info.json",
    # ★ `_top_group` 手摆细节：每族一张图集 + 一份摆放库
    "river-top-atlas.png": "river-top-atlas.png", "river-tops.bin": "river-tops.bin",
    "desert-top-atlas.png": "desert-top-atlas.png", "desert-tops.bin": "desert-tops.bin",
    "snow-top-atlas.png": "snow-top-atlas.png", "snow-tops.bin": "snow-tops.bin",
    "top-atlas.info.json": "top-atlas.info.json",
    # ★ 道路层：路片图集 + 摆放表
    "road-atlas.png": "road-atlas.png", "roads.bin": "roads.bin",
    "roads.info.json": "roads.info.json", "minimap.info.json": "minimap.info.json",
    "minimap.png": "minimap.png", "minimap-mask.png": "minimap-mask.png",
    "decor-atlas.png": "decor-atlas.png", "decor-atlas.info.json": "decor-atlas.info.json",
    # ★ 多格地形的区域件：图集 + 摆放表（regions.bin 也要进运行时，走 BufferAsset）
    "region-atlas.png": "region-atlas.png", "region-atlas.info.json": "region-atlas.info.json",
    "regions.bin": "regions.bin", "regions.info.json": "regions.info.json",
    # ★ 河流层：填充色图 + 几何库 + 摆放表（三件缺一则整层不建）
    "river-fill.png": "river-fill.png", "river-geo.bin": "river-geo.bin",
    "rivers.bin": "rivers.bin", "rivers.info.json": "rivers.info.json",
    "river-geo.index.json": "river-geo.index.json",
    # ★ 城址件：15 个原版件的图集 + 件库/摆位（§5）。⚠ 两件缺一则城址层整层不建。
    "city-atlas.png": "city-atlas.png", "cities.bin": "cities.bin",
    "cities.info.json": "cities.info.json",
    # ★ 普通点选：city_shape.GRID.click_res=2080，FairyGUI XML 的八片图集
    "choose.png": "choose.png",
    "labels.json": "labels.json",
}
KIT_ONLY = {"overview.info.json", "surface.info.json", "choose.info.json","terrain.pass.bytes", "terrain.info.json", "labels.json", "regions.info.json",
            "rivers.info.json", "river-geo.index.json", "ground.info.json",
            "blocks.info.json", "bands.bytes", "bands.info.json", "top-atlas.info.json",
            "roads.info.json", "minimap.info.json", "cities.info.json",
            "minimap-mask.png", "decor-atlas.info.json", "region-atlas.info.json"}
# ⚠ 运行时镜像里改用 Cocos 的规范缓冲扩展名 `.bin`：
#   早先镜像叫 terrain.bytes 而 .meta 的 files 写成 [".bin"]，Creator 据此导入出
#   `_native: ".bin"`，而库里的原生文件是 .bytes ⇒ 运行时报「the native asset is missing」。
#   Creator 按 uuid + 内容哈希缓存，改 .meta 不会让它重导 ⇒ 换路径（连带换掉确定性 uuid）
#   才能拿到一次干净的导入。权威产物仍叫 terrain.bytes，⛔ 不改。
MIRROR_RENAME = {"terrain.bytes": "terrain.bin"}


def uuid_for(rel: str) -> str:
    h = hashlib.sha1(("mapOriginal::" + rel).encode()).hexdigest()
    return "%s-%s-4%s-a%s-%s" % (h[0:8], h[8:12], h[13:16], h[17:20], h[20:32])


# ★ Creator 3.8 给图片的 `texture` 子资源用的是**固定 id** `6c48a`（仓里每一张已导入的
#   图片 .meta 都是它）。⛔ 别再自己 sha1 出一个：两套 id 并存时同一张 PNG 会出现两个
#   texture 子资源、动态加载 URL 相同（`…/<图名>/texture`），Creator 每次导入都报 warn，
#   运行时按 URL 取图还可能拿错。实测踩过一次（decor-atlas 的 `b2b1d` vs `6c48a`）。
CREATOR_TEXTURE_SUB_ID = "6c48a"


def dir_meta_for(rel: str) -> dict:
    return {"ver": "1.2.0", "importer": "directory", "imported": True, "uuid": uuid_for(rel),
            "files": [], "subMetas": {}, "userData": {}}


def png_has_alpha(data: bytes) -> bool:
    """PNG 的 IHDR 色彩类型里有没有 alpha 通道（4=灰+α、6=RGBA）。

    ⚠ Creator 会把它写进 `userData.hasAlpha`，**按真实图算**（缩略图蒙版是灰度图 ⇒ false）。
    ⛔ 别硬编码成 true：铸出来的与 Creator 导入出来的不一致，首次打开就会被改写一次。
    """
    if len(data) < 26 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return True
    return data[25] in (4, 6)


def meta_for(rel: str, name: str, data: bytes = b"") -> dict:
    uuid = uuid_for(rel)
    if name.endswith(".png"):
        # ⚠ 形状**逐字对齐 Creator 自己导入出来的 .meta**（含 wrapMode=repeat 这类默认值）：
        #   铸出来的与导入出来的一致 ⇒ Creator 首次打开时不会改写、也不会多出一个子资源。
        sid = CREATOR_TEXTURE_SUB_ID
        return {
            "ver": "1.0.27", "importer": "image", "imported": True, "uuid": uuid,
            "files": [".json", ".png"],
            "subMetas": {sid: {
                "importer": "texture", "uuid": "%s@%s" % (uuid, sid),
                "displayName": name[:-4], "id": sid, "name": "texture",
                "userData": {"wrapModeS": "repeat", "wrapModeT": "repeat",
                             "minfilter": "linear", "magfilter": "linear", "mipfilter": "none",
                             "anisotropy": 0, "isUuid": True,
                             "imageUuidOrDatabaseUri": uuid, "visible": False},
                "ver": "1.0.22", "imported": True, "files": [".json"], "subMetas": {}}},
            "userData": {"type": "texture", "fixAlphaTransparencyArtifacts": False,
                         "hasAlpha": png_has_alpha(data), "redirect": "%s@%s" % (uuid, sid)},
        }
    if name.endswith(".effect"):
        return {"ver": "1.7.1", "importer": "effect", "imported": True, "uuid": uuid,
                "files": [".json"], "subMetas": {}, "userData": {}}
    if name.endswith(".json"):
        return {"ver": "2.0.1", "importer": "json", "imported": True, "uuid": uuid,
                "files": [".json"], "subMetas": {}, "userData": {}}
    # ⚠ 扩展名段要与真实文件一致（Creator 导入 terrain.bytes 后把 ".bin" 纠成 ".bytes"）
    ext = "." + name.rsplit(".", 1)[-1]
    return {"ver": "1.0.3", "importer": "buffer", "imported": True, "uuid": uuid,
            "files": [ext, ".json"], "subMetas": {}, "userData": {}}


# 一处定义安装布局、运行时请求与组依赖。逻辑文件名不随重排改变。
GROUPS = {
    "overview": ([], ["mapo-sprite.effect", "overview.png", "minimap.png"]),
    "geography": (["overview"], ["ground-base.png", "region-atlas.png", "road-atlas.png", "river-fill.png",
        "regions.bin", "roads.bin", "river-geo.bin", "rivers.bin"]
        + [f"{kind}{suffix}" for kind in ("desert", "snow") for suffix in ("-base.png", "-geo.bin", ".bin")]
        + [f"{kind}{suffix}" for kind in ("river", "desert", "snow") for suffix in ("-top-atlas.png", "-tops.bin")]),
    "selection": (["overview"], ["terrain.bytes"]),
    "resources": (["overview", "selection", "geography"], ["decor-atlas.png"]),
    "cities": (["overview"], ["city-atlas.png", "cities.bin"]),
    "water": (["overview"], ["mapo-river.effect", "river-mask.png", "river-normal.png"]),
    "grid": (["overview"], ["grid-line.png"]),
    "choose": (["overview"], ["choose.png"]),
}
GENERATED_LAYOUTS = ("atlas-layout.types.ts", "decor.data.ts", "region.data.ts", "tops.data.ts", "cities.data.ts",
                     "roads.data.ts", "river.data.ts", "choose.data.ts", "top-scenes.data.ts")


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def make_manifest(map_id, payloads, bindings):
    """内容寻址防止旧 Creator 缓存命中新布局；不拿 PNG hash 检查 ASTC/ETC。"""
    manifest = {"schemaVersion": 1, "mapId": map_id, "bundle": f"kit-mapOriginal-{map_id}",
                "assets": {}, "groups": {}, "bindings": bindings}
    for group, (dependencies, names) in GROUPS.items():
        for name in names:
            data = payloads[name]
            sha = hashlib.sha256(data).hexdigest()
            ship = Path(MIRROR_RENAME.get(name, name))
            row = {"path": f"2d/{group}/{ship.stem}-{sha[:16]}",
                   "type": "texture" if ship.suffix == ".png" else "effect" if ship.suffix == ".effect" else "buffer",
                   "sourceBytes": len(data), "sourceSha256": sha}
            if row["type"] == "texture":
                row["size"] = list(struct.unpack_from(">II", data, 16))
            if row["type"] == "buffer":
                row["crc32"] = zlib.crc32(data)
            manifest["assets"][name] = row
        manifest["groups"][group] = {"dependencies": dependencies, "assets": names,
                                    "sourceBytes": sum(len(payloads[name]) for name in names)}
    if set(manifest["assets"]) != set(FILES) - KIT_ONLY:
        raise ValueError("每个运行时素材必须恰好有一个组")
    manifest["atlasLayoutVersion"] = "trim-v1-" + digest({k: bindings[k] for k in GENERATED_LAYOUTS})
    manifest["contentVersion"] = "sha256-" + digest(manifest)
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1", choices=["s1"])
    ap.add_argument("--check", action="store_true", help="只比对，不落盘")
    ap.add_argument("--remint", action="store_true", help="显式重铸 .meta；普通安装保留 Creator 导入选项")
    a = ap.parse_args()
    src = Path(OUT) / "pack" / a.map
    kit = Path(REPO) / "apps/kits/mapOriginal/data/maps" / a.map
    assets = Path(REPO) / "apps/Cocos/assets"
    bundle = assets / "bundles" / f"kit-mapOriginal-{a.map}"
    legacy = assets / "resources/kits/mapOriginal/maps" / a.map
    content = Path(REPO) / "apps/shared/src/kits/mapOriginal/content"
    # 先确认所有输入，不能因缺一个源文件先删掉半套已安装素材。
    payloads = {name: ((Path(HERE) / "shaders" if name.endswith(".effect") else src) / name).read_bytes() for name in FILES}
    layouts = {name: (src / name).read_bytes() for name in GENERATED_LAYOUTS}
    bindings = {p.name: hashlib.sha256(layouts.get(p.name, p.read_bytes())).hexdigest()
                for p in sorted(content.glob("*.ts")) if p.name != "manifest.data.ts"}
    bindings.update({name: hashlib.sha256(data).hexdigest() for name, data in layouts.items()})
    runtime = make_manifest(a.map, payloads, bindings)
    expected = {}
    ledger = []
    for name, data in payloads.items():
        target = kit / FILES[name]
        expected[target] = data
        mirror = None
        if name not in KIT_ONLY:
            record = runtime["assets"][name]
            mirror = bundle / (record["path"] + Path(MIRROR_RENAME.get(name, name)).suffix)
            expected[mirror] = data
        ledger.append({"logical": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
            "target": str(target.relative_to(REPO)), "mirror": str(mirror.relative_to(REPO)) if mirror else None,
            "convert": "由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl）",
            "meta": "本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)"})
    manifest_data = json_bytes(runtime)
    expected[bundle / "2d/manifest.json"] = manifest_data
    expected[kit / "manifest.json"] = manifest_data
    expected.update({content / name: data for name, data in layouts.items()})
    expected[content / "manifest.data.ts"] = ("// GENERATED by tools/maporiginal-assets/install_to_kit.py; do not edit.\n"
        'import type { MapoManifest } from "./map-manifest.types";\n'
        + "export const MAPO_S1_MANIFEST: MapoManifest = " + manifest_data.decode().rstrip() + ";\n").encode()
    ledger.append({"logical": "manifest.json", "sha256": hashlib.sha256(manifest_data).hexdigest(), "bytes": len(manifest_data),
        "target": str((kit / "manifest.json").relative_to(REPO)), "mirror": str((bundle / "2d/manifest.json").relative_to(REPO)),
        "convert": "安装器绑定逻辑组、源文件 SHA-256、CRC32 与 shared 配置哈希；平台派生纹理由 Creator 构建缓存绑定",
        "meta": "本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)"})
    # 只清除本管线的已知旧文件，拒绝静默删除同事新增的未知文件。
    obsolete = []
    for root in (legacy, bundle):
        if not root.exists(): continue
        for p in root.rglob("*"):
            if not p.is_file() or p in expected or p.suffix == ".meta": continue
            if root == legacy:
                known = p.name in set(FILES) | set(MIRROR_RENAME.values()) or re.fullmatch(r"plate-lod[45]\.(png|info.json)", p.name)
            else:
                known = bool(re.fullmatch(r"[^/]+-[0-9a-f]{16}\.(png|bin|effect)", p.name))
            if not known: raise ValueError(f"未登记的运行时文件，保留并拒绝安装：{p}")
            obsolete += [p, Path(str(p) + ".meta")]
    for lod in (4, 5):
        for suffix in ("png", "info.json"):
            obsolete += [kit / f"plate-lod{lod}.{suffix}", kit / f"plate-lod{lod}.{suffix}.meta"]
    # 全树 UUID 碰撞检查；只创建缺失的 meta，不覆写已有压缩或采样设置。
    owners = {}
    for p in assets.rglob("*.meta"):
        u = json.loads(p.read_text()).get("uuid")
        if u: owners.setdefault(u, p)
    metas = {}
    for p, data in list(expected.items()):
        if assets not in p.parents: continue
        mp = Path(str(p) + ".meta")
        value = meta_for(str(p.relative_to(assets)), p.name, data)
        if value["uuid"] in owners and owners[value["uuid"]] != mp:
            raise ValueError(f"UUID 撞车：{mp} / {owners[value['uuid']]}")
        if not mp.exists() or a.remint: metas[mp] = json_bytes(value)
        parent = p.parent
        while parent != assets:
            dm = Path(str(parent) + ".meta")
            if not dm.exists():
                meta = dir_meta_for(str(parent.relative_to(assets)))
                if parent == bundle:
                    meta["userData"] = {"isBundle": True, "bundleName": bundle.name, "bundleConfigID": "package2d"}
                if meta["uuid"] in owners and owners[meta["uuid"]] != dm: raise ValueError(f"目录 UUID 撞车：{dm}")
                metas[dm] = json_bytes(meta)
            parent = parent.parent
    expected.update(metas)
    root_meta = Path(str(bundle) + ".meta")
    root_value = json.loads(expected.get(root_meta, root_meta.read_bytes() if root_meta.exists() else b"{}"))
    if root_value.get("userData", {}) != {"isBundle": True, "bundleName": bundle.name, "bundleConfigID": "package2d"}:
        raise ValueError(f"地图 bundle 根配置不符：{root_meta}")
    bad = []
    for p, data in expected.items():
        if p.exists() and p.read_bytes() == data: continue
        if a.check: bad.append(f"不一致/缺失 {p.relative_to(REPO)}")
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
    for p in obsolete:
        if not p.exists(): continue
        if a.check: bad.append(f"遗留运行时副本 {p.relative_to(REPO)}")
        else: p.unlink()
    if not a.check:
        # 只移除空目录及伴随 meta，保留共享祖先和其它地图。
        for root, stop in ((legacy, assets / "resources/kits"), (bundle / "2d", bundle)):
            if root.exists():
                for p in sorted([x for x in root.rglob("*") if x.is_dir()] + [root], key=lambda p: len(p.parts), reverse=True):
                    if not any(p.iterdir()):
                        p.rmdir(); Path(str(p) + ".meta").unlink(missing_ok=True)
            p = root.parent
            while p != stop and p.exists() and not any(p.iterdir()):
                p.rmdir(); Path(str(p) + ".meta").unlink(missing_ok=True); p = p.parent
        Path(OUT, "pack_manifest.json").write_bytes(json_bytes({"schemaVersion": 2, "mapId": a.map,
            "bundle": runtime["bundle"], "contentVersion": runtime["contentVersion"], "files": ledger}))
    for message in bad: print("  ❌ " + message)
    print(f"  {runtime['bundle']}: {len(runtime['assets'])} 个素材 + manifest，{sum(x['sourceBytes'] for x in runtime['assets'].values()):,} 源字节")
    print(f"  {runtime['contentVersion']}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
