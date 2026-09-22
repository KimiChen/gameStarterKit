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

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

# out/pack/<id>/ 里的名字 -> 出品名。KIT_ONLY 的不进 Cocos 运行时镜像。
FILES = {
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
    # ★ `_top_group` 手摆细节：每族一张图集 + 一份摆放库
    "river-top-atlas.png": "river-top-atlas.png", "river-tops.bin": "river-tops.bin",
    "desert-top-atlas.png": "desert-top-atlas.png", "desert-tops.bin": "desert-tops.bin",
    "snow-top-atlas.png": "snow-top-atlas.png", "snow-tops.bin": "snow-tops.bin",
    "top-atlas.info.json": "top-atlas.info.json",
    # ★ 道路层：路片图集 + 摆放表
    "road-atlas.png": "road-atlas.png", "roads.bin": "roads.bin",
    "roads.info.json": "roads.info.json", "minimap.info.json": "minimap.info.json",
    "plate-lod4.png": "plate-lod4.png", "plate-lod4.info.json": "plate-lod4.info.json",
    "plate-lod5.png": "plate-lod5.png", "plate-lod5.info.json": "plate-lod5.info.json",
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
    "labels.json": "labels.json",
}
KIT_ONLY = {"terrain.pass.bytes", "terrain.info.json", "labels.json", "regions.info.json",
            "rivers.info.json", "river-geo.index.json", "ground.info.json",
            "blocks.info.json", "top-atlas.info.json", "roads.info.json",
            "minimap.info.json", "cities.info.json"}
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
    if name.endswith(".json"):
        return {"ver": "2.0.1", "importer": "json", "imported": True, "uuid": uuid,
                "files": [".json"], "subMetas": {}, "userData": {}}
    # ⚠ 扩展名段要与真实文件一致（Creator 导入 terrain.bytes 后把 ".bin" 纠成 ".bytes"）
    ext = "." + name.rsplit(".", 1)[-1]
    return {"ver": "1.0.3", "importer": "buffer", "imported": True, "uuid": uuid,
            "files": [ext, ".json"], "subMetas": {}, "userData": {}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--check", action="store_true", help="只比对，不落盘")
    ap.add_argument("--remint", action="store_true",
                    help="重铸已存在的 .meta。⚠ 只在 Creator 没导入过时用 —— "
                         "覆写 Creator 导入出来的 .meta 会造成同图两个 texture 子资源（动态加载 URL 相同）")
    a = ap.parse_args()

    src = os.path.join(OUT, "pack", a.map)
    kit = os.path.join(REPO, "apps/kits/mapOriginal/data/maps", a.map)
    coc = os.path.join(REPO, "apps/Cocos/assets/resources/kits/mapOriginal/maps", a.map)
    assets = os.path.join(REPO, "apps/Cocos/assets")
    if not a.check:
        os.makedirs(kit, exist_ok=True)
        os.makedirs(coc, exist_ok=True)

    existing = {}
    for root, _dirs, files in os.walk(assets):
        for f in files:
            if not f.endswith(".meta"):
                continue
            p = os.path.join(root, f)
            try:
                u = json.load(open(p, encoding="utf-8")).get("uuid")
            except Exception:  # noqa: BLE001
                continue
            if u:
                existing.setdefault(u, p)

    bad = 0
    manifest = []
    for out_name, ship in FILES.items():
        s = os.path.join(src, out_name)
        if not os.path.isfile(s):
            print("  ❌ 缺产物 %s" % s)
            bad += 1
            continue
        data = open(s, "rb").read()
        mirror_name = MIRROR_RENAME.get(ship, ship)
        targets = [os.path.join(kit, ship)] if ship in KIT_ONLY else \
                  [os.path.join(kit, ship), os.path.join(coc, mirror_name)]
        for dest in targets:
            if a.check:
                if not os.path.isfile(dest) or open(dest, "rb").read() != data:
                    print("  ❌ 不一致/缺失 %s" % os.path.relpath(dest, REPO))
                    bad += 1
            else:
                open(dest, "wb").write(data)
        manifest.append({
            "logical": ship, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
            "target": os.path.relpath(os.path.join(kit, ship), REPO),
            "mirror": None if ship in KIT_ONLY else os.path.relpath(os.path.join(coc, mirror_name), REPO),
            "convert": "由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl）",
            "meta": "本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)",
        })
        if a.check or ship in KIT_ONLY:
            continue
        rel = os.path.relpath(os.path.join(coc, mirror_name), assets)
        meta = meta_for(rel, mirror_name, data)
        owner = existing.get(meta["uuid"])
        mp = os.path.join(coc, mirror_name + ".meta")
        if owner and os.path.abspath(owner) != os.path.abspath(mp):
            print("  ❌ uuid 撞车 %s 已属 %s" % (meta["uuid"], owner))
            bad += 1
            continue
        # ★ 已经有 .meta 就**不动它**（除非 --remint）。
        # ⚠ 这里踩过一次：脚本无条件覆写，把 Creator 导入出来的 .meta 换成我们铸的，
        #   而两边的 subMeta id 不同（我们 sha1 出 `dddbd`、Creator 出 `6c48a`），
        #   于是同一张 PNG 出现两个 texture 子资源、**动态加载 URL 相同**
        #   （`kits/mapOriginal/maps/s1/atlas-lod0/texture`），Creator 七张图各报一条 warn。
        #   确定性 uuid 只在**第一次落地**时需要；之后 Creator 才是 .meta 的权威。
        if os.path.isfile(mp) and not a.remint:
            continue
        open(mp, "w", encoding="utf-8").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    if not a.check:
        node = coc
        while os.path.abspath(node) != os.path.abspath(assets):
            rel = os.path.relpath(node, assets)
            dm = os.path.join(os.path.dirname(node), os.path.basename(node) + ".meta")
            if not os.path.isfile(dm):
                open(dm, "w", encoding="utf-8").write(
                    json.dumps(dir_meta_for(rel), ensure_ascii=False, indent=2) + "\n")
                print("  铸目录 .meta %s" % os.path.relpath(dm, REPO))
            node = os.path.dirname(node)
        json.dump({"schemaVersion": 1, "mapId": a.map, "files": manifest},
                  open(os.path.join(OUT, "pack_manifest.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        tot = sum(m["bytes"] for m in manifest)
        print("  装入 %d 个文件 + .meta，源合计 %.1f MiB" % (len(manifest), tot / 1024 / 1024))
        print("  → %s" % os.path.relpath(kit, REPO))
        print("  → %s" % os.path.relpath(coc, REPO))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
