/**
 * 世界权威与控制权的 MySQL 边界（MMO MF4-B3，docs/MMO.md §4.4 / §4.6 不变量 1 / §5.4 MF4）。
 *
 * - **权威**：`world_instance.authority_epoch` 单调 +1 的 CAS（`acquireAuthority`）——每个 WorldAddress 同时只有一个可提交的模拟 owner，
 *   旧 epoch 的延迟提交被存储边界拒（MF7b `withWorldTx` 首句 CAS 用同一列）；⛔ 只在内存比 epoch 不够。
 * - **控制权**：`persona.control_epoch` 单调 +1 的 CAS（`acquireControl`）——每个 persona 同时只有一个有效控制（双登 / 交接只一个赢家），
 *   `assertControl` 与 kitApi 的门面同谓词（Rows matched；池已关 CLIENT_FOUND_ROWS，⛔ 不用 affectedRows）。
 * - 连接面可注入（int 测试注入临时库的池）；⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { ControlConflictError, PersonaNotFoundError, WorldNotAuthoritativeError } from "../../core/errors";
import { getPool } from "../../core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../core/infra/mysql";
import { storedInt } from "../../core/infra/numbers";

export type ControlSqlPool = Pick<Pool, "execute" | "query">;

export type WorldInstanceState = "recovering" | "active" | "draining" | "offline";

export interface WorldInstanceRow {
    readonly instanceId: string;
    readonly mapId: string;
    readonly line: number;
    readonly authorityEpoch: number;
    readonly holder: string;
    readonly state: WorldInstanceState;
    readonly checkpointRev: number;
    readonly writeSeq: number;
}

const INSTANCE_STATES: readonly WorldInstanceState[] = ["recovering", "active", "draining", "offline"];

function rowsMatched(result: ResultSetHeader): number {
    const matched = /Rows matched:\s*(\d+)/.exec(result.info ?? "");
    return matched ? storedInt(matched[1], "control.rowsMatched", { min: 0 }) : 0;
}

function assertSId(sId: number): void {
    if (!Number.isSafeInteger(sId) || sId < 0 || sId > 0xffff) throw new RangeError(`[control] sId 非法：${String(sId)}`);
}

function assertEpoch(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`[control] ${label} 必须是非负安全整数：${String(value)}`);
}

interface InstanceSqlRow extends RowDataPacket {
    instance_id: string; map_id: string; line: number; authority_epoch: number | string; holder: string; state: string;
    checkpoint_rev: number | string; write_seq: number | string;
}

function instanceOf(row: InstanceSqlRow): WorldInstanceRow {
    const state = INSTANCE_STATES.includes(row.state as WorldInstanceState) ? (row.state as WorldInstanceState) : "offline";
    return {
        instanceId: row.instance_id,
        mapId: row.map_id,
        line: storedInt(row.line, "world_instance.line", { min: 0, max: 0xffff }),
        authorityEpoch: storedInt(row.authority_epoch, "world_instance.authority_epoch", { min: 0 }),
        holder: row.holder,
        state,
        checkpointRev: storedInt(row.checkpoint_rev, "world_instance.checkpoint_rev", { min: 0 }),
        writeSeq: storedInt(row.write_seq, "world_instance.write_seq", { min: 0 }),
    };
}

/** 读一行（不存在 ⇒ null）。 */
export async function readInstance(sId: number, instanceId: string, pool: ControlSqlPool = getPool()): Promise<WorldInstanceRow | null> {
    assertSId(sId);
    const [rows] = await pool.query<InstanceSqlRow[]>(
        "SELECT instance_id, map_id, line, authority_epoch, holder, state, checkpoint_rev, write_seq FROM world_instance WHERE server_id = ? AND instance_id = ?",
        [sId, instanceId]);
    return rows.length === 0 ? null : instanceOf(rows[0] as InstanceSqlRow);
}

/** 某图已有的全部分线行（按 line 升序；MF10-B1 分线分配用）。 */
export async function listInstances(sId: number, mapId: string, pool: ControlSqlPool = getPool()): Promise<WorldInstanceRow[]> {
    assertSId(sId);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(mapId)) throw new RangeError(`[control] mapId 非法：${mapId}`);
    const [rows] = await pool.query<InstanceSqlRow[]>(
        "SELECT instance_id, map_id, line, authority_epoch, holder, state, checkpoint_rev, write_seq FROM world_instance WHERE server_id = ? AND map_id = ? ORDER BY line",
        [sId, mapId]);
    return rows.map((row) => instanceOf(row as InstanceSqlRow));
}

/**
 * 按 (sId, mapId, line) 找或建实例行（WorldDirectory 的 MySQL 半边；幂等：UNIQUE 撞车即回读既有行）。
 * 新行 authority_epoch 0 / state offline；⛔ 不在这里取权威。
 */
export async function findOrCreateInstance(sId: number, mapId: string, line: number, pool: ControlSqlPool = getPool()): Promise<WorldInstanceRow> {
    assertSId(sId);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(mapId)) throw new RangeError(`[control] mapId 非法：${mapId}`);
    if (!Number.isSafeInteger(line) || line < 0 || line > 0xffff) throw new RangeError(`[control] line 非法：${String(line)}`);
    const existing = await pool.query<InstanceSqlRow[]>(
        "SELECT instance_id, map_id, line, authority_epoch, holder, state, checkpoint_rev, write_seq FROM world_instance WHERE server_id = ? AND map_id = ? AND line = ?",
        [sId, mapId, line]);
    if (existing[0].length > 0) return instanceOf(existing[0][0] as InstanceSqlRow);
    const instanceId = `wi_${randomUUID().replace(/-/gu, "")}`;
    try {
        await pool.execute<ResultSetHeader>(
            "INSERT INTO world_instance (server_id, instance_id, map_id, line) VALUES (?, ?, ?, ?)", [sId, instanceId, mapId, line]);
    } catch (error) {
        // 并发建行：UNIQUE(server_id, map_id, line) 撞车 ⇒ 回读赢家的行（⛔ 不吞其它错误）
        if ((error as { errno?: unknown }).errno !== 1062) throw error;
    }
    const [rows] = await pool.query<InstanceSqlRow[]>(
        "SELECT instance_id, map_id, line, authority_epoch, holder, state, checkpoint_rev, write_seq FROM world_instance WHERE server_id = ? AND map_id = ? AND line = ?",
        [sId, mapId, line]);
    if (rows.length === 0) throw new Error(`[control] world_instance 建行后回读为空：s${sId} ${mapId}#${line}`);
    return instanceOf(rows[0] as InstanceSqlRow);
}

/**
 * 取权威：`authority_epoch` 从 expectedEpoch CAS 到 expectedEpoch + 1，同时写 holder 与 state=recovering。
 * 两个节点拿同一个 expectedEpoch 争抢只有一个匹配到行；输家得到 WorldNotAuthoritativeError（带实际 epoch，供决定是否退出）。
 */
export async function acquireAuthority(
    sId: number, instanceId: string, holder: string, expectedEpoch: number, pool: ControlSqlPool = getPool(),
): Promise<number> {
    assertSId(sId);
    assertEpoch(expectedEpoch, "expectedEpoch");
    if (typeof holder !== "string" || holder.length === 0 || holder.length > 64) throw new RangeError("[control] holder 必须是 1..64 字符");
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE world_instance SET authority_epoch = authority_epoch + 1, holder = ?, state = 'recovering' WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?",
        [holder, sId, instanceId, expectedEpoch]);
    if (rowsMatched(result) === 1) return expectedEpoch + 1;
    const current = await readInstance(sId, instanceId, pool);
    throw new WorldNotAuthoritativeError(instanceId, expectedEpoch, current?.authorityEpoch ?? -1);
}

/** 权威持有者推进分线状态（CAS 在 authority_epoch 上：旧 epoch 的延迟写 0 行 ⇒ WorldNotAuthoritativeError）。 */
export async function setInstanceState(
    sId: number, instanceId: string, authorityEpoch: number, state: WorldInstanceState, pool: ControlSqlPool = getPool(),
): Promise<void> {
    assertSId(sId);
    assertEpoch(authorityEpoch, "authorityEpoch");
    if (!INSTANCE_STATES.includes(state)) throw new RangeError(`[control] state 非法：${String(state)}`);
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE world_instance SET state = ? WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?",
        [state, sId, instanceId, authorityEpoch]);
    if (rowsMatched(result) === 1) return;
    const current = await readInstance(sId, instanceId, pool);
    throw new WorldNotAuthoritativeError(instanceId, authorityEpoch, current?.authorityEpoch ?? -1);
}

export interface PersonaControl {
    readonly controlEpoch: number;
    readonly worldAddress: string | null;
}

interface PersonaControlRow extends RowDataPacket { control_epoch: number | string; world_address: string | null }

export async function readControl(sId: number, personaId: string, pool: ControlSqlPool = getPool()): Promise<PersonaControl | null> {
    assertSId(sId);
    const [rows] = await pool.query<PersonaControlRow[]>(
        "SELECT control_epoch, world_address FROM persona WHERE server_id = ? AND persona_id = ?", [sId, personaId]);
    if (rows.length === 0) return null;
    const row = rows[0] as PersonaControlRow;
    return { controlEpoch: storedInt(row.control_epoch, "persona.control_epoch", { min: 0 }), worldAddress: row.world_address };
}

/**
 * 取控制权：`control_epoch` 从 expectedEpoch CAS 到 expectedEpoch + 1 并写 world_address。同 persona 两处 join 拿同一个
 * expectedEpoch 只有一个匹配到行；输家 ControlConflictError（不存在 ⇒ PersonaNotFoundError）。返回新 controlEpoch。
 */
export async function acquireControl(
    sId: number, personaId: string, worldAddress: string, expectedEpoch: number, pool: ControlSqlPool = getPool(),
): Promise<number> {
    assertSId(sId);
    assertEpoch(expectedEpoch, "expectedEpoch");
    if (typeof worldAddress !== "string" || worldAddress.length === 0 || worldAddress.length > 128) throw new RangeError("[control] worldAddress 必须是 1..128 字符");
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE persona SET control_epoch = control_epoch + 1, world_address = ? WHERE server_id = ? AND persona_id = ? AND control_epoch = ?",
        [worldAddress, sId, personaId, expectedEpoch]);
    if (rowsMatched(result) === 1) return expectedEpoch + 1;
    const current = await readControl(sId, personaId, pool);
    if (current === null) throw new PersonaNotFoundError(personaId);
    throw new ControlConflictError(personaId, expectedEpoch, current.controlEpoch);
}

/** 持有者放弃控制权（world_address 置空；epoch 不动，下一次 acquire 再 +1）；旧 epoch 0 行 ⇒ false。 */
export async function releaseControl(sId: number, personaId: string, controlEpoch: number, pool: ControlSqlPool = getPool()): Promise<boolean> {
    assertSId(sId);
    assertEpoch(controlEpoch, "controlEpoch");
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE persona SET world_address = NULL WHERE server_id = ? AND persona_id = ? AND control_epoch = ?",
        [sId, personaId, controlEpoch]);
    return rowsMatched(result) === 1;
}

/** 控制权仍在手上（与 kitApi.assertControl 同谓词）：0 行 ⇒ 不存在 PersonaNotFoundError / 存在 ControlConflictError。 */
export async function assertControl(sId: number, personaId: string, controlEpoch: number, pool: ControlSqlPool = getPool()): Promise<void> {
    assertSId(sId);
    assertEpoch(controlEpoch, "controlEpoch");
    const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE persona SET updated_at = NOW(3) WHERE server_id = ? AND persona_id = ? AND control_epoch = ?",
        [sId, personaId, controlEpoch]);
    if (rowsMatched(result) === 1) return;
    const current = await readControl(sId, personaId, pool);
    if (current === null) throw new PersonaNotFoundError(personaId);
    throw new ControlConflictError(personaId, controlEpoch, current.controlEpoch);
}

/** persona 归属 + 控制权（WorldRoom 准入 ⑤：归属由存储真源判定，⛔ 不信 join options / client 自报）。 */
export interface PersonaOwner {
    readonly userId: string;
    /** 0 = active，1 = inactive（kitApi.deactivatePersona 之后、deletePersona 之前）。 */
    readonly status: number;
    readonly controlEpoch: number;
    readonly worldAddress: string | null;
}

interface PersonaOwnerRow extends RowDataPacket { user_id: string; status: number | string; control_epoch: number | string; world_address: string | null }

export async function readPersonaOwner(sId: number, personaId: string, pool: ControlSqlPool = getPool()): Promise<PersonaOwner | null> {
    assertSId(sId);
    const [rows] = await pool.query<PersonaOwnerRow[]>(
        "SELECT user_id, status, control_epoch, world_address FROM persona WHERE server_id = ? AND persona_id = ?", [sId, personaId]);
    if (rows.length === 0) return null;
    const row = rows[0] as PersonaOwnerRow;
    return {
        userId: String(row.user_id),
        status: storedInt(row.status, "persona.status", { min: 0, max: 255 }),
        controlEpoch: storedInt(row.control_epoch, "persona.control_epoch", { min: 0 }),
        worldAddress: row.world_address === null || row.world_address === undefined ? null : String(row.world_address),
    };
}
