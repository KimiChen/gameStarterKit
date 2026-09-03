/** Snake Endless V2 客户端生命周期；网络与 Cocos 都经注入 port。 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay/index";
import {
    GamePhase,
    SnakeRunState,
    type ISnakeBaselineBegin,
    type ISnakeBaselineChunk,
    type ISnakeBaselineEnd,
    type ISnakeReliveDecisionResult,
    type ISnakeReliveOffered,
    type ISnakeReliveResolved,
    type ISnakePlayerState,
    type ISnakeRoomState,
    type ISnakeRunFinalizing,
    type ISnakeRunResultV1,
    type ISnakeWorldDelta,
} from "../../../shared/index";
import {
    SnakeHandednessPreference,
    type HandednessPreferencePort,
    type SnakeHandedness,
} from "./SnakeControls";
import {
    deriveSnakeHud,
    deriveSnakePersonalResult,
    deriveSnakeRelive,
    type SnakePersonalResultModel,
    type SnakeReliveViewModel,
} from "./SnakeHud";
import { SnakeSnapshotBuffer, type SnakeRenderFrame } from "./SnakeSnapshotBuffer";

export const SNAKE_GAMEPLAY_ID = "snake";

export type SnakeInput =
    | { readonly type: "steer"; readonly dirX: number; readonly dirY: number; readonly boost: boolean }
    | { readonly type: "release-boost" }
    | { readonly type: "relive"; readonly decision: "accept" | "decline" }
    | { readonly type: "request-end-run" }
    | { readonly type: "cancel-end-run" }
    | { readonly type: "confirm-end-run" }
    | { readonly type: "set-handedness"; readonly value: SnakeHandedness };

export interface SnakePresentation {
    readonly handednessPreference: HandednessPreferencePort;
    mount(): void;
    render(frame: SnakeRenderFrame, hud: ReturnType<typeof deriveSnakeHud>, relive: SnakeReliveViewModel | null): void;
    showReliveNotice(message: ISnakeReliveOffered | ISnakeReliveDecisionResult | ISnakeReliveResolved): void;
    showRunFinalizing(message: ISnakeRunFinalizing): void;
    showRunResult(model: SnakePersonalResultModel): void;
    showEndRunConfirmation(visible: boolean): void;
    setHandedness(value: SnakeHandedness): void;
    cancelInput(): void;
    setReconnecting(reconnecting: boolean): void;
    unmount(): void;
}

export interface SnakeRoomLike {
    readonly roomId: string;
    readonly sessionId: string;
    readonly dropping: boolean;
    state(): ISnakeRoomState | null;
    onWelcome(callback: (message: { motd: string }) => void): () => void;
    onError(callback: (message: { code: number; message: string }) => void): () => void;
    onBaselineBegin(callback: (message: ISnakeBaselineBegin) => void): () => void;
    onBaselineChunk(callback: (message: ISnakeBaselineChunk) => void): () => void;
    onBaselineEnd(callback: (message: ISnakeBaselineEnd) => void): () => void;
    onDelta(callback: (message: ISnakeWorldDelta) => void): () => void;
    onReliveOffered(callback: (message: ISnakeReliveOffered) => void): () => void;
    onReliveDecisionResult(callback: (message: ISnakeReliveDecisionResult) => void): () => void;
    onReliveResolved(callback: (message: ISnakeReliveResolved) => void): () => void;
    onRunFinalizing(callback: (message: ISnakeRunFinalizing) => void): () => void;
    onRunResult(callback: (message: ISnakeRunResultV1) => void): () => void;
    onStateChange(callback: (state: ISnakeRoomState) => void): () => void;
    sendInput(dirX: number, dirY: number, boost: boolean): number;
    sendReliveDecision(payload: {
        readonly runId: string;
        readonly deathSeq: number;
        readonly clientReqId: string;
        readonly decision: "accept" | "decline";
    }): boolean;
    sendEndRun(runId: string, clientReqId: string): boolean;
    requestBaseline(roomEpochId: string, afterSeq: number): boolean;
    clearBoost(): void;
    ping(): void;
}

export interface SnakeGameplayOptions {
    readonly presentationFactory?: () => SnakePresentation | undefined | Promise<SnakePresentation | undefined>;
}

const PING_INTERVAL_SECONDS = 5;
const RENDER_LAG_TICKS = 2;

export class SnakeGameplay implements GameplayPlugin<SnakeRoomLike, SnakeInput> {
    readonly id = SNAKE_GAMEPLAY_ID;
    private readonly presentationFactory: () => SnakePresentation | undefined | Promise<SnakePresentation | undefined>;
    private presentation: SnakePresentation | null = null;
    private preference: SnakeHandednessPreference | null = null;
    private room: SnakeRoomLike | null = null;
    private context: GameplayContext<SnakeRoomLike> | null = null;
    private readonly buffer = new SnakeSnapshotBuffer();
    private started = false;
    private disposed = false;
    private tornDown = true;
    private presentationMounted = false;
    private reconnecting = false;
    private endRunConfirmation = false;
    private pingTimer = 0;
    private requestSeq = 0;
    private noticeRunId: string | null = null;
    private noticeDeathSeq = -1;
    private noticeStage = 0;
    private noticeStateVersion = 0;
    private readonly seenNotices = new Set<string>();
    private readonly completedResultRuns = new Set<string>();
    private readonly unsubscribers: Array<() => void> = [];

    constructor(options: SnakeGameplayOptions) {
        this.presentationFactory = options.presentationFactory ?? (() => undefined);
    }

    get snapshotBufferReady(): boolean { return this.buffer.ready; }

    async start(context: GameplayContext<SnakeRoomLike>): Promise<void> {
        if (this.started || this.disposed) return;
        const presentation = await this.presentationFactory();
        if (!presentation || typeof presentation.mount !== "function" || typeof presentation.render !== "function"
            || typeof presentation.showRunResult !== "function" || typeof presentation.cancelInput !== "function"
            || typeof presentation.unmount !== "function" || !presentation.handednessPreference) {
            throw new TypeError("[snake] 需要有效的 Endless V2 presentation adapter");
        }
        this.started = true;
        this.tornDown = false;
        this.room = context.room;
        this.context = context;
        this.presentation = presentation;
        this.preference = new SnakeHandednessPreference(presentation.handednessPreference, (message, error) => {
            console.warn(`[snake] ${message}`, error ?? "");
        });
        this.reconnecting = false;
        this.endRunConfirmation = false;
        try {
            const state = context.room.state();
            if (state?.roomEpochId) this.buffer.attach(state.roomEpochId);
            this.observeRunState(state?.players.get(context.room.sessionId));
            this.presentationMounted = true;
            presentation.mount();
            presentation.setHandedness(this.preference.load());
            const active = () => this.started && this.context === context && this.room === context.room && context.isActive();
            this.track(context.room.onWelcome((message) => { if (active()) console.log(`[snake] ${message.motd}`); }));
            this.track(context.room.onError((message) => {
                if (active()) console.warn(`[服务端错误] ${message.code}: ${message.message}`);
            }));
            this.track(context.room.onBaselineBegin((message) => {
                if (active() && !this.buffer.acceptBaselineBegin(message)) this.requestResync();
            }));
            this.track(context.room.onBaselineChunk((message) => {
                if (active() && !this.buffer.acceptBaselineChunk(message)) this.requestResync();
            }));
            this.track(context.room.onBaselineEnd((message) => {
                if (active() && !this.buffer.acceptBaselineEnd(message)) this.requestResync();
            }));
            this.track(context.room.onDelta((message) => {
                if (active() && !this.buffer.acceptDelta(message)) this.requestResync();
            }));
            this.track(context.room.onReliveOffered((message) => {
                if (!active() || !this.acceptReliveNotice("offered", message.runId, message.deathSeq, 1)) return;
                presentation.cancelInput();
                context.room.clearBoost();
                presentation.showReliveNotice(message);
            }));
            this.track(context.room.onReliveDecisionResult((message) => {
                if (active() && this.acceptReliveNotice(
                    `decision:${message.clientReqId}:${message.outcome}`,
                    message.runId,
                    message.deathSeq,
                    2,
                )) presentation.showReliveNotice(message);
            }));
            this.track(context.room.onReliveResolved((message) => {
                if (active() && this.acceptReliveNotice(
                    `resolved:${message.clientReqId ?? "system"}:${message.result}`,
                    message.runId,
                    message.deathSeq,
                    3,
                )) presentation.showReliveNotice(message);
            }));
            this.track(context.room.onRunFinalizing((message) => {
                if (!active() || !this.acceptFinalizing(message.runId, message.stateVersion)) return;
                presentation.cancelInput();
                context.room.clearBoost();
                presentation.showRunFinalizing(message);
            }));
            this.track(context.room.onRunResult((message) => {
                if (!active() || !this.acceptRunResult(message.runId)) return;
                presentation.cancelInput();
                context.room.clearBoost();
                presentation.showRunResult(deriveSnakePersonalResult(message));
            }));
            this.track(context.room.onStateChange((next) => {
                if (!active()) return;
                if (next.roomEpochId) this.buffer.attach(next.roomEpochId);
                const self = next.players.get(context.room.sessionId);
                this.observeRunState(self);
                if (!self || self.runState !== SnakeRunState.Active || next.phase !== GamePhase.Playing) {
                    presentation.cancelInput();
                    context.room.clearBoost();
                }
            }));
            console.log(`[snake] 已加入无尽房间 ${context.room.roomId}，我是 ${context.room.sessionId}`);
        } catch (error) {
            this.teardown();
            throw error;
        }
    }

    handleInput(input: SnakeInput, context: GameplayContext<SnakeRoomLike>): void {
        if (!this.started || this.context !== context || !context.isActive() || this.room !== context.room
            || this.reconnecting || !input || typeof input !== "object") return;
        const state = this.room.state();
        const player = state?.players.get(this.room.sessionId);
        if (input.type === "release-boost") {
            this.room.clearBoost();
        } else if (input.type === "steer") {
            if (this.endRunConfirmation || player?.runState !== SnakeRunState.Active
                || !Number.isFinite(input.dirX) || !Number.isFinite(input.dirY)) return;
            this.room.sendInput(input.dirX, input.dirY, input.boost);
        } else if (input.type === "relive") {
            if (!player || player.runState !== SnakeRunState.PendingRelive) return;
            this.room.sendReliveDecision({
                runId: player.runId,
                deathSeq: player.deathSeq,
                clientReqId: this.nextRequestId("relive"),
                decision: input.decision,
            });
        } else if (input.type === "request-end-run") {
            this.presentation?.cancelInput();
            this.room.clearBoost();
            this.endRunConfirmation = true;
            this.presentation?.showEndRunConfirmation(true);
        } else if (input.type === "cancel-end-run") {
            this.endRunConfirmation = false;
            this.presentation?.showEndRunConfirmation(false);
        } else if (input.type === "confirm-end-run") {
            if (!this.endRunConfirmation || !player) return;
            this.endRunConfirmation = false;
            this.presentation?.showEndRunConfirmation(false);
            this.room.sendEndRun(player.runId, this.nextRequestId("end"));
        } else if (input.type === "set-handedness") {
            const preference = this.preference;
            if (!preference) return;
            const applied = preference.set(input.value);
            this.presentation?.setHandedness(applied ? input.value : "right");
        }
    }

    tick(dt: number, context: GameplayContext<SnakeRoomLike>): void {
        if (!this.started || this.context !== context || !context.isActive() || this.room !== context.room
            || !Number.isFinite(dt) || dt < 0) return;
        const dropping = context.room.dropping;
        if (dropping !== this.reconnecting) {
            this.reconnecting = dropping;
            this.presentation?.cancelInput();
            context.room.clearBoost();
            this.presentation?.setReconnecting(dropping);
            if (!dropping) {
                const state = context.room.state();
                if (state?.roomEpochId) context.room.requestBaseline(state.roomEpochId, this.buffer.latestSnapshot?.seq ?? 0);
            }
        }
        const frame = this.buffer.sample(this.buffer.latestTick - RENDER_LAG_TICKS);
        if (frame) {
            this.presentation?.render(
                frame,
                deriveSnakeHud(frame, context.room.state(), context.room.sessionId),
                deriveSnakeRelive(context.room.state(), context.room.sessionId, frame.envelopeTick),
            );
        }
        if (!dropping) {
            this.pingTimer += dt;
            if (this.pingTimer >= PING_INTERVAL_SECONDS) {
                this.pingTimer %= PING_INTERVAL_SECONDS;
                context.room.ping();
            }
        }
    }

    stop(_reason: GameplayStopReason, context: GameplayContext<SnakeRoomLike>): void {
        if (this.context && this.context !== context) return;
        this.started = false;
        this.teardown();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.started = false;
        this.teardown();
    }

    private requestResync(): void {
        const request = this.buffer.takeResyncRequest();
        if (request) this.room?.requestBaseline(request.roomEpochId, request.afterSeq);
    }

    private nextRequestId(kind: string): string {
        const epoch = this.room?.state()?.roomEpochId ?? "pending";
        return `${epoch}:${kind}:${++this.requestSeq}`;
    }

    private observeRunState(player: ISnakePlayerState | undefined): void {
        if (!player) return;
        if (this.noticeRunId !== player.runId) {
            this.noticeRunId = player.runId;
            this.noticeDeathSeq = player.deathSeq;
            this.noticeStage = 0;
            this.noticeStateVersion = player.stateVersion;
            this.seenNotices.clear();
            return;
        }
        if (player.deathSeq > this.noticeDeathSeq) {
            this.noticeDeathSeq = player.deathSeq;
            this.noticeStage = 0;
            this.seenNotices.clear();
        }
        this.noticeStateVersion = Math.max(this.noticeStateVersion, player.stateVersion);
    }

    private currentRunMatches(runId: string): boolean {
        const player = this.room?.state()?.players.get(this.room.sessionId);
        return player?.runId === runId || this.noticeRunId === runId;
    }

    private acceptReliveNotice(key: string, runId: string, deathSeq: number, stage: number): boolean {
        if (!this.currentRunMatches(runId) || deathSeq < this.noticeDeathSeq || stage < this.noticeStage) return false;
        if (deathSeq > this.noticeDeathSeq) {
            this.noticeDeathSeq = deathSeq;
            this.noticeStage = 0;
            this.seenNotices.clear();
        }
        const identity = `${runId}\u0000${deathSeq}\u0000${key}`;
        if (this.seenNotices.has(identity)) return false;
        this.seenNotices.add(identity);
        this.noticeRunId = runId;
        this.noticeStage = Math.max(this.noticeStage, stage);
        return true;
    }

    private acceptFinalizing(runId: string, stateVersion: number): boolean {
        if (!this.currentRunMatches(runId) || stateVersion < this.noticeStateVersion) return false;
        const identity = `${runId}\u0000finalizing\u0000${stateVersion}`;
        if (this.seenNotices.has(identity)) return false;
        this.seenNotices.add(identity);
        this.noticeRunId = runId;
        this.noticeStateVersion = stateVersion;
        this.noticeStage = 4;
        return true;
    }

    private acceptRunResult(runId: string): boolean {
        if (!this.currentRunMatches(runId) || this.completedResultRuns.has(runId)) return false;
        this.completedResultRuns.add(runId);
        this.noticeStage = 5;
        return true;
    }

    private track(unsubscribe: () => void): void {
        if (typeof unsubscribe !== "function") throw new TypeError("[snake] room listener 未返回解绑函数");
        this.unsubscribers.push(unsubscribe);
    }

    private teardown(): void {
        if (this.tornDown) return;
        this.tornDown = true;
        this.started = false;
        const room = this.room;
        const presentation = this.presentation;
        this.room = null;
        this.context = null;
        this.presentation = null;
        this.preference = null;
        try { room?.clearBoost(); } catch { /* continue cleanup */ }
        try { presentation?.cancelInput(); } catch { /* continue cleanup */ }
        for (const unsubscribe of this.unsubscribers.splice(0)) {
            try { unsubscribe(); } catch { /* continue cleanup */ }
        }
        if (this.presentationMounted && presentation) {
            this.presentationMounted = false;
            try { presentation.unmount(); } catch (error) { console.error("[snake] presentation cleanup failed", error); }
        }
        this.buffer.reset();
        this.pingTimer = 0;
        this.endRunConfirmation = false;
        this.noticeRunId = null;
        this.noticeDeathSeq = -1;
        this.noticeStage = 0;
        this.noticeStateVersion = 0;
        this.seenNotices.clear();
        this.completedResultRuns.clear();
    }
}

export function createSnakeGameplay(options: SnakeGameplayOptions): SnakeGameplay {
    return new SnakeGameplay(options);
}
