/**
 * 大厅 RPC 客户端 —— LobbyRoom 的请求-响应通道封装（HTTP 式语义，走 Colyseus websocket）。
 *
 * 与 RoomClient（GameRoom：fire-and-forget + 状态同步）职责分离：本类只管 lobby 房的
 * `rpc`（信封 {id,type,payload} ⇄ {id,ok,data,err}，按 id 配对）与 `push`（{type,data}）两个消息。
 * 路由名与 req/res 类型全部来自 shared/protocol/lobbyRpc（铁律 6：⛔ 不手写消息名字符串）。
 *
 * 使用约定：
 *  - 错误处理只按 RpcError.code 分支，⛔ 禁止解析 msg（09·G3）
 *  - 写接口一律走 rpcIdem：clientReqId 每个逻辑操作生成一次，重试复用同一个（09·I2）
 *  - join 需要框架 token（POST /account/wx-login 或 /account/dev-login 签发）
 *  - 鉴权类错误码（踢线/过期/封号）统一上报 net/session.notifyAuthInvalid，UI 从 session 订阅
 */
import { notifyAuthInvalid, notifyConnLost, type AuthInvalidReason } from "./session";
import {
    LOBBY_MSG_PUSH,
    LOBBY_MSG_RPC,
    PROTOCOL_VERSION,
    RoomName,
    type IRpcEnvelope,
    type IRpcReply,
    type LobbyPushMap,
    type LobbyRpcIdemType,
    type LobbyRpcType,
    type RpcErrCode,
    type RpcReq,
    type RpcRes,
} from "../shared/index";

/**
 * 客户端等待上限：服务端 handler 超时 10s（infra/config HANDLER_TIMEOUT_MS）+ RTT 余量。
 * 超时后该 id 的迟到回包直接静默丢弃（不是协议错误）。
 */
const RPC_CLIENT_TIMEOUT_MS = 15_000;

/** rpcIdem 对 BUSY/STALE_FENCE 的自动重试（07 重试表：同一 clientReqId 短退避重试） */
const IDEM_RETRY_MAX = 3;
const IDEM_RETRY_DELAY_MS = 300;

/** leave 的等待上限：掉线窗口里 LEAVE 帧可能发不出去、onLeave 永不触发，限时后强制本地清理 */
const LEAVE_TIMEOUT_MS = 5_000;

/** 客户端本地错误码（刻意不在服务端 07 错误码表里）：连接断开 / 本地等待超时 */
export type LocalErrCode = "CONN_LOST" | "TIMEOUT";

/** RPC 失败统一异常：调用方只按 code 分支。 */
export class RpcError extends Error {
    /**
     * rpcIdem 抛出时回填本次使用的幂等 id。money 路径重试**必须**回传同一个——
     * `rpcIdem(type, payload, err.clientReqId)`；换新 id 等于发起新操作（可能重复扣费）。
     */
    clientReqId?: string;

    constructor(
        readonly code: RpcErrCode | LocalErrCode,
        msg = "",
    ) {
        super(msg);
        this.name = "RpcError";
    }
}

interface IPending {
    resolve: (data: unknown) => void;
    reject: (e: RpcError) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class WebSocketClient {
    private static _inst: WebSocketClient | null = null;
    static get inst(): WebSocketClient {
        if (!this._inst) this._inst = new WebSocketClient();
        return this._inst;
    }

    private client: Colyseus.Client | null = null;
    private room: Colyseus.Room | null = null;
    /** 进行中的 join（并发调用合流，防双击开出两条 ws——孤儿连接会双份收推送） */
    private joining: Promise<void> | null = null;
    /** 当前连接鉴权所用的 token（换号检测） */
    private joinedToken = "";
    private pending = new Map<string, IPending>();
    private seq = 0;
    private pushHandlers = new Map<string, Set<(data: unknown) => void>>();
    /** 主动 leave 进行中的标志：区分「用户登出/换号」与「连接意外死亡」（后者才通知 connLost） */
    private leaving = false;

    get connected(): boolean {
        return this.room != null;
    }

    /** @param endpoint http(s) 地址，如 http://localhost:2568（SDK 自动派生 ws(s)） */
    init(endpoint: string): void {
        this.client = new Colyseus.Client(endpoint);
    }

    /**
     * 加入大厅房。token 为框架 token（wx-login 签发），经 SDK auth 通道以
     * Authorization: Bearer 头送达服务端 static onAuth（token 反查 uid，09·G1）。
     * 并发调用合流到同一次连接；已在线时用不同 token 调用会抛错（换号必须先 leave()）。
     */
    async join(token: string): Promise<void> {
        if (!this.client) throw new Error("[WebSocketClient] 未初始化，请先调用 init(endpoint)");
        if (!this.room && !this.joining) {
            this.joining = this.doJoin(token);
            try {
                await this.joining;
            } finally {
                this.joining = null;
            }
            return;
        }
        if (this.joining) await this.joining;
        if (this.joinedToken !== token) {
            throw new Error("[WebSocketClient] 已用其他 token 在线：换号必须先 leave() 再 join()");
        }
    }

    private async doJoin(token: string): Promise<void> {
        this.client!.auth.token = token;
        const room = await this.client!.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION });
        this.room = room;
        this.joinedToken = token;

        // 唯一的 RPC 回包处理器：按信封 id 落到 pending；已超时清掉的迟到回包静默丢弃
        room.onMessage(LOBBY_MSG_RPC, (reply: IRpcReply) => {
            const p = this.pending.get(reply.id);
            if (!p) return;
            this.pending.delete(reply.id);
            clearTimeout(p.timer);
            if (reply.ok) {
                p.resolve(reply.data);
            } else {
                const code = (reply.err?.code ?? "INTERNAL") as RpcErrCode;
                // 踢线/过期/封号：dispatcher 每消息复验 tokenEpoch，命中即上报 session
                //（清会话 + 广播）——调用方仍收到原样 RpcError 以终止自身流程
                if (code === "AUTH_EPOCH_STALE" || code === "AUTH_REQUIRED" || code === "ACCOUNT_BANNED") {
                    notifyAuthInvalid(code as AuthInvalidReason);
                }
                p.reject(new RpcError(code, reply.err?.msg ?? ""));
            }
        });
        room.onMessage(LOBBY_MSG_PUSH, (msg: { type: string; data: unknown }) => {
            const set = this.pushHandlers.get(msg.type);
            if (!set) return;
            for (const cb of set) {
                try { cb(msg.data); } catch (e) { console.error("[WebSocketClient] push 处理器异常", e); }
            }
        });

        // 掉线/离开：在途请求的回包可能已在断开窗口丢失，全部判 CONN_LOST 由调用方决定重试
        //（0.17 自动重连保留本 room 实例与消息监听，重连后新请求直接可用；
        //  幂等写接口重试必须复用同一 clientReqId——rpcIdem 已封装）。
        // 回调按 room 身份守卫：迟到的旧连接事件不得影响重新 join 后的新连接
        room.onDrop(() => {
            if (this.room !== room) return;
            this.rejectAll("CONN_LOST");
        });
        room.onLeave(() => {
            if (this.room !== room) return;
            const wasIntentional = this.leaving;
            this.room = null;
            this.joinedToken = "";
            this.rejectAll("CONN_LOST");
            // 非主动 leave 的最终死亡（SDK 自动重连耗尽/服务端强断）：通知 session，
            // UI 层提示后可用原 token 重新 join（登录态未失效）
            if (!wasIntentional) { notifyConnLost(); }
        });
    }

    /**
     * 主动离开大厅房。join 在途时先等落定再清理（取消不了进行中的握手，完成后离开，
     * 不留「服务端已 registerOnline 客户端却以为没连上」的幽灵在线——且之后换新 token
     * join 不会再被「换号必须先 leave()」误伤）。掉线重连窗口里调用也安全：先停自动
     * 重连（防 LEAVE 帧丢失后连接复活成幽灵会话），限时等待 onLeave，超时则强制本地清理。
     */
    async leave(): Promise<void> {
        if (this.joining) { await this.joining.catch(() => {}); }
        const room = this.room;
        if (!room) return;
        this.leaving = true; // 主动离开：onLeave 不得当成意外死亡广播 connLost
        try {
            this.room = null; // 先摘引用：leave 期间新发起的 rpc 直接 CONN_LOST，不发往将死的连接
            this.joinedToken = "";
            this.rejectAll("CONN_LOST");
            room.reconnection.enabled = false;
            await Promise.race([
                room.leave(true).catch(() => { /* 掉线窗口发不出 LEAVE 帧属预期 */ }),
                new Promise<void>((r) => setTimeout(r, LEAVE_TIMEOUT_MS)),
            ]);
            room.removeAllListeners();
        } finally {
            this.leaving = false;
        }
    }

    /**
     * 单次请求（HTTP 式语义）：发出 → 服务端读 Redis/MySQL → 一次回包 → 请求结束。
     * 返回类型由 shared 契约推导；失败抛 RpcError（只按 code 分支）。
     *
     *   const { uid } = await WebSocketClient.inst.rpc(UserRpc.GetUserId, {});
     */
    rpc<T extends LobbyRpcType>(type: T, payload: RpcReq<T>): Promise<RpcRes<T>> {
        const room = this.room;
        if (!room) return Promise.reject(new RpcError("CONN_LOST", "未加入大厅房"));
        const id = `r${++this.seq}`; // 仅本连接内配对；断线时 pending 全清，不跨连接复用
        return new Promise<RpcRes<T>>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new RpcError("TIMEOUT", type));
            }, RPC_CLIENT_TIMEOUT_MS);
            this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject, timer });
            const envelope: IRpcEnvelope = { id, type, payload };
            room.send(LOBBY_MSG_RPC, envelope);
        });
    }

    /**
     * 幂等写请求：clientReqId 本次逻辑操作生成一次并在重试间复用（09·I2）。
     * BUSY / STALE_FENCE 自动短退避重试；其余错误抛 RpcError 且**回填 err.clientReqId**——
     * 调用方跨调用重试（TIMEOUT / CONN_LOST / IN_PROGRESS 短轮询等）必须回传同一个 id：
     *   `rpcIdem(type, payload, err.clientReqId)`
     * 换新 id 等于发起新操作（money 路径会重复扣费）。
     */
    async rpcIdem<T extends LobbyRpcIdemType>(
        type: T,
        payload: Omit<RpcReq<T>, "clientReqId">,
        clientReqId: string = WebSocketClient.newClientReqId(),
    ): Promise<RpcRes<T>> {
        const full = { ...payload, clientReqId } as RpcReq<T>;
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.rpc(type, full);
            } catch (e) {
                const retriable = e instanceof RpcError && (e.code === "BUSY" || e.code === "STALE_FENCE");
                if (!retriable || attempt >= IDEM_RETRY_MAX) {
                    if (e instanceof RpcError) { e.clientReqId = clientReqId; }
                    throw e;
                }
                await new Promise((r) => setTimeout(r, IDEM_RETRY_DELAY_MS));
            }
        }
    }

    /** 订阅服务端主动推送（如 LobbyPush.MailNew），返回解绑函数。 */
    onPush<K extends keyof LobbyPushMap>(type: K, callback: (data: LobbyPushMap[K]) => void): () => void {
        let set = this.pushHandlers.get(type);
        if (!set) {
            set = new Set();
            this.pushHandlers.set(type, set);
        }
        const cb = callback as (data: unknown) => void;
        set.add(cb);
        return () => { this.pushHandlers.get(type)?.delete(cb); };
    }

    /** 幂等操作 id：跨会话唯一即可（时间基 36 进制 + 随机尾），≤64 字符（信封约束）。 */
    static newClientReqId(): string {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    private rejectAll(code: LocalErrCode): void {
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(new RpcError(code));
        }
        this.pending.clear();
    }
}
