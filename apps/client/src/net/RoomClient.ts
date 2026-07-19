/**
 * 网络管理器 —— Colyseus 客户端封装（全局 Colyseus 来自 lib/colyseus 的 UMD 插件）。
 *
 * 职责：
 *  - 连接管理：joinGame / leave / 自动重连事件透传
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

export class RoomClient {
    private static _inst: RoomClient | null = null;
    static get inst(): RoomClient {
        if (!this._inst) this._inst = new RoomClient();
        return this._inst;
    }

    private client: Colyseus.Client | null = null;
    private _room: Colyseus.Room<IGameRoomState> | null = null;
    /** 进行中的 join（并发调用合流，防双击开出第二条 ws——孤儿房的监听器/state 回调悬挂到连接关闭） */
    private joining: Promise<Colyseus.Room<IGameRoomState>> | null = null;
    /** 掉线重连窗口中（断线期间 SDK 会排队 send、重连后补发过期包——调用方据此暂停心跳/输入上行） */
    private _dropping = false;
    /** 掉线时用于手动重连兜底（0.17 默认自动重连，一般用不到） */
    private cachedReconnectionToken = "";

    get room(): Colyseus.Room<IGameRoomState> | null {
        return this._room;
    }

    get connected(): boolean {
        return this._room != null;
    }

    /** 掉线重连窗口中（onDrop→onReconnect/onLeave 之间）。 */
    get dropping(): boolean {
        return this._dropping;
    }

    get sessionId(): string {
        return this._room?.sessionId ?? "";
    }

    /** @param endpoint http(s) 地址，如 http://localhost:2568，SDK 自动派生 ws(s) */
    init(endpoint: string): void {
        this.client = new Colyseus.Client(endpoint);
    }

    /** 加入（或创建）主玩法房间。协议版本 v 在此统一注入（服务端 onAuth 硬闸，shared/protocol/rooms.ts）。
     *  已在房直接复用、并发合流到同一次 join（防双击开出第二条 ws 孤儿房）。 */
    async joinGame(options?: Record<string, unknown>): Promise<Colyseus.Room<IGameRoomState>> {
        if (!this.client) throw new Error("[RoomClient] 未初始化，请先调用 init(endpoint)");
        if (this._room) return this._room;
        this.joining ??= this.doJoin(options);
        try {
            return await this.joining;
        } finally {
            this.joining = null;
        }
    }

    private async doJoin(options?: Record<string, unknown>): Promise<Colyseus.Room<IGameRoomState>> {
        const room = await this.client!.joinOrCreate<IGameRoomState>(RoomName.Game, { v: PROTOCOL_VERSION, ...options });
        this._room = room;
        this.cachedReconnectionToken = room.reconnectionToken;

        // 回调按 room 身份守卫（同 WebSocketClient）：leave 在途期间重新 joinGame 后，
        // 旧房迟到的 onLeave 不得清掉新房引用/改写 dropping（评审验证探针实证过误清）
        room.onDrop((code, reason) => {
            if (this._room !== room) return;
            this._dropping = true;
            console.warn(`[RoomClient] 连接掉线（自动重连中） code=${code} reason=${reason ?? ""}`);
        });
        room.onReconnect(() => {
            if (this._room !== room) return;
            this._dropping = false;
            this.cachedReconnectionToken = room.reconnectionToken;
            console.log("[RoomClient] 自动重连成功");
        });
        room.onLeave((code, reason) => {
            if (this._room !== room) return;
            this._dropping = false;
            console.log(`[RoomClient] 已离开房间 code=${code} reason=${reason ?? ""}`);
            this._room = null;
        });
        room.onError((code, message) => {
            console.error(`[RoomClient] 房间错误 code=${code} message=${message ?? ""}`);
        });

        return room;
    }

    /** 主动离开房间。掉线重连窗口里调用也安全：先停自动重连（防 LEAVE 帧丢失后
     *  连接复活成幽灵会话），限时等待 onLeave，超时则强制本地清理。
     *  join 在途时等落定再离开（取消不了进行中的握手，完成后清理，不留幽灵房）。
     *  已知边界：合流进同一在途 join 的其他调用方会拿到随后被本 leave 关闭的房——
     *  调用方持有的 room 引用用前应查 connected（Main.connectServer 的销毁判定即此模式）。 */
    async leave(): Promise<void> {
        if (this.joining) { await this.joining.catch(() => {}); }
        const room = this._room;
        if (!room) return;
        this._room = null; // 先摘引用：leave 期间新发起的调用直接面对「未加入」而非将死连接
        this._dropping = false; // 超时路径 removeAllListeners 会摘掉能复位它的回调——必须在此显式复位，
                                // 否则重新 joinGame 后心跳/移动上发被永久扣死（评审验证探针实证）
        room.reconnection.enabled = false;
        await Promise.race([
            room.leave(true).catch(() => { /* 掉线窗口发不出 LEAVE 帧属预期 */ }),
            new Promise<void>((r) => setTimeout(r, LEAVE_TIMEOUT_MS)),
        ]);
        room.removeAllListeners();
    }

    /**
     * 状态回调代理（0.16 风格 $，0.17 仍受支持）：
     *   const $ = RoomClient.inst.state$();
     *   $(room.state).players.onAdd((player, id) => { $(player).listen("x", cb); });
     */
    state$(): any {
        if (!this._room) throw new Error("[RoomClient] 未加入房间");
        return Colyseus.getStateCallbacks(this._room);
    }

    /** 注册服务端消息处理器，返回解绑函数 */
    onMessage<K extends keyof S2CPayloadMap>(type: K, callback: (payload: S2CPayloadMap[K]) => void): () => void {
        if (!this._room) throw new Error("[RoomClient] 未加入房间");
        return this._room.onMessage(type as string, callback);
    }

    // ---------------- 类型安全的消息发送 ----------------

    ping(): void {
        const payload: IPingReq = { clientTime: Date.now() };
        this._room?.send(C2S.Ping, payload);
    }

    /** 发送移动输入（归一化方向向量） */
    move(dirX: number, dirY: number): void {
        const payload: IMoveReq = { dirX, dirY };
        this._room?.send(C2S.Move, payload);
    }

    castSkill(skillId: number, targetId?: string): void {
        const payload: ICastSkillReq = { skillId, targetId };
        this._room?.send(C2S.CastSkill, payload);
    }

    chat(text: string): void {
        const payload: IChatReq = { text };
        this._room?.send(C2S.Chat, payload);
    }
}
