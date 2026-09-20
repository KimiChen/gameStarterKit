/**
 * mmoWorld 服务端 WorldMode（mmo kit 的世界形态玩法；docs/MMO.md §7.4 / §7.6，MK0 灰盒）：只消费框架 WorldMode 契约 + kit-api 门面 + 本 kit 模块，
 * ⛔ 不 import colyseus / rooms/core 内核。
 *  - onWorldInit：按内容包（`content` 面）为本图撒怪（spawns，确定性抖动来自分线随机流），根写 packId / packVersion；图不在包内 ⇒ 抛（WorldRoom 拒启）；
 *  - onBeforeAdmit（唯一可 await 的准入钩子）：按 persona 预热角色行（`characters` 面）；onAdmit 无角色即拒；
 *  - onEnter：角色实体落在最新角色检查点的位置（persona 信封回灌，M08）或出生点；onLeave 回收；
 *  - onStep：move 意图（dir / target）→ 权威积分（`movement` 面）；baselineRequest → 框架 baseline；pickup 回 opResult rejected（MK3 接入）；
 *    transfer（MK1-B3 两图交接）：portal 存在 + 在半径内 + 无在途 ⇒ 落点先写进实体（框架 prepare 后强制点的 persona 快照带 arrival）⇒
 *    `context.transfer.request`（框架 MF8 状态机）⇒ Committed 后 perSession `transferReady`（凭据只此一处出网）⇒ 壳以 "transferred" 离座；
 *    失败 ⇒ opResult rejected + 落点清；目标图 onEnter 按 arrival 落位（HP / MP 随身）；interact / choose 暂忽略（MK4）；本人私有流 hp / mp / 冷却集合 / 施法中变了才发；
 *  - combat（MK2-B1，`combat` 面纯函数 + 本 mode 的施法管线）：target 选目标；cast ⇒ checkCast（技能 / 已学 / 存活 / 施法中 / 冷却 / 耗蓝 / 目标 / 射程）⇒ 读条（castMs > 0）
 *    或瞬发；读条期间移动即打断；到点二次校验后扣蓝 / 记冷却 / 施效（直伤按 combat 面公式 + 分线随机流浮动、治疗、buff / debuff aura）；hp ≤ 0 ⇒ 死亡
 *    （清热状态、怪物离开视野、按 respawnSec / MMO_PLAYER_RESPAWN_MS 复活、checkpointOnDeath ⇒ 强制点）；回执经 opResult（clientReqId = cast:<seq>）；同一命令序 + 同一种子 ⇒ 同一结果（无头重放）；
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
    type IMmoEntityWire, type IMmoWorldCastReq, type IMmoWorldMoveReq, type IMmoWorldPickupReq, type IMmoWorldTargetReq, type IMmoWorldTransferReq, type IObserverEnvelope,
} from "@game/shared";
import type { IContentPackIndex, IMapDef } from "@game/shared/kits/mmo/api/content/index";
import { clampToMap, withinRadius } from "@game/shared/kits/mmo/api/world/index";
import {
    MMO_PLAYER_RESPAWN_MS, auraOf, castReqIdOf, checkCast, cooldownReadyTick, damageOf, effectiveStats, healOf, needsHostileTarget, threatOf, ticksOf, type IAura,
} from "@game/shared/kits/mmo/api/combat/index";
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
/**
 * 生产节拍（MK1-B6 场景 B 热点实测后定：§11.2「只许收紧」）：角色位置每 2 步（10 Hz）进观察者流、本人 pos 回执仍每步（20 Hz）；兴趣集每 4 步（200 ms）
 * 按会话重算（enter / leave 最多晚 150 ms）。`registerMmoWorldWorldMode` 与基准剧本都用它；单测直构 mode 缺省 1 / 1（逐步语义）。
 */
export const MMO_WORLD_TUNING = Object.freeze({ characterUpdateEveryTicks: 2, interestEveryTicks: 4 });

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
    /** 冷却：spellId → 就绪 tick（快照按 tick 差折算成剩余 ms） */
    readonly cooldowns: Map<string, number>;
    /** 基础属性（职业 / 怪物模板）；生效值 = effectiveStats(base, auras) */
    readonly attack: number;
    readonly defense: number;
    /** 已学技能（角色 = 职业模板；怪物 = 模板 spells） */
    readonly spells: readonly string[];
    /** 战斗热状态（⛔ 进检查点，§7.3）：aura / 仇恨 / 施法中 / 选中目标 */
    readonly auras: Map<string, IAura>;
    readonly threat: Map<string, number>;
    casting: { readonly spellId: string; readonly targetId: string | null; readonly readyTick: number; readonly seq: number } | null;
    targetId: string | null;
    alive: boolean;
    /** 复活到期 tick（死亡时设；null = 存活） */
    respawnDueTick: number | null;
    /** 怪物出生位置（复活落点） */
    readonly origin: { readonly x: number; readonly y: number };
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
    /** 角色位置进观察者流的节拍（每 N 固定步 bump 一次 rev；停下那步必 bump）；缺省 1 = 每步。热点调优（MK1-B6），⛔ 影响本人 pos 回执 */
    readonly characterUpdateEveryTicks?: number;
    /** 兴趣集重算节拍（每 N 固定步按会话重算候选 + 规则；其间沿用上次集合、投影仍取当前状态）；缺省 1 = 每步 */
    readonly interestEveryTicks?: number;
}

export interface MmoWorldMode extends WorldMode<MmoWorldRoomState> {
    readonly __probe: {
        entities(): ReadonlyMap<string, MmoEntity>;
        moverOf(session: string): MmoEntity | null;
        /** 测试 / 编排接缝：改位面 / 隐身（MK2 aura、MK4 编排接入前的直接写口） */
        setVisibility(id: string, facts: { readonly plane?: number; readonly stealth?: boolean }): void;
        /** 在途交接的会话 */
        transfersInFlight(): readonly string[];
        /** 战斗接缝（测试）：直接扣血（走同一死亡路径） */
        damage(id: string, amount: number): void;
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

/** 私有流的冷却 / 施法中投影（冷却按 tick 差折算成剩余 ms，只含未就绪的）。 */
function privateCombatOf(entity: MmoEntity, tick: number, fixedStepMs: number): { cooldowns?: Record<string, number>; casting?: { spellId: string; readyInMs: number } } {
    const cooldowns: Record<string, number> = {};
    for (const [spellId, readyTick] of entity.cooldowns) {
        const remaining = (readyTick - tick) * fixedStepMs;
        if (remaining > 0) cooldowns[spellId] = remaining;
    }
    return {
        ...(Object.keys(cooldowns).length > 0 ? { cooldowns } : {}),
        ...(entity.casting ? { casting: { spellId: entity.casting.spellId, readyInMs: Math.max(0, (entity.casting.readyTick - tick) * fixedStepMs) } } : {}),
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
    const characterUpdateEveryTicks = Math.max(1, Math.floor(options.characterUpdateEveryTicks ?? 1));
    const interestEveryTicks = Math.max(1, Math.floor(options.interestEveryTicks ?? 1));
    /** 兴趣集缓存（interestEveryTicks > 1 时）：session → 上次选中的实体 id 列表 + 本会话的重算相位（按会话错开，⛔ 全房同一 tick 重算造成尖峰） */
    const interestCache = new Map<string, { readonly ids: readonly string[]; readonly phase: number }>();
    /** 节拍相位（按 key 哈希错开，⛔ 全房同一 tick 同时发 / 同时重算造成 tick 尖峰）。 */
    const phaseOf = (key: string, everyTicks: number): number => {
        let hash = 0;
        for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
        return hash % everyTicks;
    };
    /** 位置已变但尚未 bump rev 的角色（节拍到 / 停下时补 bump） */
    const revPending = new Set<string>();

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

    const distanceOf = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
    const statsOf = (entity: MmoEntity, tick: number) => effectiveStats({ level: entity.level, attack: entity.attack, defense: entity.defense }, entity.auras.values(), tick);
    /** 施法请求（MK2-B1）：checkCast ⇒ 读条 / 瞬发；回执 clientReqId = cast:<seq>。 */
    const requestCast = (context: WorldModeContext<MmoWorldRoomState>, session: string, request: IMmoWorldCastReq, tick: number): void => {
        const caster = moverOf(session);
        if (!caster) return;
        const reqId = castReqIdOf(request.seq);
        const spell = content.spellById.get(request.spellId);
        const targetId = request.targetId ?? caster.targetId ?? (spell && !needsHostileTarget(spell) ? caster.id : null);
        const target = targetId === null ? null : entities.get(targetId) ?? null;
        const rejection = checkCast({
            spell, learned: caster.spells.includes(request.spellId), casterAlive: caster.alive, casting: caster.casting !== null,
            readyTick: caster.cooldowns.get(request.spellId), tick, mp: caster.mp,
            target: target ? { alive: target.alive, distance: distanceOf(caster, target), isSelf: target.id === caster.id } : (targetId !== null ? { alive: false, distance: 0, isSelf: false } : null),
        });
        if (rejection !== null || !spell) { reject(context, session, reqId, rejection ?? "unknown-spell"); return; }
        const castTicks = ticksOf(spell.castMs, context.fixedStepMs);
        caster.casting = { spellId: spell.spellId, targetId: target?.id ?? null, readyTick: tick + castTicks, seq: request.seq };
        if (castTicks === 0) resolveCast(context, caster, tick);
        else privateDirty.add(session);
    };
    /** 施法完成：二次校验（目标存活 / 射程 / 耗蓝）⇒ 扣蓝 / 记冷却 / 施效；随机只经分线随机流。 */
    const resolveCast = (context: WorldModeContext<MmoWorldRoomState>, caster: MmoEntity, tick: number): void => {
        const cast = caster.casting;
        if (!cast) return;
        caster.casting = null;
        const spell = content.spellById.get(cast.spellId);
        const reqId = castReqIdOf(cast.seq);
        const fail = (detail: string): void => { if (caster.session) reject(context, caster.session, reqId, detail); };
        if (!spell || !caster.alive) { fail("dead"); return; }
        const target = cast.targetId === null ? caster : entities.get(cast.targetId) ?? null;
        if (!target || (!target.alive && target.id !== caster.id)) { fail("target-dead"); return; }
        if (target.id !== caster.id && distanceOf(caster, target) > spell.range) { fail("range"); return; }
        if (caster.mp < spell.mpCost) { fail("mp"); return; }
        caster.mp -= spell.mpCost;
        caster.cooldowns.set(spell.spellId, cooldownReadyTick(spell, tick, context.fixedStepMs));
        const roll = context.random.next();
        const attackerStats = statsOf(caster, tick);
        if (spell.kind === "damage") {
            const amount = damageOf(spell, attackerStats, statsOf(target, tick), roll);
            target.hp = Math.max(0, target.hp - amount);
            target.rev += 1;
            if (target.kind === "creature") target.threat.set(caster.id, (target.threat.get(caster.id) ?? 0) + threatOf(amount));
            log.push(`hit:${caster.id}>${target.id}:${amount}`);
        } else if (spell.kind === "heal") {
            const amount = healOf(spell, attackerStats, roll);
            target.hp = Math.min(target.hpMax, target.hp + amount);
            target.rev += 1;
            log.push(`heal:${caster.id}>${target.id}:${amount}`);
        } else {
            const aura = auraOf(spell, tick, context.fixedStepMs);
            if (aura) target.auras.set(aura.spellId, aura);
            log.push(`aura:${caster.id}>${target.id}:${spell.spellId}`);
        }
        if (caster.session) context.sendS2C(caster.session, MmoWorldOpResult, { clientReqId: reqId, result: "ok" });
        if (caster.session) privateDirty.add(caster.session);
        if (target.session) privateDirty.add(target.session);
    };
    /** 死亡：清热状态、停下；怪物按 respawnSec 复活、角色按 MMO_PLAYER_RESPAWN_MS 复活；checkpointOnDeath ⇒ 强制点（有检查点能力时）。 */
    const die = (context: WorldModeContext<MmoWorldRoomState>, entity: MmoEntity, tick: number): void => {
        entity.alive = false;
        entity.hp = 0;
        entity.rev += 1;
        entity.casting = null;
        entity.auras.clear();
        entity.threat.clear();
        entity.dirX = 0;
        entity.dirY = 0;
        entity.target = null;
        revPending.delete(entity.id);
        const template = entity.kind === "creature" ? content.creatureById.get(entity.templateId) : undefined;
        entity.respawnDueTick = tick + ticksOf(template ? template.respawnSec * 1000 : MMO_PLAYER_RESPAWN_MS, context.fixedStepMs);
        if (template?.checkpointOnDeath && checkpoint) context.requestCheckpoint(`death:${entity.id}`);
        log.push(`death:${entity.id}`);
    };
    /** 复活：怪物回出生位置、角色回最近复活点；满血满蓝。 */
    const respawn = (context: WorldModeContext<MmoWorldRoomState>, entity: MmoEntity): void => {
        const def = mapOf(context);
        const point = entity.kind === "creature"
            ? entity.origin
            : [...def.respawnPoints].sort((left, right) => distanceOf(entity, left) - distanceOf(entity, right))[0] ?? def.spawnPoints[0]!.pos;
        entity.x = point.x;
        entity.y = point.y;
        aoiOf(context).move(entity.id, entity.x, entity.y);
        entity.hp = entity.hpMax;
        entity.mp = entity.mpMax;
        entity.alive = true;
        entity.respawnDueTick = null;
        entity.rev += 1;
        if (entity.session) privateDirty.add(entity.session);
        log.push(`respawn:${entity.id}`);
    };
    /** 战斗步（移动之后）：到点的读条施法（按实体插入序，确定性）→ 过期 aura → 死亡判定 → 到期复活。 */
    const combatStep = (context: WorldModeContext<MmoWorldRoomState>, tick: number): void => {
        for (const entity of entities.values()) {
            if (entity.casting && entity.casting.readyTick <= tick) resolveCast(context, entity, tick);
        }
        for (const entity of entities.values()) {
            for (const [spellId, aura] of entity.auras) if (aura.expiresTick <= tick) entity.auras.delete(spellId);
            if (entity.alive && entity.hp <= 0) die(context, entity, tick);
            else if (!entity.alive && entity.respawnDueTick !== null && entity.respawnDueTick <= tick) respawn(context, entity);
        }
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
            // 兴趣集节拍：只在本会话的相位 tick 重算，其间沿用上次集合（投影取当前状态；已消失的实体自然掉出）
            const cached = interestEveryTicks > 1 ? interestCache.get(session) : undefined;
            if (cached && (context.state.tick + cached.phase) % interestEveryTicks !== 0) {
                for (const id of cached.ids) {
                    const entity = entities.get(id);
                    if (entity && (entity.alive || entity.kind === "character")) visible.set(id, projectionOf(entity));
                }
                return visible;
            }
            // 候选：网格（视距圆外接矩形覆盖的格子）→ 兴趣集：精确视距 + 规则 + 最近优先截断
            const ids = aoiOf(context).candidates(center, def.aoi.viewRadius, candidates);
            const pool: MmoEntity[] = [];
            for (const id of ids) {
                const entity = entities.get(id);
                // 死亡的怪物离开视野（复活再 enter）；死亡的角色留在视野（hp 0 的尸体）
                if (entity && (entity.alive || entity.kind === "character")) pool.push(entity);
            }
            const picked: string[] = [];
            for (const pick of pickInterest(center, pool, def.aoi.viewRadius, MMO_INTEREST_MAX_ENTITIES)) {
                visible.set(pick.entity.id, projectionOf(pick.entity));
                picked.push(pick.entity.id);
            }
            if (interestEveryTicks > 1) interestCache.set(session, { ids: picked, phase: cached?.phase ?? phaseOf(session, interestEveryTicks) });
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
            interestCache.clear();
            revPending.clear();
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
                        attack: template.attack, defense: template.defense, spells: template.spells, auras: new Map(), threat: new Map(), casting: null, targetId: null, alive: true, respawnDueTick: null,
                        origin: { x: pos.x, y: pos.y },
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
                if (creature.alive === false || entity.hp <= 0) {
                    entity.alive = false;
                    entity.hp = 0;
                    entity.respawnDueTick = typeof creature.respawnDueTick === "number" ? Math.max(0, creature.respawnDueTick - (typeof instance?.tick === "number" ? instance.tick : 0)) + context.state.tick : context.state.tick;
                }
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
            const hp = typeof restored?.hp === "number" ? Math.max(0, Math.min(hpMax, restored.hp)) : hpMax;
            entities.set(id, {
                id, kind: "character", templateId: row?.classId ?? "fighter", name: row?.name ?? "?", level: row?.level ?? 1, hpMax, mpMax, speedPerSec: klass?.speedPerSec ?? 120,
                session: session.session, personaId: session.personaId, characterId: row?.characterId ?? null, factionId: row?.factionId ?? null, plane: 0, stealth: false, arrival: null, cooldowns,
                attack: klass?.attack ?? 0, defense: klass?.defense ?? 0, spells: klass?.spells ?? [], auras: new Map(), threat: new Map(), casting: null, targetId: null,
                // 带着 0 hp 进图（死亡时离座）⇒ 立即按角色复活等待重生
                alive: hp > 0, respawnDueTick: hp > 0 ? null : context.state.tick + ticksOf(MMO_PLAYER_RESPAWN_MS, context.fixedStepMs),
                origin: { x: pos.x, y: pos.y },
                x: pos.x, y: pos.y, rev: 0,
                hp,
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
            interestCache.delete(session.session);
            if (id !== undefined) revPending.delete(id);
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
                if (command.type === MmoWorldTarget.type) {
                    const mover = moverOf(command.session);
                    const wanted = (command.payload as IMmoWorldTargetReq).entityId;
                    if (mover) mover.targetId = wanted !== null && entities.has(wanted) ? wanted : null;
                    continue;
                }
                if (command.type === MmoWorldCast.type) {
                    requestCast(context, command.session, command.payload as IMmoWorldCastReq, step.tick);
                    continue;
                }
                if (command.type !== MmoWorldMove.type) continue; // interact / choose：MK4
                const mover = moverOf(command.session);
                if (!mover || !mover.alive) continue; // 死者不动
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
                // 权威积分（movement 面 resolveMove：双端同源；碰撞候选来自内容包网格）；死者不动
                const result = entity.alive ? resolveMove(entity, entity.speedPerSec, step.dtMs, def.size, grid) : { x: entity.x, y: entity.y, target: null, moved: false, arrived: false, blocked: false };
                if (result.moved) {
                    entity.x = result.x;
                    entity.y = result.y;
                    aoiOf(context).move(entity.id, entity.x, entity.y);
                    // 读条被移动打断
                    if (entity.casting && entity.casting.readyTick > step.tick) {
                        const interrupted = entity.casting;
                        entity.casting = null;
                        reject(context, entity.session, castReqIdOf(interrupted.seq), "moved");
                        privateDirty.add(entity.session);
                    }
                    // 观察者流节拍：每 characterUpdateEveryTicks 步 bump 一次 rev（相位按实体错开；本人 pos 回执仍每步）
                    if (characterUpdateEveryTicks === 1 || (step.tick + phaseOf(entity.id, characterUpdateEveryTicks)) % characterUpdateEveryTicks === 0) {
                        entity.rev += 1;
                        revPending.delete(entity.id);
                    } else {
                        revPending.add(entity.id);
                    }
                } else if (revPending.has(entity.id)) {
                    // 停下那步：把节拍间攒的位置变化补进流（终点必到）
                    entity.rev += 1;
                    revPending.delete(entity.id);
                }
                entity.target = result.target;
                if (result.moved || touched.has(entity.id)) {
                    context.sendS2C(entity.session, MmoWorldPos, { seq: entity.seq, tick: step.tick, x: entity.x, y: entity.y });
                }
            }
            // 战斗步（移动之后、出站之前；确定性：按实体插入序）
            combatStep(context, step.tick);
            for (const entity of entities.values()) {
                if (entity.kind !== "character" || entity.session === null) continue;
                // 本人私有流（不可丢类，与视野流共用单 seq 流）：hp / mp / 冷却集合（按就绪 tick）/ 施法中 变了才发（⛔ 每 tick 倒计时）
                const signature = `${entity.hp}/${entity.hpMax}/${entity.mp}/${entity.mpMax}/${[...entity.cooldowns].filter(([, ready]) => ready > step.tick).map(([id, ready]) => `${id}@${ready}`).join(",")}/${entity.casting ? `${entity.casting.spellId}@${entity.casting.readyTick}` : ""}`;
                if (privateDirty.has(entity.session) || privateSent.get(entity.session) !== signature) {
                    privateDirty.delete(entity.session);
                    privateSent.set(entity.session, signature);
                    context.observers.emitPerSession(entity.session, MmoWorldPrivate, {
                        seq: context.observers.nextSeq(entity.session), tick: step.tick, hp: entity.hp, hpMax: entity.hpMax, mp: entity.mp, mpMax: entity.mpMax,
                        ...privateCombatOf(entity, step.tick, context.fixedStepMs),
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
                creatures: [...entities.values()].filter((entity) => entity.kind === "creature").map((entity) => ({
                    id: entity.id, templateId: entity.templateId, x: entity.x, y: entity.y, hp: entity.hp, alive: entity.alive,
                    ...(entity.respawnDueTick === null ? {} : { respawnDueTick: entity.respawnDueTick }),
                })),
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
            damage: (id, amount) => {
                const entity = entities.get(id);
                if (!entity) throw new Error(`[mmoWorld] damage：${id} 不存在`);
                entity.hp = Math.max(0, entity.hp - amount);
                entity.rev += 1;
                if (entity.session) privateDirty.add(entity.session);
            },
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
    return registry.register(MMO_WORLD_MODE_ID, () => createMmoWorldMode({ content, ...MMO_WORLD_TUNING }));
}
