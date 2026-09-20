/**
 * 长程邻接（关隘 / 渡口）的服务端加载器。同样 ⛔ 无导入期副作用。
 * 内容文件可以不存在——那就是「本图没有长程链接」，⛔ 不是错误。
 */
import { existsSync, readFileSync } from "node:fs";

import {
    sgzzLinksIndex, validateSgzzLinks, type ISgzzLinkTable,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";

import { SGZZMAP_DEFAULT_MAP_ID } from "./terrain";

const EMPTY: ReadonlyMap<number, readonly number[]> = new Map();

let cache: Map<string, ReadonlyMap<number, readonly number[]>> | null = null;

export function linksOf(mapId: string = SGZZMAP_DEFAULT_MAP_ID): ReadonlyMap<number, readonly number[]> {
    cache ??= new Map();
    const hit = cache.get(mapId);
    if (hit) return hit;

    const file = new URL(`../../../../../kits/sgzzmap/data/maps/${mapId}/links.json`, import.meta.url);
    let index = EMPTY;
    if (existsSync(file)) {
        const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (!validateSgzzLinks(parsed)) throw new Error(`SGZZMAP links.json 不合法：${mapId}`);
        index = sgzzLinksIndex(parsed as ISgzzLinkTable);
    }
    cache.set(mapId, index);
    return index;
}

export function resetSgzzLinksCache(): void {
    cache = null;
}
