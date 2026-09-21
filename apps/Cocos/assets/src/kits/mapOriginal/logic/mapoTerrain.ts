/**
 * 客户端地形：**两层**。
 *
 *   ① 通行层（4 类）：来自 shared 内容模块（varint-RLE + base64）⇒ **首帧即可画轮廓**，
 *      ⛔ 不等资源加载。将来接玩法时服务端也用它。
 *   ② 显示层（16 类）：2.25 MB 的 `terrain.bytes`，走 Cocos `BufferAsset`。
 *      ⚠ 为什么不塞 shared：它一阶熵 2.95 bit/格，varint-RLE 反而胀到 125.6%（3.9 MB TS）。
 *
 * ⚠ 顶层无副作用：首次调用才解码；显示层由 View 层加载完调 `mapoSetDisplayTerrain` 注入。
 */
import {
    decodeMapoTerrainRle, mapoIsPassable, mapoTerrainAt, type IMapoTerrain,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import {
    MAPO_TERRAIN_COLS, MAPO_TERRAIN_MAP_ID, MAPO_TERRAIN_PALETTE,
    MAPO_TERRAIN_RLE_B64, MAPO_TERRAIN_ROWS,
} from "../../../shared/kits/mapOriginal/content/terrain.data";

let passCache: IMapoTerrain | null = null;

/** 4 类通行层（shared 单源）。 */
export function mapoPassTerrain(): IMapoTerrain {
    if (!passCache) {
        passCache = decodeMapoTerrainRle({
            mapId: MAPO_TERRAIN_MAP_ID, rows: MAPO_TERRAIN_ROWS, cols: MAPO_TERRAIN_COLS,
            palette: MAPO_TERRAIN_PALETTE, rle: MAPO_TERRAIN_RLE_B64,
        });
    }
    return passCache;
}

export function mapoPassableAt(row: number, col: number): boolean {
    return mapoIsPassable(mapoPassTerrain(), row, col);
}

/** 通行层的 4 类 id：0 陆 / 1 河 / 2 山 / 3 水。首帧轮廓按它上色。 */
export function mapoPassClassAt(row: number, col: number): number {
    return mapoTerrainAt(mapoPassTerrain(), row, col);
}

// ── 显示层（16 类，Cocos BufferAsset 注入） ──────────────────────────────────

let displayCells: Uint8Array | null = null;
let displayCols = 0;

/**
 * 注入 `terrain.bytes` 的原始字节（含 8 字节大端头）。
 * ⚠ 校验头里的 rows/cols 与 shared 常量一致，⛔ 对不上就拒收 —— 错位的地形是最难查的 bug。
 */
export function mapoSetDisplayTerrain(buf: ArrayBuffer | Uint8Array): void {
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

export function mapoHasDisplayTerrain(): boolean {
    return displayCells !== null;
}

/**
 * 显示类 id（0..15）。**显示层没到位时退回通行层的 4 类**，
 * ⛔ 不要返回 -1 让渲染器去判空 —— 首帧就该能画出东西。
 */
export function mapoDisplayClassAt(row: number, col: number): number {
    if (displayCells && row >= 0 && col >= 0
        && row < MAPO_TERRAIN_ROWS && col < MAPO_TERRAIN_COLS) {
        return displayCells[row * displayCols + col];
    }
    return mapoPassClassAt(row, col);
}

/** 仅供测试重置。 */
export function resetMapoTerrain(): void {
    passCache = null;
    displayCells = null;
    displayCols = 0;
}
