/**
 * arenaCapture 客户端玩法插件（kits/arena 的占领赛 mode；纯 TS，无头单测）：capture → room.capture()；
 * 观察房间快照维护本地视图模型；结算后展示 2 秒经 host.requestExit("settled") 回大厅；「离开」经 host.requestExit("user-exit")。
 * 渲染归 ../../../view/rooms/arenaCapture/ArenaCaptureView.ts；⛔ 不 import cc（铁律 9）。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import type { GameplayInstanceHost } from "../../gameplay/GameplayModule";
import { GamePhase, GameplayModeId, type GamePhaseType } from "../../../shared/index";

export const ARENA_CAPTURE_GAMEPLAY_ID = GameplayModeId.ArenaCapture;
/** 结算画面停留时长（秒），之后自动回大厅。 */
export const ARENA_CAPTURE_SETTLE_LINGER_SECONDS = 2;

export type ArenaCaptureInput = { readonly type: "capture" } | { readonly type: "leave" };

/** 房间快照观察者：net 层把 Schema 变化翻译成这几个回调，逻辑层不认识 Colyseus。 */
export interface ArenaCaptureRoomObserver {
    addPlayer(id: string, name: string, captures: number, isSelf: boolean): void;
    changePlayer(id: string, captures: number): void;
    removePlayer(id: string): void;
    root(phase: GamePhaseType, captureGoal: number, winnerId: string): void;
}

export interface ArenaCaptureRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly dropping: boolean;
    capture(): void;
    observe(observer: ArenaCaptureRoomObserver): () => void;
}

export interface ArenaCapturePlayerView {
    readonly id: string;
    readonly name: string;
    readonly captures: number;
    readonly isSelf: boolean;
}

export interface ArenaCaptureViewModel {
    readonly phase: GamePhaseType;
    readonly captureGoal: number;
    readonly selfCaptures: number;
    /** 按 captures 降序、同分按名字。 */
    readonly players: readonly ArenaCapturePlayerView[];
    readonly winnerName: string | null;
    readonly selfWon: boolean;
    /** 结算画面剩余停留秒数（未结算为 null）。 */
    readonly lingerLeft: number | null;
}

export interface ArenaCapturePresentation {
    mount(): void;
    render(model: ArenaCaptureViewModel): void;
    unmount(): void;
}

export interface ArenaCaptureGameplayOptions {
    readonly host?: GameplayInstanceHost<ArenaCaptureInput>;
    readonly presentation?: ArenaCapturePresentation;
    readonly presentationFactory?: () => ArenaCapturePresentation | undefined | Promise<ArenaCapturePresentation | undefined>;
}

export class ArenaCaptureGameplay implements GameplayPlugin<ArenaCaptureRoom, ArenaCaptureInput> {
    readonly id = ARENA_CAPTURE_GAMEPLAY_ID;

    private readonly host: GameplayInstanceHost<ArenaCaptureInput> | null;
    private readonly presentationFactory: () => ArenaCapturePresentation | undefined | Promise<ArenaCapturePresentation | undefined>;
    private presentation: ArenaCapturePresentation | null = null;
    private context: GameplayContext<ArenaCaptureRoom> | null = null;
    private unobserve: (() => void) | null = null;
    private started = false;
    private disposed = false;
    private exitRequested = false;
    private linger = 0;

    private phase: GamePhaseType = GamePhase.Waiting;
    private captureGoal = 0;
    private winnerId = "";
    private readonly players = new Map<string, { name: string; captures: number; isSelf: boolean }>();

    constructor(options: ArenaCaptureGameplayOptions = {}) {
        this.host = options.host ?? null;
        this.presentationFactory = options.presentationFactory ?? (() => options.presentation);
    }

    async start(context: GameplayContext<ArenaCaptureRoom>): Promise<void> {
        if (this.started || this.disposed) return;
        const presentation = await this.presentationFactory();
        if (!presentation || typeof presentation.mount !== "function" || typeof presentation.render !== "function"
            || typeof presentation.unmount !== "function") {
            throw new TypeError("[arenaCapture] 需要有效的 presentation adapter");
        }
        this.started = true;
        this.context = context;
        this.presentation = presentation;
        try {
            presentation.mount();
            const active = () => this.started && this.context === context && context.isActive();
            this.unobserve = context.room.observe({
                addPlayer: (id, name, captures, isSelf) => { if (active()) this.players.set(id, { name, captures, isSelf }); },
                changePlayer: (id, captures) => {
                    const player = this.players.get(id);
                    if (active() && player) player.captures = captures;
                },
                removePlayer: (id) => { if (active()) this.players.delete(id); },
                root: (phase, captureGoal, winnerId) => {
                    if (!active()) return;
                    if (this.phase !== GamePhase.Settle && phase === GamePhase.Settle) this.linger = ARENA_CAPTURE_SETTLE_LINGER_SECONDS;
                    this.phase = phase;
                    this.captureGoal = captureGoal;
                    this.winnerId = winnerId;
                },
            });
            presentation.render(this.model());
        } catch (error) {
            this.teardown();
            throw error;
        }
    }

    handleInput(input: ArenaCaptureInput, context: GameplayContext<ArenaCaptureRoom>): void {
        if (!this.started || this.context !== context || !context.isActive()) return;
        if (input.type === "leave") {
            this.requestExit("user-exit");
            return;
        }
        if (input.type === "capture" && this.phase === GamePhase.Playing && !context.room.dropping) context.room.capture();
    }

    tick(dt: number, context: GameplayContext<ArenaCaptureRoom>): void {
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
    model(): ArenaCaptureViewModel {
        const self = [...this.players.values()].find((player) => player.isSelf);
        const players = [...this.players.entries()]
            .map(([id, player]) => ({ id, ...player }))
            .sort((left, right) => right.captures - left.captures || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        const winner = this.winnerId ? this.players.get(this.winnerId) ?? null : null;
        return {
            phase: this.phase,
            captureGoal: this.captureGoal,
            selfCaptures: self?.captures ?? 0,
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
            console.error(`[arenaCapture] requestExit(${reason}) 失败：`, error);
        });
    }

    private teardown(): void {
        if (!this.started && !this.presentation) return;
        this.started = false;
        try { this.unobserve?.(); } catch (error) { console.error("[arenaCapture] 解除房间观察失败", error); }
        this.unobserve = null;
        try { this.presentation?.unmount(); } catch (error) { console.error("[arenaCapture] presentation.unmount 失败", error); }
        this.presentation = null;
        this.context = null;
        this.players.clear();
    }
}

export function createArenaCaptureGameplay(options: ArenaCaptureGameplayOptions = {}): ArenaCaptureGameplay {
    return new ArenaCaptureGameplay(options);
}
