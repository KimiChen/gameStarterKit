/**
 * mmo kit · `inventory` api 面（服务端，docs/MMO.md §7.2；v2 = MK3-B1 物品半边）：`grantItem`（先并入堆叠、再空格、溢出进 mail；回执幂等）、
 * `moveItem`（bag ↔ bag / bag ↔ equip：装备槽类型 / 职业 / 单件；目标有物 ⇒ 同模板堆叠合并或交换；按 rev CAS，并发改同一件 ⇒ conflict）、
 * `claimLoot`（worker 认领掉落 = grantItem，opId = 事件 id ⇒ 至少一次 + 回执去重 = 0 重复）、`readBag`；账号级入口 `bagOf` / `moveItemFor`
 * （角色必须属本账号，⛔ 区分不存在 / 别人的）经 withKitTx（Lobby RPC 无分线作用域；世界内编排 grantItem 走 withWorldTx 归 MK4）。
 * 存储只经 `ItemStore`（persistence/items.ts；单测内存实现同语义）；模板只读 content 面。插件只能 import 本门面；任何导出变化都要 bump `api.inventory.version`。
 */
import {
    MMO_BAG_SLOTS, MMO_EVENT_LOOT_CLAIMED, MMO_ITEM_COUNT_MAX, checkEquip, equipSlotOf, planGrant, sortBagItems,
    type IMmoBagItemWire, type IMmoBagWire, type IMmoLootClaimedPayload, type MmoItemLocation,
} from "@game/shared/kits/mmo/api/inventory/index";
import type { IContentPackIndex } from "@game/shared/kits/mmo/api/content/index";
import { defaultMmoTxRunner, type MmoTxRunner } from "../../host";
import { selectCharactersByUser } from "../../persistence/characters";
import { MMO_ITEM_LOCATION_TMP, sqlItemStore, type ItemRow, type ItemStore } from "../../persistence/items";
import { contentIndex } from "../content/index";

export type MmoInventoryErrorCode = "forbidden" | "unknown-item" | "item-not-found" | "not-equippable" | "class-mismatch" | "stacked" | "bad-slot" | "occupied" | "mail-full" | "conflict";

export class MmoInventoryError extends Error {
    constructor(readonly code: MmoInventoryErrorCode, readonly detail = "") {
        super(`[mmo inventory] ${code}${detail ? `：${detail}` : ""}`);
        this.name = "MmoInventoryError";
    }
}

export interface GrantItemInput {
    /** 幂等键（回执 op_id；认领掉落 = 事件 event_id） */
    readonly opId: string;
    readonly characterId: string;
    readonly itemId: string;
    readonly count: number;
    /** 回执 kind（≤ 16 字符） */
    readonly kind: string;
}

export interface MoveItemInput {
    readonly opId: string;
    readonly characterId: string;
    /** 角色职业（装备职业限制） */
    readonly classId: string;
    readonly itemInstanceId: string;
    readonly location: "bag" | "equip";
    readonly slot: number;
}

export interface InventoryOutcome {
    readonly bag: IMmoBagWire;
    /** true = 同 opId 已做过，本次零写入 */
    readonly replayed: boolean;
}

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/u;
const KIND_RE = /^[A-Za-z][A-Za-z0-9_-]{0,15}$/u;

const wireOf = (row: ItemRow): IMmoBagItemWire | null => (row.location === MMO_ITEM_LOCATION_TMP
    ? null
    : { id: row.id, itemId: row.itemId, count: row.count, location: row.location as MmoItemLocation, slot: row.slot, rev: row.rev });

function viewOf(rows: readonly ItemRow[]): IMmoBagWire {
    const items = sortBagItems(rows.flatMap((row) => { const wire = wireOf(row); return wire ? [wire] : []; }));
    return { rev: items.reduce((max, item) => Math.max(max, item.rev), 0), items };
}

/** 背包视图（全部位置；tmp 行不出现）。 */
export async function readBag(store: ItemStore, characterId: string): Promise<IMmoBagWire> {
    return viewOf(await store.list(characterId));
}

/** 发放：先并入背包同模板堆叠、再背包空格、再邮箱；邮箱也满 ⇒ mail-full（⛔ 丢物品）；同 opId 重放只回读回执。 */
export async function grantItem(store: ItemStore, input: GrantItemInput, content: IContentPackIndex = contentIndex()): Promise<InventoryOutcome> {
    if (!ID_RE.test(input.opId) || !ID_RE.test(input.characterId) || !ID_RE.test(input.itemId)) throw new TypeError("[mmo inventory] grant id 形态非法");
    if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > MMO_ITEM_COUNT_MAX) throw new RangeError(`[mmo inventory] count ${input.count} 非法`);
    if (!KIND_RE.test(input.kind)) throw new TypeError(`[mmo inventory] 回执 kind "${input.kind}" 非法`);
    if (await store.receipt(input.opId) !== null) return { bag: await readBag(store, input.characterId), replayed: true };
    const template = content.itemById.get(input.itemId);
    if (!template) throw new MmoInventoryError("unknown-item", input.itemId);
    const rows = await store.list(input.characterId);
    const view = viewOf(rows);
    const plan = planGrant(view.items, template, input.count);
    if (!plan) throw new MmoInventoryError("mail-full", input.itemId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const merge of plan.merges) {
        const row = byId.get(merge.id)!;
        if (!await store.update(row.id, row.rev, { count: row.count + merge.count })) throw new MmoInventoryError("conflict", row.id);
    }
    const inserted: string[] = [];
    for (const insert of plan.inserts) {
        const id = store.newId();
        await store.insert({ id, characterId: input.characterId, itemId: input.itemId, location: insert.location, slot: insert.slot, count: insert.count });
        inserted.push(id);
    }
    await store.writeReceipt(input.opId, input.characterId, input.kind, { itemId: input.itemId, count: input.count, merged: plan.merges.map((merge) => merge.id), inserted });
    return { bag: await readBag(store, input.characterId), replayed: false };
}

/** 认领掉落（worker）：opId = 事件 id ⇒ 重放零写入。 */
export function claimLoot(store: ItemStore, payload: IMmoLootClaimedPayload, eventId: string, content: IContentPackIndex = contentIndex()): Promise<InventoryOutcome> {
    return grantItem(store, { opId: eventId, characterId: payload.actorCharacterId, itemId: payload.itemTemplateId, count: payload.count, kind: MMO_EVENT_LOOT_CLAIMED }, content);
}

const tmpSlotOf = (row: ItemRow): number => (row.location === "bag" ? 0 : row.location === "equip" ? 256 : 512) + row.slot;

/**
 * 移动 / 装备：目标 = bag 格（0..23）或 equip 格（必须等于模板槽位类型的索引）；目标有物 ⇒ 同模板可堆叠则合并（余量留在原件），否则交换
 * （被换下的一件必须能待在原位置：原位置是 equip ⇒ 它也得能装在那一格；原位置是 mail ⇒ 拒 occupied）；三步经 tmp 位置避开唯一键；全程按 rev CAS。
 */
export async function moveItem(store: ItemStore, input: MoveItemInput, content: IContentPackIndex = contentIndex()): Promise<InventoryOutcome> {
    if (!ID_RE.test(input.opId) || !ID_RE.test(input.characterId) || !ID_RE.test(input.itemInstanceId)) throw new TypeError("[mmo inventory] move id 形态非法");
    if (await store.receipt(input.opId) !== null) return { bag: await readBag(store, input.characterId), replayed: true };
    const rows = await store.list(input.characterId);
    const item = rows.find((row) => row.id === input.itemInstanceId && row.location !== MMO_ITEM_LOCATION_TMP);
    if (!item) throw new MmoInventoryError("item-not-found", input.itemInstanceId);
    const templateOf = (itemId: string) => {
        const template = content.itemById.get(itemId);
        if (!template) throw new MmoInventoryError("unknown-item", itemId);
        return template;
    };
    if (input.location === "equip") {
        const template = templateOf(item.itemId);
        const rejection = checkEquip(template, input.classId, item.count);
        if (rejection) throw new MmoInventoryError(rejection, item.itemId);
        if (input.slot !== equipSlotOf(template.slot)) throw new MmoInventoryError("bad-slot", `${item.itemId} → equip:${input.slot}`);
    } else if (!Number.isSafeInteger(input.slot) || input.slot < 0 || input.slot >= MMO_BAG_SLOTS) {
        throw new MmoInventoryError("bad-slot", `bag:${input.slot}`);
    }
    const settle = async (result: unknown): Promise<InventoryOutcome> => {
        await store.writeReceipt(input.opId, input.characterId, "moveItem", result);
        return { bag: await readBag(store, input.characterId), replayed: false };
    };
    if (item.location === input.location && item.slot === input.slot) return settle({ itemInstanceId: item.id, location: input.location, slot: input.slot, noop: true });
    const occupant = rows.find((row) => row.id !== item.id && row.location === input.location && row.slot === input.slot);
    const cas = async (ok: Promise<boolean>, id: string): Promise<void> => { if (!await ok) throw new MmoInventoryError("conflict", id); };
    if (!occupant) {
        await cas(store.update(item.id, item.rev, { location: input.location, slot: input.slot }), item.id);
        return settle({ itemInstanceId: item.id, location: input.location, slot: input.slot });
    }
    // 同模板堆叠合并（只在 bag）
    if (input.location === "bag" && occupant.itemId === item.itemId) {
        const stackMax = Math.max(1, templateOf(item.itemId).stackMax);
        const moved = Math.min(stackMax - occupant.count, item.count);
        if (moved > 0) {
            await cas(store.update(occupant.id, occupant.rev, { count: occupant.count + moved }), occupant.id);
            if (item.count - moved === 0) await cas(store.remove(item.id, item.rev), item.id);
            else await cas(store.update(item.id, item.rev, { count: item.count - moved }), item.id);
            return settle({ itemInstanceId: item.id, mergedInto: occupant.id, count: moved });
        }
    }
    // 交换：被换下的一件必须能待在原位置
    if (item.location === "mail") throw new MmoInventoryError("occupied", `${input.location}:${input.slot}`);
    if (item.location === "equip") {
        const occupantTemplate = templateOf(occupant.itemId);
        if (checkEquip(occupantTemplate, input.classId, occupant.count) !== null || equipSlotOf(occupantTemplate.slot) !== item.slot) throw new MmoInventoryError("occupied", `${occupant.itemId} ⛔ equip:${item.slot}`);
    }
    await cas(store.update(item.id, item.rev, { location: MMO_ITEM_LOCATION_TMP, slot: tmpSlotOf(item) }), item.id);
    await cas(store.update(occupant.id, occupant.rev, { location: item.location, slot: item.slot }), occupant.id);
    await cas(store.update(item.id, item.rev + 1, { location: input.location, slot: input.slot }), item.id);
    return settle({ itemInstanceId: item.id, location: input.location, slot: input.slot, swappedWith: occupant.id });
}

export interface InventoryDeps {
    readonly run: MmoTxRunner;
    readonly content: () => IContentPackIndex;
}

export const defaultInventoryDeps: InventoryDeps = { run: defaultMmoTxRunner, content: () => contentIndex() };

/** 账号级：角色必须属本账号（⛔ 区分不存在 / 别人的）。 */
async function ownCharacter(tx: Parameters<typeof selectCharactersByUser>[0], uid: string, characterId: string): Promise<{ readonly classId: string }> {
    const own = (await selectCharactersByUser(tx, uid)).find((row) => row.characterId === characterId);
    if (!own) throw new MmoInventoryError("forbidden", characterId);
    return { classId: own.classId };
}

/** mmo.bag：本账号某角色的背包视图。 */
export function bagOf(uid: string, sId: number, characterId: string, deps: InventoryDeps = defaultInventoryDeps): Promise<IMmoBagWire> {
    return deps.run(sId, async (tx) => {
        await ownCharacter(tx, uid, characterId);
        return readBag(sqlItemStore(tx), characterId);
    });
}

/** mmo.moveItem：本账号某角色移动 / 装备一件（幂等写：opId = kitOpId(clientReqId)）。 */
export function moveItemFor(uid: string, sId: number, input: Omit<MoveItemInput, "opId" | "classId">, opId: string, deps: InventoryDeps = defaultInventoryDeps): Promise<InventoryOutcome> {
    return deps.run(sId, async (tx) => {
        const { classId } = await ownCharacter(tx, uid, input.characterId);
        return moveItem(sqlItemStore(tx), { ...input, opId, classId }, deps.content());
    });
}

/** 世界房进图 / 刷新用：按角色读背包（persona 已由准入认证，⛔ 再查账号）。 */
export function bagOfCharacter(sId: number, characterId: string, run: MmoTxRunner = defaultMmoTxRunner): Promise<IMmoBagWire> {
    return run(sId, (tx) => readBag(sqlItemStore(tx), characterId));
}
