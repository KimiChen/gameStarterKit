/**
 * SnakeGameplay：snake 玩法的客户端生命周期（docs/snakeoff/04 §9；logic 层纯 TS，
 * 网络/Cocos 都是注入 port——对齐 BallMoveGameplay 的组装形态）。
 *
 * 闭环：room.onSnapshot → SnakeSnapshotBuffer（matchId/seq/tick 接受条件）→ tick 里
 * 按 renderTick 插值出渲染帧 → presentation.render(frame, hud)。Settle（权威
 * state.phase）→ 停输入 → presentation.showSettle(model)；「返回主页」经
 * host.requestExit("settled") 走通用恢复路径（⛔ 首版无 rematch）。
 */
import type {
    GameplayContext,
    GameplayPlugin,
    GameplayStopReason,
} from "../../gameplay/index";
import { GamePhase, type ISnakeRoomState, type ISnakeWorldSnapshot } from "../../../shared/index";
import { deriveSnakeHud, deriveSnakeSettle, type SnakeSettleModel } from "./SnakeHud";
import { SnakeSnapshotBuffer, type SnakeRenderFrame } from "./SnakeSnapshotBuffer";

export const SNAKE_GAMEPLAY_ID = "snake";

/** 玩法输入（View 层摇杆/加速 → host.dispatchInput）。 */
export type SnakeInput =
    | { readonly type: "steer"; readonly dirX: number; readonly dirY: number; readonly boost: boolean }
    | { readonly type: "release-boost" };

/** Snake 的引擎面无（presentation port；实现在 view/，⛔ 不进 logic）。 */
export interface SnakePresentation {
    mount(): void;
    /** 渲染一帧：插值世界帧 + HUD 视图模型。 */
    render(frame: SnakeRenderFrame, hud: ReturnType<typeof deriveSnakeHud>): void;
    /** 权威 Settle：停输入后的结算展示（幂等）。 */
    showSettle(model: SnakeSettleModel): void;
    /** 断线/重连遮罩（dropping 期间冻结输入层）。 */
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
    onSnapshot(callback: (snapshot: ISnakeWorldSnapshot) => void): () => void;
    onStateChange(callback: (state: ISnakeRoomState) => void): () => void;
    sendInput(dirX: number, dirY: number, boost: boolean): number;
    clearBoost(): void;
    ping(): void;
}

export interface SnakeGameplayOptions {
    readonly presentationFactory?: () => SnakePresentation | undefined | Promise<SnakePresentation | undefined>;
}

const PING_INTERVAL_SECONDS = 5;
/** 渲染落后的快照间隔数（10Hz 快照 = 2 tick；落后 1 份 ≈ 100ms）。 */
const RENDER_LAG_TICKS = 2;

export class SnakeGameplay implements GameplayPlugin<SnakeRoomLike, SnakeInput> {
    readonly id = SNAKE_GAMEPLAY_ID;

    private readonly presentationFactory: () => SnakePresentation | undefined | Promise<SnakePresentation | undefined>;
    private presentation: SnakePresentation | null = null;
    private room: SnakeRoomLike | null = null;
    private context: GameplayContext<SnakeRoomLike> | null = null;
    private readonly buffer = new SnakeSnapshotBuffer();
    private started = false;
    private disposed = false;
    private tornDown = true;
    private presentationMounted = false;
    private settleShown = false;
    private reconnecting = false;
    private pingTimer = 0;
    private readonly unsubscribers: Array<() => void> = [];

    constructor(options: SnakeGameplayOptions) {
        this.presentationFactory = options.presentationFactory ?? (() => undefined);
    }

    /** 测试观察面：缓冲状态（⛔ 生产路径不读）。 */
    get snapshotBufferReady(): boolean {
        return this.buffer.ready;
    }

    async start(context: GameplayContext<SnakeRoomLike>): Promise<void> {
        if (this.started || this.disposed) return;
        const presentation = await this.presentationFactory();
        if (!presentation
            || typeof presentation.mount !== "function"
            || typeof presentation.render !== "function"
            || typeof presentation.showSettle !== "function"
            || typeof presentation.unmount !== "function") {
            throw new TypeError("[snake] 需要有效的 presentation adapter");
        }
        this.started = true;
        this.tornDown = false;
        this.room = context.room;
        this.context = context;
        this.presentation = presentation;
        this.settleShown = false;
        this.reconnecting = false;
        try {
            // 首份真实 state 定 matchId（快照接受条件的锚；⛔ 不用本地猜测）
            const state = context.room.state();
            if (state && state.matchId) this.buffer.attach(state.matchId);
            this.presentationMounted = true;
            this.presentation.mount();

            const active = () => this.started
                && this.context === context
                && this.room === context.room
                && context.isActive();
            this.track(context.room.onWelcome((message) => {
                if (!active()) return;
                console.log(`[snake] ${message.motd}`);
            }));
            this.track(context.room.onError((message) => {
                if (!active()) return;
                console.warn(`[服务端错误] ${message.code}: ${message.message}`);
            }));
            this.track(context.room.onSnapshot((snapshot) => {
                if (!active()) return;
                this.buffer.offer(snapshot);
            }));
            this.track(context.room.onStateChange((next) => {
                if (!active()) return;
                if (next.matchId) this.buffer.attach(next.matchId);
                if (next.phase === GamePhase.Settle) this.showSettleOnce();
            }));
            console.log(`[snake] 已加入房间 ${context.room.roomId}，我是 ${context.room.sessionId}`);
        } catch (error) {
            this.teardown();
            throw error;
        }
    }

    handleInput(input: SnakeInput, context: GameplayContext<SnakeRoomLike>): void {
        if (!this.started || this.context !== context || !context.isActive() || this.room !== context.room) return;
        if (this.settleShown || this.reconnecting) return; // 结算/重连中拒新输入（04 §4.3）
        if (!input || typeof input !== "object") return;
        if (input.type === "release-boost") {
            this.room.clearBoost();
            return;
        }
        if (input.type === "steer") {
            if (!Number.isFinite(input.dirX) || !Number.isFinite(input.dirY)) return;
            this.room.sendInput(input.dirX, input.dirY, input.boost);
        }
    }

    tick(dt: number, context: GameplayContext<SnakeRoomLike>): void {
        if (!this.started || this.context !== context || !context.isActive() || this.room !== context.room) return;
        if (!Number.isFinite(dt) || dt < 0) return;

        const dropping = context.room.dropping;
        if (dropping !== this.reconnecting) {
            this.reconnecting = dropping;
            if (dropping) context.room.clearBoost(); // drop 即清 boost 意图（04 §4.3）
            this.presentation?.setReconnecting(dropping);
        }

        const frame = this.buffer.sample(this.bufferLatestTick() - RENDER_LAG_TICKS);
        if (frame && !this.settleShown) {
            this.presentation?.render(frame, deriveSnakeHud(frame, context.room.state(), context.room.sessionId));
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

    /** 权威 Settle 只触发一次：停输入 + 结算展示（用最后一份快照帧出结算模型）。 */
    private showSettleOnce(): void {
        if (this.settleShown) return;
        this.settleShown = true;
        const room = this.room;
        if (!room) return;
        room.clearBoost();
        const frame = this.buffer.sample(this.bufferLatestTick());
        if (!frame) return; // 无快照不展示（保护性兜底；正常链路必有快照）
        this.presentation?.showSettle(deriveSnakeSettle(frame, room.state(), room.sessionId));
    }

    private bufferLatestTick(): number {
        const frame = this.buffer.sample(Number.MAX_SAFE_INTEGER);
        return frame?.tick ?? 0;
    }

    private track(unsubscribe: () => void): void {
        if (typeof unsubscribe !== "function") {
            throw new TypeError("[snake] room listener 未返回解绑函数");
        }
        this.unsubscribers.push(unsubscribe);
    }

    private teardown(): void {
        if (this.tornDown) return;
        this.tornDown = true;
        this.started = false;
        const room = this.room;
        this.room = null;
        this.context = null;
        const presentation = this.presentation;
        this.presentation = null;
        const cleanupErrors: Array<{ readonly resource: string; readonly error: unknown }> = [];
        if (room) this.runCleanup("room boost", () => room.clearBoost(), cleanupErrors);
        for (const unsubscribe of this.unsubscribers.splice(0)) {
            this.runCleanup("room listener", unsubscribe, cleanupErrors);
        }
        if (this.presentationMounted && presentation) {
            this.presentationMounted = false;
            this.runCleanup("presentation", () => presentation.unmount(), cleanupErrors);
        }
        this.buffer.reset();
        this.pingTimer = 0;
        if (cleanupErrors.length > 0) {
            console.error("[snake] 资源清理异常（其余资源已继续释放）", cleanupErrors);
        }
    }

    private runCleanup(
        resource: string,
        cleanup: () => unknown,
        errors: Array<{ readonly resource: string; readonly error: unknown }>,
    ): void {
        try {
            cleanup();
        } catch (error) {
            errors.push({ resource, error });
        }
    }
}

export function createSnakeGameplay(options: SnakeGameplayOptions): SnakeGameplay {
    return new SnakeGameplay(options);
}
