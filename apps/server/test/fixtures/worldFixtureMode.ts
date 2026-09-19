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
    WORLD_FIXTURE_MAP_SIZE, WORLD_FIXTURE_RANGE, WORLD_FIXTURE_SPEED,
    WorldFixtureBaselineBegin, WorldFixtureBaselineChunk, WorldFixtureBaselineEnd, WorldFixtureEnter, WorldFixtureLeave, WorldFixtureMove,
    WorldFixturePos, WorldFixturePrivate, WorldFixtureResync, WorldFixtureUpdate,
    type IObserverEnvelope, type IWorldFixtureEntityWire, type IWorldFixtureMoveReq, type WorldFixtureEntityKind,
} from "@game/shared";
import type { WorldAdmitRequest, WorldCheckpoint, WorldMode, WorldModeContext, WorldModeObserverCapability } from "../../src/rooms/WorldMode";
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
}

export interface WorldFixtureMode extends WorldMode<WorldFixtureState> {
    readonly __probe: {
        entities(): ReadonlyMap<string, WorldFixtureEntity>;
        moverOf(session: string): WorldFixtureEntity | null;
        /** 测试直接摆放实体（rev 前进；⛔ 不是玩法输入）。 */
        place(id: string, x: number, y: number): void;
        readonly log: string[];
        checkpoints: number;
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
            const instance = snapshot.instance as { readonly entities?: readonly WorldFixtureEntity[] } | null;
            for (const entity of instance?.entities ?? []) entities.set(entity.id, { ...entity, session: null });
            syncCount(context);
            log.push(`restore:${entities.size}`);
        },
        onAdmit(_context, request) {
            log.push(`admit:${request.personaId}`);
            return options.admit ? options.admit(request) : true;
        },
        onEnter(context, session) {
            const id = `mover-${session.personaId}`;
            entities.set(id, { id, kind: "mover", session: session.session, x: 500, y: 500, rev: 0, dirX: 0, dirY: 0, seq: 0, stamina: WORLD_FIXTURE_STAMINA });
            movers.set(session.session, id);
            syncCount(context);
            log.push(`enter:${session.session}`);
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
            return {
                persona: [...movers.entries()].map(([session, id]) => ({ session, id })),
                instance: { tick: context.state.tick, entities: [...entities.values()].filter((entity) => entity.kind === "static") },
            };
        },
        onDrain(_context, info) {
            log.push(`drain:${info.reason}`);
        },
        onSignal(context, signal) {
            log.push(`signal:${signal.kind}`);
            if (signal.kind === "drain") context.requestDrain("signal");
            // 反例：perSession token 全房广播必须被框架拒（S2CPorts fail-closed）
            if (signal.kind === "broadcast-leak") {
                context.broadcastS2C(WorldFixtureEnter, { seq: 1, tick: context.state.tick, entity: { id: "leak", kind: "static", x: 0, y: 0, rev: 0 } });
            }
        },
        primaryEntityOf: (session) => movers.get(session) ?? null,
        __probe: probe,
    };
    return mode;
}
