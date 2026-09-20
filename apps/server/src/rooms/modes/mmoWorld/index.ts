/**
 * mmoWorld 服务端 WorldMode（mmo kit 的世界形态玩法；docs/MMO.md §7.4 / §7.6，MK0 灰盒）：只消费框架 WorldMode 契约 + kit-api 门面 + 本 kit 模块，
 * ⛔ 不 import colyseus / rooms/core 内核。
 *  - onWorldInit：按内容包（`content` 面）为本图撒怪（spawns，确定性抖动来自分线随机流），根写 packId / packVersion；图不在包内 ⇒ 抛（WorldRoom 拒启）；
 *  - onBeforeAdmit（唯一可 await 的准入钩子）：按 persona 预热角色行（`characters` 面）；onAdmit 无角色即拒；
 *  - onEnter：角色实体落在最新角色检查点的位置（persona 信封回灌，M08）或出生点；onLeave 回收；
 *  - onStep：move 意图（dir / target）→ 常量速度积分 + 钳图（`world` 面双端同源纯函数）；baselineRequest → 框架 baseline；pickup / transfer 回 opResult
 *    rejected（MK1 / MK3 接入）；target / cast / interact / choose 暂忽略（MK2 / MK4）；本人私有流 hp / mp 变了才发；
 *  - observer：视距 = 图的 aoi.viewRadius（欧氏），公开投影 = IMmoEntityWire（⛔ mp 等私有字段）；差分 / baseline / 投递归框架；
 *  - onCheckpoint：persona 快照 {mapId, x, y, hp, mp}、分线快照 {tick, mapId, pack, creatures}；onRestore 回灌怪物位置 / hp。
 * 登记：`registerMmoWorldWorldMode`（codegen 分表静态 import）——登记时先取内容索引，包不合法即抛（启动期 fail-closed）。
 */
import {
    GAMEPLAY_CATALOG, MmoWorldBaselineBegin, MmoWorldBaselineChunk, MmoWorldBaselineEnd, MmoWorldBaselineRequest, MmoWorldCast, MmoWorldChoose, MmoWorldEnter,
    MmoWorldInteract, MmoWorldLeave, MmoWorldMove, MmoWorldOpResult, MmoWorldPickup, MmoWorldPos, MmoWorldPrivate, MmoWorldTarget, MmoWorldTransfer, MmoWorldUpdate,
    type IMmoEntityWire, type IMmoWorldMoveReq, type IMmoWorldPickupReq, type IMmoWorldTransferReq, type IObserverEnvelope,
} from "@game/shared";
import type { IContentPackIndex, IMapDef } from "@game/shared/kits/mmo/api/content/index";
import { clampToMap, withinRadius } from "@game/shared/kits/mmo/api/world/index";
import { applyIntent, parseCollisionGrid, resolveMove, type CollisionGrid } from "../../../kits/mmo/api/movement/index";
import { characterOfPersona, type MmoCharacterRow } from "../../../kits/mmo/api/characters/index";
import { contentIndex } from "../../../kits/mmo/api/content/index";
import { MMO_WORLD_MODE_ID } from "../../../kits/mmo/host";
import type { MmoWorldRoomState } from "../../schema/GameRoomState";
import {
    worldModeRegistry, type WorldAdmitRequest, type WorldCheckpoint, type WorldMode, type WorldModeCheckpointCapability, type WorldModeContext,
    type WorldModeObserverCapability, type WorldModeRegistry, type WorldSessionInfo,
} from "../../WorldMode";
import { createMmoCheckpointCapability, type MmoInstanceSnapshot, type MmoPersonaSnapshot } from "./checkpoint";

export { MMO_WORLD_MODE_ID };

/** 撒怪抖动半径（世界单位；灰盒参数）。 */
export const MMO_SPAWN_JITTER = 40;
/** baseline 每块条目数。 */
export const MMO_BASELINE_CHUNK_ITEMS = 32;

export interface MmoEntity {
    readonly id: string;
    readonly kind: "character" | "creature";
    readonly templateId: string;
    readonly name: string;
    readonly level: number;
    readonly hpMax: number;
    readonly mpMax: number;
    readonly speedPerSec: number;
    /** 角色：所属会话 / persona / 角色 id；怪物：null */
    readonly session: string | null;
    readonly personaId: string | null;
    readonly characterId: string | null;
    x: number;
    y: number;
    /** 公开投影修订号（位置 / hp 变即 +1） */
    rev: number;
    hp: number;
    mp: number;
    dirX: number;
    dirY: number;
    target: { readonly x: number; readonly y: number } | null;
    seq: number;
}

export interface MmoWorldModeOptions {
    /** 内容索引（缺省 = 内置灰盒；单测注入）。 */
    readonly content?: IContentPackIndex;
    /** 按 persona 预热角色行（缺省 = characters 面走 kit 事务；单测注入）。 */
    readonly loadCharacter?: (sId: number, personaId: string) => Promise<MmoCharacterRow | null>;
    /** 检查点能力（缺省 = SQL 端口；null = 无能力（纯内存单测）；可注入 MemoryCheckpointPort 形态）。 */
    readonly checkpoint?: WorldModeCheckpointCapability | null;
    readonly capacity?: number;
}

export interface MmoWorldMode extends WorldMode<MmoWorldRoomState> {
    readonly __probe: {
        entities(): ReadonlyMap<string, MmoEntity>;
        moverOf(session: string): MmoEntity | null;
        readonly log: string[];
    };
}

const projectionOf = (entity: MmoEntity): IMmoEntityWire => ({
    id: entity.id, kind: entity.kind, templateId: entity.templateId, name: entity.name, x: entity.x, y: entity.y, rev: entity.rev, hp: entity.hp, hpMax: entity.hpMax, level: entity.level,
});

export function createMmoWorldMode(options: MmoWorldModeOptions = {}): MmoWorldMode {
    const content = options.content ?? contentIndex();
    const loadCharacter = options.loadCharacter ?? ((sId: number, personaId: string) => characterOfPersona(sId, personaId));
    const checkpoint = options.checkpoint === undefined ? createMmoCheckpointCapability() : options.checkpoint;
    const entities = new Map<string, MmoEntity>();
    /** session → 角色实体 id */
    const movers = new Map<string, string>();
    /** 准入预热：personaId → 角色行（onAdmit 判、onEnter 消费） */
    const pending = new Map<string, MmoCharacterRow | null>();
    /** 私有流脏标（hp / mp 变了才发） */
    const privateDirty = new Set<string>();
    const privateSent = new Map<string, string>();
    const log: string[] = [];
    let map: IMapDef | null = null;
    /** 碰撞网格（内容包 collision；无 = 全图通行） */
    let grid: CollisionGrid | null = null;

    const mapOf = (context: WorldModeContext<MmoWorldRoomState>): IMapDef => {
        if (map === null) {
            map = content.mapById.get(context.mapId) ?? null;
            if (map === null) throw new Error(`[mmoWorld] 地图 ${context.mapId} 不在内容包 ${content.pack.packId}@${content.pack.version} 内`);
            grid = parseCollisionGrid(map.collision ?? null, map.size);
        }
        return map;
    };
    const moverOf = (session: string): MmoEntity | null => {
        const id = movers.get(session);
        return id === undefined ? null : entities.get(id) ?? null;
    };
    const syncPopulation = (context: WorldModeContext<MmoWorldRoomState>): void => {
        context.state.population = movers.size;
    };

    const observer: WorldModeObserverCapability<MmoWorldRoomState, IMmoEntityWire, IMmoEntityWire> = {
        tokens: { enter: MmoWorldEnter, update: MmoWorldUpdate, leave: MmoWorldLeave },
        builders: {
            enter: (entity: IMmoEntityWire, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, entity }),
            update: (entity: IMmoEntityWire, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, id: entity.id, x: entity.x, y: entity.y, rev: entity.rev, hp: entity.hp }),
            leave: (entityId: string, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, id: entityId }),
        },
        baseline: {
            tokens: { begin: MmoWorldBaselineBegin, chunk: MmoWorldBaselineChunk, end: MmoWorldBaselineEnd },
            builders: {
                begin: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, tick: meta.tick, chunkCount: meta.chunkCount, itemCount: meta.itemCount }),
                chunk: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, index: meta.index, items: meta.items }),
                end: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, checksum: meta.checksum }),
            },
            chunkItems: MMO_BASELINE_CHUNK_ITEMS,
        },
        visibleEntities: (session, context) => {
            const visible = new Map<string, IMmoEntityWire>();
            const center = moverOf(session);
            if (!center) return visible;
            const radius = mapOf(context).aoi.viewRadius;
            for (const entity of entities.values()) {
                if (withinRadius(center, entity, radius)) visible.set(entity.id, projectionOf(entity));
            }
            return visible;
        },
    };

    const mode: MmoWorldMode = {
        id: MMO_WORLD_MODE_ID,
        capacity: options.capacity ?? GAMEPLAY_CATALOG.mmoWorld.maxPlayers,
        commands: [MmoWorldMove.type, MmoWorldTarget.type, MmoWorldCast.type, MmoWorldInteract.type, MmoWorldChoose.type, MmoWorldPickup.type, MmoWorldTransfer.type, MmoWorldBaselineRequest.type],
        observer,
        ...(checkpoint ? { checkpoint } : {}),
        onWorldInit(context, info) {
            const def = mapOf(context);
            entities.clear();
            movers.clear();
            pending.clear();
            privateDirty.clear();
            privateSent.clear();
            context.state.packId = content.pack.packId;
            context.state.packVersion = content.pack.version;
            for (const spawn of content.spawnsByMap.get(def.mapId) ?? []) {
                const template = content.creatureById.get(spawn.templateId);
                if (!template) continue; // validateContentPack 已保证引用完整；防御
                for (let index = 0; index < spawn.count; index += 1) {
                    const pos = clampToMap({
                        x: spawn.pos.x + context.random.nextInt(-MMO_SPAWN_JITTER, MMO_SPAWN_JITTER), y: spawn.pos.y + context.random.nextInt(-MMO_SPAWN_JITTER, MMO_SPAWN_JITTER),
                    }, def.size);
                    const id = `${spawn.spawnId}:${index}`; // wire id 形态：[A-Za-z0-9._:-]
                    entities.set(id, {
                        id, kind: "creature", templateId: template.templateId, name: template.name, level: template.level, hpMax: template.hpMax, mpMax: template.mpMax,
                        speedPerSec: template.speedPerSec, session: null, personaId: null, characterId: null,
                        x: pos.x, y: pos.y, rev: 0, hp: template.hpMax, mp: template.mpMax, dirX: 0, dirY: 0, target: null, seq: 0,
                    });
                }
            }
            syncPopulation(context);
            log.push(`init:${def.mapId}#${context.line}:${info.recovered}:${entities.size}`);
        },
        onRestore(context, snapshot) {
            const instance = snapshot.instance as Partial<MmoInstanceSnapshot> | null;
            let restored = 0;
            for (const creature of instance?.creatures ?? []) {
                const entity = entities.get(creature.id);
                if (!entity) continue;
                const pos = clampToMap({ x: creature.x, y: creature.y }, mapOf(context).size);
                entity.x = pos.x;
                entity.y = pos.y;
                entity.hp = Math.max(0, Math.min(entity.hpMax, creature.hp));
                restored += 1;
            }
            log.push(`restore:${restored}`);
        },
        async onBeforeAdmit(context, request: WorldAdmitRequest) {
            pending.set(request.personaId, await loadCharacter(context.sId, request.personaId));
        },
        onAdmit(_context, request) {
            const row = pending.get(request.personaId);
            // 职业模板是速度 / HP / MP 的真源：角色的 classId 不在当前内容包 ⇒ 拒（内容包换版后的存量角色由内容侧迁移）
            const ok = row !== undefined && row !== null && content.classById.has(row.classId);
            log.push(`admit:${request.personaId}:${ok}`);
            return ok;
        },
        onEnter(context, session: WorldSessionInfo) {
            const row = pending.get(session.personaId) ?? null;
            pending.delete(session.personaId);
            const def = mapOf(context);
            const restored = session.checkpoint?.snapshot as Partial<MmoPersonaSnapshot> | null | undefined;
            const spawn = def.spawnPoints[0]!.pos;
            const usable = restored && restored.mapId === def.mapId && typeof restored.x === "number" && typeof restored.y === "number";
            const pos = usable ? clampToMap({ x: restored.x as number, y: restored.y as number }, def.size) : { x: spawn.x, y: spawn.y };
            const klass = content.classById.get(row?.classId ?? "");
            const hpMax = klass?.hpMax ?? 100;
            const mpMax = klass?.mpMax ?? 50;
            const id = `char:${row?.characterId ?? session.personaId}`;
            entities.set(id, {
                id, kind: "character", templateId: row?.classId ?? "fighter", name: row?.name ?? "?", level: row?.level ?? 1, hpMax, mpMax, speedPerSec: klass?.speedPerSec ?? 120,
                session: session.session, personaId: session.personaId, characterId: row?.characterId ?? null,
                x: pos.x, y: pos.y, rev: 0,
                hp: typeof restored?.hp === "number" ? Math.max(0, Math.min(hpMax, restored.hp)) : hpMax,
                mp: typeof restored?.mp === "number" ? Math.max(0, Math.min(mpMax, restored.mp)) : mpMax,
                dirX: 0, dirY: 0, target: null, seq: 0,
            });
            movers.set(session.session, id);
            privateDirty.add(session.session);
            syncPopulation(context);
            log.push(`enter:${session.session}${usable ? ":restored" : ""}`);
        },
        onLeave(context, session, reason) {
            const id = movers.get(session.session);
            if (id !== undefined) {
                entities.delete(id);
                movers.delete(session.session);
            }
            privateDirty.delete(session.session);
            privateSent.delete(session.session);
            syncPopulation(context);
            log.push(`leave:${session.session}:${reason}`);
        },
        onStep(context, step) {
            const def = mapOf(context);
            /** 本步收到意图的角色（pos 回执：动了或有新意图都回） */
            const touched = new Set<string>();
            for (const command of step.commands) {
                if (command.type === MmoWorldBaselineRequest.type) {
                    context.observers.requestBaseline(command.session);
                    continue;
                }
                if (command.type === MmoWorldPickup.type || command.type === MmoWorldTransfer.type) {
                    const { clientReqId } = command.payload as IMmoWorldPickupReq | IMmoWorldTransferReq;
                    context.sendS2C(command.session, MmoWorldOpResult, { clientReqId, result: "rejected", detail: command.type === MmoWorldPickup.type ? "inventory 面 MK3" : "portal MK1" });
                    continue;
                }
                if (command.type !== MmoWorldMove.type) continue; // target / cast / interact / choose：MK2 / MK4
                const mover = moverOf(command.session);
                if (!mover) continue;
                const intent = command.payload as IMmoWorldMoveReq;
                mover.seq = intent.seq;
                const applied = applyIntent(mover, intent.dir ? { seq: intent.seq, dir: intent.dir } : { seq: intent.seq, target: intent.target ?? { x: mover.x, y: mover.y } }, def.size);
                mover.dirX = applied.dirX;
                mover.dirY = applied.dirY;
                mover.target = applied.target;
                touched.add(mover.id);
            }
            for (const entity of entities.values()) {
                if (entity.kind !== "character" || entity.session === null) continue;
                // 权威积分（movement 面 resolveMove：双端同源；碰撞候选来自内容包网格）
                const result = resolveMove(entity, entity.speedPerSec, step.dtMs, def.size, grid);
                if (result.moved) {
                    entity.x = result.x;
                    entity.y = result.y;
                    entity.rev += 1;
                }
                entity.target = result.target;
                if (result.moved || touched.has(entity.id)) {
                    context.sendS2C(entity.session, MmoWorldPos, { seq: entity.seq, tick: step.tick, x: entity.x, y: entity.y });
                }
                // 本人私有流（不可丢类，与视野流共用单 seq 流）：hp / mp 变了才发
                const signature = `${entity.hp}/${entity.hpMax}/${entity.mp}/${entity.mpMax}`;
                if (privateDirty.has(entity.session) || privateSent.get(entity.session) !== signature) {
                    privateDirty.delete(entity.session);
                    privateSent.set(entity.session, signature);
                    context.observers.emitPerSession(entity.session, MmoWorldPrivate, {
                        seq: context.observers.nextSeq(entity.session), tick: step.tick, hp: entity.hp, hpMax: entity.hpMax, mp: entity.mp, mpMax: entity.mpMax,
                    });
                }
            }
        },
        onCheckpoint(context): WorldCheckpoint {
            const def = mapOf(context);
            const persona = [...movers.values()].flatMap((id) => {
                const mover = entities.get(id);
                if (!mover || mover.personaId === null) return [];
                const snapshot: MmoPersonaSnapshot = { mapId: def.mapId, x: mover.x, y: mover.y, hp: mover.hp, mp: mover.mp };
                return [{ personaId: mover.personaId, snapshot }];
            });
            const instance: MmoInstanceSnapshot = {
                tick: context.state.tick,
                mapId: def.mapId,
                packId: content.pack.packId,
                packVersion: content.pack.version,
                creatures: [...entities.values()].filter((entity) => entity.kind === "creature").map((entity) => ({ id: entity.id, templateId: entity.templateId, x: entity.x, y: entity.y, hp: entity.hp })),
            };
            return { persona, instance };
        },
        onDrain(_context, info) {
            log.push(`drain:${info.reason}`);
        },
        onSignal(context, signal) {
            log.push(`signal:${signal.kind}`);
            if (signal.kind === "drain") context.requestDrain("signal");
            if (signal.kind === "checkpoint") context.requestCheckpoint("signal");
        },
        primaryEntityOf: (session) => movers.get(session) ?? null,
        __probe: { entities: () => entities, moverOf, log },
    };
    return mode;
}

/** 约定导出符号 `register<Constant>WorldMode`（codegen `registerGeneratedWorldModes` 静态 import）：登记前先取内容索引——包不合法即抛，组合根拒启。 */
export function registerMmoWorldWorldMode(registry: WorldModeRegistry = worldModeRegistry): () => void {
    const content = contentIndex();
    return registry.register(MMO_WORLD_MODE_ID, () => createMmoWorldMode({ content }));
}
