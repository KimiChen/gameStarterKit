import type {
    GameplayContext,
    GameplayPlugin,
    GameplayStopReason,
    GameplayRoomJoiner,
} from "../../gameplay/index";
import type { GameplayRegistry } from "../../gameplay/GameplayRegistry";
import {
    MAP_HEIGHT,
    MAP_WIDTH,
    GameplayModeId,
    distance,
    normalize,
    type IChatRes,
    type IErrorRes,
    type IPlayerState,
    type IPongRes,
    type ISkillResultRes,
    type IWelcomeRes,
} from "../../../shared/index";
import { GameECS } from "./GameECS";
import { PlayerModel } from "./GameComps";

export const BALL_MOVE_GAMEPLAY_ID = GameplayModeId.BallMove;

export type BallMoveInput =
    | { readonly type: "target"; readonly x: number; readonly y: number }
    | { readonly type: "release" };

/** Read-only render surface; the view never mutates ECS state. */
export interface BallMoveRenderWorld {
    forEachPlayer(callback: (eid: number) => void): void;
}

/** Graphics subset shared by the Cocos view and the headless performance probe. */
export interface BallMoveGraphicsSink<TColor> {
    lineWidth: number;
    strokeColor: TColor;
    fillColor: TColor;
    clear(): void;
    rect(x: number, y: number, width: number, height: number): void;
    circle(x: number, y: number, radius: number): void;
    stroke(): void;
    fill(): void;
}

export interface BallMoveRenderPalette<TColor> {
    readonly border: TColor;
    readonly dead: TColor;
    readonly self: TColor;
    readonly other: TColor;
    readonly hpBackground: TColor;
    readonly hp: TColor;
}

/**
 * Production render command sequence. BallMoveView supplies Cocos Graphics;
 * the performance baseline supplies a counting sink, so geometry cannot drift.
 */
export function renderBallMoveWorld<TColor>(
    world: BallMoveRenderWorld,
    graphics: BallMoveGraphicsSink<TColor>,
    palette: BallMoveRenderPalette<TColor>,
): void {
    graphics.clear();

    const offsetX = -MAP_WIDTH / 2;
    const offsetY = -MAP_HEIGHT / 2;
    graphics.lineWidth = 2;
    graphics.strokeColor = palette.border;
    graphics.rect(offsetX, offsetY, MAP_WIDTH, MAP_HEIGHT);
    graphics.stroke();

    world.forEachPlayer((eid) => {
        const x = offsetX + PlayerModel.x[eid];
        const y = offsetY + PlayerModel.y[eid];
        graphics.fillColor = !PlayerModel.alive[eid]
            ? palette.dead
            : PlayerModel.isSelf[eid] ? palette.self : palette.other;
        graphics.circle(x, y, 20);
        graphics.fill();

        const ratio = PlayerModel.maxHp[eid] > 0
            ? PlayerModel.hp[eid] / PlayerModel.maxHp[eid]
            : 0;
        graphics.fillColor = palette.hpBackground;
        graphics.rect(x - 25, y + 28, 50, 6);
        graphics.fill();
        graphics.fillColor = palette.hp;
        graphics.rect(x - 25, y + 28, 50 * ratio, 6);
        graphics.fill();
    });
}

/** Engine-facing port. Implementations belong in view/, never in this logic module. */
export interface BallMovePresentation {
    mount(): void;
    render(world: BallMoveRenderWorld): void;
    unmount(): void;
}

export interface BallMovePlayerObserver {
    add(player: IPlayerState, isSelf: boolean): void;
    change(player: IPlayerState): void;
    remove(sessionId: string): void;
}

/**
 * Capability for one exact GameRoom connection. The transport adapter rejects
 * sends and callbacks once its captured physical room is no longer current.
 */
export interface BallMoveRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly dropping: boolean;
    onWelcome(callback: (message: IWelcomeRes) => void): () => void;
    onPong(callback: (message: IPongRes) => void): () => void;
    onChat(callback: (message: IChatRes) => void): () => void;
    onSkillResult(callback: (message: ISkillResultRes) => void): () => void;
    onError(callback: (message: IErrorRes) => void): () => void;
    observePlayers(observer: BallMovePlayerObserver): () => void;
    move(dirX: number, dirY: number): void;
    clearMove(): void;
    ping(): void;
}

export interface BallMoveGameplayOptions {
    readonly presentation: BallMovePresentation;
    readonly ecs?: GameECS;
    readonly now?: () => number;
    /** Optional module-owned transport registration for app composition. */
    readonly joiner?: GameplayRoomJoiner<BallMoveRoom>;
}

const ARRIVE_RADIUS = 24;
const PING_INTERVAL_SECONDS = 5;

/** Pure TypeScript ballMove lifecycle; network and Cocos are injected ports. */
export class BallMoveGameplay implements GameplayPlugin<BallMoveRoom, BallMoveInput> {
    readonly id = BALL_MOVE_GAMEPLAY_ID;

    private readonly ecs: GameECS;
    private readonly presentation: BallMovePresentation;
    private readonly now: () => number;
    private room: BallMoveRoom | null = null;
    private target: { x: number; y: number } | null = null;
    private lastDirX = 0;
    private lastDirY = 0;
    private pingTimer = 0;
    private started = false;
    private disposed = false;
    private tornDown = true;
    private presentationMounted = false;
    private context: GameplayContext<BallMoveRoom> | null = null;
    private readonly unsubscribers: Array<() => void> = [];

    constructor(options: BallMoveGameplayOptions) {
        this.ecs = options.ecs ?? GameECS.inst;
        this.presentation = options.presentation;
        this.now = options.now ?? Date.now;
    }

    start(context: GameplayContext<BallMoveRoom>): void {
        if (this.started || this.disposed) return;
        this.started = true;
        this.tornDown = false;
        this.room = context.room;
        this.context = context;
        try {
            this.ecs.clear();
            this.resetInput();
            // Mark the mount as owned before calling into the engine so a partial
            // mount is still offered the matching unmount rollback path.
            this.presentationMounted = true;
            this.presentation.mount();

            const active = () => this.started
                && this.context === context
                && this.room === context.room
                && context.isActive();
            this.track(context.room.onWelcome((message) => {
                if (!active()) return;
                console.log(`[ballMove] ${message.motd}（tickRate=${message.tickRate}）`);
            }));
            this.track(context.room.onPong((message) => {
                if (!active()) return;
                console.log(`[ballMove] RTT ${Math.max(0, this.now() - message.clientTime)}ms`);
            }));
            this.track(context.room.onChat((message) => {
                if (!active()) return;
                console.log(`[聊天] ${message.fromName}: ${message.text}`);
            }));
            this.track(context.room.onSkillResult((message) => {
                if (!active()) return;
                console.log(`[战斗] ${message.casterId} 技能${message.skillId} 伤害${message.damage}`);
            }));
            this.track(context.room.onError((message) => {
                if (!active()) return;
                console.warn(`[服务端错误] ${message.code}: ${message.message}`);
            }));
            this.track(context.room.observePlayers({
                add: (player, isSelf) => {
                    if (active()) this.ecs.addPlayer(player, isSelf);
                },
                change: (player) => {
                    if (active()) this.ecs.syncPlayer(player);
                },
                remove: (sessionId) => {
                    if (active()) this.ecs.removePlayer(sessionId);
                },
            }));
            console.log(`[ballMove] 已加入房间 ${context.room.roomId}，我是 ${context.room.sessionId}`);
        } catch (error) {
            // Keep start transactional: a failed listener or presentation setup
            // must release everything that was acquired before rethrowing.
            this.teardown();
            throw error;
        }
    }

    handleInput(input: BallMoveInput, context: GameplayContext<BallMoveRoom>): void {
        if (!this.started || this.context !== context || !context.isActive() || this.room !== context.room) return;
        if (!input || typeof input !== "object") return;
        if (input.type === "release") {
            this.target = null;
            this.sendDir(0, 0);
            return;
        }
        if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return;
        this.target = {
            x: Math.max(0, Math.min(MAP_WIDTH, input.x)),
            y: Math.max(0, Math.min(MAP_HEIGHT, input.y)),
        };
    }

    tick(dt: number, context: GameplayContext<BallMoveRoom>): void {
        if (!this.started || this.context !== context || !context.isActive() || this.room !== context.room) return;
        if (!Number.isFinite(dt) || dt < 0) return;
        this.ecs.update(dt);
        this.steerToTarget(context.room);
        this.presentation.render(this.ecs);

        if (!context.room.dropping) {
            this.pingTimer += dt;
            if (this.pingTimer >= PING_INTERVAL_SECONDS) {
                this.pingTimer %= PING_INTERVAL_SECONDS;
                context.room.ping();
            }
        }
    }

    stop(_reason: GameplayStopReason, context: GameplayContext<BallMoveRoom>): void {
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

    private steerToTarget(room: BallMoveRoom): void {
        const target = this.target;
        if (!target) return;
        const self = this.ecs.getSelfPlayer();
        if (self === null) return;
        if (distance(PlayerModel.x[self], PlayerModel.y[self], target.x, target.y) <= ARRIVE_RADIUS) {
            this.sendDir(0, 0);
            return;
        }
        const direction = normalize(target.x - PlayerModel.x[self], target.y - PlayerModel.y[self]);
        if (this.room === room) this.sendDir(direction.x, direction.y);
    }

    private sendDir(x: number, y: number): void {
        if (Math.abs(x - this.lastDirX) < 0.02 && Math.abs(y - this.lastDirY) < 0.02) return;
        this.lastDirX = x;
        this.lastDirY = y;
        this.room?.move(x, y);
    }

    private resetInput(): void {
        this.target = null;
        this.lastDirX = 0;
        this.lastDirY = 0;
        this.pingTimer = 0;
    }

    private track(unsubscribe: () => void): void {
        if (typeof unsubscribe !== "function") {
            throw new TypeError("[ballMove] room listener 未返回解绑函数");
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
        const cleanupErrors: Array<{ readonly resource: string; readonly error: unknown }> = [];
        if (room) this.runCleanup("room input", () => room.clearMove(), cleanupErrors);
        for (const unsubscribe of this.unsubscribers.splice(0)) {
            this.runCleanup("room listener", unsubscribe, cleanupErrors);
        }
        if (this.presentationMounted) {
            this.presentationMounted = false;
            this.runCleanup("presentation", () => this.presentation.unmount(), cleanupErrors);
        }
        this.runCleanup("ecs", () => this.ecs.clear(), cleanupErrors);
        this.resetInput();
        if (cleanupErrors.length > 0) {
            console.error("[ballMove] 资源清理异常（其余资源已继续释放）", cleanupErrors);
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

export function createBallMoveGameplay(options: BallMoveGameplayOptions): BallMoveGameplay {
    return new BallMoveGameplay(options);
}

/** ballMove owns its registration; generic registry/loader code stays unchanged. */
export function registerBallMoveGameplay(
    registry: GameplayRegistry<BallMoveRoom, BallMoveInput>,
    options: BallMoveGameplayOptions,
): () => void {
    return registry.register(
        BALL_MOVE_GAMEPLAY_ID,
        () => createBallMoveGameplay(options),
        options.joiner ? { joiner: options.joiner } : {},
    );
}
