/**
 * mmo kit · `inventory` api 面（shared，docs/MMO.md §7.2；v1 = MK2-B3 掉落半边，v2 = MK3-B1 物品半边）：
 *  - 掉落：`rollLoot(table, rng)`（按权重掷一条 + 数量，只经调用方传入的随机流 ⇒ 无头重放一致）、`nearestLoot`、`lootClaimed` 载荷闸、
 *    拾取半径 / 过期 / 每分线上限 / **掉落归属时长 `MMO_LOOT_OWNER_MS`**（击杀者优先拾取，超时放开；§11.2 候选数字，只许收紧）；
 *  - 物品（v2）：背包 wire（`IMmoBagWire` = bag 24 格 + equip 3 格 + mail 64 格的物品实例列表，wire 校验在 gameplays/mmoWorld/wire）、
 *    `equipSlotOf` / `checkEquip`（槽位类型 / 职业限制 / 堆叠不可装备）、`planGrant`（先并入同模板堆叠、再空格、溢出进 mail；都满 ⇒ null）、
 *    `bagAttrs`（装备属性合计 → 服务端进战斗基础属性）、`bagSignature`（变化检测）。服务端 `grantItem / moveItem / claimLoot` 与客户端背包视图都只用这些纯函数。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.inventory.version`。
 */
import type { IItemTemplate, ILootTable, MmoItemSlot } from "../content/index";
import { MMO_BAG_MAX_ITEMS, MMO_ITEM_COUNT_MAX, validateBagWire, type IMmoBagItemWire, type IMmoBagWire, type MmoItemLocation } from "../../../../gameplays/mmoWorld/wire";

export { MMO_BAG_MAX_ITEMS, MMO_ITEM_COUNT_MAX, validateBagWire };
export type { IMmoBagItemWire, IMmoBagWire, MmoItemLocation };

/** 掉落在地上停留的时长（到期消失；§11.2 候选）。 */
export const MMO_LOOT_EXPIRE_MS = 60_000;
/** 拾取半径（世界单位；本人权威位置到掉落的距离）。 */
export const MMO_PICKUP_RADIUS = 48;
/** 每分线未认领掉落上限（超出即淘汰最早的一件）。 */
export const MMO_LOOT_MAX_PER_INSTANCE = 512;
/** 掉落堆叠上限（wire `count` 的域）。 */
export const MMO_LOOT_COUNT_MAX = 9_999;
/** 掉落归属（v2）：击杀者（仇恨最高的角色）在此时长内独占拾取权，超时任何人可拾（队伍分配归内容 / MK4）。 */
export const MMO_LOOT_OWNER_MS = 15_000;
/** 容器容量（v2；§11.2 候选）：背包 / 装备 / 邮箱（发放溢出落点，⛔ 丢物品）。 */
export const MMO_BAG_SLOTS = 24;
export const MMO_EQUIP_SLOT_COUNT = 3;
export const MMO_MAIL_SLOTS = 64;
/** 装备槽索引（equip location 的 slot）：weapon 0 / armor 1 / trinket 2。 */
export const MMO_EQUIP_SLOT_INDEX = Object.freeze({ weapon: 0, armor: 1, trinket: 2 } as const);
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

// ── 物品半边（v2，MK3-B1）──────────────────────────────────────────────────────────────────────

/** 物品槽位类型 → 装备槽索引；none / consumable 不可装备 ⇒ null。 */
export function equipSlotOf(slot: MmoItemSlot): number | null {
    return slot === "weapon" ? MMO_EQUIP_SLOT_INDEX.weapon : slot === "armor" ? MMO_EQUIP_SLOT_INDEX.armor : slot === "trinket" ? MMO_EQUIP_SLOT_INDEX.trinket : null;
}

export type EquipRejection = "not-equippable" | "class-mismatch" | "stacked";

/** 能否装备：槽位类型可装备 → 职业限制（classIds 空 = 不限）→ 只能装单件（堆叠不可装备）。 */
export function checkEquip(template: IItemTemplate, classId: string, count: number): EquipRejection | null {
    if (equipSlotOf(template.slot) === null) return "not-equippable";
    if (template.classIds.length > 0 && !template.classIds.includes(classId)) return "class-mismatch";
    if (count !== 1) return "stacked";
    return null;
}

export function capacityOf(location: MmoItemLocation): number {
    return location === "bag" ? MMO_BAG_SLOTS : location === "equip" ? MMO_EQUIP_SLOT_COUNT : MMO_MAIL_SLOTS;
}

const LOCATION_ORDER: Readonly<Record<MmoItemLocation, number>> = { bag: 0, equip: 1, mail: 2 };

/** 稳定排序：bag → equip → mail，再按 slot。 */
export function sortBagItems(items: Iterable<IMmoBagItemWire>): IMmoBagItemWire[] {
    return [...items].sort((left, right) => (LOCATION_ORDER[left.location] - LOCATION_ORDER[right.location]) || (left.slot - right.slot) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** 某容器的空格（升序）。 */
export function freeSlots(items: Iterable<IMmoBagItemWire>, location: MmoItemLocation, capacity: number = capacityOf(location)): number[] {
    const used = new Set<number>();
    for (const item of items) if (item.location === location) used.add(item.slot);
    const out: number[] = [];
    for (let slot = 0; slot < capacity; slot += 1) if (!used.has(slot)) out.push(slot);
    return out;
}

export interface IGrantPlan {
    /** 并入既有堆叠：物品实例 id → 增加的数量 */
    readonly merges: readonly { readonly id: string; readonly count: number }[];
    /** 新实例：落点 + 数量（背包空格用完落 mail） */
    readonly inserts: readonly { readonly location: MmoItemLocation; readonly slot: number; readonly count: number }[];
}

/**
 * 发放计划（纯函数，服务端 grantItem 与客户端预览同源）：先并入背包里同模板未满的堆叠（slot 升序），再占背包空格（每格 ≤ stackMax），
 * 再占邮箱空格；仍有剩余 ⇒ null（邮箱也满，调用方拒绝 / 死信，⛔ 丢物品）。
 */
export function planGrant(items: Iterable<IMmoBagItemWire>, template: IItemTemplate, count: number): IGrantPlan | null {
    if (!Number.isSafeInteger(count) || count < 1) return null;
    const list = sortBagItems(items);
    const stackMax = Math.max(1, template.stackMax);
    let remaining = count;
    const merges: { id: string; count: number }[] = [];
    for (const item of list) {
        if (remaining === 0) break;
        if (item.location !== "bag" || item.itemId !== template.itemId || item.count >= stackMax) continue;
        const take = Math.min(stackMax - item.count, remaining);
        merges.push({ id: item.id, count: take });
        remaining -= take;
    }
    const inserts: { location: MmoItemLocation; slot: number; count: number }[] = [];
    for (const location of ["bag", "mail"] as const) {
        for (const slot of freeSlots(list, location)) {
            if (remaining === 0) break;
            const take = Math.min(stackMax, remaining);
            inserts.push({ location, slot, count: take });
            remaining -= take;
        }
        if (remaining === 0) break;
    }
    return remaining === 0 ? { merges, inserts } : null;
}

export interface IBagAttrs { readonly attack: number; readonly defense: number; readonly hpMax: number }

/** 已装备物品的属性合计（服务端进图 / 换装时加进战斗基础属性；客户端展示）。 */
export function bagAttrs(equipped: Iterable<IItemTemplate>): IBagAttrs {
    let attack = 0;
    let defense = 0;
    let hpMax = 0;
    for (const template of equipped) {
        attack += template.attrs.attack ?? 0;
        defense += template.attrs.defense ?? 0;
        hpMax += template.attrs.hpMax ?? 0;
    }
    return { attack, defense, hpMax };
}

/** 背包视图里 equip 位置的模板（未知模板跳过）。 */
export function equippedTemplates(view: IMmoBagWire | null, templateOf: (itemId: string) => IItemTemplate | null | undefined): IItemTemplate[] {
    if (!view) return [];
    const out: IItemTemplate[] = [];
    for (const item of view.items) {
        if (item.location !== "equip") continue;
        const template = templateOf(item.itemId);
        if (template) out.push(template);
    }
    return out;
}

/** 变化检测签名（服务端私有流「变了才发」/ 客户端刷新判定）：与 rev 无关的内容签名 + rev。 */
export function bagSignature(view: IMmoBagWire | null): string {
    if (!view) return "";
    return `${view.rev}|${sortBagItems(view.items).map((item) => `${item.id}:${item.itemId}:${item.location}:${item.slot}:${item.count}:${item.rev}`).join(",")}`;
}
