/**
 * 可插拔玩法的纯 TypeScript 生命周期契约。
 *
 * 玩法只接收本次 RoomController 建立的精确 room capability；不得从全局单例
 * 查找当前房间。这样一局被取消、换场景或重连时，旧玩法的回调可以通过
 * `context.isActive()` 和 AbortSignal 自己停止工作。
 */

/** 房间连接租约。实现方通常是 RoomClient.joinGame() 返回的 ownership adapter。 */
export interface RoomCapability<TRoom = unknown> {
    readonly ready: Promise<TRoom>;
    leave(): Promise<void>;
}

export type GameplayStopKind =
    | "manual"
    | "cancelled"
    | "disposed"
    | "room-lost"
    | "plugin-error";

export interface GameplayStopReason {
    readonly kind: GameplayStopKind;
    readonly error?: unknown;
}

/** 传给玩法实例的本次 room 上下文。context 不跨 generation 复用。 */
export interface GameplayContext<TRoom = unknown> {
    readonly room: TRoom;
    readonly signal: AbortSignal;
    readonly generation: number;
    /** 当前控制器仍拥有这间房且没有请求停止。 */
    isActive(): boolean;
}

/**
 * 玩法插件的最小生命周期。
 *
 * `start` 成功后才会收到 `handleInput`/`tick`；`stop` 与 `dispose` 必须幂等，
 * 因为取消可能与 room 的迟到 ready 或 transport leave 同时发生。
 */
export interface GameplayPlugin<TRoom = unknown, TInput = unknown> {
    readonly id: string;
    start(context: GameplayContext<TRoom>): void | Promise<void>;
    handleInput?(input: TInput, context: GameplayContext<TRoom>): void | Promise<void>;
    tick?(dt: number, context: GameplayContext<TRoom>): void | Promise<void>;
    stop?(reason: GameplayStopReason, context: GameplayContext<TRoom>): void | Promise<void>;
    dispose?(): void | Promise<void>;
}

export type GameplayPluginFactory<TRoom = unknown, TInput = unknown> =
    () => GameplayPlugin<TRoom, TInput>;
