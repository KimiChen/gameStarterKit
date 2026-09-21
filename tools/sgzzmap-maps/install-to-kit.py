#!/usr/bin/env python3
"""把目检通过的产物装进 kit 与 Cocos 运行时镜像，并铸 .meta。

用法：install-to-kit.py <mapId> [--check]

两处必须逐字节一致（apps/server/test/sgzzmap-content.test.ts 钉住）。
.meta 的 uuid 由「相对路径」确定性派生 ⇒ 重跑不漂移；铸之前对全树查重。
⚠ 出品名去掉 `.meta.` 片段（`terrain.meta.json` → `terrain.info.json`），
   免得和 Creator 自己的 `*.meta` 命名搅在一起。
"""
from __future__ import annotations

import argparse, hashlib, json, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config  # noqa: E402

# out/ 里的名字 → 出品名。KIT_ONLY 的不进 Cocos 运行时镜像。
# ⚠ 地形不进 Cocos：kit 服务端 ⛔ 不得读盘（kit-import-boundary 规则 ①），所以地形以
#   shared TS 模块（varint-RLE+base64，emit-shared-terrain.py 产出）进两端；
#   terrain.bytes 仍是权威产物、留在 kit 数据目录供机检比对，⛔ 不再多存一份二进制到 Cocos。
KIT_ONLY = {"terrain.bytes", "terrain.info.json"}
FILES = {
    "terrain.bytes": "terrain.bytes",
    "terrain.meta.json": "terrain.info.json",
    "regions.json": "regions.json",
    "plate-lod4.png": "plate-lod4.png",
    "plate-lod4.meta.json": "plate-lod4.info.json",
    "plate-lod5.png": "plate-lod5.png",
    "plate-lod5.meta.json": "plate-lod5.info.json",
    "atlas-lod0.png": "atlas-lod0.png",
    "atlas-lod0.meta.json": "atlas-lod0.info.json",
    "atlas-lod1.png": "atlas-lod1.png",
    "atlas-lod1.meta.json": "atlas-lod1.info.json",
    "atlas-lod2.png": "atlas-lod2.png",
    "atlas-lod2.meta.json": "atlas-lod2.info.json",
    # ⚠ ⛔ 没有 atlas-lod3：地表层门控 hideAtLod:2（LOD3 起改用整幅底图），
    #   早先烘的那张从来没人消费，已撤。
    "decor-atlas.png": "decor-atlas.png",
    "decor-atlas.meta.json": "decor-atlas.info.json",
    "minimap.png": "minimap.png",
    "minimap-mask.png": "minimap-mask.png",
}


def uuid_for(rel: str) -> str:
    h = hashlib.sha1(f"sgzzmap::{rel}".encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"


def sub_id(rel: str) -> str:
    return hashlib.sha1(f"sgzzmap::sub::{rel}".encode()).hexdigest()[:5]


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
                "importer": "texture", "uuid": f"{uuid}@{sid}",
                "displayName": name[:-4], "id": sid, "name": "texture",
                "userData": {"wrapModeS": "clamp-to-edge", "wrapModeT": "clamp-to-edge",
                             "minfilter": "linear", "magfilter": "linear", "mipfilter": "none",
                             "anisotropy": 0, "isUuid": True,
                             "imageUuidOrDatabaseUri": uuid, "visible": False},
                "ver": "1.0.22", "imported": True, "files": [".json"], "subMetas": {}}},
            "userData": {"type": "texture", "fixAlphaTransparencyArtifacts": False,
                         "hasAlpha": True, "redirect": f"{uuid}@{sid}"},
        }
    if name.endswith(".json"):
        return {"ver": "2.0.1", "importer": "json", "imported": True, "uuid": uuid,
                "files": [".json"], "subMetas": {}, "userData": {}}
    return {"ver": "1.0.3", "importer": "buffer", "imported": True, "uuid": uuid,
            "files": [".bin", ".json"], "subMetas": {}, "userData": {}}


def run(map_id: str, check_only: bool) -> int:
    cfg = config.load(map_id)
    src = config.out_dir(map_id)
    kit = config.REPO / "apps/kits/sgzzmap/data/maps" / map_id
    coc = config.REPO / "apps/Cocos/assets/resources/kits/sgzzmap/maps" / map_id
    if not check_only:
        kit.mkdir(parents=True, exist_ok=True)
        coc.mkdir(parents=True, exist_ok=True)

    # 全树 uuid 查重（.meta 的 uuid 撞了会静默弄坏场景/预制体引用）
    existing = {}
    for m in (config.REPO / "apps/Cocos/assets").rglob("*.meta"):
        try:
            u = json.loads(m.read_text(encoding="utf-8")).get("uuid")
        except Exception:
            continue
        if u:
            existing.setdefault(u, str(m))

    bad = 0
    for out_name, ship_name in FILES.items():
        s = src / out_name
        if not s.is_file():
            print(f"  ❌ 缺产物 {s}"); bad += 1; continue
        data = s.read_bytes()
        targets = [kit / ship_name] if ship_name in KIT_ONLY else [kit / ship_name, coc / ship_name]
        for dest in targets:
            if check_only:
                if not dest.is_file() or dest.read_bytes() != data:
                    print(f"  ❌ 不一致/缺失 {dest.relative_to(config.REPO)}"); bad += 1
            else:
                dest.write_bytes(data)
        if check_only or ship_name in KIT_ONLY:
            continue
        rel = str((coc / ship_name).relative_to(config.REPO / "apps/Cocos/assets"))
        meta_path = coc / (ship_name + ".meta")
        meta = meta_for(rel, ship_name)
        owner = existing.get(meta["uuid"])
        if owner and owner != str(meta_path):
            print(f"  ❌ uuid 撞车 {meta['uuid']} 已属 {owner}"); bad += 1; continue
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # 目录也要 .meta，否则 Creator 不认这棵子树（先例：resources/kits/slg{,maps,qingyuan}.meta）
    if not check_only:
        assets = config.REPO / "apps/Cocos/assets"
        node = coc
        while node != assets:
            rel = str(node.relative_to(assets))
            dm = node.parent / (node.name + ".meta")
            if not dm.is_file():
                dm.write_text(json.dumps(dir_meta_for(rel), ensure_ascii=False, indent=2) + "\n",
                              encoding="utf-8")
                print(f"  铸目录 .meta {dm.relative_to(config.REPO)}")
            node = node.parent

    if not check_only:
        total = sum(f.stat().st_size for f in kit.iterdir()) + sum(f.stat().st_size for f in coc.iterdir())
        print(f"  装入 {len(FILES)} 个文件 ×2 份 + .meta，合计 {total/1024/1024:.1f} MiB")
        print(f"  → {kit.relative_to(config.REPO)}")
        print(f"  → {coc.relative_to(config.REPO)}")
    print("通过" if not bad else f"不通过（{bad} 项）")
    return 0 if not bad else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id"); ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    raise SystemExit(run(a.map_id, a.check))
