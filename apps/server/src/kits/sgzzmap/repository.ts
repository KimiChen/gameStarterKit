/** sgzzmap 内部存储；所有 SQL 仅经受限 KitTx，调用方必须先持有本区 revision 行锁。 */
import {
    SGZZ_CHUNK_TILES, sgzzCellOf, sgzzGridRectForChunkRect, type ISgzzRect,
} from "@game/shared/kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_AID, SGZZ_MAX_DURABILITY, SGZZ_MAX_UID,
    sgzzEmptyTile, type ISgzzTile,
} from "@game/shared/kits/sgzzmap/api/territory/index";
import type { ISgzzAlliance, ISgzzMembership, SgzzAllianceRoleValue } from "@game/shared/kits/sgzzmap/api/alliance/index";
import { validateSgzzMarch, type ISgzzMarch } from "@game/shared/kits/sgzzmap/api/march/index";
import type { KitTx, RowDataPacket } from "../../core/infra/kitApi";

export type SgzzReceiptKind = "occupy" | "abandon" | "alliance" | "dispatch" | "recall";

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
    /** 视窗读。`limit` 含「探一行」的余量，调用方据此判断是否截断。 */
    readTilesInRect(rect: ISgzzRect, limit: number): Promise<ISgzzTile[]>;
    insertTile(tile: ISgzzTile): Promise<boolean>;
    updateTile(tile: ISgzzTile): Promise<void>;
    deleteTile(cell: number): Promise<void>;
    readHoldingForUpdate(uid: string): Promise<SgzzHolding>;
    /** 我名下任意一块地（cell 升序取第一块），没有则 -1。⚠ 走 idx_owner，⛔ 别退化成全表扫。 */
    readAnyOwnedCell(uid: string): Promise<number>;
    upsertHolding(holding: SgzzHolding): Promise<void>;
    readReceipt(kind: SgzzReceiptKind, opId: string): Promise<SgzzReceipt | null>;
    insertReceipt(receipt: SgzzReceipt): Promise<void>;
    /** 只更新已在本事务里锁住的回执行（经济写在回执之后，见 service.mutate 的 post 钩子）。 */
    updateReceipt(kind: SgzzReceiptKind, opId: string, response: unknown): Promise<void>;
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
    /** 该玩家名下全部地块的 cell（用于把鸟瞰聚合从旧盟搬到新盟）。 */
    readTileCellsOf(uid: string): Promise<number[]>;
    insertMarch(march: ISgzzMarch): Promise<void>;
    readMarchForUpdate(marchId: string): Promise<ISgzzMarch | null>;
    updateMarchStatus(marchId: string, status: ISgzzMarch["status"]): Promise<void>;
    /** 到期队列，按 (arrive_at, march_id) 全区总序；⚠ 必须 FOR UPDATE，否则两个结算者会重复落地。 */
    readDueMarches(now: number, limit: number): Promise<ISgzzMarch[]>;
    countActiveMarches(uid: string): Promise<number>;
    /** 该玩家的在途行军，按 march_id 升序。走 idx_uid，⛔ 不扫全表。 */
    readActiveMarches(uid: string, limit: number): Promise<ISgzzMarch[]>;
    /** 分块聚合增量。delta 可正可负；归零的行删掉，⛔ 不留 tiles=0 的垃圾行。 */
    bumpChunk(level: number, chunkKey: number, allianceId: string, delta: number): Promise<void>;
    readChunks(level: number, rect: ISgzzRect, cols: number): Promise<SgzzChunkRow[]>;
}

export interface SgzzChunkRow {
    readonly chunkKey: number;
    readonly allianceId: string;
    readonly tiles: number;
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
function marchOf(row: RowDataPacket): ISgzzMarch {
    // ⚠ 过 shared 校验器：到达时刻由路径重算，库里被人手改过也会在这里红
    return validateSgzzMarch({
        marchId: text(row.march_id, "march_id", 64),
        uid: text(row.uid, "uid", SGZZ_MAX_UID),
        path: json(row.path_json),
        departAt: integer(row.depart_at, "depart_at"),
        arriveAt: integer(row.arrive_at, "arrive_at"),
        status: row.status,
    }, "march");
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
        async readTilesInRect(rect: ISgzzRect, limit: number): Promise<ISgzzTile[]> {
            const grid = sgzzGridRectForChunkRect(rect);
            const lo = sgzzCellOf(grid.minRow, grid.minCol);
            const hi = sgzzCellOf(grid.maxRow, grid.maxCol);
            // ⚠ `LIMIT ?` 会被 MySQL 预处理拒掉（Incorrect arguments to mysqld_stmt_execute），
            // 只能钳成有界整数后拼进 SQL。⛔ 别再改回占位符。
            const cap = Math.max(1, Math.min(100_000, Math.floor(limit)));
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT cell, owner_uid, owner_aid, durability, addition FROM k_sgzzmap_tile "
                + "WHERE server_id = ? AND cell BETWEEN ? AND ? "
                + `AND MOD(cell, 10000) BETWEEN ? AND ? ORDER BY cell LIMIT ${cap}`,
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

        async readAnyOwnedCell(uid: string): Promise<number> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT cell FROM k_sgzzmap_tile WHERE server_id = ? AND owner_uid = ? ORDER BY cell LIMIT 1",
                [sId, uid]);
            return rows.length > 0 ? Number(rows[0].cell) : -1;
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

        async insertMarch(march: ISgzzMarch): Promise<void> {
            await tx.query(
                "INSERT INTO k_sgzzmap_march (server_id, march_id, uid, path_json, depart_at, arrive_at, status) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [sId, march.marchId, march.uid, JSON.stringify(march.path),
                 march.departAt, march.arriveAt, march.status]);
        },

        async readMarchForUpdate(marchId: string): Promise<ISgzzMarch | null> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT march_id, uid, path_json, depart_at, arrive_at, status FROM k_sgzzmap_march "
                + "WHERE server_id = ? AND march_id = ? FOR UPDATE", [sId, marchId]);
            return rows[0] ? marchOf(rows[0]) : null;
        },

        async updateMarchStatus(marchId: string, status: ISgzzMarch["status"]): Promise<void> {
            await tx.query("UPDATE k_sgzzmap_march SET status = ? WHERE server_id = ? AND march_id = ?",
                [status, sId, marchId]);
        },

        async readDueMarches(now: number, limit: number): Promise<ISgzzMarch[]> {
            // ⚠ MySQL 预处理语句不接受 `LIMIT ?`（实测 "Incorrect arguments to mysqld_stmt_execute"）。
            // limit 是 kit 内部常量、非用户输入；这里仍先钳成有界整数再内联，⛔ 不直接拼外来值。
            const bounded = Math.max(1, Math.min(1000, Math.trunc(Number(limit) || 1)));
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT march_id, uid, path_json, depart_at, arrive_at, status FROM k_sgzzmap_march "
                + "WHERE server_id = ? AND status = 'marching' AND arrive_at <= ? "
                + `ORDER BY arrive_at, march_id LIMIT ${bounded} FOR UPDATE`,
                [sId, now]);
            return rows.map(marchOf);
        },

        async countActiveMarches(uid: string): Promise<number> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT COUNT(*) AS n FROM k_sgzzmap_march "
                + "WHERE server_id = ? AND uid = ? AND status = 'marching'", [sId, uid]);
            return integer(rows[0]?.n, "active marches");
        },

        async bumpChunk(level: number, chunkKey: number, allianceId: string, delta: number): Promise<void> {
            if (delta === 0) return;
            await tx.query(
                "INSERT INTO k_sgzzmap_chunk (server_id, level, chunk_key, alliance_id, tiles) "
                + "VALUES (?, ?, ?, ?, GREATEST(0, ?)) "
                + "ON DUPLICATE KEY UPDATE tiles = GREATEST(0, CAST(tiles AS SIGNED) + ?)",
                [sId, level, chunkKey, allianceId, delta, delta]);
            await tx.query(
                "DELETE FROM k_sgzzmap_chunk WHERE server_id = ? AND level = ? AND chunk_key = ? "
                + "AND alliance_id = ? AND tiles = 0",
                [sId, level, chunkKey, allianceId]);
        },

        async readChunks(level: number, rect: ISgzzRect, cols: number): Promise<SgzzChunkRow[]> {
            // 分块 key 是一维的（row*cols+col），单纯的区间会把 [minCol,maxCol] 之外的整行带进来，
            // 所以必须另核 MOD(chunk_key, cols)——与 readTilesInRect 同一个坑。
            const lo = rect.minRow * cols + rect.minCol;
            const hi = rect.maxRow * cols + rect.maxCol;
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT chunk_key, alliance_id, tiles FROM k_sgzzmap_chunk "
                + "WHERE server_id = ? AND level = ? AND chunk_key BETWEEN ? AND ? "
                + "AND MOD(chunk_key, ?) BETWEEN ? AND ? AND tiles > 0 ORDER BY chunk_key",
                [sId, level, lo, hi, cols, rect.minCol, rect.maxCol]);
            return rows.map((row) => ({
                chunkKey: integer(row.chunk_key, "chunk_key"),
                allianceId: text(row.alliance_id, "alliance_id", SGZZ_MAX_AID),
                tiles: integer(row.tiles, "tiles"),
            }));
        },

        async readActiveMarches(uid: string, limit: number): Promise<ISgzzMarch[]> {
            // ⚠ 同 readDueMarches：MySQL 预处理不接受 `LIMIT ?`，钳成有界整数后内联。
            const bounded = Math.max(1, Math.min(64, Math.trunc(Number(limit) || 1)));
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT march_id, uid, path_json, depart_at, arrive_at, status FROM k_sgzzmap_march "
                + "WHERE server_id = ? AND uid = ? AND status = 'marching' "
                + `ORDER BY march_id LIMIT ${bounded}`,
                [sId, uid]);
            return rows.map(marchOf);
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

        async readTileCellsOf(uid: string): Promise<number[]> {
            const rows = await tx.query<RowDataPacket[]>(
                "SELECT cell FROM k_sgzzmap_tile WHERE server_id = ? AND owner_uid = ? ORDER BY cell",
                [sId, uid]);
            return rows.map((row) => integer(row.cell, "cell"));
        },

        async retagTiles(uid: string, allianceId: string): Promise<void> {
            await tx.query("UPDATE k_sgzzmap_tile SET owner_aid = ? WHERE server_id = ? AND owner_uid = ?",
                [allianceId, sId, uid]);
        },

        async updateReceipt(kind: SgzzReceiptKind, opId: string, response: unknown): Promise<void> {
            await tx.query(
                "UPDATE k_sgzzmap_receipt SET response_json = ? WHERE server_id = ? AND kind = ? AND op_id = ?",
                [JSON.stringify(response), sId, kind, opId]);
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
