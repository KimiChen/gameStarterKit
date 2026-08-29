import type { Node } from "cc";
import type { GameplayRegistry, GameplayRoomJoiner } from "../logic/gameplay/index";
import {
    registerBallMoveGameplay,
    type BallMoveInput,
    type BallMoveRoom,
} from "../logic/rooms/ballMove/BallMoveGameplay";
import {
    registerIdleGameplay,
    type IdleInput,
    type IdleRoom,
} from "../logic/rooms/idle/IdleGameplay";
import { createIdleRoomJoiner } from "../net/rooms/IdleRoom";
import { createBallMoveRoomJoiner } from "../net/rooms/BallMoveRoom";
import {
    createBallMoveRoomAdapter,
    createIdleRoomAdapter,
    type BallMoveRoomAdapter,
    type IdleRoomAdapter,
} from "../net/rooms/GameRoomTransport";

/** Inputs/rooms are intentionally erased at the app composition boundary. */
export type AppGameplayRegistry = GameplayRegistry<any, any>;

/** Engine host passed once to the catalog; each entry owns its adapter creation. */
export interface GameplayPresentationHost {
    readonly node: Node;
    readonly dispatchInput: (input: unknown) => void;
}

export interface GameplayCatalogContext {
    readonly presentationHost?: GameplayPresentationHost;
    readonly ballMoveJoiner?: GameplayRoomJoiner<BallMoveRoom>;
    readonly idleJoiner?: GameplayRoomJoiner<IdleRoom>;
    readonly ballMoveAdapter?: BallMoveRoomAdapter;
    readonly idleAdapter?: IdleRoomAdapter;
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
    const ballMoveAdapter = context.ballMoveAdapter ?? createBallMoveRoomAdapter();
    const idleAdapter = context.idleAdapter ?? createIdleRoomAdapter();
    const ballMoveOff = registerBallMoveGameplay(
        registry as unknown as GameplayRegistry<BallMoveRoom, BallMoveInput>,
        {
            // The adapter is constructed by the ballMove entry, only when a
            // ballMove plugin starts. Other registrations (notably idle) do
            // not allocate or touch BallMoveView.
            ...(context.presentationHost ? {
                presentationFactory: async () => {
                    const host = context.presentationHost;
                    if (!host) return undefined;
                    const { BallMoveView } = await import("../view/rooms/ballMove/BallMoveView");
                    return new BallMoveView(host.node, (input) => host.dispatchInput(input));
                },
            } : {}),
            joiner: context.ballMoveJoiner ?? createBallMoveRoomJoiner(ballMoveAdapter),
        },
    );
    let idleOff: (() => void) | null = null;
    try {
        idleOff = registerIdleGameplay(
            registry as unknown as GameplayRegistry<IdleRoom, IdleInput>,
            { joiner: context.idleJoiner ?? createIdleRoomJoiner(idleAdapter) },
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
