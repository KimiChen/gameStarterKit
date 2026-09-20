/**
 * 客户端地形：直接消费 shared 的内容模块（varint-RLE + base64），⛔ 不走资源加载。
 * 好处是首帧就能画，⛔ 不用等 Texture/Buffer 资源到位，也不需要给 cc 类型桩加 BufferAsset。
 * ⚠ 首次调用才解码（2.25 MB Uint8Array，一次分配）；⛔ 顶层无副作用。
 */
import {
    decodeSgzzTerrainRle, sgzzIsPassable, sgzzTerrainAt, type ISgzzTerrain,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_TERRAIN_COLS, SGZZ_TERRAIN_MAP_ID, SGZZ_TERRAIN_PALETTE,
    SGZZ_TERRAIN_RLE_B64, SGZZ_TERRAIN_ROWS,
} from "../../../shared/kits/sgzzmap/content/terrain.data";

let cache: ISgzzTerrain | null = null;

export function sgzzTerrain(): ISgzzTerrain {
    if (!cache) {
        cache = decodeSgzzTerrainRle({
            mapId: SGZZ_TERRAIN_MAP_ID, rows: SGZZ_TERRAIN_ROWS, cols: SGZZ_TERRAIN_COLS,
            palette: SGZZ_TERRAIN_PALETTE, rle: SGZZ_TERRAIN_RLE_B64,
        });
    }
    return cache;
}
export function sgzzTerrainIdAt(row: number, col: number): number {
    return sgzzTerrainAt(sgzzTerrain(), row, col);
}
export function sgzzPassableAt(row: number, col: number): boolean {
    return sgzzIsPassable(sgzzTerrain(), row, col);
}
export function resetSgzzTerrain(): void { cache = null; }
