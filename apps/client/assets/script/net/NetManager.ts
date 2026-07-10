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

export class NetManager {
    private static _inst: NetManager | null = null;
    static get inst(): NetManager {
        if (!this._inst) this._inst = new NetManager();
        return this._inst;
    }

    private client: Colyseus.Client | null = null;
    private _room: Colyseus.Room<IGameRoomState> | null = null;
    /** 掉线时用于手动重连兜底（0.17 默认自动重连，一般用不到） */
    private cachedReconnectionToken = "";

    get room(): Colyseus.Room<IGameRoomState> | null {
        return this._room;
    }

    get connected(): boolean {
        return this._room != null;
    }

    get sessionId(): string {
        return this._room?.sessionId ?? "";
    }

    /** @param endpoint http(s) 地址，如 http://localhost:2568，SDK 自动派生 ws(s) */
    init(endpoint: string): void {
        this.client = new Colyseus.Client(endpoint);
    }

    /** 加入（或创建）主玩法房间 */
    async joinGame(options?: Record<string, unknown>): Promise<Colyseus.Room<IGameRoomState>> {
        if (!this.client) throw new Error("[NetManager] 未初始化，请先调用 init(endpoint)");
        const room = await this.client.joinOrCreate<IGameRoomState>(RoomName.Game, options);
        this._room = room;
        this.cachedReconnectionToken = room.reconnectionToken;

        room.onDrop((code, reason) => {
            console.warn(`[NetManager] 连接掉线（自动重连中） code=${code} reason=${reason ?? ""}`);
        });
        room.onReconnect(() => {
            this.cachedReconnectionToken = room.reconnectionToken;
            console.log("[NetManager] 自动重连成功");
        });
        room.onLeave((code, reason) => {
            console.log(`[NetManager] 已离开房间 code=${code} reason=${reason ?? ""}`);
            this._room = null;
        });
        room.onError((code, message) => {
            console.error(`[NetManager] 房间错误 code=${code} message=${message ?? ""}`);
        });

        return room;
    }

    /** 主动离开房间 */
    async leave(): Promise<void> {
        if (!this._room) return;
        await this._room.leave(true);
        this._room = null;
    }

    /**
     * 状态回调代理（0.16 风格 $，0.17 仍受支持）：
     *   const $ = NetManager.inst.state$();
     *   $(room.state).players.onAdd((player, id) => { $(player).listen("x", cb); });
     */
    state$(): any {
        if (!this._room) throw new Error("[NetManager] 未加入房间");
        return Colyseus.getStateCallbacks(this._room);
    }

    /** 注册服务端消息处理器，返回解绑函数 */
    onMessage<K extends keyof S2CPayloadMap>(type: K, callback: (payload: S2CPayloadMap[K]) => void): () => void {
        if (!this._room) throw new Error("[NetManager] 未加入房间");
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
