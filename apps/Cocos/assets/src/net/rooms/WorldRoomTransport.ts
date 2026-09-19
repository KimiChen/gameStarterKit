/**
 * WorldRoomTransport（MMO MF4-B7，docs/MMO.md §4.2 / §4.5 / §5.4 MF4）：世界房（RoomName.World）的客户端传输。
 * 与 GameRoom 的 RoomClient **分开**（⛔ RoomClient / GameRoomTransport 零改动）：世界房没有 match 生命周期 / Schema 名册 / 开局屏障——
 * 名册与视野走 MF5b 的 perSession 消息流，Schema root 只承载分线生命周期字段（tick / phase / instanceId / mapId / line / authorityEpoch）。
 *
 *  - join：`world.enter`（MF8）签发的 `{ personaId, ticket }` + strategy `{ kind:"world", mapId, line? }` → 信封（`v = WORLD_ROOM_PROTOCOL_VERSION`、
 *    `modeVersion` 取 client catalog 且 mode 必须是 `kind:"world"`、`profile` 恒 "world"、token / sId 取会话）先在本地经
 *    `validateWorldRoomJoinOptions` exact 校验，再 `client.joinOrCreate(RoomName.World, options)`；⛔ 不打印 token / ticket；
 *  - 一个 transport 同时只持有一个世界房：再 join 先 leave（fail-fast，⛔ 不静默换房）；
 *  - 出站：只放行 core 与本 mode 的 C2S（GAME_WIRE_OWNERS），payload 先过 validateC2SPayload；掉线期间拒发——SDK 离线队列已禁
 *    （⛔ 不重放旧意图：移动意图是时点性的，重连后由玩法层按当前输入重发）；
 *  - 入站：onMessage 先过 validateS2CPayload，非法帧丢弃并告警（不打印报文）；
 *  - 离开分类：CONSENTED = 自己离开；WITH_ERROR = 世界 Draining / Offline（⛔ 不能重连同房，须经 world.enter 重新进入）；
 *    KICK_CLOSE_CODE[Replaced] = 同 persona 在别处取得控制权；其余 = 掉线（SDK 自动重连，onReconnect 归位）。
 *  端点：PS2 落地前用 getCurrentGameWsUrl()（D27：/version 的 worldWs 缺省回落 gameWs）。
 */
import { getToken } from "../../core/http";
import {
    ForceLogoutReason,
    GAME_WIRE_OWNERS,
    KICK_CLOSE_CODE,
    RoomName,
    WORLD_ROOM_PROTOCOL_VERSION,
    validateC2SPayload,
    validateOrigin,
    validateS2CPayload,
    validateWorldRoomJoinOptions,
    type C2SPayloadMap,
    type IWorldRoomJoinOptions,
    type S2CPayloadMap,
} from "../../shared/index";
import { getCurrentGameWsUrl, getCurrentServer } from "../serverSession";
import { cloneJson, disableSdkOutboundReplay, safeError, warnInvalidWire as sharedWarnInvalidWire } from "../wireCommon";
import { WORLD_ROOM_PROFILE, normalizeWorldRoomStrategy, worldRoomModeVersion, type WorldRoomMatchmakingStrategy } from "./matchmaking";

export interface WorldJoinRequest {
    /** world 形态玩法 id（client catalog `kind:"world"`）。 */
    readonly mode: string;
    /** 撮合目标（mapId / line?）；kind 缺省补 "world"。 */
    readonly strategy: WorldRoomMatchmakingStrategy | { readonly mapId: string; readonly line?: number };
    /** world.enter 签发的一次性凭据（MF8）；⛔ 不落日志。 */
    readonly personaId: string;
    readonly ticket: string;
    /** 重连：已收到的最后 seq（缺省从 baseline 重来；MF5b）。 */
    readonly resumeSeq?: number;
}

export type WorldLeaveKind = "consented" | "drained" | "replaced" | "dropped";

/** Colyseus 关闭码 → 世界房离开语义（服务端 WorldRoom：Offline ⇒ WITH_ERROR；顶号 ⇒ KICK_CLOSE_CODE[Replaced]）。 */
export function worldLeaveKindOf(code: unknown): WorldLeaveKind {
    if (typeof code !== "number") return "dropped";
    if (code === SDK_CLOSE_CODE.CONSENTED) return "consented";
    if (code === SDK_CLOSE_CODE.WITH_ERROR) return "drained";
    if (code === KICK_CLOSE_CODE[ForceLogoutReason.Replaced]) return "replaced";
    return "dropped";
}

export interface WorldRoomHandle {
    readonly kind: "world-room";
    readonly mode: string;
    readonly mapId: string;
    readonly line: number | null;
    readonly roomId: string;
    readonly sessionId: string;
    /** 未离开且未掉线（掉线 / 重连握手期间为 false：send 拒发）。 */
    readonly current: boolean;
    readonly dropping: boolean;
    readonly left: boolean;
    onMessage<K extends keyof S2CPayloadMap>(type: K, callback: (payload: S2CPayloadMap[K]) => unknown): () => void;
    onDrop(callback: (code?: number) => void): () => void;
    onReconnect(callback: () => void): () => void;
    onLeave(callback: (kind: WorldLeaveKind, code: number | undefined) => void): () => void;
    /** 只放行 core 与本 mode 的 C2S；payload 先 exact 校验；掉线 / 已离开拒发。返回是否已交给 SDK。 */
    send<K extends keyof C2SPayloadMap>(type: K, payload: C2SPayloadMap[K]): boolean;
    leave(): Promise<void>;
}

/** 本传输只用到的 SDK 面（单测可注入 double）。 */
export interface WorldRoomSdkClient {
    auth: { token: string };
    joinOrCreate<T>(roomName: string, options?: unknown): Promise<Colyseus.Room<T>>;
}

export interface WorldRoomTransportDeps {
    readonly client: () => WorldRoomSdkClient;
    readonly token: () => string;
    readonly sId: () => number;
}

const warnInvalidWire = (scope: string, error: unknown): void => sharedWarnInvalidWire("[WorldRoom]", scope, error);

/**
 * Colyseus 关闭码（@colyseus/shared-types CloseCode，服务端 WorldRoom 同源）：SDK 全局在 Node 无头单测里不存在，故本地钉值；
 * 浏览器 / Creator 里全局存在时加载期核对，分叉即炸（⛔ 不让两份数字静默漂移）。
 */
export const SDK_CLOSE_CODE = Object.freeze({ CONSENTED: 4000, WITH_ERROR: 4002 });
if (typeof Colyseus !== "undefined" && Colyseus.CloseCode
    && (Colyseus.CloseCode.CONSENTED !== SDK_CLOSE_CODE.CONSENTED || Colyseus.CloseCode.WITH_ERROR !== SDK_CLOSE_CODE.WITH_ERROR)) {
    throw new Error("[WorldRoom] SDK CloseCode 与本地钉值不一致（CONSENTED / WITH_ERROR）");
}

/** 信封组装（单源：catalog modeVersion、profile 恒 world、v = 世界整数）；本地 exact 校验失败即 throw（⛔ 不带着坏信封上路）。 */
export function buildWorldJoinOptions(request: WorldJoinRequest, deps: Pick<WorldRoomTransportDeps, "token" | "sId">): IWorldRoomJoinOptions {
    const strategy = normalizeWorldRoomStrategy({ kind: "world", ...request.strategy });
    const modeVersion = worldRoomModeVersion(request.mode);
    const raw: Record<string, unknown> = {
        v: WORLD_ROOM_PROTOCOL_VERSION,
        token: deps.token(),
        sId: deps.sId(),
        mode: request.mode,
        modeVersion,
        profile: WORLD_ROOM_PROFILE,
        mapId: strategy.mapId,
        personaId: request.personaId,
        ticket: request.ticket,
    };
    if (strategy.line !== undefined) raw.line = strategy.line;
    if (request.resumeSeq !== undefined) raw.resumeSeq = request.resumeSeq;
    return validateWorldRoomJoinOptions(cloneJson(raw));
}

export class WorldRoomTransport {
    private activeHandle: WorldRoomHandle | null = null;
    private joining = false;

    constructor(private readonly deps: WorldRoomTransportDeps) {}

    /** 生产装配：当前区服端点 + 会话 token / sId（每个 transport 一个 SDK Client）。 */
    static forCurrentServer(): WorldRoomTransport {
        const server = getCurrentServer();
        if (!server) throw new Error("[WorldRoom] 尚未选择区服，不能进入世界");
        const endpoint = validateOrigin(getCurrentGameWsUrl(), ["http", "https", "ws", "wss"], "endpoint");
        const client = new Colyseus.Client(endpoint) as unknown as WorldRoomSdkClient;
        return new WorldRoomTransport({ client: () => client, token: () => getToken(), sId: () => server.serverId });
    }

    get active(): WorldRoomHandle | null {
        return this.activeHandle;
    }

    /**
     * 进入世界：信封校验 → SDK joinOrCreate(RoomName.World)。在途 / 已持有世界房时 fail-fast（先 leave）。
     * `signal` 只取消本地等待：SDK 握手不可中断，迟到的 room 会被立即释放。
     */
    async join(request: WorldJoinRequest, control: { readonly signal?: AbortSignal } = {}): Promise<WorldRoomHandle> {
        if (this.joining || (this.activeHandle && !this.activeHandle.left)) {
            throw new Error("[WorldRoom] 已持有 / 正在进入世界房，请先 leave 再进入另一条分线");
        }
        const joinOptions = buildWorldJoinOptions(request, this.deps);
        const client = this.deps.client();
        if (control.signal?.aborted) throw new Error("[WorldRoom] join 已取消");
        this.joining = true;
        let room: Colyseus.Room<unknown>;
        try {
            // Colyseus 从标准 auth token 字段鉴权；options.token 只是兼容字段（服务端逐字相等校验）。
            client.auth.token = joinOptions.token ?? "";
            room = await client.joinOrCreate<unknown>(RoomName.World, joinOptions);
        } catch (error) {
            this.joining = false;
            throw safeError(error, "[WorldRoom] join failed");
        }
        this.joining = false;
        if (control.signal?.aborted) {
            try { await Promise.resolve(room.leave()); } catch { /* 迟到的房：尽力释放 */ }
            throw new Error("[WorldRoom] join 已取消（迟到的房已释放）");
        }
        if (!disableSdkOutboundReplay(room)) {
            try { await Promise.resolve(room.leave()); } catch { /* 释放失败由服务端宽限兜底 */ }
            throw new Error("[WorldRoom] 无法禁用 SDK 离线消息队列");
        }
        const handle = this.bind(room, request.mode, joinOptions.mapId, joinOptions.line ?? null);
        this.activeHandle = handle;
        return handle;
    }

    private bind(room: Colyseus.Room<unknown>, mode: string, mapId: string, line: number | null): WorldRoomHandle {
        let dropping = false;
        let left = false;
        const dropListeners = new Set<(code?: number) => void>();
        const reconnectListeners = new Set<() => void>();
        const leaveListeners = new Set<(kind: WorldLeaveKind, code: number | undefined) => void>();
        const ownerOk = (type: string): boolean => {
            const owner = (GAME_WIRE_OWNERS as Readonly<Partial<Record<string, string>>>)[type];
            return owner === "core" || owner === mode;
        };
        const socketOpen = (): boolean => {
            try {
                const connection = (room as unknown as { connection?: { isOpen?: unknown } }).connection;
                return !!connection && connection.isOpen === true;
            } catch {
                return false;
            }
        };
        const finish = (kind: WorldLeaveKind, code: number | undefined): void => {
            if (left) return;
            left = true;
            dropping = false;
            if (this.activeHandle === handle) this.activeHandle = null;
            for (const listener of [...leaveListeners]) {
                try { listener(kind, code); } catch { console.error("[WorldRoom] onLeave callback exception"); }
            }
            dropListeners.clear();
            reconnectListeners.clear();
            leaveListeners.clear();
            try { room.removeAllListeners(); } catch { /* malformed adapter */ }
        };
        room.onDrop((code) => {
            if (left) return;
            dropping = true;
            // 掉线窗口里 SDK 会把 send 排进离线队列并在重连后 flush；世界意图 ⛔ 不重放。
            disableSdkOutboundReplay(room);
            for (const listener of [...dropListeners]) {
                try { listener(typeof code === "number" ? code : undefined); } catch { console.error("[WorldRoom] onDrop callback exception"); }
            }
        });
        room.onReconnect(() => {
            if (left) return;
            dropping = false;
            disableSdkOutboundReplay(room);
            for (const listener of [...reconnectListeners]) {
                try { listener(); } catch { console.error("[WorldRoom] onReconnect callback exception"); }
            }
        });
        room.onLeave((code) => {
            const numeric = typeof code === "number" ? code : undefined;
            finish(worldLeaveKindOf(numeric), numeric);
        });
        room.onError((code, message) => {
            console.error(`[WorldRoom] 房间错误 code=${String(code)} message=${typeof message === "string" ? message.slice(0, 120) : ""}`);
        });
        const handle: WorldRoomHandle = {
            kind: "world-room",
            mode,
            mapId,
            line,
            get roomId() { return room.roomId; },
            get sessionId() { return room.sessionId; },
            get current() { return !left && !dropping; },
            get dropping() { return dropping; },
            get left() { return left; },
            onMessage: (type, callback) => room.onMessage(type as string, (raw: unknown) => {
                if (left) return;
                let payload: unknown;
                try {
                    payload = validateS2CPayload(type, raw);
                } catch (error) {
                    warnInvalidWire(`S2C ${String(type)}`, error);
                    return;
                }
                try {
                    const result = callback(payload as S2CPayloadMap[typeof type]);
                    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
                        void Promise.resolve(result).catch(() => { console.error(`[WorldRoom] ${String(type)} callback rejection`); });
                    }
                } catch {
                    console.error(`[WorldRoom] ${String(type)} callback exception`);
                }
            }),
            onDrop: (callback) => { dropListeners.add(callback); return () => { dropListeners.delete(callback); }; },
            onReconnect: (callback) => { reconnectListeners.add(callback); return () => { reconnectListeners.delete(callback); }; },
            onLeave: (callback) => { leaveListeners.add(callback); return () => { leaveListeners.delete(callback); }; },
            send: (type, payload) => {
                if (left || dropping || !socketOpen()) return false;
                if (!ownerOk(type as string)) {
                    console.warn(`[WorldRoom] C2S ${String(type)} 不属 core / ${mode}，拒发`);
                    return false;
                }
                let wire: unknown;
                try {
                    wire = validateC2SPayload(type, payload);
                } catch (error) {
                    warnInvalidWire(`C2S ${String(type)}`, error);
                    return false;
                }
                try {
                    room.send(type as string, wire);
                    return true;
                } catch {
                    console.warn(`[WorldRoom] C2S ${String(type)} 发送失败`);
                    return false;
                }
            },
            leave: async () => {
                if (left) return;
                try {
                    await Promise.resolve(room.leave());
                } catch {
                    /* 掉线窗口里 LEAVE 帧可能发不出去：本地照样收尾 */
                } finally {
                    finish("consented", SDK_CLOSE_CODE.CONSENTED);
                }
            },
        };
        return handle;
    }
}
