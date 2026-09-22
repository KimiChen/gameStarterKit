/**
 * mapOriginal **地表底**常量（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 原版的地表底是「**一块 10×10 格 + 一张 256² 底纹整数次 GL_REPEAT**」
 *   （docs/MAPORIGINAL-2D.md §1.4），⛔ **不是「每格一块菱形地砖」** ——
 *   观感是「一整张连续的大地毯被菱形裁出来」。
 * ★ 整张 S1 的底就是**一张** `ground_down/underground1.png`（§1.5）：
 *   `get_grid_res()` 取定值 `RES_GRASS_1`、常规季无季节覆盖。
 *   ⇒ 画面上的颜色变化**全部来自上层的 res_field 摆件与山体件**，⛔ 不来自地表底。
 * ★ UV 是**世界轴对齐**的线性映射 ⇒ 底纹**不跟着菱形转**；横向 repeat 11 次、纵向 5 次，
 *   取整周期是为了让**块边界落在整周期上**（块与块之间不出现半个花纹的错茬），
 *   代价是微量拉伸 1.065× / 1.172×。
 * ⚠ 贴图必须 POT 且 wrap = REPEAT/REPEAT，⛔ 不能进图集（图集里没法 GL_REPEAT）。
 */

/** 一块 = 几×几个逻辑格。 */
export const MAPO_GROUND_BLOCK_TILES = 10;
/** S1 的块数（150 + 一圈 margin）。 */
export const MAPO_GROUND_GRID_SIDE = 152;
/** 块 i 覆盖逻辑行 `MAPO_GROUND_BLOCK_TILES · i + MAPO_GROUND_ORIGIN` 起的 BLOCK_TILES 行。 */
export const MAPO_GROUND_ORIGIN = -10;
/** 底纹横向/纵向各铺几次（整数 ⇒ 块边界落在整周期上）。 */
export const MAPO_GROUND_REPEAT_U = 11;
export const MAPO_GROUND_REPEAT_V = 5;
/** 底纹尺寸（px，POT）。 */
export const MAPO_GROUND_TEXTURE_SIZE: readonly [number, number] = [256, 256];
