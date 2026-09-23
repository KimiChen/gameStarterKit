/**
 * mapOriginal **道路层**常量（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 坐标系由干净集 `road_info.lua` 直给：网格 **1125²**、一个路格**半宽 200 / 半高 100**
 *   （逻辑格是 150/75）= **4/3 个逻辑格**。★ 独立佐证：18 张路片**每张都正好 400×200 px**
 *   = `grid_width×2 / grid_height×2`。
 * ★ 选片**在制图期就烘死了**（`tiles` 的值即 `type_info` 下标），运行时 ⛔ 不做邻接判断 ——
 *   与河同构。每片带一个**水平翻转**位。
 * ★ [实测] client_res → prefab → texture；[disasm] 地貌带选 `_雪地` 同名资源。
 * ⚠ 图集按 **0.5×** 缩存，`native` 记原版像素（世界尺寸依据）。
 */

export interface IMapoRoadCell {
    readonly id: number;
    readonly snowId: number;
    readonly clientResId: number;
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
export const MAPO_ROAD_CELLS: readonly IMapoRoadCell[] = [{"id": 0, "snowId": 18, "clientResId": 1170, "rect": [2, 2, 200, 100], "native": [400, 200], "cls": "downend"}, {"id": 1, "snowId": 19, "clientResId": 1171, "rect": [204, 2, 200, 100], "native": [400, 200], "cls": "downend"}, {"id": 2, "snowId": 20, "clientResId": 1172, "rect": [406, 2, 200, 100], "native": [400, 200], "cls": "downtcross"}, {"id": 3, "snowId": 21, "clientResId": 1173, "rect": [608, 2, 200, 100], "native": [400, 200], "cls": "downverticalturn"}, {"id": 4, "snowId": 22, "clientResId": 1174, "rect": [810, 2, 200, 100], "native": [400, 200], "cls": "downverticalturn"}, {"id": 5, "snowId": 23, "clientResId": 1175, "rect": [2, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 6, "snowId": 24, "clientResId": 1176, "rect": [204, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 7, "snowId": 25, "clientResId": 1177, "rect": [406, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 8, "snowId": 26, "clientResId": 1178, "rect": [608, 104, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 9, "snowId": 27, "clientResId": 1179, "rect": [810, 104, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 10, "snowId": 28, "clientResId": 1180, "rect": [2, 206, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 11, "snowId": 29, "clientResId": 1181, "rect": [204, 206, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 12, "snowId": 30, "clientResId": 1182, "rect": [406, 206, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 13, "snowId": 31, "clientResId": 1183, "rect": [608, 206, 200, 100], "native": [400, 200], "cls": "upend"}, {"id": 14, "snowId": 32, "clientResId": 1184, "rect": [810, 206, 200, 100], "native": [400, 200], "cls": "uptcross"}, {"id": 15, "snowId": 33, "clientResId": 1185, "rect": [2, 308, 200, 100], "native": [400, 200], "cls": "upverticalturn"}, {"id": 16, "snowId": 34, "clientResId": 1186, "rect": [204, 308, 200, 100], "native": [400, 200], "cls": "upverticalturn"}, {"id": 17, "snowId": 35, "clientResId": 1187, "rect": [406, 308, 200, 100], "native": [400, 200], "cls": "xcross"}, {"id": 18, "snowId": 18, "clientResId": 26001, "rect": [608, 308, 200, 100], "native": [400, 200], "cls": "downend"}, {"id": 19, "snowId": 19, "clientResId": 26002, "rect": [810, 308, 200, 100], "native": [400, 200], "cls": "downend"}, {"id": 20, "snowId": 20, "clientResId": 26003, "rect": [2, 410, 200, 100], "native": [400, 200], "cls": "downtcross"}, {"id": 21, "snowId": 21, "clientResId": 26004, "rect": [204, 410, 200, 100], "native": [400, 200], "cls": "downverticalturn"}, {"id": 22, "snowId": 22, "clientResId": 26005, "rect": [406, 410, 200, 100], "native": [400, 200], "cls": "downverticalturn"}, {"id": 23, "snowId": 23, "clientResId": 26006, "rect": [608, 410, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 24, "snowId": 24, "clientResId": 26007, "rect": [810, 410, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 25, "snowId": 25, "clientResId": 26008, "rect": [2, 512, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 26, "snowId": 26, "clientResId": 26009, "rect": [204, 512, 200, 100], "native": [400, 200], "cls": "horizonalturn"}, {"id": 27, "snowId": 27, "clientResId": 26010, "rect": [406, 512, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 28, "snowId": 28, "clientResId": 26011, "rect": [608, 512, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 29, "snowId": 29, "clientResId": 26012, "rect": [810, 512, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 30, "snowId": 30, "clientResId": 26013, "rect": [2, 614, 200, 100], "native": [400, 200], "cls": "line"}, {"id": 31, "snowId": 31, "clientResId": 26014, "rect": [204, 614, 200, 100], "native": [400, 200], "cls": "upend"}, {"id": 32, "snowId": 32, "clientResId": 26015, "rect": [406, 614, 200, 100], "native": [400, 200], "cls": "uptcross"}, {"id": 33, "snowId": 33, "clientResId": 26016, "rect": [608, 614, 200, 100], "native": [400, 200], "cls": "upverticalturn"}, {"id": 34, "snowId": 34, "clientResId": 26017, "rect": [810, 614, 200, 100], "native": [400, 200], "cls": "upverticalturn"}, {"id": 35, "snowId": 35, "clientResId": 26018, "rect": [2, 716, 200, 100], "native": [400, 200], "cls": "xcross"}];
