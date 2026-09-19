/**
 * worldFixture mode（MMO MF4 世界形态夹具；docs/MMO.md §5.1 夹具规则 / §5.4 MF4）：⛔ 不进生产 registry（manifest `wireExposed:false`，
 * 同 viewFixture 先例住在 test/fixtures），单测按注入 mode 直构 WorldRoom、test:int 临时登记进 worldModeRegistry。
 *
 * 两类实体：移动体（每个在座 persona 一个；`move` 意图 → 常量速度积分，⛔ 客户端不上报坐标）与静态体（onWorldInit 按分线随机流撒
 * WORLD_FIXTURE_STATIC_COUNT 个）。只做规则：出站只有本人 `pos` 回执（MF5b 再接观察者同步），检查点 = 静态体 + 在座 persona 的移动体。
 */
import {
    WORLD_FIXTURE_MAP_SIZE, WORLD_FIXTURE_SPEED, WorldFixtureMove, WorldFixturePos, type IWorldFixtureMoveReq,
} from "@game/shared";
import type { WorldAdmitRequest, WorldCheckpoint, WorldMode, WorldModeContext } from "../../src/rooms/WorldMode";
import type { WorldFixtureState } from "../../src/rooms/schema/GameRoomState";

export const WORLD_FIXTURE_MODE_ID = "worldFixture";
export const WORLD_FIXTURE_STATIC_COUNT = 4;

export interface WorldFixtureEntity {
    readonly id: string;
    readonly kind: "mover" | "static";
    readonly session: string | null;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    seq: number;
}

export interface WorldFixtureModeOptions {
    readonly capacity?: number;
    readonly staticCount?: number;
    /** 准入谓词（onAdmit）；缺省全部接受。 */
    readonly admit?: (request: WorldAdmitRequest) => boolean;
}

export interface WorldFixtureMode extends WorldMode<WorldFixtureState> {
    readonly __probe: {
        entities(): ReadonlyMap<string, WorldFixtureEntity>;
        moverOf(session: string): WorldFixtureEntity | null;
        readonly log: string[];
        checkpoints: number;
    };
}

const clamp = (value: number): number => Math.max(0, Math.min(WORLD_FIXTURE_MAP_SIZE, value));

export function createWorldFixtureMode(options: WorldFixtureModeOptions = {}): WorldFixtureMode {
    const entities = new Map<string, WorldFixtureEntity>();
    /** session → 移动体 id */
    const movers = new Map<string, string>();
    const log: string[] = [];
    const probe = {
        entities: (): ReadonlyMap<string, WorldFixtureEntity> => entities,
        moverOf: (session: string): WorldFixtureEntity | null => {
            const id = movers.get(session);
            return id === undefined ? null : entities.get(id) ?? null;
        },
        log,
        checkpoints: 0,
    };
    const syncCount = (context: WorldModeContext<WorldFixtureState>): void => {
        context.state.entityCount = entities.size;
    };

    const mode: WorldFixtureMode = {
        id: WORLD_FIXTURE_MODE_ID,
        capacity: options.capacity ?? 8,
        commands: [WorldFixtureMove.type],
        onWorldInit(context, info) {
            entities.clear();
            movers.clear();
            const count = options.staticCount ?? WORLD_FIXTURE_STATIC_COUNT;
            for (let index = 0; index < count; index += 1) {
                const id = `static-${index}`;
                entities.set(id, {
                    id, kind: "static", session: null,
                    x: context.random.nextInt(0, WORLD_FIXTURE_MAP_SIZE), y: context.random.nextInt(0, WORLD_FIXTURE_MAP_SIZE),
                    dirX: 0, dirY: 0, seq: 0,
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
            entities.set(id, { id, kind: "mover", session: session.session, x: 500, y: 500, dirX: 0, dirY: 0, seq: 0 });
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
            syncCount(context);
            log.push(`leave:${session.session}:${reason}`);
        },
        onStep(context, step) {
            const touched = new Set<string>();
            for (const command of step.commands) {
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
                }
                if (moving || touched.has(entity.id)) {
                    context.sendS2C(entity.session, WorldFixturePos, { entityId: entity.id, x: entity.x, y: entity.y, seq: entity.seq, tick: step.tick });
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
        },
        primaryEntityOf: (session) => movers.get(session) ?? null,
        __probe: probe,
    };
    return mode;
}
