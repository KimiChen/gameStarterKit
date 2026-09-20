/**
 * 冻结地形内容的服务端加载器。
 *
 * ⛔ 顶层只声明（docs/KIT.md §2「导入期副作用」）：首次调用才读盘、校验、缓存。
 * 地形与区无关（是静态内容），所以缓存按 **进程** 一份，不是按区一份。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { loadSgzzTerrain, type ISgzzTerrain } from "@game/shared/kits/sgzzmap/api/hexmap/index";

export const SGZZMAP_DEFAULT_MAP_ID = "zhongyuan";

let cache: Map<string, ISgzzTerrain> | null = null;

function dataDir(mapId: string): URL {
    // apps/server/src/kits/sgzzmap/content/ → 上 5 层到 apps/
    return new URL(`../../../../../kits/sgzzmap/data/maps/${mapId}/`, import.meta.url);
}

export function terrainOf(mapId: string = SGZZMAP_DEFAULT_MAP_ID): ISgzzTerrain {
    cache ??= new Map();
    const hit = cache.get(mapId);
    if (hit) return hit;

    const dir = dataDir(mapId);
    const meta = JSON.parse(readFileSync(new URL("terrain.info.json", dir), "utf8")) as { sha256?: unknown };
    const bytes = readFileSync(new URL("terrain.bytes", dir));
    // sha256 闸放在这里：shared 零依赖没有 crypto，形状校验在 shared、内容指纹在服务端。
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (typeof meta.sha256 !== "string" || digest !== meta.sha256) {
        throw new Error(`SGZZMAP terrain 内容指纹不符：${mapId}`);
    }
    const loaded = loadSgzzTerrain(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), meta);
    cache.set(mapId, loaded);
    return loaded;
}

/** 仅供测试重置进程级缓存。 */
export function resetSgzzTerrainCache(): void {
    cache = null;
}
