/**
 * 私房客户端流程（Non-intrusive §6.8/§6.9，阶段 8b）：
 *
 *  房主：Lobby `room.prepareCreate`（幂等，签发 creationTicket）
 *        → RoomClient.joinGame(strategy=create("game"), options + access:{kind:"create"})
 *  好友：Lobby `room.resolve(code)`（query，签发 joinTicket + roomId）
 *        → RoomClient.joinGame(strategy=join-by-id(roomId), options + access:{kind:"join"})
 *
 * 错误纪律（§6.9 / §10.2 行 22）：
 *  - 输错码（折叠类 ROOM_CODE_UNAVAILABLE 等）必须**停留在房间页可重试**——本服务只抛
 *    可判别的 `PrivateRoomError`，⛔ 绝不回退 joinOrCreate 误创建新房；
 *  - ⛔ 不触碰登录态（clearSession/notifyAuthInvalid 归 SessionCoordinator 的鉴权推送，
 *    码错误与网络抖动都不是身份失效）；
 *  - ticket 是不透明串：只进 join options 的 `access` 与内存 ownership key，⛔ 不打印。
 *
 * FGUI/View 装配（PrivateRoomLobby 包）是编辑器待办；本机制经 headless 用例验证。
 */
import {
    RoomName,
    RoomRpc,
    type IGameRoomAccess,
    type C2SPayloadMap,
    type LobbyRpcIdemType,
    type LobbyRpcType,
    type RpcReq,
    type RpcRes,
} from "../../shared/index";
import { getToken } from "../../core/http";
import {
    RoomClient,
    type GameRoomOwnership,
    type GameplayRoomAdapter,
    type JoinControl,
    type SupportedGameRoomMode,
} from "../RoomClient";
import { getCurrentGameWsUrl, getCurrentServer } from "../serverSession";
import { gameRoomModeVersion } from "./matchmaking";

/** Lobby ws-RPC 的最小结构端口（生产 = WebSocketClient.inst；测试注入假件）。 */
export interface PrivateRoomLobbyPort {
    rpc<T extends LobbyRpcType>(type: T, payload: RpcReq<T>): Promise<RpcRes<T>>;
    rpcIdem<T extends LobbyRpcIdemType>(
        type: T,
        payload: Omit<RpcReq<T>, "clientReqId">,
        clientReqId?: string,
    ): Promise<RpcRes<T>>;
}

/**
 * 私房流程的可判别失败。`retryable === true` ⇒ UI 停留在当前页提示重试（码输错/满员/
 * 开局中/基础设施抖动）；false ⇒ 需要玩家侧行动（如更新客户端）。两类都 ⛔ 不清登录态。
 */
export class PrivateRoomError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
        message = code,
    ) {
        super(message);
        this.name = "PrivateRoomError";
    }
}

/** 六位邀请码形状（§6.6：恰好 6 个 ASCII 数字的字符串）。 */
const INVITE_CODE_SHAPE = /^\d{6}$/;

/** 非重试类（玩家重输码/稍后重试都无济于事）的 Lobby 错误码；其余一律按可重试停留。 */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
    "AUTH_REQUIRED",
    "AUTH_EPOCH_STALE",
    "ACCOUNT_BANNED",
    "INVALID_PAYLOAD",
    "UNKNOWN_TYPE",
]);

function rpcErrorCode(error: unknown): string {
    try {
        const code = (error as { code?: unknown })?.code;
        return typeof code === "string" && code.length > 0 ? code : "ROOM_SERVICE_UNAVAILABLE";
    } catch {
        return "ROOM_SERVICE_UNAVAILABLE";
    }
}

function asPrivateRoomError(error: unknown): PrivateRoomError {
    if (error instanceof PrivateRoomError) return error;
    const code = rpcErrorCode(error);
    // ⛔ message 不回显 code 输入或 ticket；只透出稳定错误码。
    return new PrivateRoomError(code, !NON_RETRYABLE_CODES.has(code));
}

export interface PrivateRoomJoinControl {
    control?: JoinControl | AbortSignal;
}

export class PrivateRoomService {
    constructor(
        private readonly lobby: PrivateRoomLobbyPort,
        private readonly rooms: RoomClient = RoomClient.inst,
    ) {}

    /**
     * 房主创建私房：prepareCreate（配额/ticket 归服务端权威）→ create("game")。
     * profile 缺省 "private"（generated catalog 声明的 invite 组合）。
     */
    async createRoom<
        TMode extends SupportedGameRoomMode,
        TOutbound extends keyof C2SPayloadMap,
    >(
        adapter: GameplayRoomAdapter<TMode, TOutbound>,
        profile = "private",
        control?: JoinControl | AbortSignal,
    ): Promise<GameRoomOwnership<TMode, TOutbound>> {
        const modeVersion = gameRoomModeVersion(adapter.mode);
        let prepared: RpcRes<typeof RoomRpc.PrepareCreate>;
        try {
            prepared = await this.lobby.rpcIdem(RoomRpc.PrepareCreate, {
                mode: adapter.mode,
                modeVersion,
                profile,
            });
        } catch (error) {
            throw asPrivateRoomError(error);
        }
        const access: IGameRoomAccess = { kind: "create", ticket: prepared.creationTicket };
        return this.joinWithAccess(adapter, profile, modeVersion, access, control, {
            kind: "create",
            roomName: RoomName.Game,
        });
    }

    /**
     * 好友按六位码进房：resolve → joinById。任何 resolve 失败都停留可重试
     * （⛔ 不回退 joinOrCreate、不清登录态——§10.2 行 22）。
     */
    async joinByCode<
        TMode extends SupportedGameRoomMode,
        TOutbound extends keyof C2SPayloadMap,
    >(
        code: string,
        adapter: GameplayRoomAdapter<TMode, TOutbound>,
        control?: JoinControl | AbortSignal,
    ): Promise<GameRoomOwnership<TMode, TOutbound>> {
        // 本地形状闸（§6.6）：格式非法不消费 resolve 速率预算，直接停留重输。
        if (typeof code !== "string" || !INVITE_CODE_SHAPE.test(code)) {
            throw new PrivateRoomError("ROOM_CODE_FORMAT", true);
        }
        let resolved: RpcRes<typeof RoomRpc.Resolve>;
        try {
            resolved = await this.lobby.rpc(RoomRpc.Resolve, { code });
        } catch (error) {
            throw asPrivateRoomError(error);
        }
        // resolve 快照只作定位（最终权威在 GameRoom admission，§6.8）：mode 与本端 adapter
        // 不一致按折叠类停留；modeVersion 与 client catalog 不一致 = 本包过旧，不可重输解决。
        if (resolved.mode !== adapter.mode) {
            throw new PrivateRoomError("ROOM_CODE_UNAVAILABLE", true);
        }
        if (resolved.modeVersion !== gameRoomModeVersion(adapter.mode)) {
            throw new PrivateRoomError("ROOM_MODE_VERSION_STALE", false);
        }
        const access: IGameRoomAccess = { kind: "join", ticket: resolved.joinTicket };
        return this.joinWithAccess(adapter, resolved.profile, resolved.modeVersion, access, control, {
            kind: "join-by-id",
            roomId: resolved.roomId,
        });
    }

    private joinWithAccess<
        TMode extends SupportedGameRoomMode,
        TOutbound extends keyof C2SPayloadMap,
    >(
        adapter: GameplayRoomAdapter<TMode, TOutbound>,
        profile: string,
        modeVersion: number,
        access: IGameRoomAccess,
        control: JoinControl | AbortSignal | undefined,
        strategy: { kind: "create"; roomName: string } | { kind: "join-by-id"; roomId: string },
    ): GameRoomOwnership<TMode, TOutbound> {
        const server = getCurrentServer();
        if (!server) throw new PrivateRoomError("NO_SERVER_SELECTED", false, "[PrivateRoom] 尚未选择区服");
        this.rooms.init(getCurrentGameWsUrl());
        return this.rooms.joinGame(adapter, {
            token: getToken(),
            sId: server.serverId,
            mode: adapter.mode,
            modeVersion,
            profile,
            access,
        }, control, strategy);
    }
}
