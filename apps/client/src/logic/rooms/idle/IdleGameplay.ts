import type { GameplayContext, GameplayPlugin, GameplayStopReason } from "../../gameplay";
import type { GameplayRegistry } from "../../gameplay/GameplayRegistry";

/** 第二个最小玩法 fixture：只记录输入与逻辑步，不依赖 room、cc 或 FGUI。 */
export interface IdleInput {
    readonly type: "pulse";
    readonly value?: number;
}

export interface IdleRoom {
    readonly kind: "idle-fixture";
}

export class IdleGameplay implements GameplayPlugin<IdleRoom, IdleInput> {
    readonly id = "idle";
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
): () => void {
    return registry.register("idle", createIdleGameplay);
}
