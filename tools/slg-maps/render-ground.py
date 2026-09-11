#!/usr/bin/env python3
"""纯地表渲染：海色底 + Ground_WaterMask（水色混合）+ Ground + Ground_Under。

复用 zjcs-1.2.6/scripts/render_map_full.py 的 Env/bundle 装载与 Tilemap 解码（sys.path 注入 import），
跳过 Ground_Manual（纯白遮罩）、瓦片 chunk 装饰、prefabs 装饰与 Ground_Above 压顶。

用法：render-ground.py <mapId>
输出：
  tools/slg-maps/out/<mapId>/ground.png       全分辨率纯地表（上限 9000px）
  tools/slg-maps/out/<mapId>/ground.meta.json 渲染窗 {x0,y0,x1,y1,cols,rows,pxPerCell}（回填 config render.window）
"""
import json
import sys
from pathlib import Path

ZJCS_SCRIPTS = None  # main 里按 config 定
HERE = Path(__file__).resolve().parent


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("用法: render-ground.py <mapId>")
    sys.path.insert(0, str(HERE))
    from lib.zjcs import load_config, map_config, zjcs
    cfg = load_config()
    mc = map_config(cfg, sys.argv[1])
    mid = mc["classId"]

    scripts = zjcs(cfg, "scripts")
    sys.path.insert(0, str(scripts))
    import render_map_full as R  # noqa: E402  仓外学习包渲染器（只读复用）
    from PIL import Image  # noqa: E402

    have = json.load(open(R.MAP_BUNDLES))
    dev = R.parse_manifest(R.DEV_MAN)
    tag = f"mapground_{mid}"
    cand2 = [n for n in (info["name"] for info in have.values())
             if n.endswith("_bare.bundle") and n.startswith(f"defaultpackage_assets_partition_{tag}")]
    bare_f = None
    for c in [f"{tag}_bare.bundle"] + cand2:
        bare_f = R.bundle_files(c, have, dev)
        if bare_f:
            break
    if bare_f is None:
        raise SystemExit(f"{tag}: 无 bare bundle")
    sea_base = tuple(mc.get("seaColor") or [66, 143, 163]) + (255,)
    sea_edge = tuple(mc.get("seaEdge") or [209, 252, 255]) + (255,)
    env = R.Env(bare_f)
    tms = R.collect_tilemaps(env)
    if not tms:
        raise SystemExit(f"Map{mid}: bare 无瓦片")

    # 植被瓦片 chunk（TileChunkData：Rug 地坪贴花/Highland 崖沿/UnderObject/Object·Dense_Object 树阵）
    # ——地表丰富度与「林地」反分类的来源；跳过 Shadow（投影）与 prefabs 大装饰。
    chunks = []
    chunks_env = None
    cfiles = []
    for suffix in ("_chunks.bundle", "_chunks_n.bundle"):
        f = R.bundle_files(f"{tag}{suffix}", have, dev)
        if f:
            cfiles += f
    if cfiles:
        chunks_env = R.Env(cfiles)
        chunks = R.collect_tile_chunks(chunks_env)
        print(f"  瓦片chunk: {len(chunks)} 个（含变体层）")

    # 画布范围：只取地表层（纯地表渲染不含装饰/chunk 的范围扩边）
    xs, ys = [], []
    for _n, _f, t in tms:
        o, s = t["m_Origin"], t["m_Size"]
        xs += [o["x"], o["x"] + s["x"]]
        ys += [o["y"], o["y"] + s["y"]]
    x0, x1, y0, y1 = min(xs) - 2, max(xs) + 3, min(ys) - 2, max(ys) + 3
    wu, hu = x1 - x0, y1 - y0
    px_per_unit = min(168.0, R.MAX_PX / max(wu, hu))
    W, H = int(wu * px_per_unit), int(hu * px_per_unit)
    print(f"Map{mid} 纯地表: 画布 {W}x{H}（{wu}x{hu} 格, {px_per_unit:.1f}px/格）窗 x[{x0},{x1}) y[{y0},{y1})")

    canvas = Image.new("RGBA", (W, H), sea_base)

    def to_px(x, y):
        return (x - x0) * px_per_unit, (y1 - y) * px_per_unit

    def draw_tiles(name, fname, t):
        sprite_arr = t["m_TileSpriteArray"]
        matrix_arr = t["m_TileMatrixArray"]
        n_draw = 0
        cache = {}
        for tile in t["m_Tiles"]:
            pos, td = tile[0], tile[1]
            si = td.get("m_TileSpriteIndex", 0)
            if si >= len(sprite_arr):
                continue
            key = (fname, si)
            if key not in cache:
                pp = sprite_arr[si]["m_Data"]
                cache[key] = env.sprite_image(fname, pp.get("m_FileID", 0), pp.get("m_PathID", 0))
            img, ppu, pivot = cache[key]
            if img is None:
                continue
            mi = td.get("m_TileMatrixIndex", 0)
            m = matrix_arr[mi]["m_Data"] if mi < len(matrix_arr) else None
            fx = -1.0 if (m and m.get("e00", 1) < 0) else 1.0
            fy = -1.0 if (m and m.get("e11", 1) < 0) else 1.0
            cell = px_per_unit
            cx, cy = to_px(pos["x"] + 0.5, pos["y"] + 0.5)
            w = img.size[0] / 168.0 * cell
            h = img.size[1] / 168.0 * cell
            if fx < 0 or fy < 0:
                img = img.transpose(Image.FLIP_LEFT_RIGHT if fx < 0 else Image.FLIP_TOP_BOTTOM)
                cache[key] = (img, ppu, pivot)
            if name == "Ground_WaterMask":
                try:
                    import numpy as _np
                    a = _np.asarray(img.resize((max(1, int(w)), max(1, int(h)))), dtype=_np.float32)[..., 3:4] / 255.0 * 0.62
                    base = _np.array(sea_base[:3], dtype=_np.float32)
                    edge = _np.array(sea_edge[:3], dtype=_np.float32)
                    rgb = (base * (1 - a) + edge * a).astype("uint8")
                    img2 = Image.fromarray(rgb, "RGB").convert("RGBA")
                    canvas.alpha_composite(img2, (int(cx - w / 2), int(cy - h / 2)))
                except ImportError:
                    pass
            else:
                R.draw_image(canvas, img, cx, cy, w, h, 0, (0.5, 0.5))
            n_draw += 1
        return n_draw

    for name, fname, t in sorted((tm for tm in tms if tm[0] in R.DRAW_SEQ), key=lambda x: R.DRAW_SEQ[x[0]]):
        if name == "Ground_Manual":
            print(f"  层 {name}: {len(t['m_Tiles'])} 块为白色遮罩，跳过")
            continue
        print(f"  层 {name}: 绘制 {draw_tiles(name, fname, t)} 瓦片")

    # 1.5) 植被瓦片 chunk（Rug/Highland/Shadow/UnderObject/Object·Dense_Object——树阵/贴花/崖沿）
    if chunks_env is not None:
        R.draw_tile_chunks(canvas, chunks_env, chunks, to_px, px_per_unit, px_per_unit)

    out_dir = HERE / "out" / sys.argv[1]
    out_dir.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_dir / "ground.png")
    meta = {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "cols": wu, "rows": hu,
            "pxPerCell": px_per_unit, "image": "ground.png"}
    (out_dir / "ground.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  → {out_dir}/ground.png + ground.meta.json（请把 window 回填 maps.config.json 的 render.window）")


if __name__ == "__main__":
    main()
