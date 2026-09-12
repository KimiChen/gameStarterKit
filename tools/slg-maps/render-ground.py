#!/usr/bin/env python3
"""纯地表+植被+场景装饰渲染：海色底 + Ground_WaterMask（水色混合）+ Ground + Ground_Under
+ TileChunkData 植被层（树阵/贴花/崖沿）+ prefabs 场景装饰件（蘑菇屋/雕像/建筑群）。

复用 zjcs-1.2.6/scripts/render_map_full.py 的 Env/bundle 装载与解码（sys.path 注入 import），
跳过 Ground_Manual（纯白遮罩）与解锁锁线/虚线/红点等 UI 标记（运行时系统控制件）。

默认整图直出（px/格 = min(168, MAX_PX/最长边)）。--hi-res：按 32×32 渲染格分块、每块 168px/格
（原版地砖分辨率）直出 out/<mapId>/render-blocks/<rx>-<ry>.png（跨块装饰扩 2 格边距渲染后裁掉）。

用法：render-ground.py <mapId> [--hi-res]
输出：out/<mapId>/ground.png + ground.meta.json；--hi-res 时另出 render-blocks/。
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
UI_MARKS = ("unlock", "xuxian", "dot")  # 解锁锁线/虚线/红点标记：运行时系统控制，不属地表
BLOCK_G = 32      # 高分块边长（渲染格）
BLOCK_MARGIN = 2  # 块界扩边（跨块装饰件伸出部分画进来，写图时裁掉）


def draw_image_clamped(canvas, img, cx, cy, w, h, ang, pivot):
    """render_map_full.draw_image 的边界安全版：支持负坐标（分块裁剪）。"""
    from PIL import Image
    if img is None or w <= 0 or h <= 0:
        return
    tw, th = max(1, int(round(w))), max(1, int(round(h)))
    if (tw, th) != img.size:
        img = img.resize((tw, th), Image.LANCZOS)
    if abs(ang) > 0.5:
        img = img.rotate(-ang, expand=True, resample=Image.BICUBIC)
    px = cx - img.size[0] * pivot[0]
    py = cy - img.size[1] * (1 - pivot[1])
    x0c, y0c = int(round(px)), int(round(py))
    sx0, sy0 = max(0, -x0c), max(0, -y0c)
    dx0, dy0 = max(0, x0c), max(0, y0c)
    dx1, dy1 = min(canvas.size[0], x0c + img.size[0]), min(canvas.size[1], y0c + img.size[1])
    if dx1 <= dx0 or dy1 <= dy0:
        return
    piece = img.crop((sx0, sy0, sx0 + (dx1 - dx0), sy0 + (dy1 - dy0)))
    canvas.alpha_composite(piece.convert("RGBA"), (dx0, dy0))


def main() -> None:
    map_id = sys.argv[1]
    hi_res = "--hi-res" in sys.argv
    sys.path.insert(0, str(HERE))
    from lib.zjcs import load_config, map_config, zjcs
    cfg = load_config()
    mc = map_config(cfg, map_id)
    mid = mc["classId"]

    scripts = zjcs(cfg, "scripts")
    sys.path.insert(0, str(scripts))
    import render_map_full as R  # noqa: E402
    from PIL import Image  # noqa: E402

    R.draw_image = draw_image_clamped  # 分块边界安全（R.draw_tile_chunks 内部走它）

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

    # 植被瓦片 chunk（Rug/Highland/Shadow/UnderObject/Object·Dense_Object——树阵/贴花/崖沿）
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

    # 场景装饰 prefabs（蘑菇屋/雕像/建筑群；小怪是 EcEntity 不在此）
    items = []
    envs = [env]
    for suffix in ("_prefabs.bundle", "_prefabs_n.bundle", "_extensions.bundle"):
        f = R.bundle_files(f"{tag}{suffix}", have, dev)
        if f:
            e2 = R.Env(f)
            envs.append(e2)
            its = R.collect_renderers(e2)
            for it in its:
                it["env"] = e2
            items += its
    print(f"  装饰 prefabs: {len(items)} 个 SpriteRenderer")

    # 画布范围
    xs, ys = [], []
    for _n, _f, t in tms:
        o, s = t["m_Origin"], t["m_Size"]
        xs += [o["x"], o["x"] + s["x"]]
        ys += [o["y"], o["y"] + s["y"]]
    for it in items:
        xs.append(it["x"]); ys.append(it["y"])
    x0, x1, y0, y1 = min(xs) - 2, max(xs) + 3, min(ys) - 2, max(ys) + 3
    wu, hu = x1 - x0, y1 - y0
    px_per_unit = 168.0 if hi_res else min(168.0, R.MAX_PX / max(wu, hu))
    print(f"Map{mid} {'高分' if hi_res else '纯地表'}: {wu}x{hu} 格, {px_per_unit:.1f}px/格，窗 x[{x0},{x1}) y[{y0},{y1})")

    def draw_tiles(canvas, to_px, name, fname, t):
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
                    draw_image_clamped(canvas, img2, cx, cy, w, h, 0, (0.5, 0.5))
                except ImportError:
                    pass
            else:
                draw_image_clamped(canvas, img, cx, cy, w, h, 0, (0.5, 0.5))
            n_draw += 1
        return n_draw

    def render_window(wx0, wy0, wx1, wy1):
        """渲染窗格 [wx0,wx1)×[wy0,wy1) 范围的画布。"""
        W, H = int((wx1 - wx0) * px_per_unit), int((wy1 - wy0) * px_per_unit)
        canvas = Image.new("RGBA", (W, H), sea_base)

        def to_px(x, y):
            return (x - wx0) * px_per_unit, (wy1 - y) * px_per_unit

        for name, fname, t in sorted((tm for tm in tms if tm[0] in R.DRAW_SEQ), key=lambda x: R.DRAW_SEQ[x[0]]):
            if name == "Ground_Manual":
                continue
            draw_tiles(canvas, to_px, name, fname, t)
        if chunks_env is not None:
            R.draw_tile_chunks(canvas, chunks_env, chunks, to_px, px_per_unit, px_per_unit)
        items_sorted = sorted(items, key=lambda i: (i["layer"], i["order"], -i["y"]))
        for it in items_sorted:
            fid, spid = it["sp"][1], it["sp"][2]
            obj = it["env"].resolve(it["sp"][0], fid, spid)
            spname = ""
            if obj is not None:
                try:
                    spname = obj.read().m_Name.lower()
                except Exception:
                    pass
            if any(k in spname for k in UI_MARKS):
                continue
            img, ppu, pivot = it["env"].sprite_image(*it["sp"])
            if img is None:
                continue
            w = img.size[0] / ppu * it["sx"] * px_per_unit
            h = img.size[1] / ppu * it["sy"] * px_per_unit
            cx, cy = to_px(it["x"], it["y"])
            draw_image_clamped(canvas, img, cx, cy, w, h, it["ang"], pivot)
        return canvas

    out_dir = HERE / "out" / map_id
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "cols": wu, "rows": hu,
            "pxPerCell": px_per_unit, "image": "ground.png"}
    (out_dir / "ground.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not hi_res:
        canvas = render_window(x0, y0, x1, y1)
        canvas.convert("RGB").save(out_dir / "ground.png")
        print(f"  → {out_dir}/ground.png + ground.meta.json")
        return

    # 高分分块：32×32 渲染格/块，168px/格（5376²/块），扩边 2 格渲染后裁掉
    blocks_dir = out_dir / "render-blocks"
    blocks_dir.mkdir(exist_ok=True)
    for old in blocks_dir.glob("*.png"):
        old.unlink()
    import math as _math
    nbx, nby = _math.ceil(wu / BLOCK_G), _math.ceil(hu / BLOCK_G)
    for ry in range(nby):
        for rx in range(nbx):
            wx0 = x0 + rx * BLOCK_G - BLOCK_MARGIN
            wy0 = y0 + ry * BLOCK_G - BLOCK_MARGIN
            wx1 = min(x0 + (rx + 1) * BLOCK_G + BLOCK_MARGIN, x1)
            wy1 = min(y0 + (ry + 1) * BLOCK_G + BLOCK_MARGIN, y1)
            block = render_window(wx0, wy0, wx1, wy1)
            # 裁掉扩边（块图内容 = 窗格 [x0+rx*G, x0+(rx+1)*G) × [y0+ry*G, y0+(ry+1)*G)）
            m = BLOCK_MARGIN * px_per_unit
            right = m + min(BLOCK_G, x1 - (x0 + rx * BLOCK_G)) * px_per_unit
            bottom = m + min(BLOCK_G, y1 - (y0 + ry * BLOCK_G)) * px_per_unit
            block = block.crop((round(m), round(m), round(right), round(bottom)))
            block.convert("RGB").save(blocks_dir / f"{rx}-{ry}.png")
        print(f"  块行 {ry + 1}/{nby} 完成")
    print(f"  → {blocks_dir}/（{nbx}×{nby} 块，168px/格）")


if __name__ == "__main__":
    main()
