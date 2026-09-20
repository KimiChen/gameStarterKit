"""去水印、海陆掩膜、形态学。阈值全部来自 maps.config.json，⛔ 脚本内不写死。"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ST = np.ones((3, 3), bool)


def load_rgb_hsv(path):
    im = Image.open(path).convert("RGB")
    return np.asarray(im).astype(np.int16), np.asarray(im.convert("HSV")).astype(np.int16)


def strip_watermark(im: Image.Image, wm: dict) -> Image.Image:
    """生成工具在左下角烙的「AI生成」字样不是画面内容（见素材的 生成说明.md）。

    crop：整条下缘切掉（Z09 实测字形盒 x∈[17,124] y∈[1089,1124]，切 y≥1080 留 9px 余量）。
    inpaint：只在需要保留下缘地理时用，按矩形做边缘镜像填充。
    """
    x0, y0, x1, y1 = wm["rect"]
    if wm.get("mode", "crop") == "crop":
        return im.crop((0, 0, im.width, y0))
    a = np.asarray(im).copy()
    h = y1 - y0
    a[y0:y1, x0:x1] = a[max(0, y0 - h):y0, x0:x1][::-1]
    return Image.fromarray(a)


def sea_mask(rgb, hsv, cfg_sea: dict) -> np.ndarray:
    """海 = 偏蓝且偏暗，且属于与图边相连的大连通域。

    ⚠ 只判「偏蓝」会把蓝色系势力色块一起吃掉——Z09 上 V 直方图在 120–130 有明显低谷：
    海聚在 V 90–120，势力蓝块聚在 V 130–150。所以要先用 V 切一刀。
    ⚠ 但纸纹会让蓝色块里散落一些暗像素同样过关，逐像素判完会在大陆内部打出成片空洞
    （calibrate --overlay 上表现为内陆到处是陆缘红线）。真正的海是连到图边的那一片，
    所以再做一次结构判定：只保留与图边相连的连通域。
    """
    r, b = rgb[..., 0], rgb[..., 2]
    raw = ((b - r) > cfg_sea["blueOverRed"]) & (hsv[..., 2] < cfg_sea["maxValue"])
    if not cfg_sea.get("borderConnectedOnly", True):
        return raw
    lab, n = ndi.label(raw, structure=ST)
    if n == 0:
        return raw
    border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])).tolist())
    border.discard(0)
    if not border:
        return raw
    keep = np.isin(lab, list(border))
    min_px = int(cfg_sea.get("minComponentPx", 0))
    if min_px:
        sizes = np.bincount(lab.ravel())
        keep &= np.isin(lab, [i for i in border if sizes[i] >= min_px])
    return keep


def frame_mask(rgb, hsv, sea, cfg_frame: dict) -> np.ndarray:
    """图框羊皮纸底：橄榄／土黄，r≈g>b、饱和度不高。"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (~sea
            & (np.abs(r - g) < cfg_frame["maxChromaRG"])
            & ((r - b) > cfg_frame["minRedOverBlue"])
            & ((r - b) < cfg_frame["maxRedOverBlue"])
            & (hsv[..., 1] < cfg_frame["maxSat"]))


def land_mask(candidate: np.ndarray, morph: dict) -> np.ndarray:
    """候选 → 闭运算合并色块 → 取最大连通域 → 填洞 → 开运算去毛刺 → 再填洞。"""
    closed = ndi.binary_closing(candidate, structure=ST, iterations=morph["closeIterations"])
    lab, n = ndi.label(closed, structure=ST)
    if n == 0:
        raise SystemExit("没有找到任何陆地连通域——检查 frame/sea 阈值")
    sizes = ndi.sum(closed, lab, range(1, n + 1))
    land = ndi.binary_fill_holes(lab == (1 + int(np.argmax(sizes))))
    land = ndi.binary_opening(land, structure=ST, iterations=morph["openIterations"])
    return ndi.binary_fill_holes(land)


def resample_mask(mask: np.ndarray, rows: int, cols: int) -> np.ndarray:
    """按 fit:"grid" 把掩膜重采样到网格分辨率（面积平均后过半即算命中）。"""
    img = Image.fromarray((mask.astype(np.uint8) * 255))
    return np.asarray(img.resize((cols, rows), Image.BOX)) >= 128


def drop_small_components(cells: np.ndarray, min_tiles: int, protect: set | None = None,
                          max_passes: int = 8) -> np.ndarray:
    """任何小于 min_tiles 的同类连通域并入其最大邻类，反复到不动点。

    这是把逐像素噪点变成连贯地块区域的那一步；slg 产出的是矩形所以靠「丢最小的」收敛，
    我们产出稠密字节图，正确的清理是「吸收」。
    ⚠ 必须迭代：把 A 并进邻类 B 之后，B 那一侧可能仍不足 min_tiles，单趟收敛不了。
    protect 里的类别豁免——河流本就是细长连通域，一并吸收会把河网抹平。
    """
    out = cells.copy()
    protect = protect or set()
    for _ in range(max_passes):
        changed = False
        for value in np.unique(out):
            if int(value) in protect:
                continue
            sel_all = out == value
            lab, n = ndi.label(sel_all, structure=ST)
            if n == 0:
                continue
            sizes = ndi.sum(sel_all, lab, range(1, n + 1))
            for idx in np.nonzero(sizes < min_tiles)[0]:
                sel = lab == (idx + 1)
                ring = ndi.binary_dilation(sel, structure=ST) & ~sel
                neigh = out[ring]
                neigh = neigh[neigh != value]
                if neigh.size:
                    vals, cnt = np.unique(neigh, return_counts=True)
                    out[sel] = vals[int(np.argmax(cnt))]
                    changed = True
        if not changed:
            return out
    return out
