/**
 * 大厅 RPC 客户端 —— LobbyRoom 的请求-响应通道封装（HTTP 式语义，走 Colyseus websocket）。
 *
 * 与 RoomClient（GameRoom：fire-and-forget + 状态同步）职责分离：本类只管 lobby 房的
 * `rpc`（信封 {id,type,payload} ⇄ {id,ok,data,err}，按 id 配对）与 `push`（{type,data}）两个消息。
 * 路由名与 req/res 类型全部来自 shared/protocol/lobbyRpc（铁律 6）。
 */
import { notifyAuthInvalid, notifyConnLost, type AuthInvalidReason } from "./session";
import {
    looksLikeJoinSignal,
    normalizeJoinSignal,
    observeJoinControlResult,
    waitMsForJoin,
} from "./joinControl";
import {
    ForceLogoutReason,
    forceLogoutReasonOf,
    LOBBY_MSG_PUSH,
    LOBBY_MSG_RPC,
    LobbyPush,
    PROTOCOL_VERSION,
    RoomName,
    type ForceLogoutReasonType,
    type ILobbyRoomJoinOptions,
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
    validateOrigin,
    validateLobbyRoomJoinOptions,
} from "../shared/index";

const RPC_CLIENT_TIMEOUT_MS = 15_000;
const IDEM_RETRY_MAX = 3;
const IDEM_RETRY_DELAY_MS = 300;
const LEAVE_TIMEOUT_MS = 5_000;

/** join 的本地生命周期控制；这些字段不会进入 Lobby matchmaking options。 */
export interface JoinControl {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Unix epoch milliseconds; relative durations are rejected. */
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
    const wire: Record<string, unknown> = {};
    try {
        for (const key of Reflect.ownKeys(source)) {
            if (typeof key !== "string") {
                throw new TypeError("[WebSocketClient] join options 不得包含 symbol key");
            }
            wire[key] = source[key];
        }
    } catch {
        throw new TypeError("[WebSocketClient] join options 无法读取");
    }
    let explicitIsSignal = false;
    if (explicit !== undefined && explicit !== null) {
        try { explicitIsSignal = looksLikeJoinSignal(explicit); }
        catch { throw new TypeError("[WebSocketClient] join control 无法读取"); }
    }
    // Snapshot controls before allocating a slot so hostile getters/methods
    // cannot fail later in an owner cleanup callback.
    const controlSource = explicitIsSignal ? undefined : (explicit ?? source) as Partial<JoinControl>;
    const readControl = (key: keyof JoinControl): unknown => {
        try { return controlSource?.[key]; }
        catch { throw new TypeError(`[WebSocketClient] join control 字段 ${String(key)} 无法读取`); }
    };
    const control: JoinControl = {
        signal: normalizeJoinSignal(explicitIsSignal ? explicit : readControl("signal")),
        timeoutMs: readControl("timeoutMs") as number | undefined,
        deadlineMs: readControl("deadlineMs") as number | undefined,
        timeout: readControl("timeout") as number | undefined,
        deadline: readControl("deadline") as number | undefined,
    };
    delete wire.signal;
    delete wire.timeoutMs;
    delete wire.deadlineMs;
    delete wire.timeout;
    delete wire.deadline;
    return { options: wire, control };
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
    readonly options: ILobbyRoomJoinOptions;
    room: Colyseus.Room | null;
    ready: Promise<void>;
    closing: Promise<void> | null;
    physicalClose: Promise<void> | null;
    cancelled: boolean;
    /** Synchronous/asynchronous join failure observed before all owners attach. */
    failure: Error | null;
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
    try {
        if (error instanceof Error) {
            const message = error.message;
            return typeof message === "string" ? message : "";
        }
        return typeof error === "string" ? error : "";
    } catch {
        return "";
    }
}

function safeError(error: unknown, fallback: string): Error {
    try {
        if (error instanceof Error) return error;
    } catch { /* hostile/revoked error proxy */ }
    const text = wireErrorText(error);
    return new Error(text || fallback);
}

function warnInvalidWire(scope: string, error: unknown): void {
    // Do not print the packet itself: RPC payloads can contain account data and
    // join options can contain bearer tokens. The validator path is enough for
    // local diagnostics while keeping logs free of secrets.
    console.warn(`[WebSocketClient] 丢弃非法 ${scope}: ${wireErrorText(error)}`);
}

/** Push handlers are SDK event callbacks, so callers cannot be expected to
 * await them. Observe both sync exceptions and returned thenables without
 * printing the push payload (which may contain user/account data). */
function reportPushFailure(kind: "exception" | "rejection"): void {
    console.error(`[WebSocketClient] push 处理器 ${kind}`);
}

function invokePushHandler(callback: (data: unknown) => unknown, data: unknown): void {
    let result: unknown;
    try {
        result = callback(data);
    } catch {
        reportPushFailure("exception");
        return;
    }
    try {
        if (result !== null
            && (typeof result === "object" || typeof result === "function")
            && typeof (result as { then?: unknown }).then === "function") {
            Promise.resolve(result).catch(() => reportPushFailure("rejection"));
        }
    } catch {
        // A thenable may throw while its `then` property is inspected or
        // assimilated. It is still an observed callback failure.
        reportPushFailure("rejection");
    }
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
    private readonly ownershipSlots = new WeakMap<LobbyConnectionOwnership, LobbySlot>();
    private pending = new Map<string, IPending>();
    private seq = 0;
    private pushHandlers = new Map<string, Set<(data: unknown) => unknown>>();

    get connected(): boolean {
        return this.slot?.room != null;
    }

    get room(): Colyseus.Room | null {
        return this.slot?.room ?? null;
    }

    /** @param endpoint http(s) 地址，如 http://localhost:2568（SDK 自动派生 ws(s)） */
    init(endpoint: string): void {
        const validated = validateOrigin(endpoint, ["http", "https", "ws", "wss"], "endpoint");
        const client = new Colyseus.Client(validated);
        this.client = client;
        this.endpoint = validated;
    }

    /** Remove one hidden ownership and its private slot association. */
    private forgetImplicitOwner(ownership: LobbyConnectionOwnership): void {
        this.implicitOwners.delete(ownership);
        this.ownershipSlots.delete(ownership);
    }

    /** Retire all hidden ownerships belonging to one slot (or all slots). */
    private forgetImplicitOwners(slot?: LobbySlot): void {
        for (const ownership of this.implicitOwners) {
            if (slot === undefined || this.ownershipSlots.get(ownership) === slot) {
                this.implicitOwners.delete(ownership);
                this.ownershipSlots.delete(ownership);
            }
        }
    }

    /**
     * 兼容旧调用面的隐式 ownership join。client、endpoint、token 和完整 options 在槽创建时
     * 固化；后续 init(B) 不会把等待中的物理 A 记成 B。主动 leave() 或物理 onLeave 都会
     * 释放对应的隐式 ownership；旧 slot 的迟到回调只清理自己的代际。
     */
    async join(token: string, options?: Record<string, unknown>, control?: JoinControl | AbortSignal): Promise<void> {
        const owner = this.joinOwned(token, options, control);
        const slot = this.ownershipSlots.get(owner);
        if (slot && !slot.cancelled && this.slot === slot) this.implicitOwners.add(owner);
        try {
            await owner.ready;
        } catch (e) {
            this.forgetImplicitOwner(owner);
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
        // Resolve/validate the local wait policy before creating a slot or
        // owner. Invalid control values must not strand an owner in-flight.
        const waitMs = waitMsForJoin(split.control);
        // Matchmaking options cross the websocket boundary verbatim. Validate a
        // cloned copy so callers cannot mutate the identity after join starts.
        const joinOptions = validateLobbyRoomJoinOptions(
            cloneJson({ ...split.options, v: PROTOCOL_VERSION }),
        ) as ILobbyRoomJoinOptions;
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
                failure: null,
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
        const signal = split.control.signal;
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            if (timer !== null) { clearTimeout(timer); timer = null; }
            const listener = abortListener;
            abortListener = null;
            if (listener && signal) {
                try {
                    observeJoinControlResult(signal.removeEventListener("abort", listener));
                } catch {
                    // Cleanup is best-effort and must not strand the slot.
                }
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
        // `joinOrCreate()` may throw before the async owner setup below runs.
        // The join catch then has no owner to cancel, so replay that failure for
        // this late-attached owner and avoid installing a dangling timer/listener.
        if (slot.cancelled && slot.failure) {
            cancelOwner(slot.failure);
        }
        try {
            let alreadyAborted = false;
            if (owner.active && signal) alreadyAborted = signal.aborted;
            if (owner.active && alreadyAborted) {
                cancelOwner(new JoinError("CANCELLED", "[WebSocketClient] join 已取消"));
            } else if (owner.active && waitMs <= 0) {
                cancelOwner(new JoinError("TIMEOUT", "[WebSocketClient] join 超时"));
            } else if (owner.active && signal) {
                timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[WebSocketClient] join 超时")), waitMs);
                // Set the callback before invoking a non-standard adapter: it
                // may synchronously report an already-aborted signal.
                abortListener = () => cancelOwner(new JoinError("CANCELLED", "[WebSocketClient] join 已取消"));
                observeJoinControlResult(signal.addEventListener("abort", abortListener, { once: true }));
            } else if (owner.active) {
                timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[WebSocketClient] join 超时")), waitMs);
            }
        } catch (error) {
            const failure = safeError(error, "[WebSocketClient] join control failed");
            cancelOwner(failure);
            throw failure;
        }
        ready.then(dispose, dispose).catch(() => {});
        const ownership: LobbyConnectionOwnership = {
            ready,
            leave: () => {
                this.forgetImplicitOwner(ownership);
                if (owner.active) cancelOwner(new Error("[WebSocketClient] ownership 已释放"));
                if (slot!.owners.size === 0) {
                    if (slot!.closing) return slot!.closing;
                    if (!slot!.room && slot!.cancelled) return Promise.resolve();
                    return this.closeSlot(slot!);
                }
                return Promise.resolve();
            },
        };
        this.ownershipSlots.set(ownership, slot);
        return ownership;
    }

    private async doJoin(slot: LobbySlot): Promise<void> {
        let room: Colyseus.Room;
        try {
            slot.client.auth.token = slot.token;
            room = await slot.client.joinOrCreate(RoomName.Lobby, slot.options);
        } catch (e) {
            if (this.slot === slot) this.slot = null;
            slot.cancelled = true;
            this.forgetImplicitOwners(slot);
            const failure = safeError(e, "[WebSocketClient] join failed");
            slot.failure = failure;
            // 连接失败后槽已不可再复用；同步失效所有 ownership，避免显式 owner
            // 忘记调用 leave() 时把失败槽和 abort/timer listener 长期留在集合里。
            for (const owner of slot.owners) {
                owner.active = false;
                owner.disposeControl();
                owner.cancel(failure);
            }
            slot.owners.clear();
            throw e;
        }
        if (slot.cancelled || this.slot !== slot || slot.owners.size === 0) {
            this.forgetImplicitOwners(slot);
            await this.closePhysicalRoom(slot, room);
            throw new JoinError("CANCELLED", "[WebSocketClient] join 结果已过期");
        }
        slot.room = room;
        try {
            this.bindRoom(slot, room);
        } catch (error) {
            if (this.slot === slot) this.slot = null;
            slot.room = null;
            slot.cancelled = true;
            this.forgetImplicitOwners(slot);
            const failure = safeError(error, "[WebSocketClient] room setup failed");
            slot.failure = failure;
            for (const owner of slot.owners) {
                owner.active = false;
                owner.disposeControl();
                owner.cancel(failure);
            }
            slot.owners.clear();
            await this.closePhysicalRoom(slot, room);
            throw error;
        }
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
                invokePushHandler(cb, msg.data);
            }
        });
        room.onDrop(() => {
            if (!current()) return;
            slot.dropping = true;
            this.rejectAll("CONN_LOST", slot);
        });
        room.onLeave((code?: number) => {
            // Handle stale callbacks as well as the current room. Filtering by
            // slot identity prevents an old room from clearing a replacement.
            this.forgetImplicitOwners(slot);
            if (!current()) return;
            this.slot = null;
            slot.cancelled = true;
            slot.room = null;
            slot.dropping = false;
            this.rejectAll("CONN_LOST", slot);
            for (const owner of slot.owners) { owner.active = false; owner.disposeControl(); }
            slot.owners.clear();
            try { room.removeAllListeners(); } catch { /* malformed adapter */ }
            const forced = code !== undefined ? forceLogoutReasonOf(code) : null;
            if (forced) notifyAuthInvalid(FORCE_REASON_MAP[forced]);
            else notifyConnLost();
        });
    }

    /** 主动离开不等待黑洞 join；迟到 room 由 closeSlot 的后台清理释放。 */
    async leave(): Promise<void> {
        // Clear hidden ownership before checking `slot`: a prior passive
        // onLeave may already have detached the current slot.
        this.forgetImplicitOwners();
        const slot = this.slot;
        if (!slot) return;
        for (const owner of slot.owners) {
            owner.active = false;
            owner.disposeControl();
            owner.cancel(new Error("[WebSocketClient] ownership 已释放"));
        }
        slot.owners.clear();
        await this.closeSlot(slot);
    }

    private closeSlot(slot: LobbySlot): Promise<void> {
        this.forgetImplicitOwners(slot);
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
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, LEAVE_TIMEOUT_MS); });
        const leave = Promise.resolve().then(() => {
            try {
                const reconnection = (room as unknown as { reconnection?: { enabled?: boolean } }).reconnection;
                if (reconnection && typeof reconnection === "object") reconnection.enabled = false;
            } catch { /* malformed adapter: continue with best-effort leave */ }
            try {
                const fn = (room as unknown as { leave?: unknown }).leave;
                return typeof fn === "function" ? fn.call(room, true) : undefined;
            } catch { return undefined; }
        }).catch(() => {}).then(() => undefined);
        slot.physicalClose = Promise.race([leave, timeout]).then(() => {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            try { room.removeAllListeners(); } catch { /* malformed adapter */ }
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

    onPush<K extends keyof LobbyPushMap>(type: K, callback: (data: LobbyPushMap[K]) => unknown): () => void {
        let set = this.pushHandlers.get(type);
        if (!set) {
            set = new Set();
            this.pushHandlers.set(type, set);
        }
        const cb = callback as (data: unknown) => unknown;
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
