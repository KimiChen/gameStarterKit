/**
 * arena kit · `ranking` api 面（客户端，docs/KIT.md §4）：排名的格式化助手（排序规则只在 shared 面一处）。
 * ⛔ 不 import cc（铁律 9）。本面任何导出变化都要 bump `apps/kits/arena/kit.json` 的 `api.ranking.version`。
 */
import type { IArenaTile } from "../../../../shared/kits/arena/api/board/index";
import { type IArenaOwnerRank, rankOwners } from "../../../../shared/kits/arena/api/ranking/index";

export { rankOwners };
export type { IArenaOwnerRank };

/** 前 `limit` 名的一行文案：`1. u1 · 3 格 · 守备 7`（本人标 ▶）。 */
export function formatRanking(tiles: readonly IArenaTile[], selfUid: string, limit = 3): string[] {
    return rankOwners(tiles).slice(0, limit).map((entry, index) =>
        `${index + 1}. ${entry.ownerUid === selfUid ? "▶ 我" : entry.ownerUid} · ${entry.tiles} 格 · 守备 ${entry.power}`);
}
