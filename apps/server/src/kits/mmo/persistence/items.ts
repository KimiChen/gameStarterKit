/**
 * mmo kit 内部模块：物品实例存储（k_mmo_item_instance + k_mmo_receipt；MK3-B1）。`ItemStore` 是 inventory 面（grantItem / moveItem / claimLoot）
 * 消费的最小存储口：列表 / 插入 / **按 rev CAS 的更新与删除**（并发改同一件 ⇒ 后者 0 行 ⇒ 面抛 conflict）/ 回执读写 / 新 id；`sqlItemStore(tx)` 是 SQL 实现
 * （经 KitTx / KitWorkerTx / KitWorldTx.query，表闸只放行 k_mmo_*），单测用内存实现钉同一语义。交换两件用 `tmp` 位置过渡（同事务内三步，⛔ 落库可见）。
 * ⛔ 插件不得 import 本文件。
 */
import type { MmoItemLocation } from "@game/shared/kits/mmo/api/inventory/index";
import type { ResultSetHeader, RowDataPacket } from "../../../core/infra/kitApi";
import { newMmoId } from "../host";

export const MMO_ITEM_LOCATION_BAG = "bag";
/** 交换过渡位置（只在一个事务内存在）。 */
export const MMO_ITEM_LOCATION_TMP = "tmp";
export type ItemLocationOrTmp = MmoItemLocation | typeof MMO_ITEM_LOCATION_TMP;

export interface ItemSql {
    readonly sId: number;
    query<T = RowDataPacket[] | ResultSetHeader>(sql: string, params?: unknown[]): Promise<T>;
}

export interface ItemRow {
    readonly id: string;
    readonly characterId: string;
    readonly itemId: string;
    readonly location: ItemLocationOrTmp;
    readonly slot: number;
    readonly count: number;
    readonly rev: number;
}

export interface ItemPatch { readonly location?: ItemLocationOrTmp; readonly slot?: number; readonly count?: number }

export interface ItemStore {
    receipt(opId: string): Promise<unknown | null>;
    writeReceipt(opId: string, characterId: string, kind: string, result: unknown): Promise<void>;
    /** 该角色全部物品实例（含 tmp；按 location, slot 升序） */
    list(characterId: string): Promise<ItemRow[]>;
    insert(row: Omit<ItemRow, "rev">): Promise<void>;
    /** CAS：rev 相同才改（rev + 1）；false = 并发冲突 */
    update(id: string, rev: number, patch: ItemPatch): Promise<boolean>;
    remove(id: string, rev: number): Promise<boolean>;
    newId(): string;
}

interface ItemPacket extends RowDataPacket { item_id: string; template_id: string; owner_character_id: string; location: string; slot: number | string; count: number | string; rev: number | string }
interface ReceiptPacket extends RowDataPacket { result: unknown }

export function sqlItemStore(tx: ItemSql): ItemStore {
    return {
        async receipt(opId) {
            const rows = await tx.query<ReceiptPacket[]>("SELECT result FROM k_mmo_receipt WHERE server_id = ? AND op_id = ? LIMIT 1", [tx.sId, opId]);
            if (rows.length === 0) return null;
            const raw = rows[0]!.result;
            return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
        },
        async writeReceipt(opId, characterId, kind, result) {
            await tx.query<ResultSetHeader>("INSERT INTO k_mmo_receipt (server_id, op_id, character_id, kind, result) VALUES (?, ?, ?, ?, CAST(? AS JSON))", [tx.sId, opId, characterId, kind, JSON.stringify(result)]);
        },
        async list(characterId) {
            const rows = await tx.query<ItemPacket[]>(
                "SELECT item_id, template_id, owner_character_id, location, slot, count, rev FROM k_mmo_item_instance WHERE server_id = ? AND owner_character_id = ? ORDER BY location, slot",
                [tx.sId, characterId]);
            return rows.map((row) => ({
                id: String(row.item_id), characterId: String(row.owner_character_id), itemId: String(row.template_id), location: String(row.location) as ItemLocationOrTmp,
                slot: Number(row.slot), count: Number(row.count), rev: Number(row.rev),
            }));
        },
        async insert(row) {
            await tx.query<ResultSetHeader>(
                "INSERT INTO k_mmo_item_instance (server_id, item_id, template_id, owner_character_id, location, slot, count) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [tx.sId, row.id, row.itemId, row.characterId, row.location, row.slot, row.count]);
        },
        async update(id, rev, patch) {
            const sets: string[] = ["rev = rev + 1"];
            const params: unknown[] = [];
            if (patch.location !== undefined) { sets.push("location = ?"); params.push(patch.location); }
            if (patch.slot !== undefined) { sets.push("slot = ?"); params.push(patch.slot); }
            if (patch.count !== undefined) { sets.push("count = ?"); params.push(patch.count); }
            const result = await tx.query<ResultSetHeader>(`UPDATE k_mmo_item_instance SET ${sets.join(", ")} WHERE server_id = ? AND item_id = ? AND rev = ?`, [...params, tx.sId, id, rev]);
            return result.affectedRows === 1;
        },
        async remove(id, rev) {
            const result = await tx.query<ResultSetHeader>("DELETE FROM k_mmo_item_instance WHERE server_id = ? AND item_id = ? AND rev = ?", [tx.sId, id, rev]);
            return result.affectedRows === 1;
        },
        newId: () => newMmoId(),
    };
}
