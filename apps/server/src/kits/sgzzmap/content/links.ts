/**
 * 长程邻接（关隘 / 渡口）。同样 ⛔ 无 node:*、无导入期副作用。
 * v1 内容包没有长程链接 —— 这是「本图没有」，⛔ 不是错误。
 * 将来要加就往 shared 的 links.data.ts 里加一张 TS 字面量表，走 validateSgzzLinks 过闸。
 */
import { sgzzLinksIndex, validateSgzzLinks, type ISgzzLinkTable } from "@game/shared/kits/sgzzmap/api/hexmap/index";

import { SGZZMAP_DEFAULT_MAP_ID } from "./terrain";

const EMPTY_TABLE: ISgzzLinkTable = { schemaVersion: 1, mapId: SGZZMAP_DEFAULT_MAP_ID, links: [] };

let cache: ReadonlyMap<number, readonly number[]> | null = null;

export function linksOf(mapId: string = SGZZMAP_DEFAULT_MAP_ID): ReadonlyMap<number, readonly number[]> {
    if (mapId !== SGZZMAP_DEFAULT_MAP_ID) throw new Error(`SGZZMAP 没有这张图：${mapId}`);
    if (!cache) {
        if (!validateSgzzLinks(EMPTY_TABLE)) throw new Error("SGZZMAP links 表不合法");
        cache = sgzzLinksIndex(EMPTY_TABLE);
    }
    return cache;
}

export function resetSgzzLinksCache(): void {
    cache = null;
}
