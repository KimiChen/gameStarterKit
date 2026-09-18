#!/usr/bin/env python3
"""新图校准辅助（每图跑一次，人工目检后回填 maps.config.json）。

用法：
  calibrate.py <mapId> --overlay            实体散点 × 纯地表渲染叠图（校准 entityToRender）
  calibrate.py <mapId> --suggest-centroids  渲染图主色建议（映射六类语义后回填 centroids）
  calibrate.py <mapId> --check-landmarks    地标旱地校验（terrain 非水 + 9×9 足迹不跨 chunk）

entityToRender 校准原理：实体格 + entityToRender = 渲染世界格；渲染世界格 (wx,wy) 对应
渲染图像素 ((wx-x0)*pxPerCell, (y1-wy)*pxPerCell)。叠图上散点应落在陆地/建筑上；
偏了就在 config 里调 entityToRender（初始猜测：渲染窗 x0+2, y0+2 附近）。
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import (entity_xy, load_area_names, load_config, load_mapinfowrap,
                      map_config, resolve_ground_image)

LANDMARK_FOOT = 9   # 地标装饰占地 9×9 格；坐标为中心格锚（块 = 中心 ±4）
CHUNK = 16          # SLG_CHUNK_SIZE


def auto_offset(cfg, mc):
    """遍历 entityToRender 候选偏移，取实体落陆率最高者（实体几乎都在陆上；海判定 = 接近海色）。"""
    render = mc.get("render") or {}
    win = render.get("window") or json.loads((Path(__file__).resolve().parent / "out" / mc["id"] / "ground.meta.json").read_text())
    guess = mc.get("entityToRender") or [win["x0"] + 2, win["y0"] + 2]
    img = Image.open(resolve_ground_image(cfg, mc)).convert("RGB")
    sea = tuple(mc.get("seaColor") or [66, 143, 163])
    px = win.get("pxPerCell") or (img.size[0] / win["cols"])
    win_y1 = win.get("y1") if win.get("y1") is not None else win["y0"] + win["rows"]
    pix = img.load()

    def is_sea(wx, wy):
        x = round((wx - win["x0"]) * px)
        y = round((win_y1 - wy) * px)
        if not (0 <= x < img.size[0] and 0 <= y < img.size[1]):
            return True
        r, g, b = pix[x, y]
        return abs(r - sea[0]) + abs(g - sea[1]) + abs(b - sea[2]) < 40

    regions = load_mapinfowrap(cfg, mc["classId"])
    pts = [entity_xy(e) for ents in regions.values() for e in ents]
    best = None
    for dy in range(guess[1] - 24, guess[1] + 9):
        for dx in range(guess[0] - 24, guess[0] + 9):
            land = sum(1 for ex, ey in pts if not is_sea(ex + dx + 0.5, ey + dy + 0.5))
            if best is None or land > best[0]:
                best = (land, dx, dy)
    print(f"实体 {len(pts)}；最优 entityToRender = [{best[1]}, {best[2]}]，落陆率 {best[0] / len(pts):.1%}（guess {guess}）")
    print("请回填 maps.config.json 的 entityToRender 后重跑 --overlay 目检确认。")


def overlay(cfg, mc):
    render = mc.get("render") or {}
    win = render.get("window") or json.loads((Path(__file__).resolve().parent / "out" / mc["id"] / "ground.meta.json").read_text())
    e2r = mc.get("entityToRender") or [win["x0"] + 2, win["y0"] + 2]
    img = resolve_ground_image(cfg, mc)
    scale = 1600 / max(1, Image.open(img).size[0])
    base = Image.open(img).convert("RGB")
    base = base.resize((round(base.size[0] * scale), round(base.size[1] * scale)), Image.LANCZOS)
    draw = ImageDraw.Draw(base)
    px = win["pxPerCell"] * scale

    def to_img(wx, wy):
        return (wx - win["x0"]) * px, (win["y1"] - wy) * px  # 渲染系 y 北向，图像 y 向下

    regions = load_mapinfowrap(cfg, mc["classId"])
    names = load_area_names(cfg, mc["classId"])
    for rid, ents in regions.items():
        for e in ents:
            ex, ey = entity_xy(e)
            x, y = to_img(ex + e2r[0], ey + e2r[1])
            draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(255, 40, 40))
    # 区域质心注区域名（大字目检对准）
    for rid, ents in regions.items():
        if len(ents) < 20:
            continue
        cx = sum(entity_xy(e)[0] for e in ents) / len(ents) + e2r[0]
        cy = sum(entity_xy(e)[1] for e in ents) / len(ents) + e2r[1]
        x, y = to_img(cx, cy)
        draw.text((x + 4, y - 6), names.get(rid, str(rid)), fill=(255, 255, 0))
    out = Path(__file__).resolve().parent / "out" / mc["id"] / "calibrate-overlay.png"
    base.save(out)
    print(f"entityToRender 当前 {e2r}；叠图 → {out}")
    print("散点应落在陆地/建筑群上；整体偏移则在 config 调 entityToRender 后重跑。")


def suggest_centroids(cfg, mc):
    img = Image.open(resolve_ground_image(cfg, mc)).convert("RGB")
    small = img.resize((img.size[0] // 4, img.size[1] // 4))
    q = small.quantize(colors=10).convert("RGB")
    colors = sorted(q.getcolors(10 * small.size[0] * small.size[1]), key=lambda c: -c[0])
    print("主色（占比降序，人工映射到 草/林/水/岩/沙/土 后回填 config centroids）：")
    total = sum(c[0] for c in colors)
    for n, rgb in colors:
        print(f"  {rgb}  {n / total:.1%}")


def _terrain_at(regs, x, y):
    t = regs[0]["terrain"]
    for r in regs[1:]:
        if r["x"] <= x < r["x"] + r["width"] and r["y"] <= y < r["y"] + r["height"]:
            t = r["terrain"]
    return t


def _footprint_ok(regs, x, y):
    half = LANDMARK_FOOT // 2  # 中心格锚：9×9 足迹 = [x-4, x+4]×[y-4, y+4]
    if (x - half) // CHUNK != (x + half) // CHUNK or (y - half) // CHUNK != (y + half) // CHUNK:
        return False
    return all(_terrain_at(regs, x + dx, y + dy) != 2 for dx in range(-half, half + 1) for dy in range(-half, half + 1))


def fix_landmarks(cfg, mc):
    """螺旋搜索每个地标最近合法点（chunk 足迹内 + 全旱地），更新 out 产物并回填 config 定稿坐标。"""
    out_dir = Path(__file__).resolve().parent / "out" / mc["id"]
    terrain = json.loads((out_dir / "terrain.json").read_text())
    layout = json.loads((out_dir / "layout.json").read_text())
    regs = terrain["regions"]
    width, height = terrain["width"], terrain["height"]

    fixed = []
    for lm in layout["landmarks"]:
        x0, y0 = lm["x"], lm["y"]
        if _footprint_ok(regs, x0, y0):
            fixed.append({**lm})
            print(f"  ✓ {lm['name']} ({x0},{y0}) 已合法")
            continue
        hit = None
        for radius in range(1, 40):
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if max(abs(dx), abs(dy)) != radius:
                        continue
                    nx, ny = x0 + dx, y0 + dy
                    half = LANDMARK_FOOT // 2
                    if half <= nx < width - half and half <= ny < height - half and _footprint_ok(regs, nx, ny):
                        hit = (nx, ny)
                        break
                if hit:
                    break
            if hit:
                break
        if not hit:
            raise SystemExit(f"{mc['id']}: 地标 {lm['name']} 半径 40 内无合法点，需人工策展")
        print(f"  → {lm['name']} ({x0},{y0}) 移到 {hit}（Δ{hit[0]-x0},{hit[1]-y0}）")
        fixed.append({**lm, "x": hit[0], "y": hit[1]})

    layout["landmarks"] = fixed
    (out_dir / "layout.json").write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 回填 config：landmarkNames/Kinds 首次查找模式 → 定稿坐标模式
    mc["landmarks"] = [{"name": lm["name"], "kind": lm.get("kind"), "tag": lm.get("tag", lm["name"]),
                        "x": lm["x"], "y": lm["y"]} for lm in fixed]
    from lib.zjcs import CONFIG_PATH
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  config 已回填 {mc['id']}.landmarks 定稿坐标")


def check_landmarks(cfg, mc):
    out_dir = Path(__file__).resolve().parent / "out" / mc["id"]
    terrain = json.loads((out_dir / "terrain.json").read_text())
    layout = json.loads((out_dir / "layout.json").read_text())
    regs = terrain["regions"]

    def terrain_at(x, y):
        return _terrain_at(regs, x, y)

    ok = True
    for lm in layout["landmarks"]:
        x, y = lm["x"], lm["y"]
        half = LANDMARK_FOOT // 2
        chunk_ok = (x - half) // CHUNK == (x + half) // CHUNK and (y - half) // CHUNK == (y + half) // CHUNK
        dry = all(terrain_at(x + dx, y + dy) != 2
                  for dx in range(-half, half + 1) for dy in range(-half, half + 1))
        state = "✓" if (chunk_ok and dry) else "✗"
        if not (chunk_ok and dry):
            ok = False
        print(f"  {state} {lm['name']} ({x},{y}) 足迹{LANDMARK_FOOT}² chunk内={chunk_ok} 旱地={dry}")
    if not ok:
        print("在 config landmarks 里加 nudge 微调（世界格），重跑 extract-layout.py 后复检。")
        raise SystemExit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--overlay", action="store_true")
    ap.add_argument("--auto-offset", action="store_true")
    ap.add_argument("--fix-landmarks", action="store_true")
    ap.add_argument("--suggest-centroids", action="store_true")
    ap.add_argument("--check-landmarks", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    mc = map_config(cfg, args.map_id)
    if args.auto_offset:
        auto_offset(cfg, mc)
    if args.fix_landmarks:
        fix_landmarks(cfg, mc)
    if args.overlay:
        overlay(cfg, mc)
    if args.suggest_centroids:
        suggest_centroids(cfg, mc)
    if args.check_landmarks:
        check_landmarks(cfg, mc)


if __name__ == "__main__":
    main()
