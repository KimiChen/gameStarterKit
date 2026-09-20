/**
 * mmo kit · `inventory` api 面（shared，docs/MMO.md §7.2；MK2-B3 先落**掉落半边**，MK3-B1 补物品实例 / 容器 / 装备 / 掉落归属并 bump）：
 *  - `rollLoot(table, rng)`：按权重掷一条掉落 + 数量（只经调用方传入的随机流：服务端 = 分线随机流 ⇒ 同种子同命令序同掉落，无头重放一致）；
 *  - 掉落实例词汇 `ILootRoll` / 拾取半径 / 过期时长 / 每分线上限（§11.2 候选数字，只许收紧）；
 *  - `lootClaimed` durable 事件载荷（mode → k_mmo_world_event → worker 落 k_mmo_item_instance）与它的纯载荷闸；
 *  - `nearestLoot`：客户端 / 服务端同源的「最近的掉落」选择（拾取按钮）。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.inventory.version`。
 */
import type { ILootTable } from "../content/index";

/** 掉落在地上停留的时长（到期消失；§11.2 候选）。 */
export const MMO_LOOT_EXPIRE_MS = 60_000;
/** 拾取半径（世界单位；本人权威位置到掉落的距离）。 */
export const MMO_PICKUP_RADIUS = 48;
/** 每分线未认领掉落上限（超出即淘汰最早的一件）。 */
export const MMO_LOOT_MAX_PER_INSTANCE = 512;
/** 掉落堆叠上限（wire `count` 的域）。 */
export const MMO_LOOT_COUNT_MAX = 9_999;
/** durable 事件 kind：认领掉落（随下一个分线检查点同事务落库，worker 认领后发物品）。 */
export const MMO_EVENT_LOOT_CLAIMED = "lootClaimed";

export interface ILootRng { next(): number }
export interface ILootRoll { readonly itemId: string; readonly count: number }

/**
 * 按权重掷一条掉落：`next()` 一次选条目（累计权重），数量在 [countMin, countMax] 内再掷一次（min == max 不耗流）。
 * 表为空 ⇒ null（validateContentPack 已保证至少一条；防御）。
 */
export function rollLoot(table: ILootTable, rng: ILootRng): ILootRoll | null {
    if (table.entries.length === 0) return null;
    let total = 0;
    for (const entry of table.entries) total += entry.weight;
    const roll = clamp01(rng.next()) * total;
    let cursor = 0;
    let picked = table.entries[table.entries.length - 1]!;
    for (const entry of table.entries) {
        cursor += entry.weight;
        if (roll < cursor) { picked = entry; break; }
    }
    const span = picked.countMax - picked.countMin;
    const count = span <= 0 ? picked.countMin : picked.countMin + Math.min(span, Math.floor(clamp01(rng.next()) * (span + 1)));
    return { itemId: picked.itemId, count };
}

function clamp01(value: number): number {
    return Number.isFinite(value) ? Math.min(0.999_999_999, Math.max(0, value)) : 0;
}

/** `lootClaimed` 事件载荷（MMO.md §8.2 的 { actorEntityId, lootId, itemTemplateId, count } + 落账用的 actorCharacterId）。 */
export interface IMmoLootClaimedPayload {
    readonly actorEntityId: string;
    readonly actorCharacterId: string;
    readonly lootId: string;
    readonly itemTemplateId: string;
    readonly count: number;
}

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/u;

/** 载荷闸（纯函数；worker 认领后先过它，非法 ⇒ null ⇒ 死信）。 */
export function lootClaimedPayloadOf(raw: unknown): IMmoLootClaimedPayload | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    const keys = Object.keys(value);
    if (keys.length !== 5) return null;
    for (const key of ["actorEntityId", "actorCharacterId", "lootId", "itemTemplateId"] as const) {
        if (typeof value[key] !== "string" || !ID_RE.test(value[key] as string)) return null;
    }
    if (!Number.isSafeInteger(value.count) || (value.count as number) < 1 || (value.count as number) > MMO_LOOT_COUNT_MAX) return null;
    return {
        actorEntityId: value.actorEntityId as string, actorCharacterId: value.actorCharacterId as string, lootId: value.lootId as string,
        itemTemplateId: value.itemTemplateId as string, count: value.count as number,
    };
}

/** 半径内最近的掉落（kind === "loot"）；并列按 id 升序；没有 ⇒ null。 */
export function nearestLoot<T extends { readonly id: string; readonly kind: string; readonly x: number; readonly y: number }>(
    entities: Iterable<T>, self: { readonly x: number; readonly y: number }, radius: number = MMO_PICKUP_RADIUS,
): T | null {
    let best: T | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of entities) {
        if (entity.kind !== "loot") continue;
        const distance = Math.hypot(entity.x - self.x, entity.y - self.y);
        if (distance > radius) continue;
        if (best === null || distance < bestDistance || (distance === bestDistance && entity.id < best.id)) { best = entity; bestDistance = distance; }
    }
    return best;
}
