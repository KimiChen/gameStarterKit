/**
 * 交接状态机（MMO MF8-B2，docs/MMO.md §5.4 MF8 / §10.2「源 / 目标在交接各阶段崩溃」）：`world_transfer` 表上每步**持久 CAS** 推进
 *   requested → prepared → committed → activated → finalized（Committed 前可 cancelled；Committed 后 ⛔ 不回源、⛔ 不取消）
 *  - transferId 幂等：重放同一步得到同一结果——CAS 0 行时回读，状态已在目标态或其后继态 ⇒ `already`（返回持久行），否则 TransferStateError；
 *  - 一 persona 只一在途：UNIQUE(server_id, persona_id, active_key)，终态（finalized / cancelled）active_key 置 NULL；
 *  - 预留到期（reserve_expires_at）：Committed 前 `expireReservations` 释放为 cancelled；
 *  - 权威在表：崩溃后查持久状态恢复（源 / 目标 / 客户端各阶段崩溃的矩阵见 test/int/world-transfer.test.ts）；跨房唤醒只是 best-effort（MF8-B6）。
 * 连接面可注入（int 测试注入临时库的池）；⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { TransferInFlightError, TransferStateError } from "../../core/errors";
import { getPool } from "../../core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../core/infra/mysql";
import { storedInt } from "../../core/infra/numbers";

export type TransferSqlPool = Pick<Pool, "execute" | "query">;

export type WorldTransferState = "requested" | "prepared" | "committed" | "activated" | "finalized" | "cancelled";
export const WORLD_TRANSFER_STATES: readonly WorldTransferState[] = ["requested", "prepared", "committed", "activated", "finalized", "cancelled"];
/** 前进序（cancelled 是旁支终态）。 */
const ORDER: Readonly<Record<WorldTransferState, number>> = { requested: 0, prepared: 1, committed: 2, activated: 3, finalized: 4, cancelled: -1 };

export interface WorldTransferRow {
    readonly transferId: string;
    readonly personaId: string;
    readonly fromInstance: string;
    readonly toMap: string;
    readonly toLine: number;
    /** prepare 后才有（目标分线实例 id）。 */
    readonly toInstance: string;
    readonly state: WorldTransferState;
    /** commit 时 = 签发凭据绑定的 control_epoch；activate 时更新为目标房取得的新 epoch。 */
    readonly controlEpoch: number;
    /** 当前有效凭据的 sha256（'' = 未签发）。 */
    readonly ticketSha256: string;
    /** 预留到期（ms 时间戳）；null = 未预留。 */
    readonly reserveExpiresAt: number | null;
    /** kit 载荷（框架不解释）。 */
    readonly payload: unknown;
    /** 在途（active_key 非 NULL）。 */
    readonly active: boolean;
    /** 建行时刻（ms 时间戳；MF11 R2：requested 行无预留，按建行时刻判陈旧）。 */
    readonly createdAt: number;
}

export type TransferStepOutcome = "advanced" | "already";
export interface TransferStep { readonly outcome: TransferStepOutcome; readonly row: WorldTransferRow }

export const newTransferId = (): string => `wt_${randomUUID().replace(/-/gu, "")}`;
const TRANSFER_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/u;

function rowsMatched(result: ResultSetHeader): number {
    const matched = /Rows matched:\s*(\d+)/u.exec(result.info ?? "");
    return matched ? storedInt(matched[1], "transfer.rowsMatched", { min: 0 }) : 0;
}
function assertSId(sId: number): void {
    if (!Number.isSafeInteger(sId) || sId < 0 || sId > 0xffff) throw new RangeError(`[transfer] sId 非法：${String(sId)}`);
}
function assertId(value: string, label: string, max = 64): void {
    if (typeof value !== "string" || value.length === 0 || value.length > max || !/^[A-Za-z0-9_.:/-]+$/u.test(value)) {
        throw new RangeError(`[transfer] ${label} 必须是 1..${max} 的 [A-Za-z0-9_.:/-] 串`);
    }
}

interface TransferSqlRow extends RowDataPacket {
    transfer_id: string; persona_id: string; from_instance: string; to_map: string; to_line: number | string; to_instance: string; state: string;
    control_epoch: number | string; ticket_sha256: string; reserve_expires_ms: number | string | null; payload: unknown; active_key: string | null;
    created_ms: number | string;
}
const SELECT = "SELECT transfer_id, persona_id, from_instance, to_map, to_line, to_instance, state, control_epoch, ticket_sha256, "
    + "ROUND(UNIX_TIMESTAMP(reserve_expires_at) * 1000) AS reserve_expires_ms, payload, active_key, ROUND(UNIX_TIMESTAMP(created_at) * 1000) AS created_ms FROM world_transfer";

function rowOf(row: TransferSqlRow): WorldTransferRow {
    const state = WORLD_TRANSFER_STATES.includes(row.state as WorldTransferState) ? (row.state as WorldTransferState) : "cancelled";
    let payload: unknown = row.payload;
    if (typeof payload === "string") { try { payload = JSON.parse(payload) as unknown; } catch { /* 原样 */ } }
    return {
        transferId: row.transfer_id,
        personaId: row.persona_id,
        fromInstance: row.from_instance,
        toMap: row.to_map,
        toLine: storedInt(row.to_line, "world_transfer.to_line", { min: 0, max: 0xffff }),
        toInstance: row.to_instance,
        state,
        controlEpoch: storedInt(row.control_epoch, "world_transfer.control_epoch", { min: 0 }),
        ticketSha256: row.ticket_sha256,
        reserveExpiresAt: row.reserve_expires_ms === null || row.reserve_expires_ms === undefined ? null : Number(row.reserve_expires_ms),
        payload: payload ?? null,
        active: row.active_key !== null,
        createdAt: Number(row.created_ms),
    };
}

/**
 * 陈旧的 Committed 前交接（MF11 R2-01）：源房在 request → prepare → commit 之间崩溃会留下 requested / prepared 行，persona 从此「在途」
 * 被拒再交接 / 再进入。判据：prepared 且预留已到期，或 requested 且建行超过 staleAfterMs（= 预留窗口）。返回 true = 已 cancelled（或本就 cancelled）。
 * 无副作用于 committed 及之后（⛔ 回源）。
 */
export async function cancelIfStale(sId: number, row: WorldTransferRow, nowMs: number, staleAfterMs: number, pool: TransferSqlPool = getPool()): Promise<boolean> {
    if (row.state === "cancelled") return true;
    const stale = row.state === "prepared"
        ? row.reserveExpiresAt !== null && row.reserveExpiresAt < nowMs
        : row.state === "requested" && row.createdAt + staleAfterMs < nowMs;
    if (!stale) return false;
    const step = await cancelTransfer(sId, row.transferId, pool);
    return step.row.state === "cancelled";
}

/** 读一行（不存在 ⇒ null）。 */
export async function readTransfer(sId: number, transferId: string, pool: TransferSqlPool = getPool()): Promise<WorldTransferRow | null> {
    assertSId(sId);
    const [rows] = await pool.query<TransferSqlRow[]>(`${SELECT} WHERE server_id = ? AND transfer_id = ?`, [sId, transferId]);
    return rows.length === 0 ? null : rowOf(rows[0] as TransferSqlRow);
}

/** 该 persona 的在途交接（至多一条）。 */
export async function activeTransferOf(sId: number, personaId: string, pool: TransferSqlPool = getPool()): Promise<WorldTransferRow | null> {
    assertSId(sId);
    const [rows] = await pool.query<TransferSqlRow[]>(`${SELECT} WHERE server_id = ? AND persona_id = ? AND active_key IS NOT NULL`, [sId, personaId]);
    return rows.length === 0 ? null : rowOf(rows[0] as TransferSqlRow);
}

export interface RequestTransferInput {
    readonly transferId: string;
    readonly personaId: string;
    readonly fromInstance: string;
    readonly toMap: string;
    readonly toLine: number;
    readonly payload?: unknown;
}

/**
 * Requested：INSERT 一行在途（active_key='1'）。同 transferId 重放（内容一致）⇒ already；同 persona 已有在途 ⇒ TransferInFlightError。
 */
export async function requestTransfer(sId: number, input: RequestTransferInput, pool: TransferSqlPool = getPool()): Promise<TransferStep> {
    assertSId(sId);
    if (!TRANSFER_ID_RE.test(input.transferId)) throw new RangeError("[transfer] transferId 必须是 1..64 的 [A-Za-z0-9_.:-] 串");
    assertId(input.personaId, "personaId");
    assertId(input.fromInstance, "fromInstance");
    assertId(input.toMap, "toMap");
    if (!Number.isSafeInteger(input.toLine) || input.toLine < 0 || input.toLine > 0xffff) throw new RangeError("[transfer] toLine 必须是 0..65535 的整数");
    const payload = input.payload === undefined || input.payload === null ? null : JSON.stringify(input.payload);
    try {
        await pool.execute<ResultSetHeader>(
            "INSERT INTO world_transfer (server_id, transfer_id, persona_id, from_instance, to_map, to_line, payload, active_key) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), '1')",
            [sId, input.transferId, input.personaId, input.fromInstance, input.toMap, input.toLine, payload]);
    } catch (error) {
        const errno = (error as { errno?: unknown }).errno;
        if (errno !== 1062) throw error;
        const message = String((error as { message?: unknown }).message ?? "");
        if (message.includes("PRIMARY")) {
            const existing = await readTransfer(sId, input.transferId, pool);
            if (existing && existing.personaId === input.personaId && existing.fromInstance === input.fromInstance
                && existing.toMap === input.toMap && existing.toLine === input.toLine) {
                return { outcome: "already", row: existing };
            }
            throw new TransferStateError(input.transferId, "requested（同 transferId 内容一致）", existing?.state ?? null);
        }
        const inFlight = await activeTransferOf(sId, input.personaId, pool);
        throw new TransferInFlightError(input.personaId, inFlight?.transferId ?? null);
    }
    const row = await readTransfer(sId, input.transferId, pool);
    if (!row) throw new TransferStateError(input.transferId, "requested", null);
    return { outcome: "advanced", row };
}

/** 前进一步：CAS state ∈ from → to；0 行时回读——已在 to 或其后继（非 cancelled）⇒ already，否则 TransferStateError。 */
async function advance(
    sId: number, transferId: string, from: readonly WorldTransferState[], to: WorldTransferState, setSql: string, setParams: readonly (string | number | null)[],
    pool: TransferSqlPool,
): Promise<TransferStep> {
    assertSId(sId);
    const placeholders = from.map(() => "?").join(", ");
    const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE world_transfer SET state = ?${setSql} WHERE server_id = ? AND transfer_id = ? AND state IN (${placeholders})`,
        [to, ...setParams, sId, transferId, ...from]);
    const row = await readTransfer(sId, transferId, pool);
    if (!row) throw new TransferStateError(transferId, from.join("|"), null);
    if (rowsMatched(result) === 1) return { outcome: "advanced", row };
    if (row.state !== "cancelled" && ORDER[row.state] >= ORDER[to]) return { outcome: "already", row };
    throw new TransferStateError(transferId, from.join("|"), row.state);
}

/** Prepared：目标分线已解析（to_instance）并预留（reserve_expires_at）。 */
export function prepareTransfer(
    sId: number, transferId: string, input: { readonly toInstance: string; readonly reserveExpiresAt: number }, pool: TransferSqlPool = getPool(),
): Promise<TransferStep> {
    assertId(input.toInstance, "toInstance");
    if (!Number.isSafeInteger(input.reserveExpiresAt) || input.reserveExpiresAt < 0) throw new RangeError("[transfer] reserveExpiresAt 必须是 ms 时间戳");
    return advance(sId, transferId, ["requested"], "prepared", ", to_instance = ?, reserve_expires_at = FROM_UNIXTIME(? / 1000)", [input.toInstance, input.reserveExpiresAt], pool);
}

/** Committed：凭据已签发（ticket_sha256）、持有 control_epoch；此后 ⛔ 不回源、⛔ 取消。 */
export function commitTransfer(
    sId: number, transferId: string, input: { readonly controlEpoch: number; readonly ticketSha256: string }, pool: TransferSqlPool = getPool(),
): Promise<TransferStep> {
    if (!Number.isSafeInteger(input.controlEpoch) || input.controlEpoch < 0) throw new RangeError("[transfer] controlEpoch 必须是非负整数");
    if (!/^[0-9a-f]{64}$/u.test(input.ticketSha256)) throw new RangeError("[transfer] ticketSha256 必须是 64 位小写 hex");
    return advance(sId, transferId, ["prepared"], "committed", ", control_epoch = ?, ticket_sha256 = ?", [input.controlEpoch, input.ticketSha256], pool);
}

/** 凭据轮换（`world.resolveTransfer` 回复丢失后重签）：只在 committed 允许；返回是否换成。 */
export async function rotateTransferTicket(sId: number, transferId: string, ticketSha256: string, pool: TransferSqlPool = getPool()): Promise<boolean> {
    assertSId(sId);
    if (!/^[0-9a-f]{64}$/u.test(ticketSha256)) throw new RangeError("[transfer] ticketSha256 必须是 64 位小写 hex");
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE world_transfer SET ticket_sha256 = ? WHERE server_id = ? AND transfer_id = ? AND state = 'committed'", [ticketSha256, sId, transferId]);
    return rowsMatched(result) === 1;
}

/** Activated：目标房已按凭据准入并取得新 control_epoch——**唯一一次**（第二个会话拿到 already ⇒ 拒入）。 */
export function activateTransfer(
    sId: number, transferId: string, input: { readonly controlEpoch: number }, pool: TransferSqlPool = getPool(),
): Promise<TransferStep> {
    if (!Number.isSafeInteger(input.controlEpoch) || input.controlEpoch < 0) throw new RangeError("[transfer] controlEpoch 必须是非负整数");
    return advance(sId, transferId, ["committed"], "activated", ", control_epoch = ?", [input.controlEpoch], pool);
}

/** Finalized：源房已回收实体 / 归还旧控制权；active_key 置 NULL（persona 可再交接）。 */
export function finalizeTransfer(sId: number, transferId: string, pool: TransferSqlPool = getPool()): Promise<TransferStep> {
    return advance(sId, transferId, ["activated"], "finalized", ", active_key = NULL", [], pool);
}

/** Cancelled：只在 Committed 前（requested / prepared）；释放预留、active_key 置 NULL。已 cancelled ⇒ already；committed 及之后 ⇒ TransferStateError。 */
export async function cancelTransfer(sId: number, transferId: string, pool: TransferSqlPool = getPool()): Promise<TransferStep> {
    assertSId(sId);
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE world_transfer SET state = 'cancelled', active_key = NULL WHERE server_id = ? AND transfer_id = ? AND state IN ('requested', 'prepared')",
        [sId, transferId]);
    const row = await readTransfer(sId, transferId, pool);
    if (!row) throw new TransferStateError(transferId, "requested|prepared", null);
    if (rowsMatched(result) === 1) return { outcome: "advanced", row };
    if (row.state === "cancelled") return { outcome: "already", row };
    throw new TransferStateError(transferId, "requested|prepared", row.state);
}

/** 预留到期释放：Committed 前且 reserve_expires_at < now 的在途行整批 cancelled；返回条数。 */
export async function expireReservations(sId: number, nowMs: number, pool: TransferSqlPool = getPool()): Promise<number> {
    assertSId(sId);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError("[transfer] nowMs 必须是 ms 时间戳");
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE world_transfer SET state = 'cancelled', active_key = NULL WHERE server_id = ? AND state IN ('requested', 'prepared') "
        + "AND reserve_expires_at IS NOT NULL AND reserve_expires_at < FROM_UNIXTIME(? / 1000)",
        [sId, nowMs]);
    return rowsMatched(result);
}
