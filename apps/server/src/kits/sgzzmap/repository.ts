/** sgzzmap 内部存储；所有 SQL 仅经受限 KitTx，调用方必须先持有本区 revision 行锁。 */
import {
    SGZZ_CHUNK_TILES, sgzzCellOf, sgzzGridRectForChunkRect, type ISgzzRect,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_AID, SGZZ_MAX_DURABILITY, SGZZ_MAX_UID,
    sgzzEmptyTile, type ISgzzTile,
} from "@game/shared/kits/sgzzmap/api/territory/index";
import type { ISgzzAlliance, ISgzzMembership, SgzzAllianceRoleValue } from "@game/shared/kits/sgzzmap/api/alliance/index";
import type { KitTx, RowDataPacket } from "../../core/infra/kitApi";

export type SgzzReceiptKind = "occupy" | "abandon" | "alliance";

export interface SgzzReceipt {
    readonly opId: string;
    readonly uid: string;
    readonly hash: string;
    readonly contractVersion: number;
    readonly kind: SgzzReceiptKind;
    readonly response: unknown;
}
export interface SgzzHolding {
    readonly uid: string;
    readonly allianceId: string;
    readonly tiles: number;
}

/** 仅供 kit 内部事务编排与无头测试注入；插件消费 api/ 门面。 */
export interface SgzzRepository {
    lockRevision(): Promise<number>;
    readonly revision: number;
    /** 按 cell 升序批量加锁读；⚠ 调用方必须已把 cells 排好序（= 锁序）。 */
    readTilesForUpdate(cells: readonly number[]): Promise<Map<number, ISgzzTile>>;
    readTile(cell: number): Promise<ISgzzTile>;
    readTilesInRect(rect: ISgzzRect): Promise<ISgzzTile[]>;
    insertTile(tile: ISgzzTile): Promise<boolean>;
    updateTile(tile: ISgzzTile): Promise<void>;
    deleteTile(cell: number): Promise<void>;
    readHoldingForUpdate(uid: string): Promise<SgzzHolding>;
    upsertHolding(holding: SgzzHolding): Promise<void>;
    readReceipt(kind: SgzzReceiptKind, opId: string): Promise<SgzzReceipt | null>;
    insertReceipt(receipt: SgzzReceipt): Promise<void>;
    appendLog(entity: string, operation: string, payload: unknown, tombstone: boolean): Promise<number>;
    readMembershipForUpdate(uid: string): Promise<ISgzzMembership | null>;
    readAllianceForUpdate(allianceId: string): Promise<ISgzzAlliance | null>;
    insertAlliance(alliance: ISgzzAlliance): Promise<boolean>;
    updateAllianceMembers(allianceId: string, members: number): Promise<void>;
    deleteAlliance(allianceId: string): Promise<void>;
    insertMembership(m: ISgzzMembership): Promise<void>;
    deleteMembership(uid: string): Promise<void>;
    /** 同盟变更后刷新该玩家名下地块的 owner_aid。⚠ 受 SGZZ_MAX_TILES_PER_PLAYER 封顶。 */
    retagTiles(uid: string, allianceId: string): Promise<void>;
}

function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(`SGZZMAP ${label} 数据异常`);
    return n;
}
function text(value: unknown, label: string, max: number): string {
    if (typeof value !== "string" || value.length > max) throw new Error(`SGZZMAP ${label} 数据异常`);
    return value;
}
function json(value: unknown): unknown {
    return typeof value === "string" ? JSON.parse(value) : value;
}
function tileOf(row: RowDataPacket): ISgzzTile {
    return {
        cell: integer(row.cell, "cell"),
        ownerUid: text(row.owner_uid, "owner_uid", SGZZ_MAX_UID),
        ownerAid: text(row.owner_aid, "owner_aid", SGZZ_MAX_AID),
        durability: integer(row.durability, "durability", SGZZ_MAX_DURABILITY),
        addition: integer(row.addition, "addition", 1) === 1,
        capturingAid: "",
    };
}

export function createSqlSgzzRepository(tx: KitTx, sId: number): SgzzRepository {
    let revision = 0;
    const repo: SgzzRepository = {
        get revision() { return revision; },

        async lockRevision(): Promise<number> {
            await tx.query(
                "INSERT INTO k_sgzzmap_revision (server_id, revision) VALUES (?, 0) "
                + "ON DUPLICATE KEY UPDATE revision = revision", [sId]);
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT revision FROM k_sgzzmap_revision WHERE server_id = ? FOR UPDATE", [sId]);
            revision = integer(rows[0]?.revision, "revision");
            return revision;
        },

        async readTilesForUpdate(cells: readonly number[]): Promise<Map<number, ISgzzTile>> {
            const out = new Map<number, ISgzzTile>();
            for (const cell of cells) out.set(cell, sgzzEmptyTile(cell));
            if (cells.length === 0) return out;
            const marks = cells.map(() => "?").join(",");
            const rows = await tx.query<RowDataPacket[]>(
                `SELECT cell, owner_uid, owner_aid, durability, addition FROM k_sgzzmap_tile
                 WHERE server_id = ? AND cell IN (${marks}) ORDER BY cell FOR UPDATE`,
                [sId, ...cells]);
            for (const row of rows) {
                const tile = tileOf(row);
                out.set(tile.cell, tile);
            }
            return out;
        },

        async readTile(cell: number): Promise<ISgzzTile> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT cell, owner_uid, owner_aid, durability, addition FROM k_sgzzmap_tile "
                + "WHERE server_id = ? AND cell = ?", [sId, cell]);
            return rows[0] ? tileOf(rows[0]) : sgzzEmptyTile(cell);
        },

        /**
         * 视窗读。⚠ 用 cell BETWEEN 之外还必须逐行核 col ——
         * cell = row*10000+col 是一维的，单纯的区间会把 [minCol,maxCol] 之外的整行带进来。
         */
        async readTilesInRect(rect: ISgzzRect): Promise<ISgzzTile[]> {
            const grid = sgzzGridRectForChunkRect(rect);
            const lo = sgzzCellOf(grid.minRow, grid.minCol);
            const hi = sgzzCellOf(grid.maxRow, grid.maxCol);
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT cell, owner_uid, owner_aid, durability, addition FROM k_sgzzmap_tile "
                + "WHERE server_id = ? AND cell BETWEEN ? AND ? "
                + "AND MOD(cell, 10000) BETWEEN ? AND ? ORDER BY cell",
                [sId, lo, hi, grid.minCol, grid.maxCol]);
            return rows.map(tileOf);
        },

        async insertTile(tile: ISgzzTile): Promise<boolean> {
            const res = await tx.query(
                "INSERT IGNORE INTO k_sgzzmap_tile (server_id, cell, owner_uid, owner_aid, durability, addition) "
                + "VALUES (?, ?, ?, ?, ?, ?)",
                [sId, tile.cell, tile.ownerUid, tile.ownerAid, tile.durability, tile.addition ? 1 : 0]);
            return Number((res as { affectedRows?: number }).affectedRows ?? 0) === 1;
        },

        async updateTile(tile: ISgzzTile): Promise<void> {
            await tx.query(
                "UPDATE k_sgzzmap_tile SET owner_uid = ?, owner_aid = ?, durability = ?, addition = ? "
                + "WHERE server_id = ? AND cell = ?",
                [tile.ownerUid, tile.ownerAid, tile.durability, tile.addition ? 1 : 0, sId, tile.cell]);
        },

        async deleteTile(cell: number): Promise<void> {
            await tx.query("DELETE FROM k_sgzzmap_tile WHERE server_id = ? AND cell = ?", [sId, cell]);
        },

        async readHoldingForUpdate(uid: string): Promise<SgzzHolding> {
            await tx.query(
                "INSERT INTO k_sgzzmap_holding (server_id, uid) VALUES (?, ?) "
                + "ON DUPLICATE KEY UPDATE uid = uid", [sId, uid]);
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT uid, alliance_id, tiles FROM k_sgzzmap_holding "
                + "WHERE server_id = ? AND uid = ? FOR UPDATE", [sId, uid]);
            const row = rows[0];
            if (!row) throw new Error("SGZZMAP holding 行缺失");
            return {
                uid: text(row.uid, "uid", SGZZ_MAX_UID),
                allianceId: text(row.alliance_id, "alliance_id", SGZZ_MAX_AID),
                tiles: integer(row.tiles, "tiles"),
            };
        },

        async upsertHolding(holding: SgzzHolding): Promise<void> {
            await tx.query(
                "UPDATE k_sgzzmap_holding SET alliance_id = ?, tiles = ? WHERE server_id = ? AND uid = ?",
                [holding.allianceId, holding.tiles, sId, holding.uid]);
        },

        async readReceipt(kind: SgzzReceiptKind, opId: string): Promise<SgzzReceipt | null> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT op_id, uid, payload_hash, contract_version, response_json FROM k_sgzzmap_receipt "
                + "WHERE server_id = ? AND kind = ? AND op_id = ?", [sId, kind, opId]);
            const row = rows[0];
            if (!row) return null;
            return {
                opId: text(row.op_id, "op_id", 64), uid: text(row.uid, "uid", SGZZ_MAX_UID),
                hash: text(row.payload_hash, "payload_hash", 64),
                contractVersion: integer(row.contract_version, "contract_version"),
                kind, response: json(row.response_json),
            };
        },

        async insertReceipt(receipt: SgzzReceipt): Promise<void> {
            await tx.query(
                "INSERT INTO k_sgzzmap_receipt (server_id, kind, op_id, uid, payload_hash, contract_version, response_json) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [sId, receipt.kind, receipt.opId, receipt.uid, receipt.hash, receipt.contractVersion,
                 JSON.stringify(receipt.response)]);
        },

        async readMembershipForUpdate(uid: string): Promise<ISgzzMembership | null> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT uid, alliance_id, role FROM k_sgzzmap_alliance_member "
                + "WHERE server_id = ? AND uid = ? FOR UPDATE", [sId, uid]);
            const row = rows[0];
            if (!row) return null;
            return {
                uid: text(row.uid, "uid", SGZZ_MAX_UID),
                allianceId: text(row.alliance_id, "alliance_id", SGZZ_MAX_AID),
                role: text(row.role, "role", 8) as SgzzAllianceRoleValue,
            };
        },

        async readAllianceForUpdate(allianceId: string): Promise<ISgzzAlliance | null> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT alliance_id, name, tag, leader_uid, members FROM k_sgzzmap_alliance "
                + "WHERE server_id = ? AND alliance_id = ? FOR UPDATE", [sId, allianceId]);
            const row = rows[0];
            if (!row) return null;
            return {
                allianceId: text(row.alliance_id, "alliance_id", SGZZ_MAX_AID),
                name: text(row.name, "name", 48), tag: text(row.tag, "tag", 16),
                leaderUid: text(row.leader_uid, "leader_uid", SGZZ_MAX_UID),
                members: integer(row.members, "members"),
            };
        },

        async insertAlliance(a: ISgzzAlliance): Promise<boolean> {
            // tag 有唯一键：撞了说明这个标签已被占用，⛔ 不要先查再插（TOCTOU）
            const res = await tx.query(
                "INSERT IGNORE INTO k_sgzzmap_alliance (server_id, alliance_id, name, tag, leader_uid, members) "
                + "VALUES (?, ?, ?, ?, ?, ?)",
                [sId, a.allianceId, a.name, a.tag, a.leaderUid, a.members]);
            return Number((res as { affectedRows?: number }).affectedRows ?? 0) === 1;
        },

        async updateAllianceMembers(allianceId: string, members: number): Promise<void> {
            await tx.query("UPDATE k_sgzzmap_alliance SET members = ? WHERE server_id = ? AND alliance_id = ?",
                [members, sId, allianceId]);
        },

        async deleteAlliance(allianceId: string): Promise<void> {
            await tx.query("DELETE FROM k_sgzzmap_alliance WHERE server_id = ? AND alliance_id = ?", [sId, allianceId]);
        },

        async insertMembership(m: ISgzzMembership): Promise<void> {
            await tx.query(
                "INSERT INTO k_sgzzmap_alliance_member (server_id, uid, alliance_id, role) VALUES (?, ?, ?, ?)",
                [sId, m.uid, m.allianceId, m.role]);
        },

        async deleteMembership(uid: string): Promise<void> {
            await tx.query("DELETE FROM k_sgzzmap_alliance_member WHERE server_id = ? AND uid = ?", [sId, uid]);
        },

        async retagTiles(uid: string, allianceId: string): Promise<void> {
            await tx.query("UPDATE k_sgzzmap_tile SET owner_aid = ? WHERE server_id = ? AND owner_uid = ?",
                [allianceId, sId, uid]);
        },

        async appendLog(entity: string, operation: string, payload: unknown, tombstone: boolean): Promise<number> {
            revision += 1;
            await tx.query("UPDATE k_sgzzmap_revision SET revision = ? WHERE server_id = ?", [revision, sId]);
            await tx.query(
                "INSERT INTO k_sgzzmap_log (server_id, revision, entity, operation, payload, tombstone) "
                + "VALUES (?, ?, ?, ?, ?, ?)",
                [sId, revision, entity, operation, JSON.stringify(payload), tombstone ? 1 : 0]);
            return revision;
        },
    };
    return repo;
}

export { SGZZ_CHUNK_TILES };
