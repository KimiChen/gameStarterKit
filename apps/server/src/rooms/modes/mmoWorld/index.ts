/**
 * mmoWorld 服务端 WorldMode（mmo kit 的世界形态玩法；docs/MMO.md §7.4 / §7.6，MK0 灰盒）：只消费框架 WorldMode 契约 + kit-api 门面 + 本 kit 模块，
 * ⛔ 不 import colyseus / rooms/core 内核。
 *  - onWorldInit：按内容包（`content` 面）为本图撒怪（spawns，确定性抖动来自分线随机流），根写 packId / packVersion；图不在包内 ⇒ 抛（WorldRoom 拒启）；
 *  - onBeforeAdmit（唯一可 await 的准入钩子）：按 persona 预热角色行（`characters` 面）；onAdmit 无角色即拒；
 *  - onEnter：角色实体落在最新角色检查点的位置（persona 信封回灌，M08）或出生点；onLeave 回收；
 *  - onStep：move 意图（dir / target）→ 权威积分（`movement` 面）；baselineRequest → 框架 baseline；pickup 回 opResult rejected（MK3 接入）；
 *    transfer（MK1-B3 两图交接）：portal 存在 + 在半径内 + 无在途 ⇒ 落点先写进实体（框架 prepare 后强制点的 persona 快照带 arrival）⇒
 *    `context.transfer.request`（框架 MF8 状态机）⇒ Committed 后 perSession `transferReady`（凭据只此一处出网）⇒ 壳以 "transferred" 离座；
 *    失败 ⇒ opResult rejected + 落点清；目标图 onEnter 按 arrival 落位（HP / MP 随身）；target / cast / interact / choose 暂忽略（MK2 / MK4）；本人私有流 hp / mp 变了才发；
 *  - observer（MK1-B2 AOI 接入）：候选来自 kit 网格（`aoi/grid.ts`，格长 = 图的 aoi.cellSize）→ 精确视距（aoi.viewRadius 欧氏）→ 可见性规则
 *    （`aoi/visibility.ts`：位面 / 隐身 / 阵营；本人永远可见）→ 最近优先截到 MMO_INTEREST_MAX_ENTITIES（框架 InterestSet 超限即抛，kit 先收敛）；
 *    公开投影 = IMmoEntityWire（名片含 factionId，⛔ mp 等私有字段）；差分 / baseline / 投递归框架；
 *  - onCheckpoint（MK1-B4 定稿，schema v2）：persona 快照 {mapId, x, y, hp, mp, cooldowns（剩余 ms）, arrival?}、分线快照 {tick, mapId, pack, creatures, loot, scriptVars,
 *    timers（dueTick）, regions}；onPersonaCheckpoint：离座 / 交接只落该 persona（框架 MK1-B4）；onRestore 回灌怪物位置 / hp、timers 按 tick 差重排、regions / scriptVars / loot；
 *    v1 快照（无新字段）照常回灌。检查点端口住 kit 目录 `kits/mmo/persistence/checkpoint.ts`（kit-api 再导出契约类型后迁回）。
 * 登记：`registerMmoWorldWorldMode`（codegen 分表静态 import）——登记时先取内容索引，包不合法即抛（启动期 fail-closed）。
 */
import {
    GAMEPLAY_CATALOG, MmoWorldBaselineBegin, MmoWorldBaselineChunk, MmoWorldBaselineEnd, MmoWorldBaselineRequest, MmoWorldCast, MmoWorldChoose, MmoWorldEnter,
    MmoWorldInteract, MmoWorldLeave, MmoWorldMove, MmoWorldOpResult, MmoWorldPickup, MmoWorldPos, MmoWorldPrivate, MmoWorldTarget, MmoWorldTransfer, MmoWorldTransferReady, MmoWorldUpdate,
    type IMmoEntityWire, type IMmoWorldMoveReq, type IMmoWorldPickupReq, type IMmoWorldTransferReq, type IObserverEnvelope,
} from "@game/shared";
import type { IContentPackIndex, IMapDef } from "@game/shared/kits/mmo/api/content/index";
import { clampToMap, withinRadius } from "@game/shared/kits/mmo/api/world/index";
import { applyIntent, parseCollisionGrid, resolveMove, type CollisionGrid } from "../../../kits/mmo/api/movement/index";
import { AoiGrid } from "../../../kits/mmo/aoi/grid";
import { pickInterest } from "../../../kits/mmo/aoi/visibility";
import { characterOfPersona, type MmoCharacterRow } from "../../../kits/mmo/api/characters/index";
import { contentIndex } from "../../../kits/mmo/api/content/index";
import { MMO_WORLD_MODE_ID } from "../../../kits/mmo/host";
import type { MmoWorldRoomState } from "../../schema/GameRoomState";
import {
    worldModeRegistry, type WorldAdmitRequest, type WorldCheckpoint, type WorldMode, type WorldModeCheckpointCapability, type WorldModeContext,
    type WorldModeObserverCapability, type WorldModeRegistry, type WorldSessionInfo,
} from "../../WorldMode";
import { createMmoCheckpointCapability, type MmoInstanceSnapshot, type MmoPersonaSnapshot } from "../../../kits/mmo/persistence/checkpoint";

export { MMO_WORLD_MODE_ID };

/** 撒怪抖动半径（世界单位；灰盒参数）。 */
export const MMO_SPAWN_JITTER = 40;
/** baseline 每块条目数。 */
export const MMO_BASELINE_CHUNK_ITEMS = 32;
/** 一个会话兴趣集上限（最近优先截断；只许比框架 OBSERVER_SYNC_LIMITS.interestMaxEntities 小，§11.2）。 */
export const MMO_INTEREST_MAX_ENTITIES = 256;

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
    /** 阵营（角色 = 建角时选的；怪物 null = 无阵营）；名片公开，也是隐身规则的输入 */
    readonly factionId: string | null;
    /** 位面（缺省 0；不同位面互不可见） */
    plane: number;
    /** 隐身（只对自己与同阵营可见） */
    stealth: boolean;
    /** 交接落点（发起交接时写入；随 persona 快照落库；失败即清） */
    arrival: { readonly mapId: string; readonly spawnPointId: string } | null;
    /** 冷却：spellId → 就绪 tick（MK2 combat 写入；快照按 tick 差折算成剩余 ms） */
    readonly cooldowns: Map<string, number>;
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
        /** 测试 / 编排接缝：改位面 / 隐身（MK2 aura、MK4 编排接入前的直接写口） */
        setVisibility(id: string, facts: { readonly plane?: number; readonly stealth?: boolean }): void;
        /** 在途交接的会话 */
        transfersInFlight(): readonly string[];
        /** 检查点接缝（MK2–MK4 接入前的直接写口）：冷却 / timer / 区域开关 / 脚本 var */
        setCooldown(id: string, spellId: string, readyAtTick: number): void;
        setTimer(id: string, dueTick: number): void;
        setRegion(regionId: string, enabled: boolean): void;
        setVar(key: string, value: unknown): void;
        timers(): ReadonlyMap<string, number>;
        regions(): ReadonlyMap<string, boolean>;
        vars(): Readonly<Record<string, unknown>>;
        readonly log: string[];
    };
}

const projectionOf = (entity: MmoEntity): IMmoEntityWire => ({
    id: entity.id, kind: entity.kind, templateId: entity.templateId, name: entity.name, x: entity.x, y: entity.y, rev: entity.rev, hp: entity.hp, hpMax: entity.hpMax, level: entity.level,
    ...(entity.factionId === null ? {} : { factionId: entity.factionId }),
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
    /** 在途交接（发起 → Committed / 失败）的会话；在途期间再发 ⇒ 拒 */
    const inFlight = new Set<string>();
    /** 分线快照 v2 的槽位（内容随 MK2–MK4 填充）：timers（id → dueTick）/ 区域开关 / 脚本 vars / 未认领掉落 */
    const timers = new Map<string, number>();
    const regions = new Map<string, boolean>();
    let scriptVars: Record<string, unknown> = {};
    let loot: readonly unknown[] = [];
    const log: string[] = [];
    let map: IMapDef | null = null;
    /** 碰撞网格（内容包 collision；无 = 全图通行） */
    let grid: CollisionGrid | null = null;
    /** AOI 空间网格（格长 = 图的 aoi.cellSize；只产生候选） */
    let aoi: AoiGrid | null = null;
    const candidates: string[] = [];

    const mapOf = (context: WorldModeContext<MmoWorldRoomState>): IMapDef => {
        if (map === null) {
            map = content.mapById.get(context.mapId) ?? null;
            if (map === null) throw new Error(`[mmoWorld] 地图 ${context.mapId} 不在内容包 ${content.pack.packId}@${content.pack.version} 内`);
            grid = parseCollisionGrid(map.collision ?? null, map.size);
            aoi = new AoiGrid(map.aoi.cellSize, map.size);
        }
        return map;
    };
    const aoiOf = (context: WorldModeContext<MmoWorldRoomState>): AoiGrid => {
        mapOf(context);
        return aoi!;
    };
    const moverOf = (session: string): MmoEntity | null => {
        const id = movers.get(session);
        return id === undefined ? null : entities.get(id) ?? null;
    };
    const syncPopulation = (context: WorldModeContext<MmoWorldRoomState>): void => {
        context.state.population = movers.size;
    };
    /** 角色快照（onCheckpoint 全批与 onPersonaCheckpoint 共用）：冷却按 tick 差折算成剩余 ms（分线 tick 不续）。 */
    const personaSnapshotOf = (context: WorldModeContext<MmoWorldRoomState>, mover: MmoEntity): MmoPersonaSnapshot => {
        const cooldowns: Record<string, number> = {};
        for (const [spellId, readyAtTick] of mover.cooldowns) {
            const remaining = (readyAtTick - context.state.tick) * context.fixedStepMs;
            if (remaining > 0) cooldowns[spellId] = remaining;
        }
        return {
            mapId: mapOf(context).mapId, x: mover.x, y: mover.y, hp: mover.hp, mp: mover.mp,
            ...(Object.keys(cooldowns).length > 0 ? { cooldowns } : {}),
            ...(mover.arrival ? { arrival: mover.arrival } : {}),
        };
    };
    const reject = (context: WorldModeContext<MmoWorldRoomState>, session: string, clientReqId: string, detail: string): void => {
        context.sendS2C(session, MmoWorldOpResult, { clientReqId, result: "rejected", detail });
    };
    /** 两图交接（MK1-B3）：门存在 + 在半径内 + 无在途 ⇒ 落点先写进实体 ⇒ 框架状态机；Committed ⇒ perSession transferReady；失败 ⇒ rejected + 落点清。 */
    const requestTransfer = (context: WorldModeContext<MmoWorldRoomState>, session: string, request: IMmoWorldTransferReq, def: IMapDef): void => {
        const mover = moverOf(session);
        if (!mover) return;
        const portal = def.portals.find((entry) => entry.portalId === request.portalId);
        if (!portal) { reject(context, session, request.clientReqId, "portal 不存在"); return; }
        if (!withinRadius(mover, portal.pos, portal.radius)) { reject(context, session, request.clientReqId, "不在传送门范围内"); return; }
        if (inFlight.has(session)) { reject(context, session, request.clientReqId, "交接在途"); return; }
        inFlight.add(session);
        // 落点先写进实体：框架 prepare 后立即强制检查点，persona 快照随之带 arrival（目标图 onEnter 按它落位）；同时停下
        mover.arrival = { mapId: portal.toMapId, spawnPointId: portal.toSpawnPointId };
        mover.dirX = 0;
        mover.dirY = 0;
        mover.target = null;
        log.push(`transfer:${session}:${portal.portalId}`);
        context.transfer.request(session, { toMap: portal.toMapId, payload: { portalId: portal.portalId, toSpawnPointId: portal.toSpawnPointId } })
            .then((ready) => {
                // Committed：凭据只经本 perSession token 出网一次（不可丢类）；随后壳排空出站并以 "transferred" 离座
                context.observers.emitPerSession(session, MmoWorldTransferReady, { transferId: ready.transferId, worldAddress: ready.worldAddress, ticket: ready.ticket, expiresAt: ready.expiresAt });
                log.push(`transfer:${session}:ready:${ready.toMap}`);
            })
            .catch((error: unknown) => {
                inFlight.delete(session);
                const current = moverOf(session);
                if (current) current.arrival = null;
                log.push(`transfer:${session}:failed`);
                reject(context, session, request.clientReqId, `交接失败：${error instanceof Error ? error.message : String(error)}`);
            });
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
            const def = mapOf(context);
            // 候选：网格（视距圆外接矩形覆盖的格子）→ 兴趣集：精确视距 + 规则 + 最近优先截断
            const ids = aoiOf(context).candidates(center, def.aoi.viewRadius, candidates);
            const pool: MmoEntity[] = [];
            for (const id of ids) {
                const entity = entities.get(id);
                if (entity) pool.push(entity);
            }
            for (const pick of pickInterest(center, pool, def.aoi.viewRadius, MMO_INTEREST_MAX_ENTITIES)) visible.set(pick.entity.id, projectionOf(pick.entity));
            return visible;
        },
        limits: { interestMaxEntities: MMO_INTEREST_MAX_ENTITIES },
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
            aoiOf(context).clear();
            movers.clear();
            inFlight.clear();
            timers.clear();
            regions.clear();
            scriptVars = {};
            loot = [];
            for (const region of content.regionsByMap.get(def.mapId) ?? []) regions.set(region.regionId, region.enabledByDefault);
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
                        speedPerSec: template.speedPerSec, session: null, personaId: null, characterId: null, factionId: null, plane: 0, stealth: false, arrival: null, cooldowns: new Map(),
                        x: pos.x, y: pos.y, rev: 0, hp: template.hpMax, mp: template.mpMax, dirX: 0, dirY: 0, target: null, seq: 0,
                    });
                    aoiOf(context).insert(id, pos.x, pos.y);
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
                aoiOf(context).move(entity.id, pos.x, pos.y);
                entity.hp = Math.max(0, Math.min(entity.hpMax, creature.hp));
                restored += 1;
            }
            // v2 槽位：timers 按 tick 差重排（分线 tick 从 0 起）、区域开关覆盖内容包缺省、脚本 vars / 掉落原样回灌；v1 快照没有这些字段 ⇒ 保持缺省
            const snapshotTick = typeof instance?.tick === "number" ? instance.tick : 0;
            for (const timer of instance?.timers ?? []) timers.set(timer.id, Math.max(0, timer.dueTick - snapshotTick) + context.state.tick);
            for (const [regionId, enabled] of Object.entries(instance?.regions ?? {})) regions.set(regionId, enabled);
            scriptVars = { ...(instance?.scriptVars ?? {}) };
            loot = [...(instance?.loot ?? [])];
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
            // 交接落点：上一图发起交接时写进快照的 arrival（图相同才认；落点 id 不在本图 ⇒ 首个出生点）
            const arrival = !usable && restored?.arrival && restored.arrival.mapId === def.mapId
                ? def.spawnPoints.find((point) => point.spawnPointId === restored.arrival?.spawnPointId)?.pos ?? null
                : null;
            const pos = usable ? clampToMap({ x: restored.x as number, y: restored.y as number }, def.size) : arrival ? { x: arrival.x, y: arrival.y } : { x: spawn.x, y: spawn.y };
            const klass = content.classById.get(row?.classId ?? "");
            const hpMax = klass?.hpMax ?? 100;
            const mpMax = klass?.mpMax ?? 50;
            const id = `char:${row?.characterId ?? session.personaId}`;
            // 冷却回灌：剩余 ms → 就绪 tick（相对本分线当前 tick）
            const cooldowns = new Map<string, number>();
            for (const [spellId, remainingMs] of Object.entries(restored?.cooldowns ?? {})) {
                if (typeof remainingMs === "number" && remainingMs > 0) cooldowns.set(spellId, context.state.tick + Math.ceil(remainingMs / context.fixedStepMs));
            }
            entities.set(id, {
                id, kind: "character", templateId: row?.classId ?? "fighter", name: row?.name ?? "?", level: row?.level ?? 1, hpMax, mpMax, speedPerSec: klass?.speedPerSec ?? 120,
                session: session.session, personaId: session.personaId, characterId: row?.characterId ?? null, factionId: row?.factionId ?? null, plane: 0, stealth: false, arrival: null, cooldowns,
                x: pos.x, y: pos.y, rev: 0,
                hp: typeof restored?.hp === "number" ? Math.max(0, Math.min(hpMax, restored.hp)) : hpMax,
                mp: typeof restored?.mp === "number" ? Math.max(0, Math.min(mpMax, restored.mp)) : mpMax,
                dirX: 0, dirY: 0, target: null, seq: 0,
            });
            aoiOf(context).insert(id, pos.x, pos.y);
            movers.set(session.session, id);
            privateDirty.add(session.session);
            syncPopulation(context);
            log.push(`enter:${session.session}${usable ? ":restored" : arrival ? ":arrival" : ""}`);
        },
        onLeave(context, session, reason) {
            const id = movers.get(session.session);
            if (id !== undefined) {
                entities.delete(id);
                aoiOf(context).remove(id);
                movers.delete(session.session);
            }
            privateDirty.delete(session.session);
            privateSent.delete(session.session);
            inFlight.delete(session.session);
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
                if (command.type === MmoWorldPickup.type) {
                    reject(context, command.session, (command.payload as IMmoWorldPickupReq).clientReqId, "inventory 面 MK3");
                    continue;
                }
                if (command.type === MmoWorldTransfer.type) {
                    requestTransfer(context, command.session, command.payload as IMmoWorldTransferReq, def);
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
                    aoiOf(context).move(entity.id, entity.x, entity.y);
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
                return [{ personaId: mover.personaId, snapshot: personaSnapshotOf(context, mover) }];
            });
            const instance: MmoInstanceSnapshot = {
                tick: context.state.tick,
                mapId: def.mapId,
                packId: content.pack.packId,
                packVersion: content.pack.version,
                creatures: [...entities.values()].filter((entity) => entity.kind === "creature").map((entity) => ({ id: entity.id, templateId: entity.templateId, x: entity.x, y: entity.y, hp: entity.hp, alive: entity.hp > 0 })),
                loot,
                scriptVars: { ...scriptVars },
                timers: [...timers].map(([id, dueTick]) => ({ id, dueTick })),
                regions: Object.fromEntries(regions),
            };
            return { persona, instance };
        },
        // MK1-B4：离座 / 交接只落该 persona 的快照（框架 forcePersonaCheckpoint；⛔ 分线快照 / 事件批）
        onPersonaCheckpoint(context, session) {
            const mover = moverOf(session);
            return mover && mover.personaId !== null ? personaSnapshotOf(context, mover) : null;
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
        __probe: {
            entities: () => entities,
            moverOf,
            setVisibility: (id, facts) => {
                const entity = entities.get(id);
                if (!entity) throw new Error(`[mmoWorld] setVisibility：${id} 不存在`);
                if (facts.plane !== undefined) entity.plane = facts.plane;
                if (facts.stealth !== undefined) entity.stealth = facts.stealth;
            },
            transfersInFlight: () => [...inFlight],
            setCooldown: (id, spellId, readyAtTick) => {
                const entity = entities.get(id);
                if (!entity) throw new Error(`[mmoWorld] setCooldown：${id} 不存在`);
                entity.cooldowns.set(spellId, readyAtTick);
            },
            setTimer: (id, dueTick) => { timers.set(id, dueTick); },
            setRegion: (regionId, enabled) => { regions.set(regionId, enabled); },
            setVar: (key, value) => { scriptVars[key] = value; },
            timers: () => timers,
            regions: () => regions,
            vars: () => scriptVars,
            log,
        },
    };
    return mode;
}

/** 约定导出符号 `register<Constant>WorldMode`（codegen `registerGeneratedWorldModes` 静态 import）：登记前先取内容索引——包不合法即抛，组合根拒启。 */
export function registerMmoWorldWorldMode(registry: WorldModeRegistry = worldModeRegistry): () => void {
    const content = contentIndex();
    return registry.register(MMO_WORLD_MODE_ID, () => createMmoWorldMode({ content }));
}
