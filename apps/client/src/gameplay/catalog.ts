import type { GameplayRegistry, GameplayRoomJoiner } from "../logic/gameplay/index";
import {
    registerBallMoveGameplay,
    type BallMoveInput,
    type BallMovePresentation,
    type BallMoveRoom,
} from "../logic/rooms/ballMove/BallMoveGameplay";
import {
    registerIdleGameplay,
    type IdleInput,
    type IdleRoom,
} from "../logic/rooms/idle/IdleGameplay";
import { createIdleRoomJoiner } from "../net/rooms/IdleRoom";
import { createBallMoveRoomJoiner } from "../net/rooms/BallMoveRoom";

/** Inputs/rooms are intentionally erased at the app composition boundary. */
export type AppGameplayRegistry = GameplayRegistry<any, any>;

export interface GameplayCatalogContext {
    readonly ballMovePresentation: BallMovePresentation;
    readonly ballMoveJoiner?: GameplayRoomJoiner<BallMoveRoom>;
    readonly idleJoiner?: GameplayRoomJoiner<IdleRoom>;
}

/**
 * Register the starter gameplay modules in one replaceable catalog. Adding a
 * module means adding its own `register` call here; RoomClient, RoomController
 * and the Main lifecycle shell remain unchanged.
 */
export function registerDefaultGameplays(
    registry: AppGameplayRegistry,
    context: GameplayCatalogContext,
): () => void {
    const ballMoveOff = registerBallMoveGameplay(
        registry as unknown as GameplayRegistry<BallMoveRoom, BallMoveInput>,
        {
            presentation: context.ballMovePresentation,
            joiner: context.ballMoveJoiner ?? createBallMoveRoomJoiner(),
        },
    );
    let idleOff: (() => void) | null = null;
    try {
        idleOff = registerIdleGameplay(
            registry as unknown as GameplayRegistry<IdleRoom, IdleInput>,
            { joiner: context.idleJoiner ?? createIdleRoomJoiner() },
        );
    } catch (error) {
        ballMoveOff();
        throw error;
    }
    return () => {
        idleOff?.();
        ballMoveOff();
    };
}
