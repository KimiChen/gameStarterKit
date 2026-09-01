/**
 * LifecycleBus（Non-intrusive §7.2/§7.3）：无状态的**严格同步**事件转发器。
 *
 * 通道：
 *  - `connection`：转发 WebSocketClient.subscribeConnection 的低层连接事件（原样，不派生）；
 *  - `battle`：战斗房（GameRoom）低层连接事件（RoomClient 直接发布；阶段 9 把
 *    notifyBattleLost 直调归一为 closed{final-loss} 的派生，行为等价）；
 *  - `host`：宿主 hide/show（CocosLifecycleBridge 注入）。
 *
 * ⛔ 不持有 session generation、⛔ 不做任何派生、⛔ 发布不得经过微任务/queueMicrotask——
 * closed{auth-invalid} 的「同一同步栈清凭证」依赖发布与订阅在同一调用栈内完成
 * （SessionCoordinator 在同步回调里先清 token 再广播）。listener 异常逐个观察，
 * 不中断其余 listener 与发布方主流程。
 */
import type { GameRoomConnectionEvent, LobbyConnectionEvent } from "../net/connectionEvents";

/** 宿主前后台事件（Cocos Game.EVENT_HIDE/EVENT_SHOW 经 bridge 注入，seq 单调）。 */
export interface HostLifecycleEvent {
    readonly kind: "hide" | "show";
    readonly seq: number;
}

export interface LifecycleBusChannels {
    readonly connection: LobbyConnectionEvent;
    readonly battle: GameRoomConnectionEvent;
    readonly host: HostLifecycleEvent;
}

export type LifecycleBusChannel = keyof LifecycleBusChannels;

export class LifecycleBus {
    private readonly listeners: {
        readonly [K in LifecycleBusChannel]: Set<(event: LifecycleBusChannels[K]) => void>;
    } = {
        connection: new Set(),
        battle: new Set(),
        host: new Set(),
    };

    /** 订阅一个通道；返回解绑函数。 */
    subscribe<K extends LifecycleBusChannel>(
        channel: K,
        listener: (event: LifecycleBusChannels[K]) => void,
    ): () => void {
        const set = this.listeners[channel];
        set.add(listener);
        return () => { set.delete(listener); };
    }

    /** 某通道当前订阅数（app dispose 后订阅计数归零的机检出口）。 */
    listenerCount(channel: LifecycleBusChannel): number {
        return this.listeners[channel].size;
    }

    /** 严格同步发布：调用返回前所有既有订阅者都已被同步调用（发布期间新增的订阅者不追发）。 */
    publish<K extends LifecycleBusChannel>(channel: K, event: LifecycleBusChannels[K]): void {
        for (const listener of [...this.listeners[channel]]) {
            try {
                listener(event);
            } catch (error) {
                console.error(`[LifecycleBus] ${channel} listener 异常`, error);
            }
        }
    }
}
