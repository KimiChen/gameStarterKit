/**
 * arenaDuel 客户端玩法插件（kits/arena 的决斗 mode；纯 TS，无头单测）：strike → room.strike()；
 * 观察房间快照维护本地视图模型；结算后展示 2 秒经 host.requestExit("settled") 回大厅；「离开」经 host.requestExit("user-exit")。
 * 渲染归 ../../../view/rooms/arenaDuel/ArenaDuelView.ts；⛔ 不 import cc（铁律 9）。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import type { GameplayInstanceHost } from "../../gameplay/GameplayModule";
import { GamePhase, GameplayModeId, type GamePhaseType } from "../../../shared/index";

export const ARENA_DUEL_GAMEPLAY_ID = GameplayModeId.ArenaDuel;
/** 结算画面停留时长（秒），之后自动回大厅。 */
export const ARENA_DUEL_SETTLE_LINGER_SECONDS = 2;

export type ArenaDuelInput = { readonly type: "strike" } | { readonly type: "leave" };

/** 房间快照观察者：net 层把 Schema 变化翻译成这几个回调，逻辑层不认识 Colyseus。 */
export interface ArenaDuelRoomObserver {
    addPlayer(id: string, name: string, hits: number, isSelf: boolean): void;
    changePlayer(id: string, hits: number): void;
    removePlayer(id: string): void;
    root(phase: GamePhaseType, hp: number, winnerId: string): void;
}

export interface ArenaDuelRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly dropping: boolean;
    strike(): void;
    observe(observer: ArenaDuelRoomObserver): () => void;
}

export interface ArenaDuelPlayerView {
    readonly id: string;
    readonly name: string;
    readonly hits: number;
    readonly isSelf: boolean;
}

export interface ArenaDuelViewModel {
    readonly phase: GamePhaseType;
    readonly hp: number;
    readonly selfHits: number;
    /** 对手（最多一人）的已命中数；没有对手为 null。 */
    readonly opponentHits: number | null;
    /** 按 hits 降序、同分按名字。 */
    readonly players: readonly ArenaDuelPlayerView[];
    readonly winnerName: string | null;
    readonly selfWon: boolean;
    /** 结算画面剩余停留秒数（未结算为 null）。 */
    readonly lingerLeft: number | null;
}

export interface ArenaDuelPresentation {
    mount(): void;
    render(model: ArenaDuelViewModel): void;
    unmount(): void;
}

export interface ArenaDuelGameplayOptions {
    readonly host?: GameplayInstanceHost<ArenaDuelInput>;
    readonly presentation?: ArenaDuelPresentation;
    readonly presentationFactory?: () => ArenaDuelPresentation | undefined | Promise<ArenaDuelPresentation | undefined>;
}

export class ArenaDuelGameplay implements GameplayPlugin<ArenaDuelRoom, ArenaDuelInput> {
    readonly id = ARENA_DUEL_GAMEPLAY_ID;

    private readonly host: GameplayInstanceHost<ArenaDuelInput> | null;
    private readonly presentationFactory: () => ArenaDuelPresentation | undefined | Promise<ArenaDuelPresentation | undefined>;
    private presentation: ArenaDuelPresentation | null = null;
    private context: GameplayContext<ArenaDuelRoom> | null = null;
    private unobserve: (() => void) | null = null;
    private started = false;
    private disposed = false;
    private exitRequested = false;
    private linger = 0;

    private phase: GamePhaseType = GamePhase.Waiting;
    private hp = 0;
    private winnerId = "";
    private readonly players = new Map<string, { name: string; hits: number; isSelf: boolean }>();

    constructor(options: ArenaDuelGameplayOptions = {}) {
        this.host = options.host ?? null;
        this.presentationFactory = options.presentationFactory ?? (() => options.presentation);
    }

    async start(context: GameplayContext<ArenaDuelRoom>): Promise<void> {
        if (this.started || this.disposed) return;
        const presentation = await this.presentationFactory();
        if (!presentation || typeof presentation.mount !== "function" || typeof presentation.render !== "function"
            || typeof presentation.unmount !== "function") {
            throw new TypeError("[arenaDuel] 需要有效的 presentation adapter");
        }
        this.started = true;
        this.context = context;
        this.presentation = presentation;
        try {
            presentation.mount();
            const active = () => this.started && this.context === context && context.isActive();
            this.unobserve = context.room.observe({
                addPlayer: (id, name, hits, isSelf) => { if (active()) this.players.set(id, { name, hits, isSelf }); },
                changePlayer: (id, hits) => {
                    const player = this.players.get(id);
                    if (active() && player) player.hits = hits;
                },
                removePlayer: (id) => { if (active()) this.players.delete(id); },
                root: (phase, hp, winnerId) => {
                    if (!active()) return;
                    if (this.phase !== GamePhase.Settle && phase === GamePhase.Settle) this.linger = ARENA_DUEL_SETTLE_LINGER_SECONDS;
                    this.phase = phase;
                    this.hp = hp;
                    this.winnerId = winnerId;
                },
            });
            presentation.render(this.model());
        } catch (error) {
            this.teardown();
            throw error;
        }
    }

    handleInput(input: ArenaDuelInput, context: GameplayContext<ArenaDuelRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (input.type === "leave") {
            this.requestExit("user-exit");
            return;
        }
        if (input.type === "strike" && this.phase === GamePhase.Playing && !context.room.dropping) context.room.strike();
    }

    tick(dt: number, context: GameplayContext<ArenaDuelRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (!Number.isFinite(dt) || dt < 0) return;
        if (this.phase === GamePhase.Settle && this.linger > 0) {
            this.linger = Math.max(0, this.linger - dt);
            if (this.linger === 0) this.requestExit("settled");
        }
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
    model(): ArenaDuelViewModel {
        const entries = [...this.players.entries()].map(([id, player]) => ({ id, ...player }));
        const self = entries.find((player) => player.isSelf);
        const opponent = entries.find((player) => !player.isSelf);
        const players = [...entries]
            .sort((left, right) => right.hits - left.hits || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        const winner = this.winnerId ? this.players.get(this.winnerId) ?? null : null;
        return {
            phase: this.phase,
            hp: this.hp,
            selfHits: self?.hits ?? 0,
            opponentHits: opponent ? opponent.hits : null,
            players,
            winnerName: winner ? winner.name : (this.winnerId ? this.winnerId : null),
            selfWon: this.winnerId !== "" && this.winnerId === this.context?.room.sessionId,
            lingerLeft: this.phase === GamePhase.Settle ? this.linger : null,
        };
    }

    private requestExit(reason: "user-exit" | "settled"): void {
        if (this.exitRequested || !this.host) return;
        this.exitRequested = true;
        void this.host.requestExit(reason).catch((error) => {
            console.error(`[arenaDuel] requestExit(${reason}) 失败：`, error);
        });
    }

    private teardown(): void {
        if (!this.started && !this.presentation) return;
        this.started = false;
        try { this.unobserve?.(); } catch (error) { console.error("[arenaDuel] 解除房间观察失败", error); }
        this.unobserve = null;
        try { this.presentation?.unmount(); } catch (error) { console.error("[arenaDuel] presentation.unmount 失败", error); }
        this.presentation = null;
        this.context = null;
        this.players.clear();
    }
}

export function createArenaDuelGameplay(options: ArenaDuelGameplayOptions = {}): ArenaDuelGameplay {
    return new ArenaDuelGameplay(options);
}
