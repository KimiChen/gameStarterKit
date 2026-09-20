/**
 * mmoWorld 客户端玩法插件（kits/mmo 的世界形态玩法；纯 TS，无头单测）：观察世界房句柄维护本地实体表 / 本人私有态 → 视图模型；
 * 输入：方向意图 / 点地 / 停 / 传送（最近的传送门，MK1-B3）/ 离开（⛔ 客户端不上报坐标；本人位置取 movement 面本地预测）。
 * 两图交接：`transferReady` 回执（凭据只此一处）⇒ 记下并请求退出，stop 时把凭据交给 `onTransfer`（mode 模块带参重进目标图）。
 * 渲染归 ../../../view/rooms/mmoWorld/MmoWorldView.ts；⛔ 不 import cc（铁律 9）。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import type { GameplayInstanceHost } from "../../gameplay/GameplayModule";
import type { IMmoEntityWire, IMmoWorldOpResult, IMmoWorldPos, IMmoWorldTransferReady } from "../../../shared/index";
import { withinRadius, type MmoPrivateState } from "../../../kits/mmo/api/world/index";
import { MovementPredictor, normalizeDir, parseCollisionGrid } from "../../../kits/mmo/api/movement/index";
import { classOf, mapDefOf, presentationOf, type IPresentationEntry } from "../../../kits/mmo/api/content/index";

export const MMO_WORLD_GAMEPLAY_ID = "mmoWorld";

export type MmoWorldInput =
    | { readonly type: "move"; readonly dir: { readonly x: number; readonly y: number } }
    | { readonly type: "moveTo"; readonly x: number; readonly y: number }
    | { readonly type: "stop" }
    /** 走最近的传送门（本人在其半径内才发） */
    | { readonly type: "transfer" }
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
    resync(reason: string | null): void;
    dropped(): void;
    reconnected(): void;
    left(kind: string): void;
}

export interface MmoWorldRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly mapId: string;
    readonly current: boolean;
    readonly dropping: boolean;
    /** 发出意图；返回它的 seq（掉线 / 已离开拒发 ⇒ null） */
    move(dir: { readonly x: number; readonly y: number }): number | null;
    moveTo(target: { readonly x: number; readonly y: number }): number | null;
    stop(): number | null;
    /** 发起交接（portalId）；返回 clientReqId（拒发 ⇒ null） */
    transfer(portalId: string): string | null;
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
    /** 本人实体判定（缺省：kind character 且 id 以 `char:` 开头的第一个；MK1 随 join 回执带 characterId 后精确匹配）。 */
    readonly selfCharacterId?: string;
    /** 交接就绪后（本局 stop 时）交出凭据：mode 模块据此带参重进目标图。 */
    readonly onTransfer?: (ready: IMmoWorldTransferReady) => void;
}

export class MmoWorldGameplay implements GameplayPlugin<MmoWorldRoom, MmoWorldInput> {
    readonly id = MMO_WORLD_GAMEPLAY_ID;

    private readonly host: GameplayInstanceHost<MmoWorldInput> | null;
    private readonly presentationFactory: () => MmoWorldPresentation | undefined | Promise<MmoWorldPresentation | undefined>;
    private readonly selfCharacterId: string | null;
    private readonly onTransfer: ((ready: IMmoWorldTransferReady) => void) | null;
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
    private privateState: MmoPrivateState = { hp: 0, hpMax: 1, mp: 0, mpMax: 0 };
    private notice = "";

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
                    if (this.predictor === null) this.predictor = this.createPredictor(snapshot, context.room.mapId);
                },
                pos: (payload) => { if (active()) this.predictor?.reconcile(payload); },
                transferReady: (payload) => {
                    if (!active()) return;
                    // 凭据只此一处：记下 → 退出本局 → stop 时交给 onTransfer 带参重进目标图（源房随后被服务端以 transferred 离座）
                    this.pendingTransfer = payload;
                    this.notice = "传送中…";
                    this.requestExit("settled");
                },
                privateState: (state) => { if (active()) this.privateState = state; },
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
        if (input.type === "transfer") { this.requestTransfer(context); return; }
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
        this.predictor?.tick(dt * 1000);
        this.presentation?.render(this.model());
    }

    stop(_reason: GameplayStopReason): void {
        const pending = this.pendingTransfer;
        this.pendingTransfer = null;
        this.teardown();
        if (pending && this.onTransfer) {
            try { this.onTransfer(pending); } catch (error) { console.error("[mmoWorld] onTransfer 失败：", error); }
        }
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
                    factionId: entity.factionId ?? null, isSelf, presentation: presentationOf(entity.templateId),
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
        };
    }

    /** 本人实体首次出现：按职业模板（templateId = classId）速度与地图碰撞网格建预测器；职业 / 地图未知 ⇒ 不预测（位置取视野流）。 */
    private createPredictor(snapshot: ReadonlyMap<string, IMmoEntityWire>, mapId: string): MovementPredictor | null {
        const self = [...snapshot.values()].find((entity) => this.isSelf(entity));
        const map = mapDefOf(mapId);
        const klass = self ? classOf(self.templateId) : null;
        if (!self || !map || !klass) return null;
        let grid = null;
        try { grid = parseCollisionGrid(map.collision ?? null, map.size); } catch { grid = null; }
        return new MovementPredictor({ x: self.x, y: self.y }, { speedPerSec: klass.speedPerSec, size: map.size, grid });
    }

    private isSelf(entity: IMmoEntityWire): boolean {
        if (this.selfCharacterId !== null) return entity.id === `char:${this.selfCharacterId}`;
        return entity.kind === "character" && entity.id.startsWith("char:");
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
    }
}

export function createMmoWorldGameplay(options: MmoWorldGameplayOptions = {}): MmoWorldGameplay {
    return new MmoWorldGameplay(options);
}
