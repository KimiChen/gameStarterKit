/**
 * 客户端地形：**两层**，值空间不同，⛔ 别混用。
 *
 *   ① 通行层（3 类：0 陆 / 1 河 / 2 山）：来自 shared 内容模块（varint-RLE + base64）
 *      ⇒ **首帧即可画轮廓**，⛔ 不等资源加载。将来接玩法时服务端也用它。
 *   ② 显示层（**原版 res 值** 1..61）：2.25 MB 的 `terrain.bytes`，走 Cocos `BufferAsset`。
 *      ⚠ 为什么不塞 shared：它一阶熵 2.95 bit/格，varint-RLE 反而胀到 125.6%（3.9 MB TS）。
 *
 * ★ 显示层的值就是原版每格的真值（类型 + 等级），近档的地表片与摆件**都**由它查表定，
 *   ⛔ 不掺随机 —— 这是「按原游戏参数摆放」的落点。
 * ⚠ 顶层无副作用：首次调用才解码；显示层由 View 层加载完调 `mapoSetDisplayTerrain` 注入。
 */
import {
    decodeMapoTerrainRle, mapoIsPassable, mapoTerrainAt, type IMapoTerrain,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_TERRAIN_COLS, MAPO_TERRAIN_MAP_ID, MAPO_TERRAIN_PALETTE,
    MAPO_TERRAIN_RLE_B64, MAPO_TERRAIN_ROWS,
} from "../../../shared/kits/mapOriginal/content/terrain.data";

/**
 * 通行类 → 原版值的退化映射。
 * ⚠ 只在显示层还没到位时用，让**整条渲染链只认一个值空间**，
 * ⛔ 不要让渲染器去分辨「这个数是 3 类还是原版值」。
 */
const PASS_TO_VALUE: readonly number[] = [1, 47, 60];

/** 地图实例的数据读取器；dispose 清空运行时解码结果和 Buffer 视图。 */
export function createMapoTerrainData() {
    let passCache: IMapoTerrain | null = null;

    /** 3 类通行层（shared 单源）。 */
    function mapoPassTerrain(): IMapoTerrain {
        if (!passCache) {
            passCache = decodeMapoTerrainRle({
                mapId: MAPO_TERRAIN_MAP_ID, rows: MAPO_TERRAIN_ROWS, cols: MAPO_TERRAIN_COLS,
                palette: MAPO_TERRAIN_PALETTE, rle: MAPO_TERRAIN_RLE_B64,
            });
        }
        return passCache;
    }

    function mapoPassableAt(row: number, col: number): boolean {
        return mapoIsPassable(mapoPassTerrain(), row, col);
    }

    /** 通行层的 3 类 id：0 陆 / 1 河 / 2 山。 */
    function mapoPassClassAt(row: number, col: number): number {
        return mapoTerrainAt(mapoPassTerrain(), row, col);
    }

    // ── 显示层（原版值，Cocos BufferAsset 注入） ────────────────────────────────

    let displayCells: Uint8Array | null = null;

    let displayCols = 0;

    /**
     * 注入 `terrain.bytes` 的原始字节（含 8 字节大端头）。
     * ⚠ 校验头里的 rows/cols 与 shared 常量一致，⛔ 对不上就拒收 —— 错位的地形是最难查的 bug。
     */
    function mapoSetDisplayTerrain(buf: ArrayBuffer | Uint8Array): void {
        const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (u.length < 8) throw new Error("mapOriginal 显示层地形太短");
        const rows = (u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3];
        const cols = (u[4] << 24) | (u[5] << 16) | (u[6] << 8) | u[7];
        if (rows !== MAPO_TERRAIN_ROWS || cols !== MAPO_TERRAIN_COLS
            || u.length !== 8 + rows * cols) {
            throw new Error(`mapOriginal 显示层尺寸不符：${rows}x${cols}/${u.length}`);
        }
        displayCells = u.subarray(8);
        displayCols = cols;
    }

    function mapoHasDisplayTerrain(): boolean {
        return displayCells !== null;
    }

    /**
     * 某格的**原版 res 值**（1..61）。
     * ⚠ 显示层没到位时按通行类退化到同一值空间（陆→1 / 河→47 / 山→60），
     * ⛔ 不要返回 -1 让渲染器去判空 —— 首帧就该能画出东西。
     */
    function mapoValueAt(row: number, col: number): number {
        if (displayCells && row >= 0 && col >= 0
            && row < MAPO_TERRAIN_ROWS && col < MAPO_TERRAIN_COLS) {
            return displayCells[row * displayCols + col];
        }
        return PASS_TO_VALUE[mapoPassClassAt(row, col)] ?? 1;
    }

    /** 仅供测试重置。 */
    function resetMapoTerrain(): void {
        passCache = null;
        displayCells = null;
        displayCols = 0;
    }

    /** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
    function mapoTerrainDataUsage(): Readonly<Record<string, number>> {
        return { arrayBufferBytes: (passCache?.cells.buffer.byteLength ?? 0) + (displayCells?.buffer.byteLength ?? 0),
            passCells: passCache?.cells.length ?? 0, displayCells: displayCells?.length ?? 0 };
    }

    return { mapoPassTerrain, mapoPassableAt, mapoPassClassAt, mapoSetDisplayTerrain, mapoHasDisplayTerrain, mapoValueAt, resetMapoTerrain, mapoTerrainDataUsage,
        dispose(): void { resetMapoTerrain(); },
    };
}

/** 兼容离线烘焙与已有测试；地图运行时必须使用 MapoDataStore 的独立读取器。 */
export const { mapoPassTerrain, mapoPassableAt, mapoPassClassAt, mapoSetDisplayTerrain, mapoHasDisplayTerrain, mapoValueAt, resetMapoTerrain, mapoTerrainDataUsage } = createMapoTerrainData();
