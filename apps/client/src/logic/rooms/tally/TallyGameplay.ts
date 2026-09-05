/**
 * tally 客户端玩法插件（纯 TS，无头单测）：tap → room.tap()；观察房间快照维护本地视图模型；
 * 结算后展示 2 秒经 host.requestExit("settled") 回大厅；「离开」经 host.requestExit("user-exit")。
 * 渲染归 ../../../view/rooms/tally/TallyView.ts；⛔ 不 import cc（铁律 9）。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import type { GameplayInstanceHost } from "../../gameplay/GameplayModule";
import { GamePhase, GameplayModeId, type GamePhaseType } from "../../../shared/index";

export const TALLY_GAMEPLAY_ID = GameplayModeId.Tally;
/** 结算画面停留时长（秒），之后自动回大厅。 */
export const TALLY_SETTLE_LINGER_SECONDS = 2;

export type TallyInput = { readonly type: "tap" } | { readonly type: "leave" };

/** 房间快照观察者：net 层把 Schema 变化翻译成这几个回调，逻辑层不认识 Colyseus。 */
export interface TallyRoomObserver {
    addPlayer(id: string, name: string, taps: number, isSelf: boolean): void;
    changePlayer(id: string, taps: number): void;
    removePlayer(id: string): void;
    root(phase: GamePhaseType, tapGoal: number, winnerId: string): void;
}

export interface TallyRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly dropping: boolean;
    tap(): void;
    observe(observer: TallyRoomObserver): () => void;
}

export interface TallyPlayerView {
    readonly id: string;
    readonly name: string;
    readonly taps: number;
    readonly isSelf: boolean;
}

export interface TallyViewModel {
    readonly phase: GamePhaseType;
    readonly tapGoal: number;
    readonly selfTaps: number;
    /** 按 taps 降序、同分按名字。 */
    readonly players: readonly TallyPlayerView[];
    readonly winnerName: string | null;
    readonly selfWon: boolean;
    /** 结算画面剩余停留秒数（未结算为 null）。 */
    readonly lingerLeft: number | null;
}

export interface TallyPresentation {
    mount(): void;
    render(model: TallyViewModel): void;
    unmount(): void;
}

export interface TallyGameplayOptions {
    readonly host?: GameplayInstanceHost<TallyInput>;
    readonly presentation?: TallyPresentation;
    readonly presentationFactory?: () => TallyPresentation | undefined | Promise<TallyPresentation | undefined>;
}

export class TallyGameplay implements GameplayPlugin<TallyRoom, TallyInput> {
    readonly id = TALLY_GAMEPLAY_ID;

    private readonly host: GameplayInstanceHost<TallyInput> | null;
    private readonly presentationFactory: () => TallyPresentation | undefined | Promise<TallyPresentation | undefined>;
    private presentation: TallyPresentation | null = null;
    private context: GameplayContext<TallyRoom> | null = null;
    private unobserve: (() => void) | null = null;
    private started = false;
    private disposed = false;
    private exitRequested = false;
    private linger = 0;

    private phase: GamePhaseType = GamePhase.Waiting;
    private tapGoal = 0;
    private winnerId = "";
    private readonly players = new Map<string, { name: string; taps: number; isSelf: boolean }>();

    constructor(options: TallyGameplayOptions = {}) {
        this.host = options.host ?? null;
        this.presentationFactory = options.presentationFactory ?? (() => options.presentation);
    }

    async start(context: GameplayContext<TallyRoom>): Promise<void> {
        if (this.started || this.disposed) return;
        const presentation = await this.presentationFactory();
        if (!presentation || typeof presentation.mount !== "function" || typeof presentation.render !== "function"
            || typeof presentation.unmount !== "function") {
            throw new TypeError("[tally] 需要有效的 presentation adapter");
        }
        this.started = true;
        this.context = context;
        this.presentation = presentation;
        try {
            presentation.mount();
            const active = () => this.started && this.context === context && context.isActive();
            this.unobserve = context.room.observe({
                addPlayer: (id, name, taps, isSelf) => { if (active()) this.players.set(id, { name, taps, isSelf }); },
                changePlayer: (id, taps) => {
                    const player = this.players.get(id);
                    if (active() && player) player.taps = taps;
                },
                removePlayer: (id) => { if (active()) this.players.delete(id); },
                root: (phase, tapGoal, winnerId) => {
                    if (!active()) return;
                    if (this.phase !== GamePhase.Settle && phase === GamePhase.Settle) this.linger = TALLY_SETTLE_LINGER_SECONDS;
                    this.phase = phase;
                    this.tapGoal = tapGoal;
                    this.winnerId = winnerId;
                },
            });
            presentation.render(this.model());
        } catch (error) {
            this.teardown();
            throw error;
        }
    }

    handleInput(input: TallyInput, context: GameplayContext<TallyRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (input.type === "leave") {
            this.requestExit("user-exit");
            return;
        }
        if (input.type === "tap" && this.phase === GamePhase.Playing && !context.room.dropping) context.room.tap();
    }

    tick(dt: number, context: GameplayContext<TallyRoom>): void {
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
    model(): TallyViewModel {
        const self = [...this.players.values()].find((player) => player.isSelf);
        const players = [...this.players.entries()]
            .map(([id, player]) => ({ id, ...player }))
            .sort((left, right) => right.taps - left.taps || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        const winner = this.winnerId ? this.players.get(this.winnerId) ?? null : null;
        return {
            phase: this.phase,
            tapGoal: this.tapGoal,
            selfTaps: self?.taps ?? 0,
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
            console.error(`[tally] requestExit(${reason}) 失败：`, error);
        });
    }

    private teardown(): void {
        if (!this.started && !this.presentation) return;
        this.started = false;
        try { this.unobserve?.(); } catch (error) { console.error("[tally] 解除房间观察失败", error); }
        this.unobserve = null;
        try { this.presentation?.unmount(); } catch (error) { console.error("[tally] presentation.unmount 失败", error); }
        this.presentation = null;
        this.context = null;
        this.players.clear();
    }
}

export function createTallyGameplay(options: TallyGameplayOptions = {}): TallyGameplay {
    return new TallyGameplay(options);
}
