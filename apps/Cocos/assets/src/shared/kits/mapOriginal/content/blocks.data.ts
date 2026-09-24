/**
 * mapOriginal **snow / desert 块级地貌带**常量（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 三个地表层是「**叠**」不是「替」（MAPORIGINAL-2D §1.3）：
 *   `POLYGON_LAYER_ORDER = {ground: 100, desert: 200, snow: 300}`，
 *   同一块可以同时挂草地底 + 沙漠贴片 + 雪贴片（实测 **489 块**两者兼有）。
 * ★ 网格与地表底同构（152² 块 / 一块 10×10 格 / 原点 −10），
 *   ⚠ 但是**行主序** —— ⛔ 与 `river.bytes` 的列主序不同。实测判据：行主序下
 *   desert 块中心 88.58% 落在 `logic_background == 3` 上，列主序只有 4.29%。
 * ★ 字节值就是路径表下标（desert 1..51、snow 1..52），选片**制图期烘死**，运行时零判断。
 * ★ UV 按原版世界像素 / 纹理尺寸投影，v 翻转（MAPORIGINAL-2D §1.8）。
 *   导出期验证全部片的 calc_uv_in_world=true / scale=1 / angle=0 / offset=0。
 */

export interface IMapoBlockLayer {
    readonly kind: string;
    /** `POLYGON_LAYER_ORDER`：越大越靠上。 */
    readonly order: number;
    /** 路径表条数 = 字节值上界。 */
    readonly geoCount: number;
    /** 底纹的原版像素尺寸，同时决定世界 UV 周期。 */
    readonly textureSize: readonly [number, number];
}

export const MAPO_BLOCK_S_BIAS = 32;
export const MAPO_BLOCK_D_BIAS = 1536;
export const MAPO_BLOCK_RECORD_BYTES = 6;
export const MAPO_BLOCK_HEADER_BYTES = 4;
export const MAPO_BLOCK_LAYERS: readonly IMapoBlockLayer[] = [{"kind": "desert", "order": 200, "geoCount": 51, "textureSize": [256, 256]}, {"kind": "snow", "order": 300, "geoCount": 52, "textureSize": [256, 256]}];
