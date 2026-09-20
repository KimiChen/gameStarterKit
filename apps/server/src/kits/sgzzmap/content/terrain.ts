/**
 * 冻结地形内容的服务端入口。
 *
 * ⛔ 这里没有 node:fs —— kit 服务端代码不得 import node:*（kit-import-boundary 规则 ①）。
 * 地形以 shared TS 模块（varint-RLE + base64）进来，权威产物仍是
 * apps/kits/sgzzmap/data/maps/<id>/terrain.bytes，一致性由用例逐字节钉住。
 * ⛔ 顶层只声明：首次调用才解码、缓存。地形与区无关 ⇒ 缓存按**进程**一份。
 */
import { decodeSgzzTerrainRle, type ISgzzTerrain } from "@game/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_TERRAIN_COLS, SGZZ_TERRAIN_MAP_ID, SGZZ_TERRAIN_PALETTE,
    SGZZ_TERRAIN_RLE_B64, SGZZ_TERRAIN_ROWS,
} from "@game/shared/kits/sgzzmap/content/terrain.data";

export const SGZZMAP_DEFAULT_MAP_ID = SGZZ_TERRAIN_MAP_ID;

let cache: ISgzzTerrain | null = null;

export function terrainOf(mapId: string = SGZZMAP_DEFAULT_MAP_ID): ISgzzTerrain {
    if (mapId !== SGZZMAP_DEFAULT_MAP_ID) throw new Error(`SGZZMAP 没有这张图：${mapId}`);
    if (!cache) {
        cache = decodeSgzzTerrainRle({
            mapId: SGZZ_TERRAIN_MAP_ID, rows: SGZZ_TERRAIN_ROWS, cols: SGZZ_TERRAIN_COLS,
            palette: SGZZ_TERRAIN_PALETTE, rle: SGZZ_TERRAIN_RLE_B64,
        });
    }
    return cache;
}

/** 仅供测试重置进程级缓存。 */
export function resetSgzzTerrainCache(): void {
    cache = null;
}
