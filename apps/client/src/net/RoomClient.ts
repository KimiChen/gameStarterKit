/**
 * 网络管理器 —— Colyseus 客户端封装（全局 Colyseus 来自 lib/colyseus 的 UMD 插件）。
 *
 * 职责：
 *  - 连接管理：joinGame ownership / 精确释放 / 自动重连事件透传
 *  - 类型安全的消息收发：消息名与 payload 类型来自双端共享协议
 *  - 状态回调：暴露 getStateCallbacks 代理，配合 shared 的 IGameRoomState 镜像接口
 */
import {
    RoomName,
    C2S,
    S2C,
    PROTOCOL_VERSION,
    type C2SPayloadMap,
    type IGameRoomState,
    type IRoomJoinOptions,
    type IPingReq,
    type IMoveReq,
    type ICastSkillReq,
    type IChatReq,
    type IPongRes,
    type IWelcomeRes,
    type ISkillResultRes,
    type IChatRes,
    type IErrorRes,
    isPlainRecord,
    validateOrigin,
    validateC2SPayload,
    validateGameRoomState,
    validateRoomJoinOptions,
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

/**
 * Colyseus exposes Schema instances for the root and players, while the shared
 * validator intentionally accepts dependency-free plain data. Project only the
 * wire fields for class instances and retain exact keys for plain fixtures so
 * unknown fields are still rejected. MapSchema-like collections are copied to a
 * native Map, preserving the structural `entries()` contract of the validator.
 */
function projectPlayerForValidation(input: unknown): unknown {
    if (isPlainRecord(input)) return input;
    if (typeof input !== "object" || input === null) return input;
    const value = input as Record<string, unknown>;
    return {
        id: value.id,
        name: value.name,
        x: value.x,
        y: value.y,
        hp: value.hp,
        maxHp: value.maxHp,
        alive: value.alive,
    };
}

function projectPlayersForValidation(input: unknown): unknown {
    if (input instanceof Map) {
        const out = new Map<unknown, unknown>();
        for (const [key, value] of input.entries()) out.set(key, projectPlayerForValidation(value));
        return out;
    }
    if (typeof input === "object" && input !== null) {
        const entries = (input as { entries?: unknown }).entries;
        if (typeof entries === "function") {
            try {
                const out = new Map<unknown, unknown>();
                const iterable = (entries as () => Iterable<unknown>).call(input);
                for (const pair of iterable) {
                    if (!Array.isArray(pair) || pair.length !== 2) return input;
                    out.set(pair[0], projectPlayerForValidation(pair[1]));
                }
                return out;
            } catch {
                return input;
            }
        }
    }
    if (isPlainRecord(input)) {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(input)) out[key] = projectPlayerForValidation(input[key]);
        return out;
    }
    return input;
}

function projectStateForValidation(input: unknown): unknown {
    if (isPlainRecord(input)) {
        return { ...input, players: projectPlayersForValidation(input.players) };
    }
    if (typeof input !== "object" || input === null) return input;
    const value = input as Record<string, unknown>;
    return {
        tick: value.tick,
        phase: value.phase,
        matchId: value.matchId,
        players: projectPlayersForValidation(value.players),
    };
}

function validatedStateSnapshot(room: Colyseus.Room<IGameRoomState>): IGameRoomState | null {
    try {
        return validateGameRoomState(projectStateForValidation(room.state));
    } catch (error) {
        warnInvalidWire("GameRoom state", error);
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
    room: Colyseus.Room<IGameRoomState>,
    cache = new WeakMap<object, any>(),
): any {
    if ((typeof proxy !== "object" && typeof proxy !== "function") || proxy === null) return proxy;
    const cached = cache.get(proxy);
    if (cached) return cached;
    const guarded = new Proxy(proxy, {
        apply(target, thisArg, args) {
            if (!validatedStateSnapshot(room)) return noopStateProxy();
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
            return guardStateCallbacks(result, room, cache);
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
                            if (!validatedStateSnapshot(room)) return undefined;
                            return invokeObserved(`state ${property}`, () => callback(...callbackArgs));
                        };
                        return invokeObserved(`state ${property}`, () => value.apply(target, args));
                    };
                }
            }
            if (value !== null && (typeof value === "object" || typeof value === "function")) {
                return guardStateCallbacks(value, room, cache);
            }
            return value;
        },
    });
    cache.set(proxy, guarded);
    return guarded;
}

/**
 * 一次战斗连接的 ownership 租约。
 *
 * `ready` 可与其它租约合流到同一个在途 join，但 `leave()` 只释放本租约；同一连接仍有其它
 * owner 时绝不关闭。调用方因此可以安全丢弃迟到的旧世代，而不会误关后来者共享的房间。
 */
export interface GameRoomOwnership {
    readonly ready: Promise<Colyseus.Room<IGameRoomState>>;
    leave(): Promise<void>;
}

interface RoomOwner {
    active: boolean;
    readonly slot: RoomSlot;
    readonly ready: Promise<Colyseus.Room<IGameRoomState>>;
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
    readonly inputLease: number;
    room: Colyseus.Room<IGameRoomState> | null;
    ready: Promise<Colyseus.Room<IGameRoomState>>;
    closing: Promise<void> | null;
    physicalClose: Promise<void> | null;
    cancelled: boolean;
    /** Synchronous/asynchronous join failure observed before all owners attach. */
    failure: Error | null;
    dropping: boolean;
    lastInputSeq: number;
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
    private inputLease = 0;
    private inputSeq = 0;
    private desiredInput = { dirX: 0, dirY: 0, seq: 0 };

    get room(): Colyseus.Room<IGameRoomState> | null {
        return this.slot?.room ?? null;
    }

    get connected(): boolean {
        return this.room != null;
    }

    /** 掉线重连窗口中（onDrop→onReconnect/onLeave 之间）。 */
    get dropping(): boolean {
        return this.slot?.dropping ?? false;
    }

    get sessionId(): string {
        return this.room?.sessionId ?? "";
    }

    /** 当前期望输入的快照（seq 单调递增，供恢复时 reconcile）。 */
    get desiredMove(): Readonly<{ dirX: number; dirY: number; seq: number }> {
        return this.desiredInput;
    }

    get inputGeneration(): number {
        return this.inputLease;
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
    joinGame(options?: Record<string, unknown>, control?: JoinControl | AbortSignal): GameRoomOwnership {
        if (!this.client || this.endpoint === null) {
            throw new Error("[RoomClient] 未初始化，请先调用 init(endpoint)");
        }
        const split = splitJoinControl(options, control);
        // Validate the local wait policy before allocating a slot/owner.  A bad
        // timeout must fail atomically; otherwise an exception here would leave
        // an owner in the slot with no timer or abort listener to release it.
        const waitMs = waitMsForJoin(split.control);
        const joinOptions = validateRoomJoinOptions(
            cloneJson({ ...split.options, v: PROTOCOL_VERSION }),
        );
        const endpoint = this.endpoint;
        const client = this.client;
        const key = connectionKey(endpoint, joinOptions);
        let slot = this.slot;
        if (slot && slot.connectionKey !== key) {
            // ⛔ 错误里不打印 key：它包含 token。既有 slot/owners 原样保留，由调用方显式释放。
            throw new Error("[RoomClient] 当前战斗连接参数与本次 join 不一致，请先释放现有 ownership");
        }
        if (!slot) {
            slot = {
                connectionKey: key,
                generation: ++this.generation,
                inputLease: ++this.inputLease,
                room: null,
                ready: null as unknown as Promise<Colyseus.Room<IGameRoomState>>,
                closing: null,
                physicalClose: null,
                cancelled: false,
                failure: null,
                dropping: false,
                lastInputSeq: -1,
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
        const cancelled = new Promise<Colyseus.Room<IGameRoomState>>((_resolve, reject) => {
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
            ready,
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
        joinOptions: IRoomJoinOptions,
    ): Promise<Colyseus.Room<IGameRoomState>> {
        let room: Colyseus.Room<IGameRoomState>;
        try {
            // Colyseus authenticates the connection from its standard auth token
            // field. Keep it aligned with the slot snapshot before the SDK
            // starts the handshake; options.token remains only a compatibility
            // field validated by the server for exact equality.
            // Clear a stale SDK auth value as well: omitting the compatibility
            // field must never accidentally reuse the previous account's
            // bearer. A real server will reject the resulting empty token.
            client.auth.token = joinOptions.token ?? "";
            room = await client.joinOrCreate<IGameRoomState>(RoomName.Game, joinOptions);
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

        // 回调按 **slot + room** 双身份守卫：旧槽迟到的事件不得清掉新槽或改写其 dropping。
        try {
            room.onDrop((code, reason) => {
            if (this.slot !== slot || slot.room !== room) return;
            slot.dropping = true;
            // 服务端未必收到掉线前最后一个输入；恢复时强制发送当前 desired state。
            slot.lastInputSeq = -1;
            console.warn(`[RoomClient] 连接掉线（自动重连中） code=${safeDiagnostic(code)} reason=${safeDiagnostic(reason)}`);
            });
            room.onReconnect(() => {
            if (this.slot !== slot || slot.room !== room) return;
            slot.dropping = false;
            this.reconcileInput(slot);
            console.log("[RoomClient] 自动重连成功");
            });
            room.onLeave((code, reason) => {
            if (this.slot !== slot || slot.room !== room) return;
            this.slot = null;
            slot.room = null;
            slot.dropping = false;
            slot.cancelled = true;
            // 物理房已死：该槽所有 ownership 同时失效。Main 收到 battleLost 后再 leave 是幂等空操作。
            for (const owner of slot.owners) { owner.active = false; }
            for (const owner of slot.owners) { owner.disposeControl(); }
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

            // join 前已经记录的 desired input（例如触摸按下后才完成握手）在首个有效
            // room 上只发送一次；seq/lease 防止旧槽迟到回调重放到新槽。
            this.reconcileInput(slot);
            room.onError((code, message) => {
            console.error(`[RoomClient] 房间错误 code=${safeDiagnostic(code)} message=${safeDiagnostic(message)}`);
            });
        } catch (error) {
            if (this.slot === slot) this.slot = null;
            slot.room = null;
            slot.cancelled = true;
            const failure = safeError(error, "[RoomClient] room setup failed");
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

        return room;
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
        slot.dropping = false;
        const room = slot.room;
        if (!room) {
            // 在途 join 不可被 SDK 中断；leave 必须立即返回，迟到 room 由后台 finally
            // 释放。给 raw promise 挂 catch，避免黑洞/失败分支产生 unhandled rejection。
            slot.closing = Promise.resolve();
            void slot.ready.then((lateRoom) => this.closePhysicalRoom(slot, lateRoom)).catch(() => {});
            return slot.closing;
        }
        slot.closing = this.closePhysicalRoom(slot, room);
        return slot.closing;
    }

    /** 精确 room 的有界关闭；无论 leave 成功、失败或超时都清理 timer/listener。 */
    private closePhysicalRoom(slot: RoomSlot, room: Colyseus.Room<IGameRoomState>): Promise<void> {
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

    /**
     * 记录并（若当前连接可写）发送最新移动意图。即使没有 room 或处于 dropping，
     * 也必须更新 desired；重连回调会按 seq 重新 reconcile，避免“松手”丢失。
     */
    move(dirX: number, dirY: number): void {
        let payload: IMoveReq;
        try {
            // Validate before recording desired state. Otherwise an out-of-range
            // direction would remain queued and be retried on every reconnect.
            payload = validateC2SPayload(C2S.Move, { dirX, dirY });
        } catch (error) {
            warnInvalidWire(`C2S ${String(C2S.Move)}`, error);
            return;
        }
        this.desiredInput = { dirX: payload.dirX, dirY: payload.dirY, seq: ++this.inputSeq };
        const slot = this.slot;
        if (slot && slot.room && !slot.dropping && !slot.cancelled) this.reconcileInput(slot);
    }

    /**
     * 清空当前意图；下一房间首包会是 stop，且不会被旧局方向污染。
     * 传入 generation 时仅允许对应输入租约清理：旧插件 stop 的迟到清理
     * 不得覆盖后来房间已经写入的新方向。
     */
    clearDesiredMove(expectedGeneration?: number): boolean {
        if (expectedGeneration !== undefined && expectedGeneration !== this.inputLease) return false;
        this.desiredInput = { dirX: 0, dirY: 0, seq: ++this.inputSeq };
        const slot = this.slot;
        if (slot && slot.room && !slot.dropping && !slot.cancelled) this.reconcileInput(slot);
        return true;
    }

    /** 主动触发当前槽的输入对账（测试/外部恢复编排可调用）。 */
    reconcileInput(slot?: RoomSlot): void {
        slot = slot ?? this.slot ?? undefined;
        if (!slot || this.slot !== slot || !slot.room || slot.dropping || slot.cancelled) return;
        // seq=0 代表尚未收到任何用户意图；首次 join 不凭空发一条 stop，
        // 但 move/clearDesiredMove 一旦产生 seq，迟到 join 与重连都必须对账。
        if (this.desiredInput.seq === 0 && this.inputSeq === 0) return;
        if (slot.lastInputSeq >= this.desiredInput.seq) return;
        const payload: IMoveReq = {
            dirX: this.desiredInput.dirX,
            dirY: this.desiredInput.dirY,
        };
        if (this.sendC2S(C2S.Move, payload, slot.room)) {
            slot.lastInputSeq = this.desiredInput.seq;
        }
    }

    /**
     * 状态回调代理（0.16 风格 $，0.17 仍受支持）：
     *   const $ = RoomClient.inst.state$(room);
     *   $(room.state).players.onAdd((player, id) => { $(player).listen("x", cb); });
     */
    state$(room: Colyseus.Room<IGameRoomState>): any {
        const callbacks = Colyseus.getStateCallbacks(room);
        if (!callbacks) return noopStateProxy();
        return guardStateCallbacks(callbacks, room);
    }

    /** 在精确 room 上注册服务端消息处理器，返回解绑函数。 */
    onMessage<K extends keyof S2CPayloadMap>(
        room: Colyseus.Room<IGameRoomState>,
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
        this.sendC2S(C2S.Ping, payload);
    }

    castSkill(skillId: number, targetId?: string): void {
        const payload: ICastSkillReq = { skillId, targetId };
        this.sendC2S(C2S.CastSkill, payload);
    }

    chat(text: string): void {
        const payload: IChatReq = { text };
        this.sendC2S(C2S.Chat, payload);
    }

    /** Validate every client-originated payload immediately before it crosses the wire. */
    private sendC2S<K extends keyof C2SPayloadMap>(
        type: K,
        payload: C2SPayloadMap[K],
        targetRoom: Colyseus.Room<IGameRoomState> | null = this.room,
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
            // A failed send must not advance reconcile's lastInputSeq: the latest desired
            // input remains queued and can be retried by a reconnect/join callback.
            warnSendFailure(String(type));
            return false;
        }
        return true;
    }
}
