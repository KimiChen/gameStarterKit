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
}

/**
 * 一个物理房间连接槽。owner 可以有多个（并发调用合流），但槽与 room 始终一一对应；
 * 旧槽的异步回调只能按槽身份修改状态，不能碰后来创建的新槽。
 */
interface RoomSlot {
    readonly connectionKey: string;
    room: Colyseus.Room<IGameRoomState> | null;
    ready: Promise<Colyseus.Room<IGameRoomState>>;
    closing: Promise<void> | null;
    dropping: boolean;
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
    joinGame(options?: Record<string, unknown>): GameRoomOwnership {
        if (!this.client || this.endpoint === null) {
            throw new Error("[RoomClient] 未初始化，请先调用 init(endpoint)");
        }
        const joinOptions: Record<string, unknown> = { v: PROTOCOL_VERSION, ...options };
        const key = connectionKey(this.endpoint, joinOptions);
        let slot = this.slot;
        if (slot && slot.connectionKey !== key) {
            // ⛔ 错误里不打印 key：它包含 token。既有 slot/owners 原样保留，由调用方显式释放。
            throw new Error("[RoomClient] 当前战斗连接参数与本次 join 不一致，请先释放现有 ownership");
        }
        if (!slot) {
            slot = {
                connectionKey: key,
                room: null,
                ready: null as unknown as Promise<Colyseus.Room<IGameRoomState>>,
                closing: null,
                dropping: false,
                owners: new Set<RoomOwner>(),
            };
            // 先挂槽再启动 async join：若 SDK 在调用点同步抛错，doJoin 的失败清理也能命中本槽。
            this.slot = slot;
            // 固化本次 Client：后续 init() 即使切端点，也不能把在途 join 偷换到另一个 Client。
            slot.ready = this.doJoin(slot, this.client, joinOptions);
        }

        const owner: RoomOwner = { active: true, slot };
        slot.owners.add(owner);
        const ready = slot.ready.then((room) => {
            if (!owner.active) {
                throw new Error("[RoomClient] ownership 已释放");
            }
            return room;
        });
        return {
            ready,
            leave: () => this.release(owner),
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
            throw e;
        }
        slot.room = room;

        // 回调按 **slot + room** 双身份守卫：旧槽迟到的事件不得清掉新槽或改写其 dropping。
        room.onDrop((code, reason) => {
            if (this.slot !== slot || slot.room !== room) return;
            slot.dropping = true;
            console.warn(`[RoomClient] 连接掉线（自动重连中） code=${code} reason=${reason ?? ""}`);
        });
        room.onReconnect(() => {
            if (this.slot !== slot || slot.room !== room) return;
            slot.dropping = false;
            console.log("[RoomClient] 自动重连成功");
        });
        room.onLeave((code, reason) => {
            if (this.slot !== slot || slot.room !== room) return;
            this.slot = null;
            slot.dropping = false;
            // 物理房已死：该槽所有 ownership 同时失效。Main 收到 battleLost 后再 leave 是幂等空操作。
            for (const owner of slot.owners) { owner.active = false; }
            slot.owners.clear();
            console.log(`[RoomClient] 已离开房间 code=${code} reason=${reason ?? ""}`);
            // **非主动离开 = 这一局没了**（重连耗尽/服务端强断/房间销毁）：必须上报，
            // ⛔ 否则 Main 永远不知道连接已死，会拿着死房间继续驱动渲染（inBattle 恒 true，
            // 玩家卡在冻结的战斗画面且回不去大厅）。登录态不受影响，故走 battleLost 而非 authInvalid。
            //
            // ⚠ 主动 leave **不会**走到这里：最后一个 owner 释放时先摘掉 `this.slot`，本回调
            // 开头即 return。无需全局 `_leaving` 标志（它无法区分旧槽 leave 与新槽意外死亡）。
            notifyBattleLost();
        });
        room.onError((code, message) => {
            console.error(`[RoomClient] 房间错误 code=${code} message=${message ?? ""}`);
        });

        return room;
    }

    /** 释放精确 owner；同槽仍有后来者时只减 ownership，绝不关闭共享连接。 */
    private async release(owner: RoomOwner): Promise<void> {
        if (!owner.active) return;
        owner.active = false;
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
        slot.dropping = false;
        slot.closing = (async () => {
            let room: Colyseus.Room<IGameRoomState>;
            try {
                room = slot.room ?? await slot.ready;
            } catch {
                return; // join 自身失败，无物理房可退
            }
            room.reconnection.enabled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            try {
                await Promise.race([
                    room.leave(true).catch(() => { /* 掉线窗口发不出 LEAVE 帧属预期 */ }),
                    new Promise<void>((resolve) => { timer = setTimeout(resolve, LEAVE_TIMEOUT_MS); }),
                ]);
            } finally {
                if (timer !== null) clearTimeout(timer);
                room.removeAllListeners();
            }
        })();
        return slot.closing;
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

    /** 发送移动输入（归一化方向向量） */
    move(dirX: number, dirY: number): void {
        const payload: IMoveReq = { dirX, dirY };
        this.room?.send(C2S.Move, payload);
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
