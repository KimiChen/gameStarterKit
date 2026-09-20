/**
 * mmoWorld 客户端玩法插件（kits/mmo 的世界形态玩法；纯 TS，无头单测）：观察世界房句柄维护本地实体表 / 本人私有态 → 视图模型；
 * 输入：方向意图 / 点地 / 停 / 离开（⛔ 客户端不上报坐标，位置以服务端 update 为准；本地预测归 MK1 movement 面）。
 * 渲染归 ../../../view/rooms/mmoWorld/MmoWorldView.ts；⛔ 不 import cc（铁律 9）。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import type { GameplayInstanceHost } from "../../gameplay/GameplayModule";
import type { IMmoEntityWire, IMmoWorldOpResult } from "../../../shared/index";
import type { MmoPrivateState } from "../../../kits/mmo/api/world/index";
import { mapDefOf, presentationOf, type IPresentationEntry } from "../../../kits/mmo/api/content/index";

export const MMO_WORLD_GAMEPLAY_ID = "mmoWorld";

export type MmoWorldInput =
    | { readonly type: "move"; readonly dir: { readonly x: number; readonly y: number } }
    | { readonly type: "moveTo"; readonly x: number; readonly y: number }
    | { readonly type: "stop" }
    | { readonly type: "leave" };

/** 世界房句柄观察者：net 层把观察者流 / 私有流 / 回执 / 连接事件翻译成这几个回调，逻辑层不认识 Colyseus。 */
export interface MmoWorldRoomObserver {
    entities(snapshot: ReadonlyMap<string, IMmoEntityWire>, synced: boolean): void;
    privateState(state: MmoPrivateState): void;
    opResult(result: IMmoWorldOpResult): void;
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
    move(dir: { readonly x: number; readonly y: number }): boolean;
    moveTo(target: { readonly x: number; readonly y: number }): boolean;
    stop(): boolean;
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
}

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export class MmoWorldGameplay implements GameplayPlugin<MmoWorldRoom, MmoWorldInput> {
    readonly id = MMO_WORLD_GAMEPLAY_ID;

    private readonly host: GameplayInstanceHost<MmoWorldInput> | null;
    private readonly presentationFactory: () => MmoWorldPresentation | undefined | Promise<MmoWorldPresentation | undefined>;
    private readonly selfCharacterId: string | null;
    private presentation: MmoWorldPresentation | null = null;
    private context: GameplayContext<MmoWorldRoom> | null = null;
    private unobserve: (() => void) | null = null;
    private started = false;
    private disposed = false;
    private exitRequested = false;

    private entities: ReadonlyMap<string, IMmoEntityWire> = new Map();
    private synced = false;
    private privateState: MmoPrivateState = { hp: 0, hpMax: 1, mp: 0, mpMax: 0 };
    private notice = "";

    constructor(options: MmoWorldGameplayOptions = {}) {
        this.host = options.host ?? null;
        this.presentationFactory = options.presentationFactory ?? (() => options.presentation);
        this.selfCharacterId = options.selfCharacterId ?? null;
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
                entities: (snapshot, synced) => { if (active()) { this.entities = snapshot; this.synced = synced; } },
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
        if (input.type === "move") context.room.move({ x: clampNumber(input.dir.x, -1, 1), y: clampNumber(input.dir.y, -1, 1) });
        else if (input.type === "moveTo") context.room.moveTo({ x: Math.max(0, input.x), y: Math.max(0, input.y) });
        else context.room.stop();
    }

    tick(dt: number, context: GameplayContext<MmoWorldRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (!Number.isFinite(dt) || dt < 0) return;
        this.presentation?.render(this.model());
    }

    stop(_reason: GameplayStopReason): void {
        this.teardown();
    }

    dispose(): void {
        this.disposed = true;
        this.teardown();
    }

    /** 当前视图模型（View 只读它渲染）。 */
    model(): MmoWorldViewModel {
        const mapId = this.context?.room.mapId ?? "";
        const map = mapDefOf(mapId);
        const views = [...this.entities.values()]
            .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
            .map((entity) => ({
                id: entity.id, kind: entity.kind, name: entity.name, x: entity.x, y: entity.y, hp: entity.hp, hpMax: entity.hpMax, level: entity.level,
                isSelf: this.isSelf(entity), presentation: presentationOf(entity.templateId),
            }));
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
    }
}

export function createMmoWorldGameplay(options: MmoWorldGameplayOptions = {}): MmoWorldGameplay {
    return new MmoWorldGameplay(options);
}
