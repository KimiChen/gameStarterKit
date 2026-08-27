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
    type IGameRoomState,
    type IPingReq,
    type IMoveReq,
    type ICastSkillReq,
    type IChatReq,
    type IPongRes,
    type IWelcomeRes,
    type ISkillResultRes,
    type IChatRes,
    type IErrorRes,
} from "../shared/index";
import { notifyBattleLost } from "./session";

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
    /** 从调用时刻起的最长等待时间。 */
    timeoutMs?: number;
    /** 绝对截止时间（Unix ms）；小于 1e11 的值也接受为相对毫秒，便于测试。 */
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
function connectionKey(endpoint: string, options: Record<string, unknown>): string {
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
    const wire: Record<string, unknown> = { ...source };
    // 支持把控制字段放在第二参的兼容写法，同时不让它们进入 matchmaking payload。
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
        const deadline = raw < 1e11 ? now + raw : raw;
        return Math.max(0, deadline - now);
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
        const client = new Colyseus.Client(endpoint);
        this.client = client;
        this.endpoint = endpoint;
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
        const joinOptions = cloneJson({ ...split.options, v: PROTOCOL_VERSION });
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
            slot.owners.delete(owner);
            owner.cancel(error);
            if (slot.owners.size === 0) void this.closeSlot(slot).catch(() => {});
        };
        const signal = split.control.signal;
        const waitMs = waitMsFor(split.control);
        if (signal?.aborted) {
            cancelOwner(new JoinError("CANCELLED", "[RoomClient] join 已取消"));
        } else if (waitMs <= 0) {
            cancelOwner(new JoinError("TIMEOUT", "[RoomClient] join 超时"));
        } else if (signal) {
            timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[RoomClient] join 超时")), waitMs);
            abortListener = () => cancelOwner(new JoinError("CANCELLED", "[RoomClient] join 已取消"));
            signal.addEventListener("abort", abortListener, { once: true });
        } else {
            timer = setTimeout(() => cancelOwner(new JoinError("TIMEOUT", "[RoomClient] join 超时")), waitMs);
        }
        // ready 落定后清理本 owner 的 timer/listener；Promise.then 的 rejection 被显式观察。
        ready.then(dispose, dispose);
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
        joinOptions: Record<string, unknown>,
    ): Promise<Colyseus.Room<IGameRoomState>> {
        let room: Colyseus.Room<IGameRoomState>;
        try {
            room = await client.joinOrCreate<IGameRoomState>(RoomName.Game, joinOptions);
        } catch (e) {
            // 失败槽不再接纳后来调用；既有 owner 仍从各自 ready 收到原始连接错误。
            if (this.slot === slot) { this.slot = null; }
            slot.cancelled = true;
            for (const owner of slot.owners) {
                owner.active = false;
                owner.disposeControl();
                owner.cancel(e instanceof Error ? e : new Error(String(e)));
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
        room.onDrop((code, reason) => {
            if (this.slot !== slot || slot.room !== room) return;
            slot.dropping = true;
            // 服务端未必收到掉线前最后一个输入；恢复时强制发送当前 desired state。
            slot.lastInputSeq = -1;
            console.warn(`[RoomClient] 连接掉线（自动重连中） code=${code} reason=${reason ?? ""}`);
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
            room.removeAllListeners();
            console.log(`[RoomClient] 已离开房间 code=${code} reason=${reason ?? ""}`);
            // **非主动离开 = 这一局没了**（重连耗尽/服务端强断/房间销毁）：必须上报，
            // ⛔ 否则 Main 永远不知道连接已死，会拿着死房间继续驱动渲染（inBattle 恒 true，
            // 玩家卡在冻结的战斗画面且回不去大厅）。登录态不受影响，故走 battleLost 而非 authInvalid。
            //
            // ⚠ 主动 leave **不会**走到这里：最后一个 owner 释放时先摘掉 `this.slot`，本回调
            // 开头即 return。无需全局 `_leaving` 标志（它无法区分旧槽 leave 与新槽意外死亡）。
            notifyBattleLost();
        });

        // join 前已经记录的 desired input（例如触摸按下后才完成握手）在首个有效
        // room 上只发送一次；seq/lease 防止旧槽迟到回调重放到新槽。
        this.reconcileInput(slot);
        room.onError((code, message) => {
            console.error(`[RoomClient] 房间错误 code=${code} message=${message ?? ""}`);
        });

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
        room.reconnection.enabled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, LEAVE_TIMEOUT_MS);
        });
        const leave = Promise.resolve()
            .then(() => room.leave(true))
            .catch(() => { /* 掉线窗口发不出 LEAVE 帧属预期 */ })
            .then(() => undefined);
        slot.physicalClose = Promise.race([leave, timeout]).then(() => {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            room.removeAllListeners();
        });
        return slot.physicalClose;
    }

    /**
     * 记录并（若当前连接可写）发送最新移动意图。即使没有 room 或处于 dropping，
     * 也必须更新 desired；重连回调会按 seq 重新 reconcile，避免“松手”丢失。
     */
    move(dirX: number, dirY: number): void {
        if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) return;
        this.desiredInput = { dirX, dirY, seq: ++this.inputSeq };
        const slot = this.slot;
        if (slot && slot.room && !slot.dropping && !slot.cancelled) this.reconcileInput(slot);
    }

    /** 清空当前意图；下一房间首包会是 stop，且不会被旧局方向污染。 */
    clearDesiredMove(): void {
        this.desiredInput = { dirX: 0, dirY: 0, seq: ++this.inputSeq };
        const slot = this.slot;
        if (slot && slot.room && !slot.dropping && !slot.cancelled) this.reconcileInput(slot);
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
        slot.room.send(C2S.Move, payload);
        slot.lastInputSeq = this.desiredInput.seq;
    }

    /**
     * 状态回调代理（0.16 风格 $，0.17 仍受支持）：
     *   const $ = RoomClient.inst.state$(room);
     *   $(room.state).players.onAdd((player, id) => { $(player).listen("x", cb); });
     */
    state$(room: Colyseus.Room<IGameRoomState>): any {
        return Colyseus.getStateCallbacks(room);
    }

    /** 在精确 room 上注册服务端消息处理器，返回解绑函数。 */
    onMessage<K extends keyof S2CPayloadMap>(
        room: Colyseus.Room<IGameRoomState>,
        type: K,
        callback: (payload: S2CPayloadMap[K]) => void,
    ): () => void {
        return room.onMessage(type as string, callback);
    }

    // ---------------- 类型安全的消息发送 ----------------

    ping(): void {
        const payload: IPingReq = { clientTime: Date.now() };
        this.room?.send(C2S.Ping, payload);
    }

    castSkill(skillId: number, targetId?: string): void {
        const payload: ICastSkillReq = { skillId, targetId };
        this.room?.send(C2S.CastSkill, payload);
    }

    chat(text: string): void {
        const payload: IChatReq = { text };
        this.room?.send(C2S.Chat, payload);
    }
}
