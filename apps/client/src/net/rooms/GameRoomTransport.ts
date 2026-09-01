import { getToken } from "../../core/http";
import {
    C2S,
    GameplayModeId,
    validateC2SPayload,
    validateRoomStateForMode,
    type C2SPayloadMap,
    type IMoveReq,
} from "../../shared/index";
import {
    RoomClient,
    type GameRoomOwnership,
    type GameRoomReconcileReason,
    type GameplayRoomAdapter,
    type SupportedGameRoomMode,
    type TypedGameRoom,
} from "../RoomClient";
import { getCurrentGameWsUrl, getCurrentServer } from "../serverSession";
import { DEFAULT_GAME_ROOM_PROFILE, gameRoomModeVersion } from "./matchmaking";

type BallMoveOutbound =
    | typeof C2S.Ping
    | typeof C2S.Move
    | typeof C2S.CastSkill
    | typeof C2S.Chat;

export type BallMoveTypedRoom = TypedGameRoom<
    typeof GameplayModeId.BallMove,
    BallMoveOutbound
>;

export type IdleTypedRoom = TypedGameRoom<
    typeof GameplayModeId.Idle,
    typeof C2S.IdlePulse
>;

export interface BallMoveRoomAdapter extends GameplayRoomAdapter<
    typeof GameplayModeId.BallMove,
    BallMoveOutbound
> {
    readonly desiredMove: Readonly<IMoveReq & { seq: number }>;
    readonly inputGeneration: number;
    beginInputLease(): number;
    move(expectedGeneration: number, room: BallMoveTypedRoom, dirX: number, dirY: number): void;
    clearMove(expectedGeneration: number, room?: BallMoveTypedRoom): boolean;
}

class DefaultBallMoveRoomAdapter implements BallMoveRoomAdapter {
    readonly mode = GameplayModeId.BallMove;
    readonly outbound = [C2S.Ping, C2S.Move, C2S.CastSkill, C2S.Chat] as const;
    private inputSeq = 0;
    private generation = 0;
    private desired: IMoveReq & { seq: number } = { dirX: 0, dirY: 0, seq: 0 };
    private readonly lastSentSeq = new WeakMap<object, number>();

    get desiredMove(): Readonly<IMoveReq & { seq: number }> {
        return this.desired;
    }

    get inputGeneration(): number {
        return this.generation;
    }

    validateState(input: unknown) {
        return validateRoomStateForMode(GameplayModeId.BallMove, input);
    }

    beginInputLease(): number {
        return ++this.generation;
    }

    move(expectedGeneration: number, room: BallMoveTypedRoom, dirX: number, dirY: number): void {
        // `generation` fences older capabilities on a shared physical room;
        // `current` also closes the leave -> next capability creation window.
        if (expectedGeneration !== this.generation || !room.current) return;
        let payload: IMoveReq;
        try {
            payload = validateC2SPayload(C2S.Move, { dirX, dirY });
        } catch {
            console.warn("[BallMoveRoomAdapter] 丢弃非法 Move");
            return;
        }
        this.desired = { ...payload, seq: ++this.inputSeq };
        this.sendDesired(room);
    }

    clearMove(expectedGeneration: number, room?: BallMoveTypedRoom): boolean {
        if (expectedGeneration !== this.generation) return false;
        this.desired = { dirX: 0, dirY: 0, seq: ++this.inputSeq };
        if (room) this.sendDesired(room);
        return true;
    }

    reconcile(room: BallMoveTypedRoom, reason: GameRoomReconcileReason): void {
        if (reason === "reconnected") this.lastSentSeq.delete(room);
        this.sendDesired(room);
    }

    private sendDesired(room: BallMoveTypedRoom): void {
        if (!room.current || room.dropping || this.desired.seq === 0) return;
        if ((this.lastSentSeq.get(room) ?? -1) >= this.desired.seq) return;
        if (room.send(C2S.Move, { dirX: this.desired.dirX, dirY: this.desired.dirY })) {
            this.lastSentSeq.set(room, this.desired.seq);
        }
    }
}

export function createBallMoveRoomAdapter(): BallMoveRoomAdapter {
    return new DefaultBallMoveRoomAdapter();
}

export type IdleRoomAdapter = GameplayRoomAdapter<
    typeof GameplayModeId.Idle,
    typeof C2S.IdlePulse
>;

export function createIdleRoomAdapter(): IdleRoomAdapter {
    return {
        mode: GameplayModeId.Idle,
        outbound: [C2S.IdlePulse] as const,
        validateState: (input) => validateRoomStateForMode(GameplayModeId.Idle, input),
        // Deliberately no reconcile hook: idle never constructs or replays Move.
    };
}

/** Join one raw GameRoom with an explicit matchmaking mode. */
export function joinGameRoom<
    TMode extends SupportedGameRoomMode,
    TOutbound extends keyof C2SPayloadMap,
>(
    client: RoomClient,
    adapter: GameplayRoomAdapter<TMode, TOutbound>,
    signal: AbortSignal,
): GameRoomOwnership<TMode, TOutbound> {
    const server = getCurrentServer();
    if (!server) throw new Error("[GameRoom] 尚未选择区服，不能进入玩法");
    client.init(getCurrentGameWsUrl());
    return client.joinGame(adapter, {
        token: getToken(),
        sId: server.serverId,
        mode: adapter.mode,
        // v8 必填信封（§4.4）：默认撮合注入 "default" profile；modeVersion 取 client catalog。
        modeVersion: gameRoomModeVersion(adapter.mode),
        profile: DEFAULT_GAME_ROOM_PROFILE,
    }, signal);
}
