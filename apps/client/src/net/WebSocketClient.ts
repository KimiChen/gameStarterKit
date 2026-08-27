/**
 * 大厅 RPC 客户端 —— LobbyRoom 的请求-响应通道封装（HTTP 式语义，走 Colyseus websocket）。
 *
 * 与 RoomClient（GameRoom：fire-and-forget + 状态同步）职责分离：本类只管 lobby 房的
 * `rpc`（信封 {id,type,payload} ⇄ {id,ok,data,err}，按 id 配对）与 `push`（{type,data}）两个消息。
 * 路由名与 req/res 类型全部来自 shared/protocol/lobbyRpc（铁律 6）。
 */
import { notifyAuthInvalid, notifyConnLost, type AuthInvalidReason } from "./session";
import {
    ForceLogoutReason,
    forceLogoutReasonOf,
    LOBBY_MSG_PUSH,
    LOBBY_MSG_RPC,
    LobbyPush,
    PROTOCOL_VERSION,
    RoomName,
    type ForceLogoutReasonType,
    type IRoomJoinOptions,
    type IRpcEnvelope,
    type IRpcReply,
    type LobbyPushEnvelope,
    type LobbyPushMap,
    type LobbyRpcIdemType,
    type LobbyRpcType,
    type RpcErrCode,
    type RpcReq,
    type RpcRes,
    validateLobbyPush,
    validateLobbyRpcRequest,
    validateLobbyRpcResponse,
    validateRpcEnvelope,
    validateRpcReply,
    validateRoomJoinOptions,
} from "../shared/index";

const RPC_CLIENT_TIMEOUT_MS = 15_000;
const IDEM_RETRY_MAX = 3;
const IDEM_RETRY_DELAY_MS = 300;
const LEAVE_TIMEOUT_MS = 5_000;

/** join 的本地生命周期控制；这些字段不会进入 Lobby matchmaking options。 */
export interface JoinControl {
    signal?: AbortSignal;
    timeoutMs?: number;
    deadlineMs?: number;
    timeout?: number;
    deadline?: number;
}

export type JoinFailureCode = "TIMEOUT" | "CANCELLED";

export class JoinError extends Error {
    constructor(readonly code: JoinFailureCode, message: string = code) {
        super(message);
        this.name = "JoinError";
    }
}

export interface LobbyConnectionOwnership {
    readonly ready: Promise<void>;
    leave(): Promise<void>;
}

/** 客户端本地错误码（刻意不在 shared RPC_ERR_CODES 里）。 */
export type LocalErrCode = "CONN_LOST" | "TIMEOUT";

/** RPC 失败统一异常：调用方只按 code 分支。 */
export class RpcError extends Error {
    clientReqId?: string;

    constructor(readonly code: RpcErrCode | LocalErrCode, msg = "") {
        super(msg);
        this.name = "RpcError";
    }
}

function cloneJson<T>(value: T, ancestors = new Set<object>()): T {
    if (value === null || typeof value !== "object") {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new TypeError("[WebSocketClient] join options 不能包含 NaN/Infinity");
        }
        if (typeof value === "bigint") {
            throw new TypeError("[WebSocketClient] join options 不支持 BigInt");
        }
        return value;
    }
    const object = value as unknown as object;
    if (ancestors.has(object)) throw new TypeError("[WebSocketClient] join options 不支持循环引用");
    ancestors.add(object);
    try {
        if (Array.isArray(value)) return value.map((item) => cloneJson(item, ancestors)) as unknown as T;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>)) {
            const item = (value as Record<string, unknown>)[key];
            if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
            out[key] = cloneJson(item, ancestors);
        }
        return out as T;
    } finally {
        ancestors.delete(object);
    }
}

function stableJson(value: unknown, ancestors = new Set<object>()): string | undefined {
    if (value === null) return "null";
    switch (typeof value) {
        case "string": return JSON.stringify(value);
        case "boolean": return value ? "true" : "false";
        case "number": return JSON.stringify(value);
        case "undefined":
        case "function":
        case "symbol": return undefined;
        case "bigint": throw new TypeError("[WebSocketClient] join options 不支持 BigInt");
        case "object": break;
    }
    const object = value as object;
    if (ancestors.has(object)) throw new TypeError("[WebSocketClient] join options 不支持循环引用");
    ancestors.add(object);
    try {
        if (Array.isArray(object)) {
            return `[${object.map((item) => stableJson(item, ancestors) ?? "null").join(",")}]`;
        }
        const fields: string[] = [];
        for (const key of Object.keys(object).sort()) {
            const encoded = stableJson((object as Record<string, unknown>)[key], ancestors);
            if (encoded !== undefined) fields.push(`${JSON.stringify(key)}:${encoded}`);
        }
        return `{${fields.join(",")}}`;
    } finally {
        ancestors.delete(object);
    }
}

function splitJoinControl(
    options: Record<string, unknown> | undefined,
    explicit: JoinControl | AbortSignal | undefined,
): { options: Record<string, unknown>; control: JoinControl } {
    const source = options ?? {};
    const wire: Record<string, unknown> = { ...source };
    const embedded = source as Record<string, unknown> & Partial<JoinControl>;
    const explicitControl: JoinControl | undefined = explicit && "aborted" in explicit
        ? { signal: explicit as AbortSignal }
        : explicit as JoinControl | undefined;
    const control: JoinControl = explicitControl ?? {
        signal: embedded.signal,
        timeoutMs: embedded.timeoutMs,
        deadlineMs: embedded.deadlineMs,
        timeout: embedded.timeout,
        deadline: embedded.deadline,
    };
    delete wire.signal;
    delete wire.timeoutMs;
    delete wire.deadlineMs;
    delete wire.timeout;
    delete wire.deadline;
    return { options: wire, control };
}

function waitMsFor(control: JoinControl): number {
    const now = Date.now();
    if (control.deadlineMs !== undefined) {
        const raw = Number(control.deadlineMs);
        if (!Number.isFinite(raw)) return 0;
        return Math.max(0, (raw < 1e11 ? now + raw : raw) - now);
    }
    if (control.timeoutMs !== undefined) {
        const raw = Number(control.timeoutMs);
        return Number.isFinite(raw) ? Math.max(0, raw) : 0;
    }
    if (control.timeout !== undefined) {
        const raw = Number(control.timeout);
        return Number.isFinite(raw) ? Math.max(0, raw) : 0;
    }
    return 15_000;
}

const FORCE_REASON_MAP: Record<ForceLogoutReasonType, AuthInvalidReason> = {
    [ForceLogoutReason.Banned]: "FORCE_BANNED",
    [ForceLogoutReason.Replaced]: "FORCE_REPLACED",
    [ForceLogoutReason.Revoked]: "FORCE_REVOKED",
};

interface LobbySlot {
    readonly connectionKey: string;
    readonly generation: number;
    readonly client: Colyseus.Client;
    readonly endpoint: string;
    readonly token: string;
    readonly options: IRoomJoinOptions;
    room: Colyseus.Room | null;
    ready: Promise<void>;
    closing: Promise<void> | null;
    physicalClose: Promise<void> | null;
    cancelled: boolean;
    dropping: boolean;
    readonly owners: Set<LobbyOwner>;
}

interface LobbyOwner {
    active: boolean;
    readonly slot: LobbySlot;
    readonly ready: Promise<void>;
    cancel(reason: Error): void;
    disposeControl(): void;
}

interface IPending {
    resolve: (data: unknown) => void;
    reject: (e: RpcError) => void;
    timer: ReturnType<typeof setTimeout>;
    readonly slot: LobbySlot;
    readonly type: LobbyRpcType;
}

function wireErrorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function warnInvalidWire(scope: string, error: unknown): void {
    // Do not print the packet itself: RPC payloads can contain account data and
    // join options can contain bearer tokens. The validator path is enough for
    // local diagnostics while keeping logs free of secrets.
    console.warn(`[WebSocketClient] 丢弃非法 ${scope}: ${wireErrorText(error)}`);
}

export class WebSocketClient {
    private static _inst: WebSocketClient | null = null;
    static get inst(): WebSocketClient {
        if (!this._inst) this._inst = new WebSocketClient();
        return this._inst;
    }

    private client: Colyseus.Client | null = null;
    /** 最近一次 init 的端点；在途槽使用自身固化的 endpoint/client。 */
    private endpoint = "";
    private slot: LobbySlot | null = null;
    private generation = 0;
    private readonly implicitOwners = new Set<LobbyConnectionOwnership>();
    private pending = new Map<string, IPending>();
    private seq = 0;
    private pushHandlers = new Map<string, Set<(data: unknown) => void>>();

    get connected(): boolean {
        return this.slot?.room != null;
    }

    get room(): Colyseus.Room | null {
        return this.slot?.room ?? null;
    }

    /** @param endpoint http(s) 地址，如 http://localhost:2568（SDK 自动派生 ws(s)） */
    init(endpoint: string): void {
        this.client = new Colyseus.Client(endpoint);
        this.endpoint = endpoint;
    }

    /**
     * 兼容旧调用面的隐式 ownership join。client、endpoint、token 和完整 options 在槽创建时
     * 固化；后续 init(B) 不会把等待中的物理 A 记成 B。调用 leave() 释放全部隐式 owner。
     */
    async join(token: string, options?: Record<string, unknown>, control?: JoinControl | AbortSignal): Promise<void> {
        const owner = this.joinOwned(token, options, control);
        this.implicitOwners.add(owner);
        try {
            await owner.ready;
        } catch (e) {
            this.implicitOwners.delete(owner);
            await owner.leave().catch(() => {});
            throw e;
        }
    }

    /** Lobby 连接的显式 ownership 入口，供可取消/可替换的编排层使用。 */
    joinOwned(
        token: string,
        options?: Record<string, unknown>,
        control?: JoinControl | AbortSignal,
    ): LobbyConnectionOwnership {
        if (!this.client) throw new Error("[WebSocketClient] 未初始化，请先调用 init(endpoint)");
        const split = splitJoinControl(options, control);
        // Matchmaking options cross the websocket boundary verbatim. Validate a
        // cloned copy so callers cannot mutate the identity after join starts.
        const joinOptions = validateRoomJoinOptions(
            cloneJson({ ...split.options, v: PROTOCOL_VERSION }),
        ) as IRoomJoinOptions;
        const endpoint = this.endpoint;
        const client = this.client;
        const key = stableJson([endpoint, token, joinOptions])!;
        let slot = this.slot;
        if (slot && slot.connectionKey !== key) {
            throw new Error("[WebSocketClient] 当前大厅连接参数与本次 join 不一致，请先 leave() 再 join()");
        }
        if (!slot) {
            slot = {
                connectionKey: key,
                generation: ++this.generation,
                client,
                endpoint,
                token,
                options: joinOptions,
                room: null,
                ready: null as unknown as Promise<void>,
                closing: null,
                physicalClose: null,
                cancelled: false,
                dropping: false,
                owners: new Set<LobbyOwner>(),
            };
            this.slot = slot;
            slot.ready = this.doJoin(slot);
            slot.ready.catch(() => {});
        }

        let rejectCancelled!: (reason: Error) => void;
        const cancelled = new Promise<void>((_resolve, reject) => { rejectCancelled = reject; });
        const ready = Promise.race([slot.ready, cancelled]);
        ready.catch(() => {});
        const owner: LobbyOwner = {
            active: true,
            slot,
            ready,
            cancel: (reason) => rejectCancelled(reason),
            disposeControl: () => {},
        };
        slot.owners.add(owner);
        let timer: ReturnType<typeof setTimeout> | null = null;
        let abortListener: (() => void) | null = null;
        const dispose = () => {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            if (abortListener && split.control.signal) {
                split.control.signal.removeEventListener("abort", abortListener);
                abortListener = null;
            }
        };
        owner.disposeControl = dispose;
        const cancelOwner = (error: JoinError | Error) => {
            if (!owner.active) return;
            owner.active = false;
            dispose();
            slot!.owners.delete(owner);
            owner.cancel(error);
            if (slot!.owners.size === 0) void this.closeSlot(slot!).catch(() => {});
        };
        const signal = split.control.signal;
        const waitMs = waitMsFor(split.control);
        if (signal?.aborted) cancelOwner(new JoinError("CANCELLED", "[WebSocketClient] join 已取消"));
        else if (waitMs <= 0) cancelOwner(new JoinError("TIMEOUT", "[WebSocketClient] join 超时"));
        else if (signal) {
            timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[WebSocketClient] join 超时")), waitMs);
            abortListener = () => cancelOwner(new JoinError("CANCELLED", "[WebSocketClient] join 已取消"));
            signal.addEventListener("abort", abortListener, { once: true });
        } else {
            timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[WebSocketClient] join 超时")), waitMs);
        }
        ready.then(dispose, dispose);
        return {
            ready,
            leave: () => {
                if (owner.active) cancelOwner(new Error("[WebSocketClient] ownership 已释放"));
                if (slot!.owners.size === 0) {
                    if (slot!.closing) return slot!.closing;
                    if (!slot!.room && slot!.cancelled) return Promise.resolve();
                    return this.closeSlot(slot!);
                }
                return Promise.resolve();
            },
        };
    }

    private async doJoin(slot: LobbySlot): Promise<void> {
        let room: Colyseus.Room;
        try {
            slot.client.auth.token = slot.token;
            room = await slot.client.joinOrCreate(RoomName.Lobby, slot.options);
        } catch (e) {
            if (this.slot === slot) this.slot = null;
            slot.cancelled = true;
            // 连接失败后槽已不可再复用；同步失效所有 ownership，避免显式 owner
            // 忘记调用 leave() 时把失败槽和 abort/timer listener 长期留在集合里。
            for (const owner of slot.owners) {
                owner.active = false;
                owner.disposeControl();
                owner.cancel(e instanceof Error ? e : new Error(String(e)));
            }
            slot.owners.clear();
            throw e;
        }
        if (slot.cancelled || this.slot !== slot || slot.owners.size === 0) {
            await this.closePhysicalRoom(slot, room);
            throw new JoinError("CANCELLED", "[WebSocketClient] join 结果已过期");
        }
        slot.room = room;
        this.bindRoom(slot, room);
    }

    private bindRoom(slot: LobbySlot, room: Colyseus.Room): void {
        const current = () => this.slot === slot && slot.room === room && !slot.cancelled;
        room.onMessage(LOBBY_MSG_RPC, (raw: unknown) => {
            if (!current()) return;
            let reply: IRpcReply;
            try {
                reply = validateRpcReply(raw);
            } catch (error) {
                warnInvalidWire("Lobby RPC reply", error);
                this.rejectMalformedReply(slot, raw, error);
                return;
            }
            const p = this.pending.get(reply.id);
            if (!p || p.slot !== slot) return;
            this.pending.delete(reply.id);
            clearTimeout(p.timer);
            if (reply.ok) {
                try {
                    const data = validateLobbyRpcResponse(p.type, reply.data);
                    p.resolve(data);
                } catch (error) {
                    warnInvalidWire(`Lobby RPC response ${p.type}`, error);
                    p.reject(this.invalidPayloadError(`response ${p.type}`, error));
                }
            } else {
                const code = (reply.err?.code ?? "INTERNAL") as RpcErrCode;
                if (code === "AUTH_EPOCH_STALE" || code === "AUTH_REQUIRED" || code === "ACCOUNT_BANNED") {
                    notifyAuthInvalid(code as AuthInvalidReason);
                }
                p.reject(new RpcError(code, reply.err.msg));
            }
        });
        room.onMessage(LOBBY_MSG_PUSH, (raw: unknown) => {
            if (!current()) return;
            let msg: LobbyPushEnvelope;
            try {
                msg = validateLobbyPush(raw);
            } catch (error) {
                warnInvalidWire("Lobby push", error);
                return;
            }
            if (msg.type === LobbyPush.ForceLogout) {
                notifyAuthInvalid(FORCE_REASON_MAP[msg.data.reason]);
            }
            const set = this.pushHandlers.get(msg.type);
            if (!set) return;
            for (const cb of set) {
                try { cb(msg.data); } catch (e) { console.error("[WebSocketClient] push 处理器异常", e); }
            }
        });
        room.onDrop(() => {
            if (!current()) return;
            slot.dropping = true;
            this.rejectAll("CONN_LOST", slot);
        });
        room.onLeave((code?: number) => {
            if (!current()) return;
            this.slot = null;
            slot.cancelled = true;
            slot.room = null;
            slot.dropping = false;
            this.rejectAll("CONN_LOST", slot);
            for (const owner of slot.owners) { owner.active = false; owner.disposeControl(); }
            slot.owners.clear();
            room.removeAllListeners();
            const forced = code !== undefined ? forceLogoutReasonOf(code) : null;
            if (forced) notifyAuthInvalid(FORCE_REASON_MAP[forced]);
            else notifyConnLost();
        });
    }

    /** 主动离开不等待黑洞 join；迟到 room 由 closeSlot 的后台清理释放。 */
    async leave(): Promise<void> {
        const slot = this.slot;
        if (!slot) return;
        this.implicitOwners.clear();
        for (const owner of slot.owners) {
            owner.active = false;
            owner.disposeControl();
            owner.cancel(new Error("[WebSocketClient] ownership 已释放"));
        }
        slot.owners.clear();
        await this.closeSlot(slot);
    }

    private closeSlot(slot: LobbySlot): Promise<void> {
        if (slot.closing) return slot.closing;
        if (this.slot === slot) this.slot = null;
        slot.cancelled = true;
        // 主动释放也要立即结束该 slot 的 RPC；否则 room.leave() 黑洞时调用方会被
        // RPC_CLIENT_TIMEOUT_MS 拖住，且迟到回包可能落到一个已无主的 pending。
        this.rejectAll("CONN_LOST", slot);
        slot.dropping = false;
        if (!slot.room) {
            slot.closing = Promise.resolve();
            void slot.ready.then(() => {
                if (slot.room) return this.closePhysicalRoom(slot, slot.room);
                return undefined;
            }).catch(() => {});
            return slot.closing;
        }
        slot.closing = this.closePhysicalRoom(slot, slot.room);
        return slot.closing;
    }

    private closePhysicalRoom(slot: LobbySlot, room: Colyseus.Room): Promise<void> {
        if (slot.physicalClose) return slot.physicalClose;
        room.reconnection.enabled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, LEAVE_TIMEOUT_MS); });
        const leave = Promise.resolve().then(() => room.leave(true)).catch(() => {}).then(() => undefined);
        slot.physicalClose = Promise.race([leave, timeout]).then(() => {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            room.removeAllListeners();
        });
        return slot.physicalClose;
    }

    rpc<T extends LobbyRpcType>(type: T, payload: RpcReq<T>): Promise<RpcRes<T>> {
        const slot = this.slot;
        const room = slot?.room;
        if (!room || !slot) return Promise.reject(new RpcError("CONN_LOST", "未加入大厅房"));
        const id = `r${++this.seq}`;
        let wirePayload: RpcReq<T>;
        let envelope: IRpcEnvelope;
        try {
            wirePayload = validateLobbyRpcRequest(type, payload);
            envelope = validateRpcEnvelope({ id, type, payload: wirePayload });
        } catch (error) {
            warnInvalidWire(`Lobby RPC request ${String(type)}`, error);
            return Promise.reject(this.invalidPayloadError(`request ${String(type)}`, error));
        }
        return new Promise<RpcRes<T>>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new RpcError("TIMEOUT", type));
            }, RPC_CLIENT_TIMEOUT_MS);
            this.pending.set(id, {
                resolve: resolve as (data: unknown) => void,
                reject,
                timer,
                slot,
                type,
            });
            try {
                room.send(LOBBY_MSG_RPC, envelope);
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(new RpcError("CONN_LOST", wireErrorText(error)));
            }
        });
    }

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
                    if (e instanceof RpcError) e.clientReqId = clientReqId;
                    throw e;
                }
                await new Promise((resolve) => setTimeout(resolve, IDEM_RETRY_DELAY_MS));
            }
        }
    }

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

    static newClientReqId(): string {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    private rejectAll(code: LocalErrCode, slot?: LobbySlot): void {
        for (const [id, p] of this.pending) {
            if (slot && p.slot !== slot) continue;
            clearTimeout(p.timer);
            p.reject(new RpcError(code));
            this.pending.delete(id);
        }
    }

    private invalidPayloadError(scope: string, error: unknown): RpcError {
        return new RpcError("INVALID_PAYLOAD", `${scope}: ${wireErrorText(error)}`);
    }

    /** Reject a pending request when a malformed reply carries a usable id. */
    private rejectMalformedReply(slot: LobbySlot, raw: unknown, error: unknown): void {
        if (typeof raw !== "object" || raw === null) return;
        let id: unknown;
        try { id = (raw as { id?: unknown }).id; } catch { return; }
        if (typeof id !== "string") return;
        const pending = this.pending.get(id);
        if (!pending || pending.slot !== slot) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(this.invalidPayloadError("reply", error));
    }
}
