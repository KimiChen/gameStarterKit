import type { GameplayContext, GameplayPlugin, GameplayStopReason, GameplayRoomJoiner } from "../../gameplay/index";
import type { GameplayRegistry } from "../../gameplay/GameplayRegistry";
import { GameplayModeId } from "../../../shared/index";

/** 第二个最小玩法 fixture：只记录输入与逻辑步，不依赖 room、cc 或 FGUI。 */
export interface IdleInput {
    readonly type: "pulse";
    readonly value?: number;
}

export const IDLE_GAMEPLAY_ID = GameplayModeId.Idle;

export interface IdleRoom {
    /** `idle-fixture` is retained for pure unit tests; `idle` is the real room adapter. */
    readonly kind: "idle-fixture" | "idle";
    readonly roomId?: string;
    readonly sessionId?: string;
}

export interface IdleGameplayOptions {
    /** Optional production transport; omitted when testing the pure plugin. */
    readonly joiner?: GameplayRoomJoiner<IdleRoom>;
}

export class IdleGameplay implements GameplayPlugin<IdleRoom, IdleInput> {
    readonly id = IDLE_GAMEPLAY_ID;
    started = false;
    stopped = false;
    disposed = false;
    ticks = 0;
    elapsedMs = 0;
    readonly inputs: IdleInput[] = [];
    readonly stopReasons: GameplayStopReason[] = [];
    room: IdleRoom | null = null;

    start(context: GameplayContext<IdleRoom>): void {
        if (this.started) return;
        this.started = true;
        this.room = context.room;
    }

    handleInput(input: IdleInput, context: GameplayContext<IdleRoom>): void {
        if (!context.isActive() || input.type !== "pulse") return;
        this.inputs.push({ ...input });
    }

    tick(dt: number, context: GameplayContext<IdleRoom>): void {
        if (!context.isActive()) return;
        this.ticks++;
        this.elapsedMs += dt * 1000;
    }

    stop(reason: GameplayStopReason): void {
        if (this.stopped) return;
        this.stopped = true;
        this.stopReasons.push(reason);
    }

    dispose(): void {
        this.disposed = true;
    }
}

export function createIdleGameplay(): IdleGameplay {
    return new IdleGameplay();
}

/** 玩法模块自己的登记函数；调用方无需修改通用 loader 或 Main。 */
export function registerIdleGameplay(
    registry: GameplayRegistry<IdleRoom, IdleInput>,
    options: IdleGameplayOptions = {},
): () => void {
    return registry.register(IDLE_GAMEPLAY_ID, createIdleGameplay, options.joiner ? { joiner: options.joiner } : {});
}
