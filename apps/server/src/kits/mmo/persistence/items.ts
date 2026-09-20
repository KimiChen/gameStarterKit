/**
 * mmo kit 内部模块：物品实例 SQL（k_mmo_item_instance + k_mmo_receipt；MK2-B3 先落「按回执幂等发一件物品」，MK3-B1 inventory 面补堆叠 /
 * 容器 / 装备 / 移动）。opId = 世界事件 event_id（认领掉落）或框架 kitOpId：同 opId 重放只回读回执，⛔ 不复制物品（§7.3「0 重复」）。
 * 经 KitTx / KitWorkerTx / KitWorldTx.query（表闸只放行 k_mmo_*）。⛔ 插件不得 import 本文件。
 */
import type { ResultSetHeader, RowDataPacket } from "../../../core/infra/kitApi";
import { newMmoId } from "../host";

export const MMO_ITEM_LOCATION_BAG = "bag";
export const MMO_ITEM_COUNT_MAX = 9_999;

export interface ItemSql {
    readonly sId: number;
    query<T = RowDataPacket[] | ResultSetHeader>(sql: string, params?: unknown[]): Promise<T>;
}

export interface ItemGrant {
    /** 幂等键（回执 op_id；认领掉落 = 事件 event_id） */
    readonly opId: string;
    readonly characterId: string;
    readonly itemId: string;
    readonly count: number;
    /** 回执 kind（≤ 16 字符 ascii） */
    readonly kind: string;
}

export interface ItemGrantResult {
    readonly itemInstanceId: string;
    /** true = 同 opId 已发过，本次零写入 */
    readonly replayed: boolean;
}

interface ReceiptRow extends RowDataPacket { result: unknown }
interface SlotRow extends RowDataPacket { next_slot: number | string }

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/u;

/** 发一件物品到角色背包（下一个空槽）并写回执；同一事务；同 opId 重放回读回执零写入。 */
export async function grantItemInTx(tx: ItemSql, grant: ItemGrant): Promise<ItemGrantResult> {
    if (!ID_RE.test(grant.opId) || !ID_RE.test(grant.characterId) || !ID_RE.test(grant.itemId)) throw new TypeError("[mmo items] grant id 形态非法");
    if (!Number.isSafeInteger(grant.count) || grant.count < 1 || grant.count > MMO_ITEM_COUNT_MAX) throw new RangeError(`[mmo items] count ${grant.count} 非法`);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,15}$/u.test(grant.kind)) throw new TypeError(`[mmo items] 回执 kind "${grant.kind}" 非法`);
    const receipts = await tx.query<ReceiptRow[]>("SELECT result FROM k_mmo_receipt WHERE server_id = ? AND op_id = ? LIMIT 1", [tx.sId, grant.opId]);
    if (receipts.length > 0) {
        const result = (typeof receipts[0]!.result === "string" ? JSON.parse(receipts[0]!.result as string) : receipts[0]!.result) as { itemInstanceId?: unknown };
        return { itemInstanceId: typeof result?.itemInstanceId === "string" ? result.itemInstanceId : "", replayed: true };
    }
    const slots = await tx.query<SlotRow[]>(
        "SELECT COALESCE(MAX(slot), -1) + 1 AS next_slot FROM k_mmo_item_instance WHERE server_id = ? AND owner_character_id = ? AND location = ?",
        [tx.sId, grant.characterId, MMO_ITEM_LOCATION_BAG]);
    const slot = Number(slots[0]?.next_slot ?? 0);
    const itemInstanceId = newMmoId();
    await tx.query<ResultSetHeader>(
        "INSERT INTO k_mmo_item_instance (server_id, item_id, template_id, owner_character_id, location, slot, count) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [tx.sId, itemInstanceId, grant.itemId, grant.characterId, MMO_ITEM_LOCATION_BAG, slot, grant.count]);
    await tx.query<ResultSetHeader>(
        "INSERT INTO k_mmo_receipt (server_id, op_id, character_id, kind, result) VALUES (?, ?, ?, ?, CAST(? AS JSON))",
        [tx.sId, grant.opId, grant.characterId, grant.kind, JSON.stringify({ itemInstanceId, itemId: grant.itemId, count: grant.count })]);
    return { itemInstanceId, replayed: false };
}
