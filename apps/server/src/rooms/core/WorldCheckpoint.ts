/**
 * WorldCheckpointer（MMO MF7b-B4，docs/MMO.md §4.5 / §5.4 MF7b / §7.3）：WorldRoom 的检查点编排——把 WorldRuntime 取出的批次
 * （分线快照 + persona 快照 + 事件批）在**同一个权威守卫世界事务**里落盘，并推进 `world_instance.checkpoint_rev`：
 *   withWorldTx(kitId, sId, { instanceId, authorityEpoch, personas })：
 *     port.saveInstance(tx, instanceId, 信封{rev, eventOffset, authorityEpoch, schemaVersion, stateHash, snapshot})
 *     → 每个 persona 条目 port.savePersona(tx, personaId, 信封{…, controlEpoch})
 *     → 每条事件 tx.appendWorldEvent(eventTable, { eventId(uuid), seq, kind, payload, checkpointRev: rev })
 *     → beforeCommit：UPDATE world_instance SET checkpoint_rev = rev WHERE … AND authority_epoch = ? AND checkpoint_rev < rev（0 行 ⇒ AuthorityLostError）
 *   全部成功 COMMIT ⇒ 壳 `runtime.commitCheckpoint(rev)`；任一步失败整体 ROLLBACK ⇒ 壳 `runtime.rollbackCheckpoint(batch)`（事件保留到后继批提交成功）。
 * 这就是 MF7b-B3 选定的实现选项 ④「事件批只随分线检查点同事务落库」：事件行与它所属状态的检查点原子，worker 的 `checkpoint_rev ≤` 门
 * 与 Recovering 的 superseded 只作纵深。
 * 加载：`loadInstance` / `loadPersona` 经 port 读回后 `validateCheckpointEnvelope`（版本窗口 / stateHash，不兼容 fail-closed）；
 * `supersede` 在 Recovering 把 pending 且 checkpoint_rev > 恢复点的事件行标 superseded（正常 0 行）。
 * ⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import { randomUUID } from "node:crypto";
import { AuthorityLostError, withKitWorldTx, type KitWorldTxDeps, type KitWorldTxScope } from "../../core/infra/kitApi";
import { getPool, type PoolConnection, type ResultSetHeader } from "../../core/infra/mysql";
import type { WorldModeCheckpointCapability } from "../WorldMode";
import { buildCheckpointEnvelope, validateCheckpointEnvelope, validateCheckpointSchema, type CheckpointEnvelope } from "./CheckpointPort";
import { supersedeWorldEvents, type WorldEventSql } from "./WorldEventPort";
import type { WorldCheckpointBatch, WorldPersonaCheckpointBatch } from "./WorldRuntime";

export interface WorldCheckpointerDeps {
    /** 世界事务入口（生产 = kit-api withKitWorldTx；单测注入假事务）。 */
    readonly withWorldTx: <T>(kitId: string, sId: number, scope: KitWorldTxScope, fn: Parameters<typeof withKitWorldTx<T>>[3], deps?: Partial<KitWorldTxDeps>) => Promise<T>;
    /** Recovering superseded 用的框架连接（生产 = 池；单测注入）。 */
    readonly sql: () => WorldEventSql;
    readonly eventId: () => string;
}

const ROWS_MATCHED = /Rows matched:\s*(\d+)/u;
const rowsMatched = (result: ResultSetHeader): number => {
    const match = ROWS_MATCHED.exec(result.info ?? "");
    return match === null ? result.affectedRows : Number(match[1]);
};

export const defaultWorldCheckpointerDeps: WorldCheckpointerDeps = {
    withWorldTx: (kitId, sId, scope, fn, deps) => withKitWorldTx(kitId, sId, scope, fn, deps),
    sql: () => getPool() as unknown as WorldEventSql,
    eventId: () => `wev_${randomUUID().replace(/-/gu, "")}`,
};

/** 推进 world_instance.checkpoint_rev（同事务、权威 CAS、只许前进）；框架在 beforeCommit 里调。 */
export async function commitCheckpointRev(conn: Pick<PoolConnection, "execute">, sId: number, instanceId: string, authorityEpoch: number, rev: number): Promise<void> {
    const [result] = await conn.execute<ResultSetHeader>(
        "UPDATE world_instance SET checkpoint_rev = ? WHERE server_id = ? AND instance_id = ? AND authority_epoch = ? AND checkpoint_rev < ?",
        [rev, sId, instanceId, authorityEpoch, rev]);
    if (rowsMatched(result) !== 1) throw new AuthorityLostError(instanceId, authorityEpoch);
}

export class WorldCheckpointer {
    private readonly deps: WorldCheckpointerDeps;

    constructor(readonly capability: WorldModeCheckpointCapability, readonly sId: number, deps: Partial<WorldCheckpointerDeps> = {}) {
        validateCheckpointSchema(capability.schema);
        if (typeof capability.kitId !== "string" || capability.kitId.length === 0) throw new TypeError("[WorldCheckpointer] kitId 必须非空");
        this.deps = { ...defaultWorldCheckpointerDeps, ...deps };
    }

    /** 落盘一批（同一世界事务）；抛出 = 整体未落盘（壳据此 rollbackCheckpoint；AuthorityLostError ⇒ Draining）。 */
    async save(instanceId: string, batch: WorldCheckpointBatch): Promise<void> {
        const { kitId, port, schema, eventTable } = this.capability;
        if (batch.events.length > 0 && !eventTable) throw new Error(`[WorldCheckpointer] mode 未声明 eventTable，却有 ${batch.events.length} 条 durable 事件`);
        const controlEpochOf = new Map(batch.personas.map((persona) => [persona.personaId, persona.controlEpoch]));
        const instanceEnvelope = buildCheckpointEnvelope({
            rev: batch.rev, eventOffset: batch.eventOffset, authorityEpoch: batch.authorityEpoch, schemaVersion: schema.version, snapshot: batch.checkpoint.instance ?? null,
        });
        await this.deps.withWorldTx(kitId, this.sId, { instanceId, authorityEpoch: batch.authorityEpoch, personas: batch.personas.map((p) => ({ id: p.personaId, controlEpoch: p.controlEpoch })) }, async (tx) => {
            await port.saveInstance(tx, instanceId, instanceEnvelope);
            for (const entry of batch.checkpoint.persona) {
                const controlEpoch = controlEpochOf.get(entry.personaId);
                if (controlEpoch === undefined) {
                    console.warn(`[WorldCheckpointer ${instanceId}] persona ${entry.personaId} 不在座（已离开 / 失控制权），本批跳过其快照`);
                    continue;
                }
                await port.savePersona(tx, entry.personaId, buildCheckpointEnvelope({
                    rev: batch.rev, eventOffset: batch.eventOffset, authorityEpoch: batch.authorityEpoch, controlEpoch, schemaVersion: schema.version, snapshot: entry.snapshot ?? null,
                }));
            }
            for (const event of batch.events) {
                await tx.appendWorldEvent(eventTable as string, { eventId: this.deps.eventId(), seq: event.seq, kind: event.kind, payload: event.payload, checkpointRev: batch.rev });
            }
        }, { beforeCommit: (conn, scope) => commitCheckpointRev(conn, this.sId, scope.instanceId, scope.authorityEpoch, batch.rev) });
    }

    /** persona 级强制点（MK1-B4）：世界事务里只落该 persona 的快照（首句权威 CAS + 该 persona assertControl）；⛔ 分线快照 / 事件行 / checkpoint_rev。 */
    async savePersona(instanceId: string, batch: WorldPersonaCheckpointBatch): Promise<void> {
        const { kitId, port, schema } = this.capability;
        const envelope = buildCheckpointEnvelope({
            rev: batch.rev, eventOffset: batch.eventOffset, authorityEpoch: batch.authorityEpoch, controlEpoch: batch.controlEpoch, schemaVersion: schema.version, snapshot: batch.snapshot ?? null,
        });
        await this.deps.withWorldTx(kitId, this.sId, { instanceId, authorityEpoch: batch.authorityEpoch, personas: [{ id: batch.personaId, controlEpoch: batch.controlEpoch }] }, async (tx) => {
            await port.savePersona(tx, batch.personaId, envelope);
        });
    }

    /** Recovering：读回并校验分线检查点（null = 空世界起步；不兼容 / 损坏 ⇒ 抛，壳拒绝建房）。 */
    async loadInstance(instanceId: string): Promise<CheckpointEnvelope | null> {
        const raw = await this.capability.port.loadInstance(this.sId, instanceId);
        return raw === null ? null : validateCheckpointEnvelope(raw, this.capability.schema, "instance");
    }

    /** 准入：读回并校验 persona 检查点（null = 首次进入）。 */
    async loadPersona(personaId: string): Promise<CheckpointEnvelope | null> {
        const raw = await this.capability.port.loadPersona(this.sId, personaId);
        return raw === null ? null : validateCheckpointEnvelope(raw, this.capability.schema, "persona");
    }

    /** Recovering：把属于已丢失未来的 pending 事件行标 superseded（无 eventTable ⇒ 0）。 */
    async supersede(instanceId: string, recoveryRev: number): Promise<number> {
        if (!this.capability.eventTable) return 0;
        return supersedeWorldEvents(this.deps.sql(), this.capability.eventTable, this.sId, instanceId, recoveryRev);
    }
}
