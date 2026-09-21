/**
 * mmoWorld 客户端玩法插件（kits/mmo 的世界形态玩法；纯 TS，无头单测）：观察世界房句柄维护本地实体表 / 本人私有态 → 视图模型；
 * 输入：方向意图 / 点地 / 停 / 传送（最近的传送门，MK1-B3）/ 离开（⛔ 客户端不上报坐标；本人位置取 movement 面本地预测）。
 * 两图交接：`transferReady` 回执（凭据只此一处）⇒ 记下并请求退出，stop 时把凭据交给 `onTransfer`（mode 模块带参重进目标图）。
 * 附近聊天（MK1-B5）：`say` 输入 ⇒ 框架 core 世界 token；收到的 `chat` 只把 fromEntityId 映射成视野实体名（受众由服务端按兴趣集算）。
 * 战斗（MK2-B1）：`target` 选目标、`cast` 施法（无目标时敌对技能自动选视野内最近存活怪）；冷却取 private 流集合本地倒计时；施法回执 `cast:<seq>` 进提示。
 * 掉落（MK2-B3）：视野里的 loot 实体带 count；`pickup` 输入 ⇒ 拾取半径内最近的掉落（inventory 面 nearestLoot，本人取预测位置）⇒ `room.pickup`；回执 `p<seq>` 进提示。
 * 背包（MK3-B1）：private 流的 bag（进图一份、变化才来）进模型 `bag` + 摘要 `bagSummary`（inventory 面 describeBag）；移动 / 装备走 Lobby RPC（kit runtime bag / moveItem），⛔ 经世界房。
 * 渲染归 ../../../view/rooms/mmoWorld/MmoWorldView.ts；⛔ 不 import cc（铁律 9）。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import type { GameplayInstanceHost } from "../../gameplay/GameplayModule";
import type { IMmoEntityWire, IMmoWorldOpResult, IMmoWorldPos, IMmoWorldTransferReady } from "../../../shared/index";
import { withinRadius, type MmoPrivateState } from "../../../kits/mmo/api/world/index";
import { MovementPredictor, normalizeDir, parseCollisionGrid } from "../../../kits/mmo/api/movement/index";
import { mapDefOf, packForMap, presentationOf, type IClassTemplate, type IPresentationEntry } from "../../../kits/mmo/api/content/index";
import { appendChatLine, nearbyChatLineOf, type INearbyChatLine } from "../../../kits/mmo/api/social/index";
import { CooldownModel, pickHostileTarget } from "../../../kits/mmo/api/combat/index";
import { MMO_PICKUP_RADIUS, describeBag, nearestLoot, type IMmoBagWire } from "../../../kits/mmo/api/inventory/index";
import type { IWorldChatRes } from "../../../shared/protocol/messages";

export const MMO_WORLD_GAMEPLAY_ID = "mmoWorld";

export type MmoWorldInput =
    | { readonly type: "move"; readonly dir: { readonly x: number; readonly y: number } }
    | { readonly type: "moveTo"; readonly x: number; readonly y: number }
    | { readonly type: "stop" }
    /** 走最近的传送门（本人在其半径内才发） */
    | { readonly type: "transfer" }
    /** 附近聊天 */
    | { readonly type: "say"; readonly text: string }
    /** 选目标（null 清除） */
    | { readonly type: "target"; readonly entityId: string | null }
    /** 施法（敌对技能无目标时自动选最近存活怪） */
    | { readonly type: "cast"; readonly spellId: string }
    /** 拾取拾取半径内最近的掉落 */
    | { readonly type: "pickup" }
    | { readonly type: "leave" };

/** 世界房句柄观察者：net 层把观察者流 / 私有流 / 回执 / 连接事件翻译成这几个回调，逻辑层不认识 Colyseus。 */
export interface MmoWorldRoomObserver {
    entities(snapshot: ReadonlyMap<string, IMmoEntityWire>, synced: boolean): void;
    privateState(state: MmoPrivateState): void;
    opResult(result: IMmoWorldOpResult): void;
    /** 本人移动回执（movement 面）：服务端权威位置 + 意图 seq */
    pos(payload: IMmoWorldPos): void;
    /** 交接就绪（MK1-B3）：目标分线凭据，只此一处出网 */
    transferReady(payload: IMmoWorldTransferReady): void;
    /** 附近聊天（框架 core 世界 token；MK1-B5） */
    chat(payload: IWorldChatRes): void;
    resync(reason: string | null): void;
    dropped(): void;
    reconnected(): void;
    left(kind: string): void;
}

export interface MmoWorldRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly mapId: string;
    /** 本次 join 已验证归属的角色身份，随房间实例传递，不依赖 module 的上一次 launch。 */
    readonly selfCharacterId?: string;
    readonly current: boolean;
    readonly dropping: boolean;
    /** 发出意图；返回它的 seq（掉线 / 已离开拒发 ⇒ null） */
    move(dir: { readonly x: number; readonly y: number }): number | null;
    moveTo(target: { readonly x: number; readonly y: number }): number | null;
    stop(): number | null;
    /** 发起交接（portalId）；返回 clientReqId（拒发 ⇒ null） */
    transfer(portalId: string): string | null;
    /** 附近聊天（拒发 ⇒ false） */
    say(text: string): boolean;
    /** 选目标（拒发 ⇒ false） */
    target(entityId: string | null): boolean;
    /** 施法；返回 seq（回执 clientReqId = cast:<seq>；拒发 ⇒ null） */
    cast(spellId: string, targetId?: string): number | null;
    /** 拾取掉落；返回 clientReqId（拒发 ⇒ null） */
    pickup(lootId: string): string | null;
    requestBaseline(afterSeq: number): boolean;
    observe(observer: MmoWorldRoomObserver): () => void;
    leave(): Promise<void>;
}

export interface MmoWorldEntityView {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
    readonly hpMax: number;
    readonly level: number;
    /** 阵营（名片；无阵营实体 null） */
    readonly factionId: string | null;
    /** 掉落堆叠数（kind loot；其余 null） */
    readonly count: number | null;
    readonly isSelf: boolean;
    readonly presentation: IPresentationEntry;
}

export interface MmoWorldViewModel {
    readonly mapId: string;
    readonly mapSize: { readonly w: number; readonly h: number };
    readonly self: MmoWorldEntityView | null;
    /** 视野内实体（含本人），按 id 排序 */
    readonly entities: readonly MmoWorldEntityView[];
    readonly hp: number;
    readonly hpMax: number;
    readonly mp: number;
    readonly mpMax: number;
    readonly synced: boolean;
    readonly dropping: boolean;
    readonly notice: string;
    /** 附近聊天日志（最新在后，上限 NEARBY_CHAT_LOG_MAX） */
    readonly chat: readonly INearbyChatLine[];
    /** 战斗（MK2-B1）：当前目标 / 职业技能栏 / 冷却剩余 ms / 施法中 */
    readonly targetId: string | null;
    readonly spells: readonly string[];
    readonly cooldowns: Readonly<Record<string, number>>;
    readonly casting: { readonly spellId: string; readonly readyInMs: number } | null;
    /** 背包（MK3-B1）：private 流最近一份；未收到 ⇒ null */
    readonly bag: IMmoBagWire | null;
    readonly bagSummary: string;
}

export interface MmoWorldPresentation {
    mount(): void;
    render(model: MmoWorldViewModel): void;
    unmount(): void;
}

export interface MmoWorldGameplayOptions {
    readonly host?: GameplayInstanceHost<MmoWorldInput>;
    readonly presentation?: MmoWorldPresentation;
    readonly presentationFactory?: () => MmoWorldPresentation | undefined | Promise<MmoWorldPresentation | undefined>;
    /** 无头调用可显式注入；生产从本次 room.selfCharacterId 读取，身份缺席时不猜本人。 */
    readonly selfCharacterId?: string;
    /** 交接就绪后（本局 stop 时）交出凭据：mode 模块据此带参重进目标图。 */
    readonly onTransfer?: (ready: IMmoWorldTransferReady, characterId: string | null) => void;
}

export class MmoWorldGameplay implements GameplayPlugin<MmoWorldRoom, MmoWorldInput> {
    readonly id = MMO_WORLD_GAMEPLAY_ID;

    private readonly host: GameplayInstanceHost<MmoWorldInput> | null;
    private readonly presentationFactory: () => MmoWorldPresentation | undefined | Promise<MmoWorldPresentation | undefined>;
    private selfCharacterId: string | null;
    private readonly onTransfer: ((ready: IMmoWorldTransferReady, characterId: string | null) => void) | null;
    /** 已收到的交接凭据（stop 时交出） */
    private pendingTransfer: IMmoWorldTransferReady | null = null;
    private presentation: MmoWorldPresentation | null = null;
    private context: GameplayContext<MmoWorldRoom> | null = null;
    private unobserve: (() => void) | null = null;
    private started = false;
    private disposed = false;
    private exitRequested = false;

    private entities: ReadonlyMap<string, IMmoEntityWire> = new Map();
    private synced = false;
    /** 本地预测器（本人实体首次出现在视野流时按职业模板 / 地图建） */
    private predictor: MovementPredictor | null = null;
    private dead = false;
    /** 复活位置回执先于同一步 private 到达；待 HP 恢复后重建预测器，丢弃死亡前意图。 */
    private respawnPosition: IMmoWorldPos | null = null;
    private privateState: MmoPrivateState = { hp: 0, hpMax: 1, mp: 0, mpMax: 0, cooldowns: {}, casting: null, bag: null };
    private readonly cooldowns = new CooldownModel();
    /** 本地时钟（tick 累加；冷却倒计时用） */
    private nowMs = 0;
    private targetId: string | null = null;
    private notice = "";
    private chatLog: readonly INearbyChatLine[] = [];

    constructor(options: MmoWorldGameplayOptions = {}) {
        this.host = options.host ?? null;
        this.presentationFactory = options.presentationFactory ?? (() => options.presentation);
        this.selfCharacterId = options.selfCharacterId ?? null;
        this.onTransfer = options.onTransfer ?? null;
    }

    async start(context: GameplayContext<MmoWorldRoom>): Promise<void> {
        if (this.started || this.disposed) return;
        const presentation = await this.presentationFactory();
        if (!presentation || typeof presentation.mount !== "function" || typeof presentation.render !== "function" || typeof presentation.unmount !== "function") {
            throw new TypeError("[mmoWorld] 需要有效的 presentation adapter");
        }
        this.started = true;
        this.selfCharacterId = context.room.selfCharacterId ?? this.selfCharacterId;
        this.context = context;
        this.presentation = presentation;
        try {
            presentation.mount();
            const active = () => this.started && this.context === context && context.isActive();
            this.unobserve = context.room.observe({
                entities: (snapshot, synced) => {
                    if (!active()) return;
                    this.entities = snapshot;
                    this.synced = synced;
                    if (!this.dead && this.predictor === null) this.predictor = this.createPredictor(snapshot, context.room.mapId);
                },
                pos: (payload) => {
                    if (!active()) return;
                    if (this.dead) this.respawnPosition = payload;
                    else this.predictor?.reconcile(payload);
                },
                chat: (payload) => { if (active()) this.chatLog = appendChatLine(this.chatLog, nearbyChatLineOf(payload, (id) => this.entities.get(id)?.name ?? null)); },
                transferReady: (payload) => {
                    if (!active()) return;
                    // 凭据只此一处：记下 → 退出本局 → stop 时交给 onTransfer 带参重进目标图（源房随后被服务端以 transferred 离座）
                    this.pendingTransfer = payload;
                    this.notice = "传送中…";
                    this.requestExit("settled");
                },
                privateState: (state) => {
                    if (!active()) return;
                    const wasDead = this.dead;
                    this.dead = state.hp <= 0;
                    this.privateState = state;
                    this.cooldowns.accept(state.cooldowns, this.nowMs);
                    if (this.dead) {
                        this.predictor = null;
                        if (!wasDead) this.respawnPosition = null;
                    } else if (wasDead) {
                        this.predictor = this.createPredictor(this.entities, context.room.mapId);
                        if (this.respawnPosition) this.predictor?.reconcile(this.respawnPosition);
                        this.respawnPosition = null;
                    }
                },
                opResult: (result) => { if (active()) this.notice = result.result === "ok" ? "" : `${result.result}${result.detail ? `：${result.detail}` : ""}`; },
                resync: (reason) => { if (active()) this.notice = `重同步${reason ? `（${reason}）` : ""}`; },
                dropped: () => { if (active()) this.notice = "连接中断，重连中…"; },
                reconnected: () => { if (active()) this.notice = ""; },
                left: (kind) => { if (active() && kind !== "consented") this.requestExit("settled"); },
            });
            presentation.render(this.model());
        } catch (error) {
            this.teardown();
            throw error;
        }
    }

    handleInput(input: MmoWorldInput, context: GameplayContext<MmoWorldRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (input.type === "leave") { this.requestExit("user-exit"); return; }
        if (context.room.dropping || !context.room.current) return;
        if (this.dead && input.type !== "say" && input.type !== "target") return;
        if (input.type === "transfer") { this.requestTransfer(context); return; }
        if (input.type === "say") {
            const text = input.text.trim();
            if (text.length === 0) return;
            if (!context.room.say(text)) this.notice = "聊天未发出";
            return;
        }
        if (input.type === "target") {
            this.targetId = input.entityId !== null && this.entities.has(input.entityId) ? input.entityId : null;
            context.room.target(this.targetId);
            return;
        }
        if (input.type === "cast") { this.requestCast(context, input.spellId); return; }
        if (input.type === "pickup") { this.requestPickup(context); return; }
        if (input.type === "move") {
            const dir = normalizeDir(input.dir);
            const seq = context.room.move(dir);
            if (seq !== null) this.predictor?.push({ seq, dir });
        } else if (input.type === "moveTo") {
            const target = { x: Math.max(0, input.x), y: Math.max(0, input.y) };
            const seq = context.room.moveTo(target);
            if (seq !== null) this.predictor?.push({ seq, target });
        } else {
            const seq = context.room.stop();
            if (seq !== null) this.predictor?.push({ seq, dir: { x: 0, y: 0 } });
        }
    }

    tick(dt: number, context: GameplayContext<MmoWorldRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (!Number.isFinite(dt) || dt < 0) return;
        this.nowMs += dt * 1000;
        this.predictor?.tick(dt * 1000);
        this.presentation?.render(this.model());
    }

    stop(_reason: GameplayStopReason): void {
        const pending = this.pendingTransfer;
        this.pendingTransfer = null;
        this.teardown();
        if (pending && this.onTransfer) {
            try { this.onTransfer(pending, this.selfCharacterId); } catch (error) { console.error("[mmoWorld] onTransfer 失败：", error); }
        }
    }

    /** 职业模板按**当前地图所在的包**解析（与服务端准入同源：`contentFor(mapId).classById`）；⛔ classOf 的「贡献包优先」——多包并存时别的包会盖住本图的职业（MG0 发现）。 */
    private classTemplate(classId: string): IClassTemplate | null {
        const mapId = this.context?.room.mapId;
        return mapId === undefined ? null : packForMap(mapId)?.classById.get(classId) ?? null;
    }

    /** 职业技能栏（本人实体的 templateId = classId）。 */
    private spellBar(): readonly string[] {
        const self = [...this.entities.values()].find((entity) => this.isSelf(entity));
        return self ? this.classTemplate(self.templateId)?.spells ?? [] : [];
    }

    /** 施法：目标 = 已选目标，否则视野内最近存活怪（本人预测位置起、按视距）；本地冷却未就绪只提示不发。 */
    private requestCast(context: GameplayContext<MmoWorldRoom>, spellId: string): void {
        if (!this.cooldowns.isReady(spellId, this.nowMs)) { this.notice = "冷却中"; return; }
        const selfEntity = [...this.entities.values()].find((entity) => this.isSelf(entity)) ?? null;
        const self = this.predictor?.position() ?? selfEntity;
        const map = mapDefOf(context.room.mapId);
        let targetId = this.targetId !== null && this.entities.has(this.targetId) ? this.targetId : null;
        if (targetId === null && self) {
            const picked = pickHostileTarget(this.entities.values(), self, map?.aoi.viewRadius ?? 400);
            if (picked) { targetId = picked.id; this.targetId = picked.id; context.room.target(picked.id); }
        }
        const seq = context.room.cast(spellId, targetId ?? undefined);
        this.notice = seq === null ? "施法未发出" : `施法：${spellId}`;
    }

    /** 拾取：拾取半径内最近的掉落（本人取预测位置）；没有 ⇒ 提示不发。 */
    private requestPickup(context: GameplayContext<MmoWorldRoom>): void {
        const self = this.predictor?.position() ?? [...this.entities.values()].find((entity) => this.isSelf(entity)) ?? null;
        if (!self) { this.notice = "尚未进入世界"; return; }
        const drop = nearestLoot(this.entities.values(), self, MMO_PICKUP_RADIUS);
        if (!drop) { this.notice = "附近没有掉落"; return; }
        this.notice = context.room.pickup(drop.id) === null ? "拾取未发出" : `拾取：${drop.name}`;
    }

    /** 传送：本人（预测位置）在某个传送门半径内才发；否则提示。 */
    private requestTransfer(context: GameplayContext<MmoWorldRoom>): void {
        const map = mapDefOf(context.room.mapId);
        const self = this.predictor?.position() ?? [...this.entities.values()].find((entity) => this.isSelf(entity)) ?? null;
        const portal = map && self ? map.portals.find((entry) => withinRadius(self, entry.pos, entry.radius)) ?? null : null;
        if (!portal) { this.notice = "不在传送门范围内"; return; }
        this.notice = context.room.transfer(portal.portalId) === null ? "传送请求未发出" : `传送：${portal.portalId}`;
    }

    dispose(): void {
        this.disposed = true;
        this.teardown();
    }

    /** 当前视图模型（View 只读它渲染）。 */
    model(): MmoWorldViewModel {
        const mapId = this.context?.room.mapId ?? "";
        const map = mapDefOf(mapId);
        const predicted = this.predictor?.position() ?? null;
        const views = [...this.entities.values()]
            .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
            .map((entity) => {
                const isSelf = this.isSelf(entity);
                // 本人位置取本地预测（回执按 seq 和解），他人位置取视野流
                const pos = isSelf && predicted ? predicted : entity;
                return {
                    id: entity.id, kind: entity.kind, name: entity.name, x: pos.x, y: pos.y, hp: entity.hp, hpMax: entity.hpMax, level: entity.level,
                    factionId: entity.factionId ?? null, count: entity.count ?? null, isSelf, presentation: presentationOf(entity.templateId),
                };
            });
        return {
            mapId,
            mapSize: map ? map.size : { w: 0, h: 0 },
            self: views.find((view) => view.isSelf) ?? null,
            entities: views,
            hp: this.privateState.hp,
            hpMax: this.privateState.hpMax,
            mp: this.privateState.mp,
            mpMax: this.privateState.mpMax,
            synced: this.synced,
            dropping: this.context?.room.dropping ?? false,
            notice: this.notice,
            chat: this.chatLog,
            targetId: this.targetId !== null && this.entities.has(this.targetId) ? this.targetId : null,
            spells: this.spellBar(),
            cooldowns: this.cooldowns.snapshot(this.nowMs),
            casting: this.privateState.casting,
            bag: this.privateState.bag,
            bagSummary: describeBag(this.privateState.bag),
        };
    }

    /** 本人实体首次出现：按职业模板（templateId = classId）速度与地图碰撞网格建预测器；职业 / 地图未知 ⇒ 不预测（位置取视野流）。 */
    private createPredictor(snapshot: ReadonlyMap<string, IMmoEntityWire>, mapId: string): MovementPredictor | null {
        const self = [...snapshot.values()].find((entity) => this.isSelf(entity));
        const map = mapDefOf(mapId);
        const klass = self ? packForMap(mapId)?.classById.get(self.templateId) ?? null : null;
        if (!self || !map || !klass) return null;
        let grid = null;
        try { grid = parseCollisionGrid(map.collision ?? null, map.size); } catch { grid = null; }
        return new MovementPredictor({ x: self.x, y: self.y }, { speedPerSec: klass.speedPerSec, size: map.size, grid });
    }

    private isSelf(entity: IMmoEntityWire): boolean {
        return this.selfCharacterId !== null && entity.id === `char:${this.selfCharacterId}`;
    }

    private requestExit(reason: "user-exit" | "settled"): void {
        if (this.exitRequested || !this.host) return;
        this.exitRequested = true;
        void this.host.requestExit(reason).catch((error) => {
            console.error(`[mmoWorld] requestExit(${reason}) 失败：`, error);
        });
    }

    private teardown(): void {
        if (!this.started && !this.presentation) return;
        this.started = false;
        try { this.unobserve?.(); } catch (error) { console.error("[mmoWorld] 解除房间观察失败", error); }
        this.unobserve = null;
        try { this.presentation?.unmount(); } catch (error) { console.error("[mmoWorld] presentation.unmount 失败", error); }
        this.presentation = null;
        this.context = null;
        this.entities = new Map();
        this.synced = false;
        this.predictor = null;
        this.dead = false;
        this.respawnPosition = null;
        this.chatLog = [];
        this.targetId = null;
    }
}

export function createMmoWorldGameplay(options: MmoWorldGameplayOptions = {}): MmoWorldGameplay {
    return new MmoWorldGameplay(options);
}
