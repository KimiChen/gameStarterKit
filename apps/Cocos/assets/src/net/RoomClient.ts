/**
 * 网络管理器 —— Colyseus 客户端封装（全局 Colyseus 来自 lib/colyseus 的 UMD 插件）。
 *
 * 职责：
 *  - 连接管理：joinGame ownership / 精确释放 / 自动重连事件透传
 *  - 类型安全的消息收发：消息名与 payload 类型来自双端共享协议
 *  - 状态回调：由具体 gameplay adapter 注入 exact validator，通用层不假定 root Schema
 */
import {
    RoomName,
    C2S,
    S2C,
    PROTOCOL_VERSION,
    ROOM_STATE_VALIDATORS,
    type C2SPayloadMap,
    type GameplayModeIdType,
    type IGameRoomJoinOptions,
    type IPingReq,
    type ICastSkillReq,
    type IChatReq,
    type IPongRes,
    type IWelcomeRes,
    type ISkillResultRes,
    type IChatRes,
    type IErrorRes,
    type RoomStateByMode,
    type RoomStateMode,
    validateOrigin,
    validateC2SPayload,
    validateGameRoomJoinOptions,
    validateS2CPayload,
} from "../shared/index";
import { notifyBattleLost } from "./session";
import {
    looksLikeJoinSignal,
    normalizeJoinSignal,
    observeJoinControlResult,
    waitMsForJoin,
} from "./joinControl";

/** 服务端 → 客户端各消息的 payload 类型映射 */
export interface S2CPayloadMap {
    [S2C.Pong]: IPongRes;
    [S2C.Welcome]: IWelcomeRes;
    [S2C.SkillResult]: ISkillResultRes;
    [S2C.Chat]: IChatRes;
    [S2C.Error]: IErrorRes;
}

export type GameRoomReconcileReason = "joined" | "reconnected";
export type SupportedGameRoomMode = GameplayModeIdType & RoomStateMode;

/**
 * Adapter-owned view of one exact physical GameRoom. `mode` is a literal
 * discriminator and `send` is restricted to the messages declared by that
 * adapter both at compile time and at runtime.
 */
export interface TypedGameRoom<
    TMode extends SupportedGameRoomMode,
    TOutbound extends keyof C2SPayloadMap,
> {
    readonly kind: "typed-game-room";
    readonly mode: TMode;
    readonly state: RoomStateByMode[TMode];
    readonly roomId: string;
    readonly sessionId: string;
    readonly current: boolean;
    readonly dropping: boolean;
    state$(): any;
    onMessage<K extends keyof S2CPayloadMap>(
        type: K,
        callback: (payload: S2CPayloadMap[K]) => unknown,
    ): () => void;
    send<K extends TOutbound>(type: K, payload: C2SPayloadMap[K]): boolean;
}

/** Per-gameplay contract injected before any slot or SDK join is allocated. */
export interface GameplayRoomAdapter<
    TMode extends SupportedGameRoomMode,
    TOutbound extends keyof C2SPayloadMap,
> {
    readonly mode: TMode;
    readonly outbound: readonly TOutbound[];
    validateState(input: unknown): RoomStateByMode[TMode];
    /** Optional initial/reconnect reconciliation. Idle intentionally omits it. */
    reconcile?(
        room: TypedGameRoom<TMode, TOutbound>,
        reason: GameRoomReconcileReason,
    ): unknown;
}

/** A typed owner returned to a concrete gameplay joiner. */
export interface GameRoomOwnership<
    TMode extends SupportedGameRoomMode,
    TOutbound extends keyof C2SPayloadMap,
> {
    readonly kind: "game-room-ownership";
    readonly mode: TMode;
    readonly adapter: GameplayRoomAdapter<TMode, TOutbound>;
    readonly ready: Promise<TypedGameRoom<TMode, TOutbound>>;
    leave(): Promise<void>;
}

/** Type-erased ownership for lifecycle infrastructure that does not inspect state. */
export type CommonGameRoomOwnership = GameRoomOwnership<
    SupportedGameRoomMode,
    keyof C2SPayloadMap
>;

type AnyTypedGameRoom = TypedGameRoom<SupportedGameRoomMode, keyof C2SPayloadMap>;

interface GameplayAdapterSnapshot {
    readonly source: object;
    readonly mode: SupportedGameRoomMode;
    readonly outbound: ReadonlySet<keyof C2SPayloadMap>;
    readonly validateState: (input: unknown) => unknown;
    readonly reconcile?: (room: AnyTypedGameRoom, reason: GameRoomReconcileReason) => unknown;
}

/** leave 的等待上限：掉线窗口里 LEAVE 帧可能发不出去、onLeave 永不触发，限时后强制本地清理 */
const LEAVE_TIMEOUT_MS = 5_000;

/** join 的本地生命周期控制。控制字段不会透传给服务端。 */
export interface JoinControl {
    /** 取消本次 ownership；SDK 握手不可中断时，迟到 room 会在后台被释放。 */
    signal?: AbortSignal;
    /** 从调用时刻起的最长等待时间（安全非负整数）。 */
    timeoutMs?: number;
    /** 绝对截止时间（Unix ms）；不接受相对时间或字符串。 */
    deadlineMs?: number;
    /** aliases accepted by adapters/tests; deadline is absolute when epoch-sized. */
    timeout?: number;
    deadline?: number;
}

export type JoinFailureCode = "TIMEOUT" | "CANCELLED";

/** join 超时/取消的可判别错误；业务层不需要解析 message。 */
export class JoinError extends Error {
    constructor(readonly code: JoinFailureCode, message: string = code) {
        super(message);
        this.name = "JoinError";
    }
}

/**
 * 按 JSON 线上语义生成稳定 key：对象键递归排序、对象里的 undefined 等不可编码值省略、
 * 数组里的不可编码值视为 null。这样字段顺序不影响合流，但 token/sId 及未来新增的任意
 * join option 都会进入连接身份。循环引用/BigInt 与 JSON 传输本就不兼容，直接 fail-fast。
 */
function stableJson(value: unknown, ancestors = new Set<object>()): string | undefined {
    if (value === null) return "null";
    switch (typeof value) {
        case "string": return JSON.stringify(value);
        case "boolean": return value ? "true" : "false";
        case "number": return JSON.stringify(value);
        case "undefined":
        case "function":
        case "symbol":
            return undefined;
        case "bigint":
            throw new TypeError("[RoomClient] join options 必须是 JSON 可编码数据（不支持 BigInt）");
        case "object":
            break;
    }

    const object = value as object;
    if (ancestors.has(object)) {
        throw new TypeError("[RoomClient] join options 必须是 JSON 可编码数据（不支持循环引用）");
    }
    ancestors.add(object);
    try {
        const toJSON = (object as { toJSON?: unknown }).toJSON;
        if (typeof toJSON === "function") {
            const converted = toJSON.call(object);
            if (converted !== object) return stableJson(converted, ancestors);
        }
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

/** endpoint + 实际发送的完整 join options 共同定义一个可安全合流的物理连接。 */
function connectionKey(endpoint: string, options: unknown): string {
    return stableJson([endpoint, options])!;
}

/** 复制调用方的 JSON options，避免 join 在途期间外部 mutating 改写身份或线上 payload。 */
function cloneJson<T>(value: T, ancestors = new Set<object>()): T {
    if (value === null || typeof value !== "object") {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new TypeError("[RoomClient] join options 不能包含 NaN/Infinity");
        }
        if (typeof value === "bigint") {
            throw new TypeError("[RoomClient] join options 必须是 JSON 可编码数据（不支持 BigInt）");
        }
        return value;
    }
    const object = value as unknown as object;
    if (ancestors.has(object)) {
        throw new TypeError("[RoomClient] join options 必须是 JSON 可编码数据（不支持循环引用）");
    }
    ancestors.add(object);
    try {
        if (Array.isArray(value)) {
            return value.map((item) => cloneJson(item, ancestors)) as unknown as T;
        }
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

function snapshotGameplayAdapter(input: unknown): GameplayAdapterSnapshot {
    if ((typeof input !== "object" && typeof input !== "function") || input === null) {
        throw new TypeError("[RoomClient] gameplay adapter 必须是对象");
    }
    let mode: unknown;
    let outbound: unknown;
    let validateState: unknown;
    let reconcile: unknown;
    try {
        const value = input as Record<string, unknown>;
        mode = value.mode;
        outbound = value.outbound;
        validateState = value.validateState;
        reconcile = value.reconcile;
    } catch {
        throw new TypeError("[RoomClient] gameplay adapter 无法读取");
    }
    const validatedMode = validateGameRoomJoinOptions({ mode }).mode;
    if (!Object.prototype.hasOwnProperty.call(ROOM_STATE_VALIDATORS, validatedMode)) {
        throw new TypeError("[RoomClient] gameplay adapter mode 没有生成的 room state contract");
    }
    const supportedMode = validatedMode as SupportedGameRoomMode;
    if (!Array.isArray(outbound)) {
        throw new TypeError("[RoomClient] gameplay adapter outbound 必须是数组");
    }
    const knownMessages = new Set<string>(Object.values(C2S));
    const allowed = new Set<keyof C2SPayloadMap>();
    for (const message of outbound) {
        if (typeof message !== "string" || !knownMessages.has(message) || allowed.has(message as keyof C2SPayloadMap)) {
            throw new TypeError("[RoomClient] gameplay adapter outbound 含未知或重复消息");
        }
        allowed.add(message as keyof C2SPayloadMap);
    }
    if (typeof validateState !== "function"
        || (reconcile !== undefined && typeof reconcile !== "function")) {
        throw new TypeError("[RoomClient] gameplay adapter 缺少 state validator 或 reconcile 非函数");
    }
    const source = input as object;
    return {
        source,
        mode: supportedMode,
        outbound: allowed,
        validateState: (value) => validateState.call(input, value),
        ...(typeof reconcile === "function"
            ? { reconcile: (room: AnyTypedGameRoom, reason: GameRoomReconcileReason) =>
                reconcile.call(input, room, reason) }
            : {}),
    };
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
                throw new TypeError("[RoomClient] join options 不得包含 symbol key");
            }
            wire[key] = source[key];
        }
    } catch {
        throw new TypeError("[RoomClient] join options 无法读取");
    }
    // 支持把控制字段放在第二参的兼容写法，同时不让它们进入 matchmaking payload。
    let explicitIsSignal = false;
    if (explicit !== undefined && explicit !== null) {
        try { explicitIsSignal = looksLikeJoinSignal(explicit); }
        catch { throw new TypeError("[RoomClient] join control 无法读取"); }
    }
    // Snapshot every control field before allocating a slot.  Besides making
    // the lifetime deterministic, this prevents a getter/Proxy from throwing
    // later in a timer or leave callback.
    const controlSource = explicitIsSignal ? undefined : (explicit ?? source) as Partial<JoinControl>;
    const readControl = (key: keyof JoinControl): unknown => {
        try { return controlSource?.[key]; }
        catch { throw new TypeError(`[RoomClient] join control 字段 ${String(key)} 无法读取`); }
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

/** Diagnostic values come from the SDK callback and may be hostile at runtime. */
function safeDiagnostic(value: unknown): string {
    try {
        if (typeof value === "string") return value.slice(0, 256);
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
        return "";
    } catch {
        return "";
    }
}

/**
 * The 0.17 SDK buffers `room.send()` while its socket is closed and flushes
 * that queue immediately after reconnect JOIN_ROOM, before the next full
 * ROOM_STATE. Our mode/state barrier owns replay, so the SDK queue must stay
 * empty even in the close -> onDrop notification gap.
 */
function disableSdkOutboundReplay(room: Colyseus.Room<unknown>): boolean {
    try {
        const reconnection = (room as unknown as {
            reconnection?: {
                maxEnqueuedMessages?: unknown;
                enqueuedMessages?: unknown;
            };
        }).reconnection;
        if (!reconnection || typeof reconnection !== "object") return false;
        reconnection.maxEnqueuedMessages = 0;
        if (Array.isArray(reconnection.enqueuedMessages)) {
            reconnection.enqueuedMessages.length = 0;
        } else {
            reconnection.enqueuedMessages = [];
        }
        return reconnection.maxEnqueuedMessages === 0
            && Array.isArray(reconnection.enqueuedMessages)
            && reconnection.enqueuedMessages.length === 0;
    } catch {
        return false;
    }
}

function warnInvalidWire(scope: string, error: unknown): void {
    // Payloads may contain user text or account identifiers; log only the
    // validator's stable code/path, never the rejected packet itself.
    console.warn(`[RoomClient] 丢弃非法 ${scope}: ${wireErrorText(error)}`);
}

/** Colyseus `room.send` is allowed to throw synchronously (closed socket, bad adapter, etc.).
 * Keep that transport failure inside the fire-and-forget API and avoid echoing packet contents. */
function warnSendFailure(scope: string): void {
    console.warn(`[RoomClient] C2S ${scope} 发送失败`);
}

/**
 * State/message callbacks are invoked by the SDK rather than by an awaited
 * caller.  Keep both synchronous exceptions and returned thenables inside the
 * transport boundary; in particular, do not log callback arguments (they may
 * contain chat/account data).
 */
function reportCallbackFailure(scope: string, kind: "exception" | "rejection"): void {
    console.error(`[RoomClient] ${scope} callback ${kind}`);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
    try {
        return typeof (value as { then?: unknown }).then === "function";
    } catch {
        return false;
    }
}

function observeCallbackResult(scope: string, result: unknown): unknown {
    if (!isThenable(result)) return result;
    try {
        // Attaching a rejection handler is enough to mark the original Promise
        // observed, while returning the original value preserves SDK semantics.
        Promise.resolve(result).catch(() => reportCallbackFailure(scope, "rejection"));
    } catch {
        // A hostile thenable may throw while Promise.resolve assimilates it.
        reportCallbackFailure(scope, "rejection");
    }
    return result;
}

function invokeObserved(scope: string, callback: () => unknown): unknown {
    try {
        return observeCallbackResult(scope, callback());
    } catch {
        reportCallbackFailure(scope, "exception");
        return undefined;
    }
}

function validatedStateSnapshot(
    room: Colyseus.Room<unknown>,
    adapter: GameplayAdapterSnapshot,
): unknown | null {
    try {
        return adapter.validateState(room.state);
    } catch (error) {
        warnInvalidWire(`${adapter.mode} GameRoom state`, error);
        return null;
    }
}

const CALLBACK_ARG_INDEX: Record<string, number> = {
    listen: 1,
    onAdd: 0,
    onRemove: 0,
    onChange: 0,
};

function noopStateProxy(): any {
    // A callable recursive proxy lets callers retain the usual `$(state).players`
    // shape even while a malformed snapshot is being dropped.
    return new Proxy(() => undefined, {
        get: () => noopStateProxy(),
        apply: () => noopStateProxy(),
    });
}

function guardStateCallbacks(
    proxy: any,
    room: Colyseus.Room<unknown>,
    adapter: GameplayAdapterSnapshot,
    isCurrent: () => boolean,
    cache = new WeakMap<object, any>(),
): any {
    if ((typeof proxy !== "object" && typeof proxy !== "function") || proxy === null) return proxy;
    const cached = cache.get(proxy);
    if (cached) return cached;
    const guarded = new Proxy(proxy, {
        apply(target, thisArg, args) {
            if (!isCurrent() || !validatedStateSnapshot(room, adapter)) return noopStateProxy();
            let result: unknown;
            try {
                result = Reflect.apply(target, thisArg, args);
            } catch {
                reportCallbackFailure("state proxy", "exception");
                return noopStateProxy();
            }
            observeCallbackResult("state proxy", result);
            // Promise methods rely on their receiver being the original Promise;
            // proxying one would make `then`/`catch` throw in some runtimes.
            if (isThenable(result)) return result;
            return guardStateCallbacks(result, room, adapter, isCurrent, cache);
        },
        get(target, property, receiver) {
            let value: unknown;
            try { value = Reflect.get(target, property, receiver); }
            catch {
                reportCallbackFailure(`state ${String(property)}`, "exception");
                return noopStateProxy();
            }
            if (typeof value === "function" && typeof property === "string") {
                const callbackIndex = CALLBACK_ARG_INDEX[property];
                if (callbackIndex !== undefined) {
                    return (...args: unknown[]) => {
                        const callback = args[callbackIndex];
                        if (typeof callback !== "function") {
                            return invokeObserved(`state ${property}`, () => value.apply(target, args));
                        }
                        args[callbackIndex] = (...callbackArgs: unknown[]) => {
                            if (!isCurrent() || !validatedStateSnapshot(room, adapter)) return undefined;
                            return invokeObserved(`state ${property}`, () => callback(...callbackArgs));
                        };
                        return invokeObserved(`state ${property}`, () => value.apply(target, args));
                    };
                }
            }
            if (value !== null && (typeof value === "object" || typeof value === "function")) {
                return guardStateCallbacks(value, room, adapter, isCurrent, cache);
            }
            return value;
        },
    });
    cache.set(proxy, guarded);
    return guarded;
}

interface RoomOwner {
    active: boolean;
    readonly slot: RoomSlot;
    readonly ready: Promise<AnyTypedGameRoom>;
    cancel(reason: Error): void;
    disposeControl(): void;
}

/**
 * 一个物理房间连接槽。owner 可以有多个（并发调用合流），但槽与 room 始终一一对应；
 * 旧槽的异步回调只能按槽身份修改状态，不能碰后来创建的新槽。
 */
interface RoomSlot {
    readonly connectionKey: string;
    readonly generation: number;
    readonly adapter: GameplayAdapterSnapshot;
    room: Colyseus.Room<unknown> | null;
    typedRoom: AnyTypedGameRoom | null;
    ready: Promise<AnyTypedGameRoom>;
    closing: Promise<void> | null;
    physicalClose: Promise<void> | null;
    cancelled: boolean;
    /** Synchronous/asynchronous join failure observed before all owners attach. */
    failure: Error | null;
    /** Rejects a handshake that is waiting for the SDK's first ROOM_STATE. */
    pendingStateReject: ((reason: Error) => void) | null;
    dropping: boolean;
    /** No C2S may cross before the first/reconnected exact state snapshot. */
    stateReady: boolean;
    readonly owners: Set<RoomOwner>;
}

export class RoomClient {
    private static _inst: RoomClient | null = null;
    static get inst(): RoomClient {
        if (!this._inst) this._inst = new RoomClient();
        return this._inst;
    }

    private client: Colyseus.Client | null = null;
    /** 与 `client` 同次 init 固化；必须进入 slot key，防切区服端点时复用旧房。 */
    private endpoint: string | null = null;
    /**
     * 当前连接槽（含 join 在途期）。新旧调用只有在指向同一 slot 时才允许合流；最后一个 owner
     * 释放时先摘掉本 slot，再异步关闭其精确 room，后来者会创建新 slot、不受旧回调影响。
     */
    private slot: RoomSlot | null = null;
    private generation = 0;

    get connected(): boolean {
        return this.slot?.room != null;
    }

    /** 掉线重连窗口中（onDrop→onReconnect/onLeave 之间）。 */
    get dropping(): boolean {
        return this.slot?.dropping ?? false;
    }

    get sessionId(): string {
        return this.slot?.room?.sessionId ?? "";
    }

    /** @param endpoint http(s) 地址，如 http://localhost:2568，SDK 自动派生 ws(s) */
    init(endpoint: string): void {
        const validated = validateOrigin(endpoint, ["http", "https", "ws", "wss"], "endpoint");
        const client = new Colyseus.Client(validated);
        this.client = client;
        this.endpoint = validated;
    }

    /**
     * 加入（或创建）主玩法房间并取得独立 ownership。协议版本 v 在此统一注入。
     *
     * 已在房/正在 join 且 endpoint + 完整 options 一致时复用同一 slot；key 不一致会 fail-fast，
     * 要求调用方先释放旧 ownership，绝不把新身份静默交给旧房，也不破坏既有 owner。
     * 每次成功调用都有自己的 owner：旧世代 `leave()` 只减少自己的 ownership；只有最后一个
     * owner 离开才关闭物理房间。这是 Main 世代竞态的硬边界。
     */
    joinGame<
        TMode extends SupportedGameRoomMode,
        TOutbound extends keyof C2SPayloadMap,
    >(
        adapter: GameplayRoomAdapter<TMode, TOutbound>,
        options?: Record<string, unknown>,
        control?: JoinControl | AbortSignal,
    ): GameRoomOwnership<TMode, TOutbound> {
        if (!this.client || this.endpoint === null) {
            throw new Error("[RoomClient] 未初始化，请先调用 init(endpoint)");
        }
        const adapterSnapshot = snapshotGameplayAdapter(adapter);
        const split = splitJoinControl(options, control);
        // Validate the local wait policy before allocating a slot/owner.  A bad
        // timeout must fail atomically; otherwise an exception here would leave
        // an owner in the slot with no timer or abort listener to release it.
        const waitMs = waitMsForJoin(split.control);
        if (split.options.mode !== undefined && split.options.mode !== adapterSnapshot.mode) {
            throw new TypeError("[RoomClient] join mode 与 gameplay adapter 不匹配");
        }
        const joinOptions = validateGameRoomJoinOptions(
            cloneJson({ ...split.options, mode: adapterSnapshot.mode, v: PROTOCOL_VERSION }),
        );
        const endpoint = this.endpoint;
        const client = this.client;
        const key = connectionKey(endpoint, joinOptions);
        let slot = this.slot;
        if (slot && (slot.connectionKey !== key || slot.adapter.source !== adapterSnapshot.source)) {
            // ⛔ 错误里不打印 key：它包含 token。既有 slot/owners 原样保留，由调用方显式释放。
            throw new Error("[RoomClient] 当前战斗连接参数与本次 join 不一致，请先释放现有 ownership");
        }
        if (!slot) {
            slot = {
                connectionKey: key,
                generation: ++this.generation,
                adapter: adapterSnapshot,
                room: null,
                typedRoom: null,
                ready: null as unknown as Promise<AnyTypedGameRoom>,
                closing: null,
                physicalClose: null,
                cancelled: false,
                failure: null,
                pendingStateReject: null,
                dropping: false,
                stateReady: false,
                owners: new Set<RoomOwner>(),
            };
            // 先挂槽再启动 async join：若 SDK 在调用点同步抛错，doJoin 的失败清理也能命中本槽。
            this.slot = slot;
            // 固化本次 Client：后续 init() 即使切端点，也不能把在途 join 偷换到另一个 Client。
            slot.ready = this.doJoin(slot, client, joinOptions);
            // 即使调用方忘记观察失败，也要让内部 raw promise 有 rejection handler；每个
            // ownership 的 ready 仍保留原始失败供调用方断言。
            slot.ready.catch(() => {});
        }

        let rejectCancelled!: (reason: Error) => void;
        const cancelled = new Promise<AnyTypedGameRoom>((_resolve, reject) => {
            rejectCancelled = reject;
        });
        const ready = Promise.race([slot.ready, cancelled]);
        ready.catch(() => {});
        const owner: RoomOwner = {
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
                    // Cleanup is best-effort; it must never break owner or
                    // transport failure handling.
                }
            }
        };
        owner.disposeControl = dispose;
        const cancelOwner = (error: JoinError | Error) => {
            if (!owner.active) return;
            owner.active = false;
            dispose();
            slot.owners.delete(owner);
            owner.cancel(error);
            if (slot.owners.size === 0) void this.closeSlot(slot).catch(() => {});
        };
        // `joinOrCreate()` may throw before the async owner setup below runs.
        // The join catch then has no owner to cancel, so replay that failure for
        // this late-attached owner and avoid installing a dangling timer/listener.
        if (slot.cancelled && slot.failure) {
            cancelOwner(slot.failure);
        }
        try {
            let alreadyAborted = false;
            if (owner.active && signal) {
                // `normalizeJoinSignal` checked the shape before slot creation,
                // but a hostile getter can still change/throw between reads.
                alreadyAborted = signal.aborted;
            }
            if (owner.active && alreadyAborted) {
                cancelOwner(new JoinError("CANCELLED", "[RoomClient] join 已取消"));
            } else if (owner.active && waitMs <= 0) {
                cancelOwner(new JoinError("TIMEOUT", "[RoomClient] join 超时"));
            } else if (owner.active && signal) {
                timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[RoomClient] join 超时")), waitMs);
                // Install the callback reference before calling an adapter: a
                // non-standard signal may invoke it synchronously.
                abortListener = () => cancelOwner(new JoinError("CANCELLED", "[RoomClient] join 已取消"));
                observeJoinControlResult(signal.addEventListener("abort", abortListener, { once: true }));
            } else if (owner.active) {
                timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[RoomClient] join 超时")), waitMs);
            }
        } catch (error) {
            const failure = safeError(error, "[RoomClient] join control failed");
            cancelOwner(failure);
            throw failure;
        }
        // ready 落定后清理本 owner 的 timer/listener；Promise.then 的 rejection 被显式观察。
        ready.then(dispose, dispose).catch(() => {});
        return {
            kind: "game-room-ownership",
            mode: adapterSnapshot.mode as TMode,
            adapter,
            ready: ready as Promise<TypedGameRoom<TMode, TOutbound>>,
            leave: () => {
                if (owner.active) cancelOwner(new Error("[RoomClient] ownership 已释放"));
                // cancelOwner 已同步摘掉 owner；若它是最后一个，返回同一个精确
                // close promise，让调用方可等待 room.leave()/timer 完成。
                if (slot.owners.size === 0) {
                    if (slot.closing) return slot.closing;
                    // onLeave 已经证明物理房死亡，不能再次调用 room.leave()。
                    if (!slot.room && slot.cancelled) return Promise.resolve();
                    return this.closeSlot(slot);
                }
                return this.release(owner);
            },
        };
    }

    private async doJoin(
        slot: RoomSlot,
        client: Colyseus.Client,
        joinOptions: IGameRoomJoinOptions,
    ): Promise<AnyTypedGameRoom> {
        let room: Colyseus.Room<unknown>;
        try {
            // Colyseus authenticates the connection from its standard auth token
            // field. Keep it aligned with the slot snapshot before the SDK
            // starts the handshake; options.token remains only a compatibility
            // field validated by the server for exact equality.
            // Clear a stale SDK auth value as well: omitting the compatibility
            // field must never accidentally reuse the previous account's
            // bearer. A real server will reject the resulting empty token.
            client.auth.token = joinOptions.token ?? "";
            room = await client.joinOrCreate<unknown>(RoomName.Game, joinOptions);
        } catch (e) {
            // 失败槽不再接纳后来调用；既有 owner 仍从各自 ready 收到原始连接错误。
            if (this.slot === slot) { this.slot = null; }
            slot.cancelled = true;
            const failure = safeError(e, "[RoomClient] join failed");
            slot.failure = failure;
            for (const owner of slot.owners) {
                owner.active = false;
                owner.disposeControl();
                owner.cancel(failure);
            }
            slot.owners.clear();
            throw e;
        }
        // leave/timeout/cancel 可能在握手期间先摘掉槽；SDK 仍会把迟到的 room 交回来，
        // 此时必须释放它，绝不能把物理 A 记成当前连接或留下无主 socket。
        if (slot.cancelled || this.slot !== slot || slot.owners.size === 0) {
            await this.closePhysicalRoom(slot, room);
            throw new JoinError("CANCELLED", "[RoomClient] join 结果已过期");
        }
        slot.room = room;
        let typedRoom!: AnyTypedGameRoom;

        // SDK join resolves on JOIN_ROOM; reflected state arrives in a later
        // ROOM_STATE frame. Register every lifecycle callback first, then keep
        // ownership.ready pending until the first exact state snapshot passes.
        try {
            if (!disableSdkOutboundReplay(room)) {
                throw new Error("[RoomClient] 无法禁用 SDK 离线消息队列");
            }
            typedRoom = this.createTypedRoom(slot, room);
            slot.typedRoom = typedRoom;
            let initialStateSettled = false;
            let reconnectStatePending = false;
            let resolveInitialState!: () => void;
            let rejectInitialState!: (reason: Error) => void;
            const initialState = new Promise<void>((resolve, reject) => {
                resolveInitialState = resolve;
                rejectInitialState = reject;
            });
            const resolveInitial = () => {
                if (initialStateSettled) return;
                initialStateSettled = true;
                slot.stateReady = true;
                slot.pendingStateReject = null;
                resolveInitialState();
            };
            const rejectInitial = (reason: Error) => {
                if (initialStateSettled) return;
                initialStateSettled = true;
                slot.pendingStateReject = null;
                rejectInitialState(reason);
            };
            slot.pendingStateReject = rejectInitial;

            room.onStateChange(() => {
                if (this.slot !== slot || slot.room !== room || slot.cancelled) return;
                if (!validatedStateSnapshot(room, slot.adapter)) {
                    const failure = new TypeError(`[RoomClient] ${slot.adapter.mode} GameRoom state 非法`);
                    if (!initialStateSettled) rejectInitial(failure);
                    else this.invalidateGameplayState(slot, room, failure);
                    return;
                }
                if (!initialStateSettled) resolveInitial();
                if (reconnectStatePending) {
                    reconnectStatePending = false;
                    slot.stateReady = true;
                    slot.dropping = false;
                    this.reconcileGameplay(slot, "reconnected");
                    console.log("[RoomClient] 自动重连成功");
                }
            });
            room.onDrop((code, reason) => {
                if (this.slot !== slot || slot.room !== room) return;
                slot.dropping = true;
                slot.stateReady = false;
                reconnectStatePending = false;
                if (!disableSdkOutboundReplay(room)) {
                    const failure = new Error("[RoomClient] 无法清理 SDK 离线消息队列");
                    rejectInitial(failure);
                    this.invalidateGameplayState(slot, room, failure);
                    return;
                }
                console.warn(`[RoomClient] 连接掉线（自动重连中） code=${safeDiagnostic(code)} reason=${safeDiagnostic(reason)}`);
            });
            room.onReconnect(() => {
                if (this.slot !== slot || slot.room !== room) return;
                // Reconnect JOIN_ROOM precedes its full state frame as well.
                // Keep sends blocked until the following state callback validates.
                slot.dropping = true;
                slot.stateReady = false;
                reconnectStatePending = true;
                if (!disableSdkOutboundReplay(room)) {
                    const failure = new Error("[RoomClient] 无法清理 SDK 离线消息队列");
                    rejectInitial(failure);
                    this.invalidateGameplayState(slot, room, failure);
                }
            });
            room.onLeave((code, reason) => {
                if (this.slot !== slot || slot.room !== room) return;
                const failure = new Error("[RoomClient] GameRoom 在首个 state 前离开");
                rejectInitial(failure);
                this.slot = null;
                slot.room = null;
                slot.typedRoom = null;
                slot.dropping = false;
                slot.stateReady = false;
                slot.cancelled = true;
                slot.failure = failure;
                // 物理房已死：该槽所有 ownership 同时失效。Main 收到 battleLost 后再 leave 是幂等空操作。
                for (const owner of slot.owners) {
                    owner.active = false;
                    owner.disposeControl();
                    owner.cancel(failure);
                }
                slot.owners.clear();
                try { room.removeAllListeners(); } catch { /* malformed adapter */ }
                console.log(`[RoomClient] 已离开房间 code=${safeDiagnostic(code)} reason=${safeDiagnostic(reason)}`);
                // **非主动离开 = 这一局没了**（重连耗尽/服务端强断/房间销毁）：必须上报，
                // ⛔ 否则 Main 永远不知道连接已死，会拿着死房间继续驱动渲染（inBattle 恒 true，
                // 玩家卡在冻结的战斗画面且回不去大厅）。这不是鉴权判定，故走 battleLost；
                // 已注册的 session 导航出口随后统一回登录并清理 bearer。
                //
                // ⚠ 主动 leave **不会**走到这里：最后一个 owner 释放时先摘掉 `this.slot`，本回调
                // 开头即 return。无需全局 `_leaving` 标志（它无法区分旧槽 leave 与新槽意外死亡）。
                notifyBattleLost();
            });
            room.onError((code, message) => {
                if (!initialStateSettled) rejectInitial(new Error("[RoomClient] GameRoom 首个 state 前发生错误"));
                console.error(`[RoomClient] 房间错误 code=${safeDiagnostic(code)} message=${safeDiagnostic(message)}`);
            });

            // JOIN_ROOM's Schema handshake may already expose a default-looking
            // root. Only an actual ROOM_STATE callback can open the write barrier.
            await initialState;
            if (slot.cancelled || this.slot !== slot || slot.room !== room || slot.owners.size === 0) {
                throw new JoinError("CANCELLED", "[RoomClient] join state 结果已过期");
            }
            // Only the selected gameplay adapter knows whether anything needs
            // replaying. Idle has no hook, so join cannot fabricate Move.
            this.reconcileGameplay(slot, "joined");
        } catch (error) {
            // onLeave already proves the physical connection is dead and clears
            // slot.room. Do not call room.leave() again and delay owner.ready by
            // the close fallback timeout in that path.
            const shouldClosePhysical = slot.room === room;
            slot.pendingStateReject = null;
            if (this.slot === slot) this.slot = null;
            slot.room = null;
            slot.typedRoom = null;
            slot.stateReady = false;
            slot.cancelled = true;
            const failure = safeError(error, "[RoomClient] room setup failed");
            slot.failure = failure;
            for (const owner of slot.owners) {
                owner.active = false;
                owner.disposeControl();
                owner.cancel(failure);
            }
            slot.owners.clear();
            if (shouldClosePhysical) await this.closePhysicalRoom(slot, room);
            throw error;
        }

        return typedRoom;
    }

    private createTypedRoom(slot: RoomSlot, room: Colyseus.Room<unknown>): AnyTypedGameRoom {
        const isCurrent = () => this.slot === slot && slot.room === room && !slot.cancelled;
        return {
            kind: "typed-game-room",
            mode: slot.adapter.mode,
            get state() {
                return room.state as RoomStateByMode[SupportedGameRoomMode];
            },
            roomId: room.roomId,
            sessionId: room.sessionId,
            get current() { return isCurrent(); },
            get dropping() { return isCurrent() && slot.dropping; },
            state$: () => {
                if (!isCurrent()) return noopStateProxy();
                const callbacks = Colyseus.getStateCallbacks(room);
                if (!callbacks) return noopStateProxy();
                return guardStateCallbacks(callbacks, room, slot.adapter, isCurrent);
            },
            onMessage: (type, callback) => this.onMessage(room, type, (payload) => {
                if (isCurrent()) return callback(payload);
                return undefined;
            }),
            send: (type, payload) => this.sendFromSlot(slot, room, type, payload),
        };
    }

    private reconcileGameplay(slot: RoomSlot, reason: GameRoomReconcileReason): void {
        const room = slot.typedRoom;
        const reconcile = slot.adapter.reconcile;
        if (!room || !reconcile || this.slot !== slot || slot.cancelled || slot.dropping || !slot.stateReady) return;
        invokeObserved(`${slot.adapter.mode} ${reason} reconcile`, () => reconcile(room, reason));
    }

    /** A malformed reflected state invalidates the whole physical ownership. */
    private invalidateGameplayState(
        slot: RoomSlot,
        room: Colyseus.Room<unknown>,
        failure = new Error(`[RoomClient] ${slot.adapter.mode} GameRoom state 非法`),
    ): void {
        if (this.slot !== slot || slot.room !== room || slot.cancelled) return;
        this.slot = null;
        slot.room = null;
        slot.typedRoom = null;
        slot.dropping = false;
        slot.stateReady = false;
        slot.cancelled = true;
        slot.failure = failure;
        for (const owner of slot.owners) {
            owner.active = false;
            owner.disposeControl();
            owner.cancel(failure);
        }
        slot.owners.clear();
        void this.closePhysicalRoom(slot, room);
        notifyBattleLost();
    }

    /** 释放精确 owner；同槽仍有后来者时只减 ownership，绝不关闭共享连接。 */
    private async release(owner: RoomOwner): Promise<void> {
        if (!owner.active) return;
        owner.active = false;
        owner.disposeControl();
        const slot = owner.slot;
        slot.owners.delete(owner);
        if (slot.owners.size > 0) return;
        await this.closeSlot(slot);
    }

    /**
     * 关闭精确 slot。先同步摘槽，再等待在途 join 落定并关闭其 room：
     * 后来者会创建新槽；旧 room 的 leave/onLeave 无权修改新槽。
     */
    private closeSlot(slot: RoomSlot): Promise<void> {
        if (slot.closing) return slot.closing;
        if (this.slot === slot) { this.slot = null; }
        slot.cancelled = true;
        slot.pendingStateReject?.(new JoinError("CANCELLED", "[RoomClient] join state 已取消"));
        slot.pendingStateReject = null;
        slot.dropping = false;
        slot.stateReady = false;
        const room = slot.room;
        if (!room) {
            // 在途 join 不可被 SDK 中断；leave 必须立即返回，迟到 room 由 doJoin
            // 的 stale-result 分支释放。给 raw promise 挂 catch，避免 unhandled rejection。
            slot.closing = Promise.resolve();
            void slot.ready.catch(() => {});
            return slot.closing;
        }
        slot.closing = this.closePhysicalRoom(slot, room);
        return slot.closing;
    }

    /** 精确 room 的有界关闭；无论 leave 成功、失败或超时都清理 timer/listener。 */
    private closePhysicalRoom(slot: RoomSlot, room: Colyseus.Room<unknown>): Promise<void> {
        if (slot.physicalClose) return slot.physicalClose;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, LEAVE_TIMEOUT_MS);
        });
        const leave = Promise.resolve()
            .then(() => {
                try {
                    const reconnection = (room as unknown as { reconnection?: { enabled?: boolean } }).reconnection;
                    if (reconnection && typeof reconnection === "object") reconnection.enabled = false;
                } catch { /* malformed adapter: continue with best-effort leave */ }
                try {
                    const fn = (room as unknown as { leave?: unknown }).leave;
                    return typeof fn === "function" ? fn.call(room, true) : undefined;
                } catch { return undefined; }
            })
            .catch(() => { /* 掉线窗口发不出 LEAVE 帧属预期 */ })
            .then(() => undefined);
        slot.physicalClose = Promise.race([leave, timeout]).then(() => {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            try { room.removeAllListeners(); } catch { /* malformed adapter */ }
        });
        return slot.physicalClose;
    }

    /** 在精确 room 上注册服务端消息处理器，返回解绑函数。 */
    onMessage<K extends keyof S2CPayloadMap>(
        room: Colyseus.Room<unknown>,
        type: K,
        callback: (payload: S2CPayloadMap[K]) => unknown,
    ): () => void {
        return room.onMessage(type as string, (raw: unknown) => {
            let payload: S2CPayloadMap[K];
            try {
                payload = validateS2CPayload(type, raw);
            } catch (error) {
                warnInvalidWire(`S2C ${String(type)}`, error);
                return;
            }
            invokeObserved(`S2C ${String(type)}`, () => callback(payload));
        });
    }

    // ---------------- 类型安全的消息发送 ----------------

    ping(): void {
        const payload: IPingReq = { clientTime: Date.now() };
        this.sendCurrent(C2S.Ping, payload);
    }

    castSkill(skillId: number, targetId?: string): void {
        const payload: ICastSkillReq = { skillId, targetId };
        this.sendCurrent(C2S.CastSkill, payload);
    }

    chat(text: string): void {
        const payload: IChatReq = { text };
        this.sendCurrent(C2S.Chat, payload);
    }

    private sendCurrent<K extends keyof C2SPayloadMap>(type: K, payload: C2SPayloadMap[K]): boolean {
        const slot = this.slot;
        const room = slot?.room;
        return slot && room ? this.sendFromSlot(slot, room, type, payload) : false;
    }

    private sendFromSlot<K extends keyof C2SPayloadMap>(
        slot: RoomSlot,
        room: Colyseus.Room<unknown>,
        type: K,
        payload: C2SPayloadMap[K],
    ): boolean {
        if (this.slot !== slot || slot.room !== room || slot.cancelled || slot.dropping || !slot.stateReady) {
            return false;
        }
        if (!slot.adapter.outbound.has(type)) {
            console.warn(`[RoomClient] gameplay ${slot.adapter.mode} 不允许发送 C2S ${String(type)}`);
            return false;
        }
        return this.sendC2S(type, payload, room);
    }

    /** Validate every client-originated payload immediately before it crosses the wire. */
    private sendC2S<K extends keyof C2SPayloadMap>(
        type: K,
        payload: C2SPayloadMap[K],
        targetRoom: Colyseus.Room<unknown> | null,
    ): boolean {
        const room = targetRoom;
        if (!room) return false;
        let wirePayload: C2SPayloadMap[K];
        try {
            wirePayload = validateC2SPayload(type, payload);
        } catch (error) {
            warnInvalidWire(`C2S ${String(type)}`, error);
            return false;
        }
        try {
            room.send(type as string, wirePayload);
        } catch {
            // Adapter reconciliation owns retry state; report only the transport failure.
            warnSendFailure(String(type));
            return false;
        }
        return true;
    }
}
