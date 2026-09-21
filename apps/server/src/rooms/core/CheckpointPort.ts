/**
 * CheckpointPort（MMO MF7b-B1，docs/MMO.md §5.4 MF7b / §7.3 回退窗口）：世界检查点的**框架信封 + kit 存储端口**。
 *
 * - 快照内容由 kit 定义（分线级：NPC / 计时器 / 脚本 vars…；persona 级：位置 / HP / 冷却…），框架只定义并校验**信封**
 *   `{ rev, eventOffset, authorityEpoch, controlEpoch?, schemaVersion, stateHash, snapshot }`：
 *   `rev` 单调（分线 / persona 各自）、`eventOffset` = 该检查点覆盖到的世界事件 seq（§7.3「世界事件 offset 0 回退」：seq > 它的事件已
 *   durable 只消费不重放进内存）、`authorityEpoch` / `controlEpoch` 是落盘时的权威 / 控制代、`schemaVersion` 是 kit 快照 schema 版本
 *   （加载时 `minSupported ≤ schemaVersion ≤ version`，否则 **fail-closed 拒启**——CheckpointIncompatibleError，⛔ 不猜着升级）、
 *   `stateHash` = canonical FNV-1a（shared `wireChecksum`）of snapshot（存储篡改 / 截断 ⇒ CheckpointCorruptError）。
 * - 端口四方法由 kit 实现走自己的表（`saveInstance` / `savePersona` 在框架给的 `KitWorldTx`（权威守卫事务，MF7b-B2）内写，
 *   ⛔ 自开事务；`loadInstance` / `loadPersona` 由 kit 自己读），框架的 `WorldCheckpoint`（MF7b-B4）负责：落盘编排（同一事务里
 *   分线快照 + persona 快照 + 事件批 + `world_instance.checkpoint_rev` 推进）、加载校验、Recovering 的 superseded 标记。
 * - `MemoryCheckpointPort`：无头单测 / 回放用的内存实现（同信封校验）。⛔ 不 import colyseus / rooms/modes / websocket。
 */
import { wireChecksum } from "@game/shared";
import type { KitWorldTx } from "../../core/infra/kitApi";

export interface CheckpointEnvelope<TSnapshot = unknown> {
    /** 单调修订号（≥ 1）；分线级与 persona 级各自计数。 */
    readonly rev: number;
    /** 该检查点覆盖到的世界事件 seq（含）；0 = 尚无事件。 */
    readonly eventOffset: number;
    /** 落盘时的权威代（≥ 1）。 */
    readonly authorityEpoch: number;
    /** persona 级必带：落盘时该 persona 的控制代（≥ 0）。 */
    readonly controlEpoch?: number;
    /** kit 快照 schema 版本（≥ 1）。 */
    readonly schemaVersion: number;
    /** canonical FNV-1a of snapshot（shared wireChecksum，8 位十六进制）。 */
    readonly stateHash: string;
    readonly snapshot: TSnapshot;
}

/** kit 声明的快照 schema 版本窗口：加载 `minSupported ≤ schemaVersion ≤ version` 之外的信封一律拒（fail-closed）。 */
export interface CheckpointSchema {
    readonly version: number;
    readonly minSupported: number;
}

export type CheckpointScope = "instance" | "persona";

export class CheckpointIncompatibleError extends Error {
    constructor(readonly scope: CheckpointScope, readonly schemaVersion: number, readonly schema: CheckpointSchema) {
        super(`checkpoint incompatible: ${scope} schemaVersion ${schemaVersion} ∉ [${schema.minSupported}, ${schema.version}]`);
        this.name = "CheckpointIncompatibleError";
    }
}

export class CheckpointCorruptError extends Error {
    constructor(readonly scope: CheckpointScope, readonly reason: string) {
        super(`checkpoint corrupt: ${scope} ${reason}`);
        this.name = "CheckpointCorruptError";
    }
}

/** 快照的稳定摘要（键序无关、内容与数组序敏感，与客户端 baseline checksum 同一实现）。 */
export function checkpointStateHash(snapshot: unknown): string {
    return wireChecksum(snapshot);
}

/** 造信封（stateHash 由框架算，⛔ 调用方不自填）。 */
export function buildCheckpointEnvelope<TSnapshot>(input: Omit<CheckpointEnvelope<TSnapshot>, "stateHash">): CheckpointEnvelope<TSnapshot> {
    if (input.snapshot === undefined) throw new TypeError("[CheckpointPort] snapshot 不得是 undefined（JSON 不可表示）");
    const envelope: CheckpointEnvelope<TSnapshot> = {
        rev: input.rev,
        eventOffset: input.eventOffset,
        authorityEpoch: input.authorityEpoch,
        ...(input.controlEpoch === undefined ? {} : { controlEpoch: input.controlEpoch }),
        schemaVersion: input.schemaVersion,
        stateHash: checkpointStateHash(input.snapshot),
        snapshot: input.snapshot,
    };
    return envelope;
}

export function validateCheckpointSchema(schema: unknown): CheckpointSchema {
    if (!schema || typeof schema !== "object") throw new TypeError("[CheckpointPort] schema 必须是对象");
    const { version, minSupported } = schema as Partial<CheckpointSchema>;
    if (!Number.isSafeInteger(version) || (version as number) < 1) throw new TypeError("[CheckpointPort] schema.version 必须是 ≥ 1 的整数");
    if (!Number.isSafeInteger(minSupported) || (minSupported as number) < 1 || (minSupported as number) > (version as number)) {
        throw new TypeError("[CheckpointPort] schema.minSupported 必须是 1..version 的整数");
    }
    return { version: version as number, minSupported: minSupported as number };
}

const nonNegativeInt = (value: unknown, label: string, scope: CheckpointScope, min = 0): number => {
    if (!Number.isSafeInteger(value) || (value as number) < min) throw new CheckpointCorruptError(scope, `${label} 必须是 ≥ ${min} 的整数`);
    return value as number;
};

/**
 * 加载侧校验（框架在 kit 的 load 返回后调）：形状 → 版本窗口（不兼容 fail-closed）→ stateHash 复算。
 * 返回冻结的信封；快照内容仍是 kit 的（框架不解释）。
 */
export function validateCheckpointEnvelope(input: unknown, schema: CheckpointSchema, scope: CheckpointScope): CheckpointEnvelope {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CheckpointCorruptError(scope, "信封必须是对象");
    const record = input as Record<string, unknown>;
    const allowed = new Set(["rev", "eventOffset", "authorityEpoch", "controlEpoch", "schemaVersion", "stateHash", "snapshot"]);
    for (const key of Object.keys(record)) {
        if (!allowed.has(key)) throw new CheckpointCorruptError(scope, `未知信封字段 ${key}`);
    }
    const rev = nonNegativeInt(record.rev, "rev", scope, 1);
    const eventOffset = nonNegativeInt(record.eventOffset, "eventOffset", scope, 0);
    const authorityEpoch = nonNegativeInt(record.authorityEpoch, "authorityEpoch", scope, 1);
    let controlEpoch: number | undefined;
    if (scope === "persona" || record.controlEpoch !== undefined) {
        controlEpoch = nonNegativeInt(record.controlEpoch, "controlEpoch", scope, 0);
    }
    const schemaVersion = nonNegativeInt(record.schemaVersion, "schemaVersion", scope, 1);
    if (schemaVersion < schema.minSupported || schemaVersion > schema.version) {
        throw new CheckpointIncompatibleError(scope, schemaVersion, schema);
    }
    if (!("snapshot" in record) || record.snapshot === undefined) throw new CheckpointCorruptError(scope, "缺 snapshot");
    if (typeof record.stateHash !== "string" || !/^[0-9a-f]{8}$/u.test(record.stateHash)) throw new CheckpointCorruptError(scope, "stateHash 形状非法");
    const expected = checkpointStateHash(record.snapshot);
    if (record.stateHash !== expected) throw new CheckpointCorruptError(scope, `stateHash 不符（存储 ${record.stateHash} ≠ 复算 ${expected}）`);
    return Object.freeze({
        rev, eventOffset, authorityEpoch,
        ...(controlEpoch === undefined ? {} : { controlEpoch }),
        schemaVersion, stateHash: record.stateHash, snapshot: record.snapshot,
    });
}

/**
 * kit 实现的存储端口。save* 在框架给的世界事务（`KitWorldTx`，首句已过权威 CAS）内写本 kit 的表；
 * load* 由 kit 自己读（返回原始信封，框架再 `validateCheckpointEnvelope`）；不存在 ⇒ null。
 */
export interface CheckpointPort {
    saveInstance(tx: KitWorldTx, instanceId: string, envelope: CheckpointEnvelope): Promise<void>;
    loadInstance(sId: number, instanceId: string): Promise<unknown | null>;
    savePersona(tx: KitWorldTx, personaId: string, envelope: CheckpointEnvelope): Promise<void>;
    loadPersona(sId: number, personaId: string): Promise<unknown | null>;
}

/** 内存端口（无头单测 / 回放）：分线按 rev、persona 按 (controlEpoch, rev) 只留最新信封；跨分线的新控制代可以从较小的分线 rev 起步。 */
export class MemoryCheckpointPort implements CheckpointPort {
    readonly instances = new Map<string, CheckpointEnvelope>();
    readonly personas = new Map<string, CheckpointEnvelope>();
    readonly log: string[] = [];

    private static key(sId: number, id: string): string {
        return `${sId}:${id}`;
    }

    async saveInstance(tx: KitWorldTx, instanceId: string, envelope: CheckpointEnvelope): Promise<void> {
        const key = MemoryCheckpointPort.key(tx.sId, instanceId);
        const previous = this.instances.get(key);
        if (previous && envelope.rev <= previous.rev) throw new Error(`[MemoryCheckpointPort] instance rev 必须单调：${envelope.rev} ≤ ${previous.rev}`);
        this.instances.set(key, envelope);
        this.log.push(`instance:${instanceId}:${envelope.rev}@${tx.writeSeq}`);
    }

    async loadInstance(sId: number, instanceId: string): Promise<unknown | null> {
        return this.instances.get(MemoryCheckpointPort.key(sId, instanceId)) ?? null;
    }

    async savePersona(tx: KitWorldTx, personaId: string, envelope: CheckpointEnvelope): Promise<void> {
        const key = MemoryCheckpointPort.key(tx.sId, personaId);
        const previous = this.personas.get(key);
        const controlEpoch = envelope.controlEpoch;
        if (controlEpoch === undefined) throw new TypeError("[MemoryCheckpointPort] persona 信封必须带 controlEpoch");
        if (previous && (controlEpoch < (previous.controlEpoch ?? 0)
            || (controlEpoch === previous.controlEpoch && envelope.rev <= previous.rev))) {
            throw new Error(`[MemoryCheckpointPort] persona (controlEpoch, rev) 必须单调：(${controlEpoch}, ${envelope.rev}) ≤ (${previous.controlEpoch}, ${previous.rev})`);
        }
        this.personas.set(key, envelope);
        this.log.push(`persona:${personaId}:${envelope.rev}@${tx.writeSeq}`);
    }

    async loadPersona(sId: number, personaId: string): Promise<unknown | null> {
        return this.personas.get(MemoryCheckpointPort.key(sId, personaId)) ?? null;
    }
}
