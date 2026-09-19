/**
 * worldFixture mode（MMO MF4 世界形态夹具；docs/MMO.md §5.1 夹具规则 / §5.4 MF4 / MF5b）：⛔ 不进生产 registry（manifest `wireExposed:false`，
 * 同 viewFixture 先例住在 test/fixtures），单测按注入 mode 直构 WorldRoom、test:int 临时登记进 worldModeRegistry。
 *
 * 两类实体：移动体（每个在座 persona 一个；`move` 意图 → 常量速度积分，⛔ 客户端不上报坐标）与静态体（onWorldInit 按分线随机流撒
 * WORLD_FIXTURE_STATIC_COUNT 个）。规则只做「候选 + 可见性 + 私有字段过滤」（MF5b）：视距（切比雪夫 ≤ WORLD_FIXTURE_RANGE，以本人移动体为中心）
 * 决定 visibleEntities 的**公开投影**（id / kind / x / y / rev），私有字段 `stamina`（移动每步 −1）只经 `observers.emitPerSession(private)` 发给
 * owner 会话；差分 / 编号 / baseline / 有界投递归框架（WorldRuntime + WorldRoom 每 tick 排空）。出站另有本人 `pos` 直发回执（MF4）。
 */
import {
    CORE_S2C_TOKENS,
    WORLD_FIXTURE_MAP_SIZE, WORLD_FIXTURE_RANGE, WORLD_FIXTURE_SPEED,
    WorldFixtureBaselineBegin, WorldFixtureBaselineChunk, WorldFixtureBaselineEnd, WorldFixtureEnter, WorldFixtureLeave, WorldFixtureMove,
    WorldFixturePos, WorldFixturePrivate, WorldFixtureResync, WorldFixtureUpdate,
    type IObserverEnvelope, type IWorldFixtureEntityWire, type IWorldFixtureMoveReq, type WorldFixtureEntityKind,
} from "@game/shared";
import type {
    WorldAdmitRequest, WorldCheckpoint, WorldMode, WorldModeCheckpointCapability, WorldModeContext, WorldModeObserverCapability,
} from "../../src/rooms/WorldMode";
import type { WorldFixtureState } from "../../src/rooms/schema/GameRoomState";

export const WORLD_FIXTURE_MODE_ID = "worldFixture";
export const WORLD_FIXTURE_STATIC_COUNT = 4;
export const WORLD_FIXTURE_STAMINA = 100;

export interface WorldFixtureEntity {
    readonly id: string;
    readonly kind: WorldFixtureEntityKind;
    readonly session: string | null;
    x: number;
    y: number;
    /** 公开投影修订号（位置变即 +1）。 */
    rev: number;
    dirX: number;
    dirY: number;
    seq: number;
    /** 私有字段：只发给 owner。 */
    stamina: number;
}

export interface WorldFixtureModeOptions {
    readonly capacity?: number;
    readonly staticCount?: number;
    /** 准入谓词（onAdmit）；缺省全部接受。 */
    readonly admit?: (request: WorldAdmitRequest) => boolean;
    /** 视距（切比雪夫）；缺省 wire 的 WORLD_FIXTURE_RANGE。 */
    readonly range?: number;
    /** 有界原语上限（只许收紧，§11.2）。 */
    readonly limits?: WorldModeObserverCapability<WorldFixtureState>["limits"];
    /** 检查点能力（MF7b）：kit 作用域的持久层（单测 MemoryCheckpointPort；int 走 kitfix 表）。 */
    readonly checkpoint?: WorldModeCheckpointCapability;
}

/** persona 级快照（位置 / stamina）；分线级快照 = 静态体 + tick。schema 版本 1。 */
export interface WorldFixturePersonaSnapshot { readonly x: number; readonly y: number; readonly stamina: number }
export const WORLD_FIXTURE_CHECKPOINT_SCHEMA = { version: 1, minSupported: 1 } as const;

export interface WorldFixtureMode extends WorldMode<WorldFixtureState> {
    readonly __probe: {
        entities(): ReadonlyMap<string, WorldFixtureEntity>;
        moverOf(session: string): WorldFixtureEntity | null;
        /** 测试直接摆放实体（rev 前进；⛔ 不是玩法输入）。 */
        place(id: string, x: number, y: number): void;
        readonly log: string[];
        checkpoints: number;
        /** 脚本 timers（id → dueTick）：§7.3「timer 存 dueTick，恢复后按 tick 差重排」的夹具。 */
        timers(): ReadonlyMap<string, number>;
        setTimer(id: string, dueTick: number): void;
    };
}

const clamp = (value: number): number => Math.max(0, Math.min(WORLD_FIXTURE_MAP_SIZE, value));
const projectionOf = (entity: WorldFixtureEntity): IWorldFixtureEntityWire => ({ id: entity.id, kind: entity.kind, x: entity.x, y: entity.y, rev: entity.rev });
const within = (center: WorldFixtureEntity, entity: WorldFixtureEntity, range: number): boolean =>
    Math.abs(entity.x - center.x) <= range && Math.abs(entity.y - center.y) <= range;

export function createWorldFixtureMode(options: WorldFixtureModeOptions = {}): WorldFixtureMode {
    const entities = new Map<string, WorldFixtureEntity>();
    /** session → 移动体 id */
    const movers = new Map<string, string>();
    /** session → 已发出的 stamina（私有流去重） */
    const staminaSent = new Map<string, number>();
    const range = options.range ?? WORLD_FIXTURE_RANGE;
    const log: string[] = [];
    /** 脚本 timers：dueTick 按分线 tick 计；分线快照落 { id: dueTick }，恢复后按「快照 tick → 恢复时 tick」的差重排（§7.3）。 */
    const timers = new Map<string, number>();
    const probe = {
        entities: (): ReadonlyMap<string, WorldFixtureEntity> => entities,
        moverOf: (session: string): WorldFixtureEntity | null => {
            const id = movers.get(session);
            return id === undefined ? null : entities.get(id) ?? null;
        },
        place: (id: string, x: number, y: number): void => {
            const entity = entities.get(id);
            if (!entity) throw new Error(`no entity ${id}`);
            entity.x = clamp(x);
            entity.y = clamp(y);
            entity.rev += 1;
        },
        log,
        checkpoints: 0,
        timers: (): ReadonlyMap<string, number> => timers,
        setTimer: (id: string, dueTick: number): void => { timers.set(id, dueTick); },
    };
    const syncCount = (context: WorldModeContext<WorldFixtureState>): void => {
        context.state.entityCount = entities.size;
    };

    const observer: WorldModeObserverCapability<WorldFixtureState, IWorldFixtureEntityWire, IWorldFixtureEntityWire> = {
        tokens: { enter: WorldFixtureEnter, update: WorldFixtureUpdate, leave: WorldFixtureLeave },
        builders: {
            enter: (entity: IWorldFixtureEntityWire, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, entity }),
            update: (entity: IWorldFixtureEntityWire, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, id: entity.id, x: entity.x, y: entity.y, rev: entity.rev }),
            leave: (entityId: string, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, id: entityId }),
        },
        baseline: {
            tokens: { begin: WorldFixtureBaselineBegin, chunk: WorldFixtureBaselineChunk, end: WorldFixtureBaselineEnd },
            builders: {
                begin: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, tick: meta.tick, chunkCount: meta.chunkCount, itemCount: meta.itemCount }),
                chunk: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, index: meta.index, items: meta.items }),
                end: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, checksum: meta.checksum }),
            },
            chunkItems: 2,
        },
        visibleEntities: (session) => {
            const visible = new Map<string, IWorldFixtureEntityWire>();
            const center = probe.moverOf(session);
            if (!center) return visible;
            for (const entity of entities.values()) {
                if (within(center, entity, range)) visible.set(entity.id, projectionOf(entity));
            }
            return visible;
        },
        ...(options.limits ? { limits: options.limits } : {}),
    };

    const mode: WorldFixtureMode = {
        id: WORLD_FIXTURE_MODE_ID,
        capacity: options.capacity ?? 8,
        commands: [WorldFixtureMove.type, WorldFixtureResync.type],
        observer,
        ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}),
        onWorldInit(context, info) {
            entities.clear();
            movers.clear();
            staminaSent.clear();
            const count = options.staticCount ?? WORLD_FIXTURE_STATIC_COUNT;
            for (let index = 0; index < count; index += 1) {
                const id = `static-${index}`;
                entities.set(id, {
                    id, kind: "static", session: null,
                    x: context.random.nextInt(0, WORLD_FIXTURE_MAP_SIZE), y: context.random.nextInt(0, WORLD_FIXTURE_MAP_SIZE),
                    rev: 0, dirX: 0, dirY: 0, seq: 0, stamina: 0,
                });
            }
            syncCount(context);
            log.push(`init:${context.mapId}#${context.line}:${info.recovered}`);
        },
        onRestore(context, snapshot) {
            const instance = snapshot.instance as { readonly tick?: number; readonly entities?: readonly WorldFixtureEntity[]; readonly timers?: Record<string, number> } | null;
            for (const entity of instance?.entities ?? []) entities.set(entity.id, { ...entity, session: null });
            // timer 重排：dueTick 相对快照 tick 的剩余步数，接到当前分线 tick 之后（⛔ 直接沿用旧绝对 tick）
            const snapshotTick = typeof instance?.tick === "number" ? instance.tick : 0;
            timers.clear();
            for (const [id, dueTick] of Object.entries(instance?.timers ?? {})) {
                timers.set(id, context.state.tick + Math.max(0, dueTick - snapshotTick));
            }
            syncCount(context);
            log.push(`restore:${entities.size}`);
        },
        onAdmit(_context, request) {
            log.push(`admit:${request.personaId}`);
            return options.admit ? options.admit(request) : true;
        },
        onEnter(context, session) {
            const id = `mover-${session.personaId}`;
            // persona 级检查点回灌（框架已校验信封；快照内容归本 mode）：位置 / stamina 回到最近一次落盘（≤ 1 个角色检查点周期）
            const restored = session.checkpoint?.snapshot as Partial<WorldFixturePersonaSnapshot> | null | undefined;
            const x = typeof restored?.x === "number" ? clamp(restored.x) : 500;
            const y = typeof restored?.y === "number" ? clamp(restored.y) : 500;
            const stamina = typeof restored?.stamina === "number" ? restored.stamina : WORLD_FIXTURE_STAMINA;
            entities.set(id, { id, kind: "mover", session: session.session, x, y, rev: 0, dirX: 0, dirY: 0, seq: 0, stamina });
            movers.set(session.session, id);
            syncCount(context);
            log.push(`enter:${session.session}${restored ? ":restored" : ""}`);
        },
        onLeave(context, session, reason) {
            const id = movers.get(session.session);
            if (id !== undefined) {
                entities.delete(id);
                movers.delete(session.session);
            }
            staminaSent.delete(session.session);
            syncCount(context);
            log.push(`leave:${session.session}:${reason}`);
        },
        onStep(context, step) {
            const touched = new Set<string>();
            for (const command of step.commands) {
                if (command.type === WorldFixtureResync.type) {
                    context.observers.requestBaseline(command.session);
                    continue;
                }
                if (command.type !== WorldFixtureMove.type) continue;
                const mover = probe.moverOf(command.session);
                if (!mover) continue;
                const intent = command.payload as IWorldFixtureMoveReq;
                mover.dirX = intent.dirX;
                mover.dirY = intent.dirY;
                mover.seq = intent.seq;
                touched.add(mover.id);
            }
            for (const entity of entities.values()) {
                if (entity.kind !== "mover" || entity.session === null) continue;
                const moving = entity.dirX !== 0 || entity.dirY !== 0;
                if (moving) {
                    entity.x = clamp(entity.x + entity.dirX * WORLD_FIXTURE_SPEED);
                    entity.y = clamp(entity.y + entity.dirY * WORLD_FIXTURE_SPEED);
                    entity.rev += 1;
                    entity.stamina = Math.max(0, entity.stamina - 1);
                }
                if (moving || touched.has(entity.id)) {
                    context.sendS2C(entity.session, WorldFixturePos, { entityId: entity.id, x: entity.x, y: entity.y, seq: entity.seq, tick: step.tick });
                }
                // 本人私有流（不可丢类，与视野流共用单 seq 流）：stamina 变了才发
                if (staminaSent.get(entity.session) !== entity.stamina) {
                    staminaSent.set(entity.session, entity.stamina);
                    context.observers.emitPerSession(entity.session, WorldFixturePrivate, {
                        seq: context.observers.nextSeq(entity.session), tick: step.tick, id: entity.id, stamina: entity.stamina,
                    });
                }
            }
        },
        onCheckpoint(context): WorldCheckpoint {
            probe.checkpoints += 1;
            const persona = [...movers.values()].flatMap((id) => {
                const mover = entities.get(id);
                return mover ? [{ personaId: id.slice("mover-".length), snapshot: { x: mover.x, y: mover.y, stamina: mover.stamina } satisfies WorldFixturePersonaSnapshot }] : [];
            });
            return {
                persona,
                instance: {
                    tick: context.state.tick,
                    entities: [...entities.values()].filter((entity) => entity.kind === "static").map(({ session: _s, ...rest }) => rest),
                    timers: Object.fromEntries(timers),
                },
            };
        },
        onDrain(_context, info) {
            log.push(`drain:${info.reason}`);
        },
        onSignal(context, signal) {
            log.push(`signal:${signal.kind}`);
            if (signal.kind === "drain") context.requestDrain("signal");
            // durable 命令（§7.3 脚本 durable 命令行）：loot ⇒ 追加 grantCurrency 事件；checkpoint ⇒ 强制点（checkpointOnDeath / setVar durable 同形）
            if (signal.kind === "loot") {
                const { session, amount } = signal.payload as { session: string; amount: number };
                const mover = probe.moverOf(session);
                if (mover) context.events.append("grantCurrency", { personaId: mover.id.slice("mover-".length), amount });
            }
            if (signal.kind === "checkpoint") context.requestCheckpoint("signal");
            // 反例：perSession token 全房广播必须被框架拒（S2CPorts fail-closed）
            if (signal.kind === "broadcast-leak") {
                context.broadcastS2C(WorldFixtureEnter, { seq: 1, tick: context.state.tick, entity: { id: "leak", kind: "static", x: 0, y: 0, rev: 0 } });
            }
            if (signal.kind === "chat-broadcast-leak") {
                // MF6b：core 世界 token s2c.world.chat 是 perSession，全房广播必须被 S2CPorts 拒（⛔ 任何人收到）
                context.broadcastS2C(CORE_S2C_TOKENS.WorldChat, { fromEntityId: "leak", text: "leak", at: 0 });
            }
        },
        primaryEntityOf: (session) => movers.get(session) ?? null,
        __probe: probe,
    };
    return mode;
}
