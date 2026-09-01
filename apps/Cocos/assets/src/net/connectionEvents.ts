/**
 * 大厅连接事件契约（Non-intrusive §7.3）：transport 的唯一低层连接真相。
 *
 * 低层事件只携带 connection/slot generation、单调 sequence 与关闭原因，
 * ⛔ 不携带 session generation、不反向依赖 session——高层 session 事件由
 * app/SessionCoordinator 订阅派生（经 app/LifecycleBus 严格同步转发）。
 * 本文件是纯类型模块：transport（net/WebSocketClient）与 SessionCoordinator
 * 都从这里取类型，避免 transport → session 的反向 import。
 */

/**
 * 鉴权失效原因。两类来源：
 * - RPC 错误码（快路径/建连校验失败）：`AUTH_REQUIRED` / `ACCOUNT_BANNED` / `AUTH_EPOCH_STALE`（保留码，服务端已不产出）
 * - **强制下线**（服务端主动踢，先推 `auth.forceLogout{reason}`、关闭码兜底）：`FORCE_BANNED` / `FORCE_REPLACED`（顶号）/ `FORCE_REVOKED`
 */
export type AuthInvalidReason =
    | "AUTH_EPOCH_STALE" | "AUTH_REQUIRED" | "ACCOUNT_BANNED"
    | "FORCE_BANNED" | "FORCE_REPLACED" | "FORCE_REVOKED";

/**
 * closed 的判别三分类（§7.3）：
 * - `voluntary`：显式 leave() / ownership 全部释放 / join 取消、超时或失败等
 *   **现状不触发任何 session 通知**的终局路径——派生层不触发导航；
 * - `auth-invalid`：ForceLogout 推送 / 强踢关闭码 / RPC err AUTH_* 与 ACCOUNT_BANNED
 *   路径——派生层同一同步栈清凭证并回登录；
 * - `final-loss`：其余非自愿最终死亡（onLeave 普通关闭码、replay 闸失守放弃连接）——
 *   派生层先对账、失败才回登录。
 */
export type LobbyConnectionCloseReason = "voluntary" | "auth-invalid" | "final-loss";

export type LobbyConnectionEvent =
    | { readonly kind: "joining"; readonly connGeneration: number; readonly seq: number }
    | { readonly kind: "ready"; readonly connGeneration: number; readonly seq: number }
    | { readonly kind: "dropped"; readonly connGeneration: number; readonly seq: number }
    | { readonly kind: "reconnected"; readonly connGeneration: number; readonly seq: number }
    | {
        readonly kind: "closed";
        readonly connGeneration: number;
        readonly seq: number;
        readonly reason: "voluntary" | "final-loss";
    }
    | {
        readonly kind: "closed";
        readonly connGeneration: number;
        readonly seq: number;
        readonly reason: "auth-invalid";
        readonly authReason: AuthInvalidReason;
    };

/** 订阅时立即回放的当前不可变连接快照（§7.3：晚到订阅者不会永远错过 ready）。 */
export interface LobbyConnectionSnapshot {
    readonly state: "idle" | "joining" | "ready" | "dropped";
    readonly connGeneration: number;
    readonly lastSeq: number;
}

export type LobbyConnectionListener = (event: LobbyConnectionEvent) => void;

/**
 * 战斗房（GameRoom）连接事件——battle 通道的低层真相（§7.3/§7.8 阶段 9）。
 * 由 net/RoomClient 直接发布进 app/LifecycleBus 的 `battle` 通道，
 * SessionCoordinator 只从 `closed{final-loss}` 派生 battleLost（与旧
 * notifyBattleLost 直调**行为等价**）；`closed{voluntary}` = 主动 leave /
 * join 取消，现状不触发任何 session 通知。GameRoom 没有 auth-invalid 分类：
 * 鉴权失败在 join 阶段直接拒绝、强踢经 Lobby 侧派生。
 */
export type GameRoomConnectionEvent =
    | { readonly kind: "joining"; readonly connGeneration: number; readonly seq: number }
    | { readonly kind: "ready"; readonly connGeneration: number; readonly seq: number }
    | { readonly kind: "dropped"; readonly connGeneration: number; readonly seq: number }
    | { readonly kind: "reconnected"; readonly connGeneration: number; readonly seq: number }
    | {
        readonly kind: "closed";
        readonly connGeneration: number;
        readonly seq: number;
        readonly reason: "voluntary" | "final-loss";
    };

/**
 * 战斗房连接三态快照（§7.8 show 路径判连接状态用）：从当前 slot **派生**，
 * ⛔ 不是第二份事件簿——ready = 首帧/重连 state 已过 exact validator，
 * dropped = drop 宽限窗口，joining = 握手或首帧屏障中，idle = 无连接。
 */
export interface GameRoomConnectionSnapshot {
    readonly state: "idle" | "joining" | "ready" | "dropped";
    readonly connGeneration: number;
}
