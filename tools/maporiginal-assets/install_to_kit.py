#!/usr/bin/env python3
"""把目检通过的内容包装进 kit 与 Cocos 运行时镜像，并确定性铸 `.meta`。

    /tmp/maporiginal-venv/bin/python install_to_kit.py [--map s1] [--check]

`.meta` 的 uuid 由「`mapOriginal::<相对路径>`」的 sha1 派生 ⇒ 重跑不漂移；落盘前全树查重
（uuid 撞车会静默弄坏场景/预制体引用）。

⚠ 与 sgzzmap 的**唯一形态差别**：`terrain.bytes`（16 类显示层）**要进 Cocos**，
   因为它塞不进 shared 模块（熵太高，见 README §4.3），客户端用 BufferAsset 加载。
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
    "atlas-lod0.png": "atlas-lod0.png", "atlas-lod0.info.json": "atlas-lod0.info.json",
    "atlas-lod1.png": "atlas-lod1.png", "atlas-lod1.info.json": "atlas-lod1.info.json",
    "atlas-lod2.png": "atlas-lod2.png", "atlas-lod2.info.json": "atlas-lod2.info.json",
    "plate-lod4.png": "plate-lod4.png", "plate-lod4.info.json": "plate-lod4.info.json",
    "plate-lod5.png": "plate-lod5.png", "plate-lod5.info.json": "plate-lod5.info.json",
    "minimap.png": "minimap.png", "minimap-mask.png": "minimap-mask.png",
    "plate.calib.json": "plate.calib.json",
}
KIT_ONLY = {"terrain.pass.bytes", "terrain.info.json", "plate.calib.json"}
# ⚠ 运行时镜像里改用 Cocos 的规范缓冲扩展名 `.bin`：
#   早先镜像叫 terrain.bytes 而 .meta 的 files 写成 [".bin"]，Creator 据此导入出
#   `_native: ".bin"`，而库里的原生文件是 .bytes ⇒ 运行时报「the native asset is missing」。
#   Creator 按 uuid + 内容哈希缓存，改 .meta 不会让它重导 ⇒ 换路径（连带换掉确定性 uuid）
#   才能拿到一次干净的导入。权威产物仍叫 terrain.bytes，⛔ 不改。
MIRROR_RENAME = {"terrain.bytes": "terrain.bin"}


def uuid_for(rel: str) -> str:
    h = hashlib.sha1(("mapOriginal::" + rel).encode()).hexdigest()
    return "%s-%s-4%s-a%s-%s" % (h[0:8], h[8:12], h[13:16], h[17:20], h[20:32])


def sub_id(rel: str) -> str:
    return hashlib.sha1(("mapOriginal::sub::" + rel).encode()).hexdigest()[:5]


def dir_meta_for(rel: str) -> dict:
    return {"ver": "1.2.0", "importer": "directory", "imported": True, "uuid": uuid_for(rel),
            "files": [], "subMetas": {}, "userData": {}}


def meta_for(rel: str, name: str) -> dict:
    uuid = uuid_for(rel)
    if name.endswith(".png"):
        sid = sub_id(rel)
        return {
            "ver": "1.0.27", "importer": "image", "imported": True, "uuid": uuid,
            "files": [".json", ".png"],
            "subMetas": {sid: {
                "importer": "texture", "uuid": "%s@%s" % (uuid, sid),
                "displayName": name[:-4], "id": sid, "name": "texture",
                "userData": {"wrapModeS": "clamp-to-edge", "wrapModeT": "clamp-to-edge",
                             "minfilter": "linear", "magfilter": "linear", "mipfilter": "none",
                             "anisotropy": 0, "isUuid": True,
                             "imageUuidOrDatabaseUri": uuid, "visible": False},
                "ver": "1.0.22", "imported": True, "files": [".json"], "subMetas": {}}},
            "userData": {"type": "texture", "fixAlphaTransparencyArtifacts": False,
                         "hasAlpha": True, "redirect": "%s@%s" % (uuid, sid)},
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
        meta = meta_for(rel, mirror_name)
        owner = existing.get(meta["uuid"])
        mp = os.path.join(coc, mirror_name + ".meta")
        if owner and os.path.abspath(owner) != os.path.abspath(mp):
            print("  ❌ uuid 撞车 %s 已属 %s" % (meta["uuid"], owner))
            bad += 1
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
