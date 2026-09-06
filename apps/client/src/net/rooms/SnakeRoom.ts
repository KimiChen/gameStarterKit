/**
 * Snake 玩法的 RoomClient 装配（apps/plugins/snake/README.md；drop-in 自由加入）。
 *
 * 与 ballMove 的差异点：
 *  - join options 带 `profile: "dropIn"`（生产撮合 filterBy sId/mode/profile 隔离）；
 *  - 输入是 `{dirX, dirY, boost, seq}`：seq 由本 adapter 严格递增分配；重连 reconcile
 *    读取权威 `ackSeq`，以严格更大的新 seq 续发当前方向（boost 先归 false，
 *    ⛔ 不重放旧 seq，⛔ 不归零——04 §8.2）；
 *  - 高频方向输入上行限频合流：方向/加速未变不发（发送闸仍另有房间总预算）。
 */
import {
    C2S,
    GameplayModeId,
    S2C,
    validateRoomStateForMode,
    type ISnakePlayerState,
    type ISnakeRoomState,
    type ISnakeBaselineBegin,
    type ISnakeBaselineChunk,
    type ISnakeBaselineEnd,
    type ISnakeReliveDecisionReq,
    type ISnakeReliveDecisionResult,
    type ISnakeReliveOffered,
    type ISnakeReliveResolved,
    type ISnakeRunFinalizing,
    type ISnakeRunResultV2,
    type ISnakeWorldDelta,
    type S2CPayloadMap,
} from "../../shared/index";
import { getToken } from "../../core/http";
import { RoomClient, type GameRoomOwnership, type TypedGameRoom } from "../RoomClient";
import { gameRoomModeVersion } from "./matchmaking";
import { getCurrentGameWsUrl, getCurrentServer } from "../serverSession";

export type SnakeOutbound = typeof C2S.Ping | typeof C2S.Chat | typeof C2S.SnakeInput
    | typeof C2S.SnakeReliveDecision | typeof C2S.SnakeEndRun | typeof C2S.SnakeBaselineRequest;

export type SnakeTypedRoom = TypedGameRoom<typeof GameplayModeId.Snake, SnakeOutbound>;

type MessageOff = () => void;

/** Snake 的 GameplayRoomAdapter：输入 desired 状态 + 严格递增 seq + 重连续发。 */
export interface SnakeRoomAdapter {
    readonly mode: typeof GameplayModeId.Snake;
    readonly outbound: readonly SnakeOutbound[];
    readonly inputSeq: number;
    validateState(input: unknown): ISnakeRoomState;
    /** 发送方向/加速意图（未变化合流不发）；返回分配的 seq（未发送时为 0）。 */
    pushInput(room: SnakeTypedRoom, dirX: number, dirY: number, boost: boolean): number;
    /** 清除 boost 意图（失焦/重连/结算边界）；可选择立即发送。 */
    clearBoost(room?: SnakeTypedRoom): void;
    reconcile(room: SnakeTypedRoom, reason: string): void;
}

class DefaultSnakeRoomAdapter implements SnakeRoomAdapter {
    readonly mode = GameplayModeId.Snake;
    readonly outbound = [
        C2S.Ping,
        C2S.Chat,
        C2S.SnakeInput,
        C2S.SnakeReliveDecision,
        C2S.SnakeEndRun,
        C2S.SnakeBaselineRequest,
    ] as const;
    private seq = 0;
    private desired: { dirX: number; dirY: number; boost: boolean } = { dirX: 0, dirY: 0, boost: false };

    get inputSeq(): number {
        return this.seq;
    }

    validateState(input: unknown): ISnakeRoomState {
        return validateRoomStateForMode(GameplayModeId.Snake, input);
    }

    pushInput(room: SnakeTypedRoom, dirX: number, dirY: number, boost: boolean): number {
        if (!room.current || room.dropping) return 0;
        const unchanged = Math.abs(this.desired.dirX - dirX) < 1e-3
            && Math.abs(this.desired.dirY - dirY) < 1e-3
            && this.desired.boost === boost;
        this.desired = { dirX, dirY, boost };
        if (unchanged) return 0; // 合流：不变输入不占上行（服务端每 tick 沿用最新意图）
        return this.send(room);
    }

    clearBoost(room?: SnakeTypedRoom): void {
        if (!this.desired.boost) return;
        this.desired = { ...this.desired, boost: false };
        if (room && room.current && !room.dropping) this.send(room);
    }

    /** 重连续发（04 §8.2）：从权威 ackSeq 之后继续；boost 先 false；⛔ 不重放不归零。 */
    reconcile(room: SnakeTypedRoom, reason: string): void {
        if (reason !== "reconnected") return;
        const ackSeq = this.ackSeqOf(room);
        if (ackSeq > this.seq) this.seq = ackSeq;
        this.desired = { ...this.desired, boost: false };
        // 续发当前方向：服务端在宽限期保持了最后方向，这里只是重新建立 seq 通道
        this.send(room);
    }

    private ackSeqOf(room: SnakeTypedRoom): number {
        const state = room.state as ISnakeRoomState | null;
        const self = state?.players?.get(room.sessionId) as ISnakePlayerState | undefined;
        return self?.ackSeq ?? 0;
    }

    private send(room: SnakeTypedRoom): number {
        const seq = ++this.seq;
        const sent = room.send(C2S.SnakeInput, {
            dirX: this.desired.dirX,
            dirY: this.desired.dirY,
            boost: this.desired.boost,
            seq,
        });
        if (!sent) {
            // 发送闸关闭（drop 等）：seq 回退，这次意图并入下一次发送（⛔ 不产生空洞 seq）
            this.seq -= 1;
            return 0;
        }
        return seq;
    }
}

export function createSnakeRoomAdapter(): SnakeRoomAdapter {
    return new DefaultSnakeRoomAdapter();
}

/** 一局 snake 房间的精确 capability（回调只在本 capability 存活时投递）。 */
export interface SnakeRoom {
    readonly roomId: string;
    readonly sessionId: string;
    readonly dropping: boolean;
    /** 权威房间状态（Schema 摘要面）。 */
    state(): ISnakeRoomState | null;
    onWelcome(callback: (message: S2CPayloadMap[typeof S2C.Welcome]) => void): MessageOff;
    /** ⚠ 只为满足 SDK 的「消息必须有登记」：snake 只用 ping 保活，⛔ 不算 RTT。 */
    onPong(callback: (message: S2CPayloadMap[typeof S2C.Pong]) => void): MessageOff;
    onError(callback: (message: S2CPayloadMap[typeof S2C.Error]) => void): MessageOff;
    onBaselineBegin(callback: (message: ISnakeBaselineBegin) => void): MessageOff;
    onBaselineChunk(callback: (message: ISnakeBaselineChunk) => void): MessageOff;
    onBaselineEnd(callback: (message: ISnakeBaselineEnd) => void): MessageOff;
    onDelta(callback: (message: ISnakeWorldDelta) => void): MessageOff;
    onReliveOffered(callback: (message: ISnakeReliveOffered) => void): MessageOff;
    onReliveDecisionResult(callback: (message: ISnakeReliveDecisionResult) => void): MessageOff;
    onReliveResolved(callback: (message: ISnakeReliveResolved) => void): MessageOff;
    onRunFinalizing(callback: (message: ISnakeRunFinalizing) => void): MessageOff;
    onRunResult(callback: (message: ISnakeRunResultV2) => void): MessageOff;
    /** 状态变化订阅（phase/players 摘要驱动 HUD 与结算；返回解绑）。 */
    onStateChange(callback: (state: ISnakeRoomState) => void): MessageOff;
    sendInput(dirX: number, dirY: number, boost: boolean): number;
    sendReliveDecision(payload: ISnakeReliveDecisionReq): boolean;
    sendEndRun(runId: string, clientReqId: string): boolean;
    requestBaseline(roomEpochId: string, afterSeq: number): boolean;
    clearBoost(): void;
    ping(): void;
}

export function createSnakeRoom(room: SnakeTypedRoom, adapter: SnakeRoomAdapter): SnakeRoom {
    if (room.mode !== GameplayModeId.Snake || adapter.mode !== GameplayModeId.Snake) {
        throw new TypeError("[SnakeRoom] room mode 与 adapter 不匹配");
    }
    if (!room.current) throw new Error("[SnakeRoom] room 已失效");
    const isCurrent = () => room.current;
    const onMessage = <K extends keyof S2CPayloadMap>(
        type: K,
        callback: (message: S2CPayloadMap[K]) => void,
    ): MessageOff => room.onMessage(type, (message) => {
        if (isCurrent()) callback(message);
    });

    return {
        roomId: room.roomId,
        sessionId: room.sessionId,
        get dropping() {
            return room.dropping;
        },
        state: () => (room.current ? (room.state as ISnakeRoomState) : null),
        onWelcome: (callback) => onMessage(S2C.Welcome, callback),
        onPong: (callback) => onMessage(S2C.Pong, callback),
        onError: (callback) => onMessage(S2C.Error, callback),
        onBaselineBegin: (callback) => onMessage(S2C.SnakeBaselineBegin, callback),
        onBaselineChunk: (callback) => onMessage(S2C.SnakeBaselineChunk, callback),
        onBaselineEnd: (callback) => onMessage(S2C.SnakeBaselineEnd, callback),
        onDelta: (callback) => onMessage(S2C.SnakeDelta, callback),
        onReliveOffered: (callback) => onMessage(S2C.SnakeReliveOffered, callback),
        onReliveDecisionResult: (callback) => onMessage(S2C.SnakeReliveDecisionResult, callback),
        onReliveResolved: (callback) => onMessage(S2C.SnakeReliveResolved, callback),
        onRunFinalizing: (callback) => onMessage(S2C.SnakeRunFinalizing, callback),
        onRunResult: (callback) => onMessage(S2C.SnakeRunResult, callback),
        onStateChange(callback) {
            const stateApi = room.state$() as {
                onChange?: (listener: () => void) => MessageOff | void;
            } | null;
            const off = stateApi?.onChange?.(() => {
                if (isCurrent()) callback(room.state as ISnakeRoomState);
            });
            return typeof off === "function" ? off : () => {};
        },
        sendInput: (dirX, dirY, boost) => adapter.pushInput(room, dirX, dirY, boost),
        sendReliveDecision: (payload) => room.send(C2S.SnakeReliveDecision, payload),
        sendEndRun: (runId, clientReqId) => room.send(C2S.SnakeEndRun, { runId, clientReqId }),
        requestBaseline: (roomEpochId, afterSeq) => room.send(C2S.SnakeBaselineRequest, { roomEpochId, afterSeq }),
        clearBoost: () => adapter.clearBoost(room),
        ping() {
            if (isCurrent()) room.send(C2S.Ping, { clientTime: Date.now() });
        },
    };
}

/** 生产 joiner：joinOrCreate + dropIn profile（端点/会话查询保持在壳外）。 */
export function createSnakeRoomJoiner(
    adapter: SnakeRoomAdapter,
    client: RoomClient = RoomClient.inst,
): { join(signal: AbortSignal): { ready: Promise<SnakeRoom>; leave(): Promise<void> } } {
    return {
        join(signal) {
            const server = getCurrentServer();
            if (!server) throw new Error("[SnakeRoom] 尚未选择区服，不能进入玩法");
            client.init(getCurrentGameWsUrl());
            const ownership: GameRoomOwnership<typeof GameplayModeId.Snake, SnakeOutbound> = client.joinGame(
                adapter,
                {
                    token: getToken(),
                    sId: server.serverId,
                    mode: adapter.mode,
                    modeVersion: gameRoomModeVersion(adapter.mode),
                    profile: "dropIn",
                },
                signal,
            );
            return {
                ready: ownership.ready.then((room) => createSnakeRoom(room, adapter)),
                leave: () => ownership.leave(),
            };
        },
    };
}
