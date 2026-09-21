/**
 * mmo kit · `orchestration` api 面（服务端，docs/MMO.md §8.5 末段；MK4-B1；v2 MG1-B2）：对插件只导出这几件——
 *  - `readCheckpointedVars(sId, instanceId, packId)`：最新已落库分线检查点里该 pack 的 vars（运维 / 用例读；⛔ 运行中写口）；
 *  - `listCheckpointedVars(sId, mapId, packId)`（v2）：某图全部分线（k_mmo_instance 语义行，按 instance_id 序、≤ 64 条）各自最新检查点的
 *    pack vars + rev / tick（插件自有域页面读，如 mmodemo.bossBoard；没有检查点 / 检查点里不是该 pack ⇒ vars 为空对象，rev / tick 为 0）；
 *  - `createOrchestrationHarness({ module, pack, mapId, seed, entities? })`：无头重放台——同一运行器 + 内存世界（内容包的图 / 区域 / 碰撞 + 注入的实体视图），
 *    `emit(event)` 跑一条事件返回命令（本地命令已生效、其余原样），`vars()` / `publish()` / `ring()`，`replay(events)` 用同种子重跑并逐条比对环形日志摘要；
 *    v3 `snapshot()` / `restore(snapshot, currentTick?)` 通过公开只读快照验证真实运行器恢复（vars / timers / 发布态 / 区域开关，默认新进程 tick 0）。
 * 插件只能 import 本门面；任何导出变化都要 bump `api.orchestration.version`。
 */
import { indexContentPack, validateContentPack, type IContentPack, type IContentPackIndex, type IRegionDef } from "@game/shared/kits/mmo/api/content/index";
import { clampToMap, parseCollisionGrid } from "@game/shared/kits/mmo/api/movement/index";
import {
    ORCH_MAX_EVENT_QUEUE,
    type EntityId, type IEntityView, type OrchestrationCommand, type OrchestrationEvent, type OrchestrationModule, type OrchestrationRingEntry, type ScriptScalar, type Vec2,
} from "@game/shared/kits/mmo/api/orchestration/index";
import { withKitTx, type RowDataPacket } from "../../../../core/infra/kitApi";
import { MMO_KIT_ID, defaultMmoTxRunner, type MmoTxRunner } from "../../host";
import { OrchestrationRunner, type RunnerEffect, type RunnerWorld } from "../../orchestration/runner";

export type { OrchestrationRingEntry, RunnerEffect };

interface EnvelopeRow extends RowDataPacket { envelope: unknown }

/** 最新已落库分线检查点里该 pack 的 vars（无检查点 / 无该 pack ⇒ null）。 */
export async function readCheckpointedVars(sId: number, instanceId: string, packId: string): Promise<Readonly<Record<string, ScriptScalar>> | null> {
    return withKitTx(MMO_KIT_ID, sId, async (tx) => {
        const rows = await tx.query<EnvelopeRow[]>("SELECT envelope FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ? ORDER BY rev DESC LIMIT 1", [sId, instanceId]);
        if (rows.length === 0) return null;
        const raw = rows[0]!.envelope;
        const envelope = (typeof raw === "string" ? JSON.parse(raw) : raw) as { snapshot?: { orchestration?: { packId?: unknown; vars?: unknown } } };
        const orchestration = envelope.snapshot?.orchestration;
        if (!orchestration || orchestration.packId !== packId || typeof orchestration.vars !== "object" || orchestration.vars === null) return null;
        return orchestration.vars as Record<string, ScriptScalar>;
    });
}

/** 一条分线的最新检查点 vars（listCheckpointedVars）。 */
export interface CheckpointedVarsRow {
    readonly instanceId: string;
    /** 最新检查点 rev / 分线 tick；无检查点 ⇒ 0 / 0 */
    readonly rev: number;
    readonly tick: number;
    /** 该 pack 的脚本 vars；无检查点或检查点里不是该 pack ⇒ {} */
    readonly vars: Readonly<Record<string, ScriptScalar>>;
}

/** listCheckpointedVars 一次最多返回的分线数。 */
export const CHECKPOINTED_VARS_MAX_ROWS = 64;

interface InstanceIdRow extends RowDataPacket { instance_id: string }
interface LatestCheckpointRow extends RowDataPacket { rev: number | string; tick: number | string; envelope: unknown }

const varsOf = (raw: unknown, packId: string): Readonly<Record<string, ScriptScalar>> => {
    const envelope = (typeof raw === "string" ? JSON.parse(raw) : raw) as { snapshot?: { orchestration?: { packId?: unknown; vars?: unknown } } } | null;
    const orchestration = envelope?.snapshot?.orchestration;
    if (!orchestration || orchestration.packId !== packId || typeof orchestration.vars !== "object" || orchestration.vars === null || Array.isArray(orchestration.vars)) return {};
    return orchestration.vars as Record<string, ScriptScalar>;
};

/**
 * 某图全部分线（k_mmo_instance 语义行里 map_id / pack_id 匹配者，按 instance_id 序、≤ CHECKPOINTED_VARS_MAX_ROWS）各自最新分线检查点的 pack vars。
 * 只读两张 kit 表（表闸内），⛔ 不碰框架 world_instance；`run` 只给单测注入。
 */
export async function listCheckpointedVars(sId: number, mapId: string, packId: string, run: MmoTxRunner = defaultMmoTxRunner): Promise<readonly CheckpointedVarsRow[]> {
    return run(sId, async (tx) => {
        const instances = await tx.query<InstanceIdRow[]>(
            // mysql2 execute 把 JS number 按 DOUBLE 绑定，部分 MySQL 版本不接受 LIMIT 的 DOUBLE 参数。
            // 上限是代码内可信整数，身份筛选值仍使用绑定参数。
            `SELECT instance_id FROM k_mmo_instance WHERE server_id = ? AND map_id = ? AND pack_id = ? ORDER BY instance_id LIMIT ${CHECKPOINTED_VARS_MAX_ROWS}`, [sId, mapId, packId]);
        const out: CheckpointedVarsRow[] = [];
        for (const instance of instances) {
            const instanceId = String(instance.instance_id);
            const rows = await tx.query<LatestCheckpointRow[]>(
                "SELECT rev, tick, envelope FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ? ORDER BY rev DESC LIMIT 1", [sId, instanceId]);
            const latest = rows[0];
            out.push(latest
                ? { instanceId, rev: Number(latest.rev), tick: Number(latest.tick), vars: varsOf(latest.envelope, packId) }
                : { instanceId, rev: 0, tick: 0, vars: {} });
        }
        return out;
    });
}

export interface GrantResultRow { readonly seq: number; readonly opId: string; readonly ok: boolean; readonly reason?: string }

/**
 * 回投 grantResult（§8.2）：读本分线已执行（done 1 / dead 2）的 grantItem / grantCurrency 事件行（seq > 水位），mode 按节拍轮询后投给模块
 * （v1 无 worker → 房间的推送通道，轮询是唯一路径；水位随分线快照）。
 */
export async function pollGrantResults(sId: number, instanceId: string, afterSeq: number, limit = 64): Promise<readonly GrantResultRow[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > ORCH_MAX_EVENT_QUEUE) throw new RangeError(`grant result limit must be an integer in 1..${ORCH_MAX_EVENT_QUEUE}`);
    return withKitTx(MMO_KIT_ID, sId, async (tx) => {
        const rows = await tx.query<(RowDataPacket & { seq: number | string; event_id: string; payload: unknown; status: number | string })[]>(
            `SELECT seq, event_id, payload, status FROM k_mmo_world_event WHERE server_id = ? AND instance_id = ? AND seq > ? AND kind IN ('grantItem', 'grantCurrency') AND status IN (1, 2) ORDER BY seq LIMIT ${limit}`,
            [sId, instanceId, afterSeq]);
        return rows.map((row) => {
            const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as { opId?: unknown } | null;
            const opId = payload && typeof payload.opId === "string" ? payload.opId : String(row.event_id);
            const ok = Number(row.status) === 1;
            return { seq: Number(row.seq), opId, ok, ...(ok ? {} : { reason: "dead" }) };
        });
    });
}

/** 区域包含判定（circle / rect；纯函数，mode 与 harness 共用）。 */
export function regionContains(region: IRegionDef, pos: Vec2): boolean {
    if (region.shape.kind === "circle") return Math.hypot(pos.x - region.shape.center.x, pos.y - region.shape.center.y) <= region.shape.radius;
    return pos.x >= region.shape.min.x && pos.x <= region.shape.max.x && pos.y >= region.shape.min.y && pos.y <= region.shape.max.y;
}

export interface HarnessOptions {
    readonly module: OrchestrationModule;
    /** 内容包（字面量或已索引） */
    readonly pack: IContentPack | IContentPackIndex;
    readonly mapId: string;
    readonly seed: number;
    /** 内存世界里的实体视图（缺省空世界） */
    readonly entities?: readonly IEntityView[];
    /** 队伍：entityId → 同分线队友 entityId（缺省只有自己） */
    readonly parties?: Readonly<Record<string, readonly EntityId[]>>;
    readonly fixedStepMs?: number;
    readonly budgetMs?: number;
}

export interface HarnessEmitResult {
    readonly commands: readonly OrchestrationCommand[];
    readonly effects: readonly RunnerEffect[];
    readonly suspended: string | null;
}

export interface HarnessReplayResult { readonly equal: boolean; readonly mismatches: readonly { readonly seq: number; readonly expected: OrchestrationRingEntry; readonly actual: OrchestrationRingEntry | null }[] }

/** 可 JSON 往返的测试检查点；只含值，不持有运行器或内部可变集合。实体视图仍由 HarnessOptions 注入。 */
export interface HarnessSnapshot {
    readonly schemaVersion: 1;
    readonly packId: string;
    readonly mapId: string;
    readonly seed: number;
    readonly fixedStepMs: number;
    readonly tick: number;
    readonly regions: Readonly<Record<string, boolean>>;
    readonly vars: Readonly<Record<string, ScriptScalar>>;
    readonly timers: readonly { readonly id: string; readonly dueTick: number; readonly tag: string; readonly repeatMs: number }[];
    readonly publish: { readonly rev: number; readonly state: Readonly<Record<string, ScriptScalar>> };
    readonly suspended: string | null;
    readonly eventSeq: number;
    readonly ring: readonly OrchestrationRingEntry[];
}

export interface OrchestrationHarness {
    /** 在 tick 上投一条事件并立刻 dispatch。 */
    emit(event: OrchestrationEvent, tick?: number): HarnessEmitResult;
    /** 推进 tick（timer / tick 节拍照常触发）；返回这些步里跑出来的 effects。 */
    advance(ticks: number): readonly RunnerEffect[];
    vars(): Readonly<Record<string, ScriptScalar>>;
    publish(): { readonly rev: number; readonly state: Readonly<Record<string, ScriptScalar>> };
    ring(): readonly OrchestrationRingEntry[];
    snapshot(): HarnessSnapshot;
    /** 重建运行器并回灌检查点；timer 按 snapshot.tick → currentTick 重排、旧暂停解除，不隐式投 instanceStarted。 */
    restore(snapshot: HarnessSnapshot, currentTick?: number): void;
    readonly tick: number;
    /** 用同种子重跑同一事件序列（按 emit 时的 tick），逐条比对环形日志。 */
    replay(events: readonly { readonly event: OrchestrationEvent; readonly tick: number }[]): HarnessReplayResult;
}

const isIndex = (pack: IContentPack | IContentPackIndex): pack is IContentPackIndex => "mapById" in pack;

function memoryWorld(index: IContentPackIndex, mapId: string, entities: readonly IEntityView[], parties: Readonly<Record<string, readonly EntityId[]>>): RunnerWorld {
    const map = index.mapById.get(mapId);
    if (!map) throw new Error(`[mmo orchestration harness] 地图 ${mapId} 不在内容包 ${index.pack.packId} 内`);
    const grid = parseCollisionGrid(map.collision ?? null, map.size);
    const regions = new Map((index.regionsByMap.get(mapId) ?? []).map((region) => [region.regionId, region]));
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return {
        entity: (id) => byId.get(id) ?? null,
        entitiesInRegion: (regionId, filter) => {
            const region = regions.get(regionId);
            if (!region) return [];
            return entities.filter((entity) => entity.alive && regionContains(region, entity) && (filter?.kind === undefined || entity.kind === filter.kind) && (filter?.tag === undefined || entity.tag === filter.tag) && (filter?.factionId === undefined || entity.factionId === filter.factionId)).map((entity) => entity.id);
        },
        playersInInstance: () => entities.filter((entity) => entity.kind === "character").map((entity) => entity.id),
        isWalkable: (pos) => { const clamped = clampToMap(pos, map.size); return clamped.x === pos.x && clamped.y === pos.y && !(grid?.blocked(pos.x, pos.y) ?? false); },
        region: (regionId) => regions.get(regionId) ?? null,
        creature: (templateId) => index.creatureById.get(templateId) ?? null,
        item: (itemId) => index.itemById.get(itemId) ?? null,
        partyMembersInInstance: (entityId) => parties[entityId] ?? [entityId],
    };
}

export function createOrchestrationHarness(options: HarnessOptions): OrchestrationHarness {
    const index = isIndex(options.pack) ? options.pack : indexContentPack(validateContentPack(options.pack));
    const fixedStepMs = options.fixedStepMs ?? 50;
    const world = memoryWorld(index, options.mapId, options.entities ?? [], options.parties ?? {});
    const build = (): OrchestrationRunner => new OrchestrationRunner({ module: options.module, instanceId: `harness:${options.seed}`, address: `h/${options.mapId}/0`, fixedStepMs, now: () => 0, ...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }) });
    let runner = build();
    let tick = 0;
    const defaultRegions = (): Map<string, boolean> => new Map((index.regionsByMap.get(options.mapId) ?? []).map((region) => [region.regionId, region.enabledByDefault]));
    let regions = defaultRegions();
    let replayBase: { readonly snapshot: HarnessSnapshot; readonly tick: number } | null = null;
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const applyEffects = (effects: readonly RunnerEffect[], targetRegions: Map<string, boolean>): void => {
        for (const effect of effects) if (effect.op === "setRegionEnabled" && targetRegions.has(effect.regionId)) targetRegions.set(effect.regionId, effect.enabled);
    };
    const run = (target: OrchestrationRunner, event: OrchestrationEvent, at: number, targetRegions: Map<string, boolean>): HarnessEmitResult => {
        target.enqueue(event);
        const before = target.ring.length;
        const result = target.dispatch(at, world);
        applyEffects(result.effects, targetRegions);
        const entry = target.ring[before];
        // 命令列表从环形日志摘要还原不了，重放比对只看摘要；emit 返回的 commands = effects + 本地命令的可见结果（vars / publish / timers 由 harness 读）
        return { commands: result.effects, effects: result.effects, suspended: result.suspendedNow ?? (entry ? null : target.suspended) };
    };
    return {
        get tick() { return tick; },
        emit(event, at = tick) {
            tick = Math.max(tick, at);
            return run(runner, event, at, regions);
        },
        advance(ticks) {
            const effects: RunnerEffect[] = [];
            for (let index = 0; index < ticks; index += 1) {
                tick += 1;
                runner.schedule(tick);
                const result = runner.dispatch(tick, world);
                applyEffects(result.effects, regions);
                effects.push(...result.effects);
            }
            return effects;
        },
        vars: () => Object.fromEntries(runner.vars()),
        publish: () => clone(runner.publish()),
        ring: () => clone(runner.ring),
        snapshot: () => clone({ schemaVersion: 1, packId: options.module.packId, mapId: options.mapId, seed: options.seed, fixedStepMs, tick, regions: Object.fromEntries(regions), ...runner.snapshot() }),
        restore(snapshot, currentTick = 0) {
            if (snapshot.schemaVersion !== 1 || snapshot.packId !== options.module.packId || snapshot.mapId !== options.mapId || snapshot.seed !== options.seed || snapshot.fixedStepMs !== fixedStepMs) throw new Error("[mmo orchestration harness] incompatible snapshot");
            if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || !Number.isSafeInteger(currentTick) || currentTick < 0) throw new Error("[mmo orchestration harness] invalid snapshot/current tick");
            const saved = clone(snapshot);
            runner = build();
            runner.restore(saved, saved.tick, currentTick);
            tick = currentTick;
            regions = defaultRegions();
            for (const [regionId, enabled] of Object.entries(saved.regions)) {
                if (regions.has(regionId) && typeof enabled === "boolean") regions.set(regionId, enabled);
            }
            replayBase = { snapshot: saved, tick: currentTick };
        },
        replay(events) {
            const expected = [...runner.ring];
            const fresh = build();
            const replayRegions = defaultRegions();
            if (replayBase) {
                fresh.restore(replayBase.snapshot, replayBase.snapshot.tick, replayBase.tick);
                for (const [regionId, enabled] of Object.entries(replayBase.snapshot.regions)) replayRegions.set(regionId, enabled);
            }
            for (const { event, tick: at } of events) run(fresh, event, at, replayRegions);
            const actual = fresh.ring;
            const mismatches: { seq: number; expected: OrchestrationRingEntry; actual: OrchestrationRingEntry | null }[] = [];
            expected.forEach((entry, index) => {
                const other = actual[index] ?? null;
                if (!other || other.seq !== entry.seq || other.eventDigest !== entry.eventDigest || other.commandDigest !== entry.commandDigest) mismatches.push({ seq: entry.seq, expected: entry, actual: other });
            });
            return { equal: mismatches.length === 0 && actual.length === expected.length, mismatches };
        },
    };
}
