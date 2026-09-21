#!/usr/bin/env python3
"""给 Cocos 镜像里的 mapOriginal 脚本补 `.meta`（确定性 uuid）。

    python3 mint_script_meta.py [--check]

⚠ 正常情况下脚本 `.meta` 是 **Creator 导入时生成**的（`scripts/sync-client.mjs` 的口径）。
   但入库前跑不了 Creator，而 `verify:sync` 对**已入库**文件缺 `.meta` 判红，
   所以这里先确定性铸一份（uuid = sha1(`mapOriginal::meta::<相对路径>`)）——
   与 `install_to_kit.py` 给 `resources/` 铸 `.meta` 是同一条先例。
⚠ **首次用 Creator 打开本仓时它会正式导入并可能改写 uuid —— 把它改完的 `.meta` 一并提交。**
⛔ 确定性铸造的意义就是「多机不各铸各的」；⛔ 不要改成随机 uuid。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(REPO, "apps/Cocos/assets")
ROOTS = ["src/kits/mapOriginal", "src/shared/kits/mapOriginal"]


def uuid_for(rel: str) -> str:
    h = hashlib.sha1(("mapOriginal::meta::" + rel).encode()).hexdigest()
    return "%s-%s-4%s-a%s-%s" % (h[0:8], h[8:12], h[13:16], h[17:20], h[20:32])


def meta_for(rel: str, is_dir: bool) -> dict:
    u = uuid_for(rel)
    if is_dir:
        return {"ver": "1.2.0", "importer": "directory", "imported": True, "uuid": u,
                "files": [], "subMetas": {}, "userData": {}}
    if rel.endswith(".json"):
        return {"ver": "2.0.1", "importer": "json", "imported": True, "uuid": u,
                "files": [".json"], "subMetas": {}, "userData": {}}
    return {"ver": "4.0.24", "importer": "typescript", "imported": True, "uuid": u,
            "files": [], "subMetas": {}, "userData": {}}


def existing_uuids() -> dict:
    out = {}
    for root, _d, files in os.walk(ASSETS):
        for f in files:
            if not f.endswith(".meta"):
                continue
            p = os.path.join(root, f)
            try:
                u = json.load(open(p, encoding="utf-8")).get("uuid")
            except Exception:  # noqa: BLE001
                continue
            if u:
                out.setdefault(u, p)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    taken = existing_uuids()
    made = missing = bad = 0
    for r in ROOTS:
        base = os.path.join(ASSETS, r)
        if not os.path.isdir(base):
            continue
        targets = []
        node = base
        while os.path.abspath(node) != os.path.abspath(ASSETS):
            targets.append((node, True))
            node = os.path.dirname(node)
        for root, dirs, files in os.walk(base):
            for d in dirs:
                targets.append((os.path.join(root, d), True))
            for f in files:
                if f.endswith(".meta"):
                    continue
                targets.append((os.path.join(root, f), False))
        for path, is_dir in targets:
            mp = path + ".meta"
            rel = os.path.relpath(path, ASSETS)
            if os.path.isfile(mp):
                continue
            if a.check:
                print("  ❌ 缺 .meta %s" % rel)
                missing += 1
                continue
            m = meta_for(rel, is_dir)
            owner = taken.get(m["uuid"])
            if owner and os.path.abspath(owner) != os.path.abspath(mp):
                print("  ❌ uuid 撞车 %s 已属 %s" % (m["uuid"], owner))
                bad += 1
                continue
            open(mp, "w", encoding="utf-8").write(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
            taken[m["uuid"]] = mp
            made += 1
    if a.check:
        print("缺 %d 个 .meta" % missing)
        return 1 if missing else 0
    print("铸了 %d 个 .meta，撞车 %d" % (made, bad))
    return 1 if bad else 0
if __name__ == "__main__":
    raise SystemExit(main())
