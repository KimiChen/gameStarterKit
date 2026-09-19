/**
 * WorldEventPort（MMO MF7b-B3，docs/MMO.md §5.4 MF7b / §7.3「事件批与分线检查点的原子规则」M09）：世界事件 outbox 的框架半边。
 *
 * 表形态由框架固定（kit 选表名、以 `role:"world-event"` 声明；列集 `event_id / instance_id / seq / kind / payload / status / attempts /
 * checkpoint_rev` 由 `tools/kit-migrations.ts` 机检），status：0 pending / 1 done（认领与效果同一事务）/ 2 dead / 3 superseded。
 *
 * 写侧 / 消费侧住在 kit-api 门面（`withKitWorldTx.appendWorldEvent`、worker / 世界事务的 `claimWorldEvents` / `releaseWorldEvent` /
 * `deadLetterWorldEvent`，`core/infra/kitApi.ts`），本文件是 Recovering 与运维用的框架 SQL（raw 连接，⛔ 经 kit 表闸）：
 *  - **实现选项**（MF7b-B3 二选一，本仓选 ④「事件批只随分线检查点同事务落库」）：WorldRuntime 把本 tick 产生的 durable 命令缓冲在内存，
 *    `WorldCheckpoint.save` 在**同一世界事务**里落分线快照 + persona 快照 + 事件行（`checkpoint_rev` = 该检查点 rev）+ 推进
 *    `world_instance.checkpoint_rev`。因此「事件已落库、检查点未落」的窗口不存在；崩溃丢掉的只是未落盘的缓冲，恢复后重放会重新产生
 *    （新 event_id），⛔ 不会双发（旧的从未 durable）。代价 = 奖励最多延迟到下一个分线检查点（强制点即时）。
 *  - 仍保留 ①–③ 作为纵深：worker 只执行 `checkpoint_rev ≤ world_instance.checkpoint_rev` 的行（`claimWorldEventsSql` 的门），
 *    Recovering 用 `supersedeWorldEvents` 把 `status = 0 AND checkpoint_rev > 恢复点 rev` 的行标 superseded（正常路径 0 行；只在有人绕过
 *    同事务规则直写事件表时兜底）。
 *  - 至少一次 + 回执去重：效果以 eventId 作 opId（`credit` / `enqueueEffect` 的幂等键）；死信同 outbox 口径（attempts ≥ 上限 ⇒ 2，
 *    `worldEventStats` 供运维面读积压）。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "../../core/infra/mysql";

export {
    WORLD_EVENT_CLAIM_LIMIT_DEFAULT, WORLD_EVENT_CLAIM_LIMIT_MAX, WORLD_EVENT_MAX_ATTEMPTS, assertWorldEventTable, claimWorldEventsSql,
    worldEventTablesOfKit,
} from "../../core/infra/kitApi";
export type { KitWorldEventClaimOptions as WorldEventClaimOptions, KitWorldEventOps as WorldEventOps, KitWorldEventRow as WorldEventRow } from "../../core/infra/kitApi";

export const WORLD_EVENT_STATUS = Object.freeze({ Pending: 0, Done: 1, Dead: 2, Superseded: 3 } as const);
export type WorldEventStatus = (typeof WORLD_EVENT_STATUS)[keyof typeof WORLD_EVENT_STATUS];

/** world-event 表名形态（与 kit-api / tools/plugin/workerGate.ts 同形）；框架 SQL 里的表名只经它进反引号。 */
const WORLD_EVENT_TABLE_RE = /^k_[a-z0-9]{1,64}_[A-Za-z0-9_]{1,64}$/u;
export function assertWorldEventTableName(table: string): string {
    if (typeof table !== "string" || !WORLD_EVENT_TABLE_RE.test(table)) throw new TypeError(`[WorldEventPort] world-event 表名非法：${String(table)}`);
    return table;
}

export type WorldEventSql = Pick<PoolConnection, "execute" | "query">;

const ROWS_MATCHED = /Rows matched:\s*(\d+)/u;
const rowsMatched = (result: ResultSetHeader): number => {
    const match = ROWS_MATCHED.exec(result.info ?? "");
    return match === null ? result.affectedRows : Number(match[1]);
};

/** Recovering：把「属于已丢失的未来」的 pending 行标 superseded（§7.3 ③）。返回标记行数（同事务落库规则下正常为 0）。 */
export function supersedeWorldEventsSql(table: string): string {
    return `UPDATE \`${assertWorldEventTableName(table)}\` SET status = ${WORLD_EVENT_STATUS.Superseded} WHERE server_id = ? AND instance_id = ? AND status = ${WORLD_EVENT_STATUS.Pending} AND checkpoint_rev > ?`;
}

export async function supersedeWorldEvents(conn: WorldEventSql, table: string, sId: number, instanceId: string, recoveryRev: number): Promise<number> {
    if (!Number.isSafeInteger(recoveryRev) || recoveryRev < 0) throw new RangeError(`[WorldEventPort] recoveryRev ${recoveryRev} 非法`);
    const [result] = await conn.execute<ResultSetHeader>(supersedeWorldEventsSql(table), [sId, instanceId, recoveryRev]);
    return rowsMatched(result);
}

export interface WorldEventStats {
    readonly pending: number;
    readonly done: number;
    readonly dead: number;
    readonly superseded: number;
    /** 检查点已落库、可被 worker 执行的 pending 行数（门内）。 */
    readonly executable: number;
}

/** 运维 / 用例读积压（按分线可选）。 */
export async function worldEventStats(conn: WorldEventSql, table: string, sId: number, instanceId?: string): Promise<WorldEventStats> {
    const target = assertWorldEventTableName(table);
    const where = instanceId === undefined ? "e.server_id = ?" : "e.server_id = ? AND e.instance_id = ?";
    const params = instanceId === undefined ? [sId] : [sId, instanceId];
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT SUM(e.status = 0) AS pending, SUM(e.status = 1) AS done, SUM(e.status = 2) AS dead, SUM(e.status = 3) AS superseded, `
        + "SUM(e.status = 0 AND e.checkpoint_rev <= w.checkpoint_rev) AS executable "
        + `FROM \`${target}\` e JOIN world_instance w ON w.server_id = e.server_id AND w.instance_id = e.instance_id WHERE ${where}`,
        params);
    const row = rows[0] ?? {};
    const count = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
    return { pending: count(row.pending), done: count(row.done), dead: count(row.dead), superseded: count(row.superseded), executable: count(row.executable) };
}
