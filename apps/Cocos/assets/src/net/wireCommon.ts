/**
 * Lobby（WebSocketClient）与 GameRoom（RoomClient）两个 transport 共用的 wire 层原语：
 * join options 的 JSON 线上语义克隆与稳定序列化（连接身份 key）、控制字段拆分、
 * 错误文本卫生，以及 SDK 离线重放闸。错误文案不按客户端分版，诊断归属由调用栈区分。
 */
import {
    looksLikeJoinSignal,
    normalizeJoinSignal,
} from "./joinControl";

/** splitJoinControl 拆出的控制字段快照；与两个客户端各自导出的 JoinControl 结构一致。 */
export interface JoinControlSnapshot {
    signal?: AbortSignal;
    timeoutMs?: number;
    deadlineMs?: number;
    timeout?: number;
    deadline?: number;
}

/** 复制调用方的 JSON options，避免 join 在途期间外部 mutating 改写身份或线上 payload。 */
export function cloneJson<T>(value: T, ancestors = new Set<object>()): T {
    if (value === null || typeof value !== "object") {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new TypeError("[join] join options 不能包含 NaN/Infinity");
        }
        if (typeof value === "bigint") {
            throw new TypeError("[join] join options 必须是 JSON 可编码数据（不支持 BigInt）");
        }
        return value;
    }
    const object = value as unknown as object;
    if (ancestors.has(object)) {
        throw new TypeError("[join] join options 必须是 JSON 可编码数据（不支持循环引用）");
    }
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

/**
 * 按 JSON 线上语义生成稳定 key：对象键递归排序、对象里的 undefined 等不可编码值省略、
 * 数组里的不可编码值视为 null、自定义 toJSON 先展开。这样字段顺序不影响合流，但
 * token/sId 及未来新增的任意 join option 都会进入连接身份。循环引用/BigInt 与
 * JSON 传输本就不兼容，直接 fail-fast。
 */
export function stableJson(value: unknown, ancestors = new Set<object>()): string | undefined {
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
            throw new TypeError("[join] join options 必须是 JSON 可编码数据（不支持 BigInt）");
        case "object":
            break;
    }

    const object = value as object;
    if (ancestors.has(object)) {
        throw new TypeError("[join] join options 必须是 JSON 可编码数据（不支持循环引用）");
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

/**
 * 把本地生命周期控制字段（signal/timeout 等）从 join options 里拆出：它们不进线上
 * matchmaking payload，但兼容放在第二参或混在 options 里两种写法。在任何 slot 分配前
 * 完成读取与快照，hostile getter/Proxy 只能在无污染的状态下失败。
 */
export function splitJoinControl(
    options: Record<string, unknown> | undefined,
    explicit: JoinControlSnapshot | AbortSignal | undefined,
): { options: Record<string, unknown>; control: JoinControlSnapshot } {
    const source = options ?? {};
    const wire: Record<string, unknown> = {};
    try {
        for (const key of Reflect.ownKeys(source)) {
            if (typeof key !== "string") {
                throw new TypeError("[join] join options 不得包含 symbol key");
            }
            wire[key] = source[key];
        }
    } catch {
        throw new TypeError("[join] join options 无法读取");
    }
    let explicitIsSignal = false;
    if (explicit !== undefined && explicit !== null) {
        try { explicitIsSignal = looksLikeJoinSignal(explicit); }
        catch { throw new TypeError("[join] join control 无法读取"); }
    }
    // Snapshot every control field before allocating a slot.  Besides making
    // the lifetime deterministic, this prevents a getter/Proxy from throwing
    // later in a timer or leave callback.
    const controlSource = explicitIsSignal ? undefined : (explicit ?? source) as Partial<JoinControlSnapshot>;
    const readControl = (key: keyof JoinControlSnapshot): unknown => {
        try { return controlSource?.[key]; }
        catch { throw new TypeError(`[join] join control 字段 ${String(key)} 无法读取`); }
    };
    const control: JoinControlSnapshot = {
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

export function wireErrorText(error: unknown): string {
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

export function safeError(error: unknown, fallback: string): Error {
    try {
        if (error instanceof Error) return error;
    } catch { /* hostile/revoked error proxy */ }
    const text = wireErrorText(error);
    return new Error(text || fallback);
}

/**
 * 丢弃非法 wire 数据时的告警。payload 可能含用户文本或账号标识：只打校验器错误的
 * 稳定文本，⛔ 绝不打印被拒报文本身。tag 是调用方客户端标识（如 "[RoomClient]"）。
 */
export function warnInvalidWire(tag: string, scope: string, error: unknown): void {
    console.warn(`${tag} 丢弃非法 ${scope}: ${wireErrorText(error)}`);
}

/**
 * The 0.17 SDK buffers `room.send()` while its socket is closed and flushes that
 * queue right after reconnect JOIN_ROOM. The Lobby answers RPCs by id and the
 * GameRoom mode/state barrier owns replay, so the SDK queue must stay empty even
 * in the close -> onDrop notification gap.
 */
export function disableSdkOutboundReplay(room: Colyseus.Room<unknown>): boolean {
    try {
        const reconnection = (room as unknown as {
            reconnection?: {
                maxEnqueuedMessages?: unknown;
                enqueuedMessages?: unknown;
            };
        }).reconnection;
        if (!reconnection || typeof reconnection !== "object") return false;
        // 顺序与分步都要紧：调用点（bindRoom / onDrop / onReconnect）返回后 SDK 会
        // **同步** flush 队列，所以「清空已入队的旧消息」必须先于「设上限」，且任一步
        // 失败都不能吞掉后面的补救——过去三步共用一个 try，写上限抛错会直接跳过清队列。
        try {
            const queue = reconnection.enqueuedMessages;
            if (Array.isArray(queue) && queue.length > 0) queue.length = 0;
        } catch { /* 冻结数组：交给下面的整体替换 */ }
        try {
            const queue = reconnection.enqueuedMessages;
            if (!Array.isArray(queue) || queue.length > 0) reconnection.enqueuedMessages = [];
        } catch { /* 不可写：只能如实报告失败 */ }
        try {
            reconnection.maxEnqueuedMessages = 0;
        } catch { /* 不可写：只能如实报告失败 */ }
        return reconnection.maxEnqueuedMessages === 0
            && Array.isArray(reconnection.enqueuedMessages)
            && reconnection.enqueuedMessages.length === 0;
    } catch {
        return false;
    }
}
