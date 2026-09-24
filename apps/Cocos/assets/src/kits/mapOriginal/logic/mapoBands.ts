/**
 * 季/地貌带的**逐格判定**（N1）：哪格该换雪件/沙件。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 与原版同一条数据链（docs/MAPORIGINAL-2D.md §3.2）：
 *   原版 `map_mgr:check_ground_type(row, col)`
 *     = `GROUND_TYPE_NAMES[logic_background.bytes 格值] or "ground"`
 *   （枚举定义是干净集 `const.lua:252` 的 `def_enum("GROUND_TYPE", "ground", "snow", "desert")`；
 *   层归属是干净集 `map_layer_config.lua` 的 `logic_ground = logic_background.bytes`）。
 *   ⇒ 本模块照抄：**格值 2 → 雪、3 → 沙、其余（含 7/8/9/11/13/16/17/18）→ 基础季**。
 *
 * ⛔ **不要用雪/沙「块」层（`mapoBlocks`）当选件判据**：块带是 10×10 格的粗粒度贴片归属，
 *   且 489 块雪沙双挂（§1.3「叠不是替」）；cell 级的 `logic_background` 在那些块里
 *   逐格各有唯一定论（实测 41,295 格雪 / 3,292 格沙 / 813 格草）。块级判据会把雪块里
 *   38,066 个草地格误换雪件。打包期已交叉校验：值 2 格 100% 落在雪块内、值 3 格 100%
 *   落在沙块内（`bands.info.json`）。
 *
 * ⚠ 数据走 shared 内容模块（varint-RLE + base64；文件与解码驻留分别由 O0 审计记录）⇒ **同步可得**，
 *   ⛔ 不需要 View 层注入（与通行层同款，不是 BufferAsset 那条路）。
 * ⚠ 顶层无副作用：首次调用才解码。
 */
import {
    MAPO_BAND_COLS, MAPO_BAND_DESERT, MAPO_BAND_GROUND, MAPO_BAND_RLE_B64,
    MAPO_BAND_ROWS, MAPO_BAND_SNOW,
} from "../../../shared/kits/mapOriginal/content/bands.data";
import { mapoDecodeBase64, mapoDecodeRle } from "../../../shared/kits/mapOriginal/api/hexmap/index";

/** 地图实例的数据读取器；dispose 清空运行时解码结果和 Buffer 视图。 */
export function createMapoBandsData() {
    let cells: Uint8Array | null = null;

    /** 地貌带层（惰性解码一次）。 */
    function bandCells(): Uint8Array {
        if (!cells) {
            cells = mapoDecodeRle(mapoDecodeBase64(MAPO_BAND_RLE_B64), MAPO_BAND_ROWS, MAPO_BAND_COLS);
        }
        return cells;
    }

    /**
     * 该格的地貌带：`MAPO_BAND_SNOW` / `MAPO_BAND_DESERT` / `MAPO_BAND_GROUND`。
     * ⚠ 越界格与未覆盖值一律回 `MAPO_BAND_GROUND`（= 基础季件）——照抄原版的 `or "ground"` 回退。
     */
    function mapoBandAt(row: number, col: number): number {
        if (row < 0 || col < 0 || row >= MAPO_BAND_ROWS || col >= MAPO_BAND_COLS) {
            return MAPO_BAND_GROUND;
        }
        const v = bandCells()[row * MAPO_BAND_COLS + col];
        if (v === MAPO_BAND_SNOW) return MAPO_BAND_SNOW;
        if (v === MAPO_BAND_DESERT) return MAPO_BAND_DESERT;
        return MAPO_BAND_GROUND;
    }

    /** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
    function mapoBandsDataUsage(): Readonly<Record<string, number>> {
        return { arrayBufferBytes: cells?.buffer.byteLength ?? 0, cells: cells?.length ?? 0 };
    }

    return { mapoBandAt, mapoBandsDataUsage,
        dispose(): void { cells = null; },
    };
}

/** 兼容离线烘焙与已有测试；地图运行时必须使用 MapoDataStore 的独立读取器。 */
export const { mapoBandAt, mapoBandsDataUsage } = createMapoBandsData();
