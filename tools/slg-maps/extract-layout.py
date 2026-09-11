#!/usr/bin/env python3
"""mapinfowrap + map_area.csv + entity_map_display.csv → 布局 JSON（decorations/landmarks/biomes）。

用法：extract-layout.py <mapId> [--out 路径]
输出默认 tools/slg-maps/out/<mapId>/layout.json。森之国回归：--out 指向仓内文件前应 diff 验证。

坐标：实体格 × scale + offset → 本 kit 世界格（config entityToWorld）。
怪物/NPC/角色不进装饰层（会动的东西不是摆件）。
"""
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import (entity_class_id, entity_xy, load_area_names, load_config,
                      load_display, load_mapinfowrap, map_config)


def classify(display: dict, ecid: int, refresh_group: int) -> str | None:
    path, _memo = display.get(ecid, ("", ""))
    if "WorldMonster" in path or "WorldNPC" in path or "WorldMapCharacter" in path:
        return None
    if "WorldDoor" in path or "Transport" in path:
        return "portal"
    if "WorldBonus" in path or "BonusTouch" in path or "Reward" in path:
        return "chest"
    if "WorldGamePlay" in path or "Puzzle" in path or "Stele" in path:
        return "sword"
    if "WorldBuilding" in path or "Building" in path:
        return "stele"
    if path:
        return "tree"
    return "tree" if refresh_group == 0 else "crystal"  # 未解析的静态物件按植被/灵晶兜底


# 森之国 legacy 词表（回归钉死）；新图可用 config 的 biomeKeywordsExtend 扩展。
# legacy 语义：岸/岛词与「湖」同判一档，含「湖」（或扩展水词）才算 water，否则 sand。
BASE_KEYWORDS = {
    "shore": ("海岸", "海角", "海边", "岛", "远航"),
    "lake": ("湖",),
    "rock": ("山谷", "峡谷", "崖", "石窟", "巢穴", "大本营"),
    "forest": ("密林", "森林", "树林", "回廊", "花谷", "花海", "蘑森", "蘑菇"),
}


def make_biome_of(extend: dict | None):
    ext = extend or {}
    shore = tuple(BASE_KEYWORDS["shore"]) + tuple(ext.get("shore", ()))
    lake = tuple(BASE_KEYWORDS["lake"]) + tuple(ext.get("lake", ()))
    rock = tuple(BASE_KEYWORDS["rock"]) + tuple(ext.get("rock", ()))
    forest = tuple(BASE_KEYWORDS["forest"]) + tuple(ext.get("forest", ()))

    def biome_of(name: str) -> str:
        if any(k in name for k in shore) or any(k in name for k in lake):
            return "water" if any(k in name for k in lake) else "sand"
        if any(k in name for k in rock):
            return "rock"
        if any(k in name for k in forest):
            return "forest"
        return "grass"

    return biome_of


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    cfg = load_config()
    mc = map_config(cfg, args.map_id)
    e2w = mc.get("entityToWorld")
    if not e2w:
        # 新图派生：offset = (entityToRender - 渲染窗原点) × scale + margin（与地形严格同帧）
        render = mc.get("render") or {}
        win = render.get("window")
        if not mc.get("entityToRender") or not win or not mc.get("worldSize"):
            raise SystemExit(f"{args.map_id}: 先跑 render-ground.py + calibrate.py --auto-offset + classify-terrain.py")
        margin_x = (mc["worldSize"][0] - win["cols"] * mc["scale"]) // 2
        margin_y = (mc["worldSize"][1] - win["rows"] * mc["scale"]) // 2
        e2w = {"scale": mc["scale"],
               "offset": [(mc["entityToRender"][0] - win["x0"]) * mc["scale"] + margin_x,
                          (mc["entityToRender"][1] - win["y0"]) * mc["scale"] + margin_y]}
        print(f"派生 entityToWorld offset {e2w['offset']}（实体与地形同帧）")

    regions = load_mapinfowrap(cfg, mc["classId"])
    area_names = load_area_names(cfg, mc["classId"])
    display = load_display(cfg)
    scale, off = e2w["scale"], e2w["offset"]

    def tx(v): return v * scale

    xs, ys = [], []
    for ents in regions.values():
        for e in ents:
            ex, ey = entity_xy(e)
            xs.append(ex); ys.append(ey)
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)

    decorations, skipped = [], 0
    for rid in sorted(regions):
        for e in regions[rid]:
            kind = classify(display, entity_class_id(e), e[1])
            if kind is None:
                skipped += 1
                continue
            ex, ey = entity_xy(e)
            decorations.append({"x": tx(ex) + off[0], "y": tx(ey) + off[1], "kind": kind})

    centroids = {}
    for rid, ents in regions.items():
        if not ents:
            continue
        cx = sum(tx(entity_xy(e)[0]) for e in ents) / len(ents) + off[0]
        cy = sum(tx(entity_xy(e)[1]) for e in ents) / len(ents) + off[1]
        centroids[rid] = (round(cx), round(cy), len(ents))

    biome_of = make_biome_of(mc.get("biomeKeywordsExtend"))
    biomes = [{"name": area_names.get(rid, f"区域{rid}"), "terrain": biome_of(area_names.get(rid, "")),
               "cx": c[0], "cy": c[1], "entities": c[2]} for rid, c in sorted(centroids.items())]

    # 地标三态混合：{"x","y"} 定稿坐标（fix-landmarks 回填）| {"region"} 质心+nudge | {"name"} 按区域名查找。
    landmarks = []
    used = set()
    spec = mc.get("landmarks") or [{"name": n} for n in mc.get("landmarkNames", [])]
    kinds = mc.get("landmarkKinds") or []
    for idx, lm in enumerate(spec):
        kind = lm.get("kind") or (kinds[idx] if idx < len(kinds) else None)
        if "x" in lm:
            entry = {"name": lm["name"], "x": lm["x"], "y": lm["y"], "tag": lm.get("tag", lm["name"])}
        else:
            if "region" in lm:
                rid = lm["region"]
                if rid not in centroids:
                    raise SystemExit(f"{args.map_id}: 地标区域 {rid} 无实体")
            else:
                rid = next((r for r, n in area_names.items() if n == lm["name"] and r in centroids and r not in used), None)
                if rid is None:
                    raise SystemExit(f"{args.map_id}: 找不到地标区域「{lm['name']}」")
            used.add(rid)
            nudge = lm.get("nudge", [0, 0])
            # 质心即中心格锚（9×9 足迹 = 中心 ±4；fix-landmarks 同语义）
            entry = {"name": area_names.get(rid, lm.get("name", f"区域{rid}")),
                     "x": centroids[rid][0] + nudge[0], "y": centroids[rid][1] + nudge[1],
                     "tag": lm.get("tag", lm.get("name", ""))}
        if kind:
            entry["kind"] = kind
        landmarks.append(entry)
    if not mc.get("landmarks"):
        print("⚠ 地标未做旱地/足迹微调，请用 calibrate.py --fix-landmarks 定稿")

    size = mc.get("worldSize")  # 森之国 legacy 单值；新图由 classify-terrain 定稿后回填
    if isinstance(size, list) and size[0] == size[1]:
        size = size[0]  # 方图保持 legacy 单值形态（validateSlgForestLayout 兼容）
    out = {
        "source": f"zjcs-1.2.6 mapinfowrap_{mc['classId']} + map_area.csv + entity_map_display.csv（{mc['name']}，地图 ClassId {mc['classId']}）",
        "id": mc["id"],
        "mapSize": size if size else None,
        "sourceBounds": {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y},
        "scale": scale, "offset": {"x": off[0], "y": off[1]},
        "counts": {"entities": sum(len(v) for v in regions.values()),
                   "decorations": len(decorations), "skipped": skipped},
        "landmarks": landmarks,
        "biomes": biomes,
        "decorations": decorations,
    }
    if out["mapSize"] is None:
        del out["mapSize"]  # 尺寸未定稿时省略（classify-terrain 定稿后回填）
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    out_path = Path(args.out) if args.out else Path(__file__).resolve().parent / "out" / args.map_id / "layout.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    print("decorations:", len(decorations), "| skipped:", skipped, "| landmarks:", [(l["name"], l["x"], l["y"]) for l in landmarks])
    print("biome counts:", collections.Counter(b["terrain"] for b in biomes))
    print("→", out_path)


if __name__ == "__main__":
    main()
