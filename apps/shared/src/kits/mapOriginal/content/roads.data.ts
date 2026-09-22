/**
 * mapOriginal **道路层**常量（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 坐标系由干净集 `road_info.lua` 直给：网格 **1125²**、一个路格**半宽 200 / 半高 100**
 *   （逻辑格是 150/75）= **4/3 个逻辑格**。★ 独立佐证：18 张路片**每张都正好 400×200 px**
 *   = `grid_width×2 / grid_height×2`。
 * ★ 选片**在制图期就烘死了**（`tiles` 的值即 `type_info` 下标），运行时 ⛔ 不做邻接判断 ——
 *   与河同构。每片带一个**水平翻转**位。
 * ⚠ 图集格 → 精灵的绑定是 `[推断]`（邻接度结构签名 + 字母序，18 位逐位全等）：
 *   `client_res` 在未解的 `base.cw` 里。⛔ 别当干净集引用。
 * ⚠ 图集按 **0.5×** 缩存，`native` 记原版像素（世界尺寸依据）。
 */

export interface IMapoRoadCell {
    readonly id: number;
    /** 图集像素矩形 [x, y, w, h]（**已缩**）。 */
    readonly rect: readonly [number, number, number, number];
    /** 原图像素（**未缩**，恒 400×200 = 一个路格）。 */
    readonly native: readonly [number, number];
    /** 片类：line / horizonalturn / up+downverticalturn / up+downend / up+downtcross / xcross。 */
    readonly cls: string;
}

/** 路格网格边长。 */
export const MAPO_ROAD_SIDE = 1125;
/** 一个路格的半宽 / 半高（**原版 px**）。 */
export const MAPO_ROAD_HALF_W = 200;
export const MAPO_ROAD_HALF_H = 100;
export const MAPO_ROAD_S_BIAS = 0;
export const MAPO_ROAD_D_BIAS = 1125;
/** 摆放表单条长度（u16 s, u16 d, u8 图集格, u8 水平翻转）。 */
export const MAPO_ROAD_RECORD_BYTES = 6;
export const MAPO_ROAD_HEADER_BYTES = 4;
export const MAPO_ROAD_ATLAS_W = 1024;
export const MAPO_ROAD_ATLAS_H = 1024;
export const MAPO_ROAD_CELLS: readonly IMapoRoadCell[] = [{"id": 0, "rect": [2, 2, 200, 100], "native": [400, 200], "cls": "downend"}, {"id": 1, "rect": [204, 2, 200, 100], "native": [400, 200], "cls": "downend"}, {"id": 2, "rect": [406, 2, 200, 100], "native": [400, 200], "cls": "downtcross"}, {"id": 3, "rect": [608, 2, 200, 100], "native": [400, 200], "cls": "downverticalturn"}, {"id": 4, "rect": [810, 2, 200, 100], "native": [400, 200], "cls": "downverticalturn"}, {"id": 5, "rect": [2, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 6, "rect": [204, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 7, "rect": [406, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 8, "rect": [608, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 9, "rect": [810, 104, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 10, "rect": [2, 206, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 11, "rect": [204, 206, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 12, "rect": [406, 206, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 13, "rect": [608, 206, 200, 100], "native": [400, 200], "cls": "upend"}, {"id": 14, "rect": [810, 206, 200, 100], "native": [400, 200], "cls": "uptcross"}, {"id": 15, "rect": [2, 308, 200, 100], "native": [400, 200], "cls": "upverticalturn"}, {"id": 16, "rect": [204, 308, 200, 100], "native": [400, 200], "cls": "upverticalturn"}, {"id": 17, "rect": [406, 308, 200, 100], "native": [400, 200], "cls": "xcross"}];
