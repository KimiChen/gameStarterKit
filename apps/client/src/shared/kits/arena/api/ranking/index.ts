/**
 * arena kit · `ranking` api 面（shared，docs/KIT.md §4）：棋盘排名的纯函数。零依赖、确定性、⛔ 无 IO。
 * 本面任何导出变化都要 bump `apps/kits/arena/kit.json` 的 `api.ranking.version`。
 */
import type { IArenaTile } from "../board/index";

export interface IArenaOwnerRank {
    readonly ownerUid: string;
    /** 持有格数 */
    readonly tiles: number;
    /** 持有格守备值之和 */
    readonly power: number;
}

/** 按 power 降序、同分按 tile 升序的稳定排序（不改输入）。 */
export function rankTiles(tiles: readonly IArenaTile[]): IArenaTile[] {
    return [...tiles].sort((left, right) => right.power - left.power || left.tile - right.tile);
}

/** 按主人聚合：格数降序 → 守备和降序 → uid 升序；无主格不计。 */
export function rankOwners(tiles: readonly IArenaTile[]): IArenaOwnerRank[] {
    const byOwner = new Map<string, { tiles: number; power: number }>();
    for (const tile of tiles) {
        if (tile.ownerUid === "") continue;
        const entry = byOwner.get(tile.ownerUid) ?? { tiles: 0, power: 0 };
        entry.tiles += 1;
        entry.power += tile.power;
        byOwner.set(tile.ownerUid, entry);
    }
    return [...byOwner.entries()]
        .map(([ownerUid, entry]) => ({ ownerUid, tiles: entry.tiles, power: entry.power }))
        .sort((left, right) => right.tiles - left.tiles || right.power - left.power
            || (left.ownerUid < right.ownerUid ? -1 : left.ownerUid > right.ownerUid ? 1 : 0));
}
