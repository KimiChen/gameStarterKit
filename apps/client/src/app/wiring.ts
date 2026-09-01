/**
 * app 层接线（Non-intrusive §7.3 阶段 5a）：transport 连接事件 → LifecycleBus →
 * SessionCoordinator 派生。单向依赖：transport 只发布事件、⛔ 不知道 session；
 * 本文件是唯一同时 import 两侧的地方（Main.start 调用，5b 迁入 bootstrap）。
 */
import { WebSocketClient } from "../net/WebSocketClient";
import { LifecycleBus } from "./LifecycleBus";
import { handleGameRoomConnectionEvent, handleLobbyConnectionEvent } from "./SessionCoordinator";

/** 应用级 LifecycleBus 单例（宿主 hide/show 与连接事件共用；5b 归入 AppRuntime）。 */
export const lifecycleBus = new LifecycleBus();

// battle 通道派生（阶段 9，5a 偏差 8 收尾）：RoomClient 为发布战斗房连接事件而
// import 本模块取得 bus ⇒ 本行在任何 battle 发布之前已求值，派生订阅必然在位——
// ⛔ 不需要（也不提供）第二个显式接线开关，避免「未接线时 battleLost 静默丢失」
// 的中间态；closed{final-loss} → notifyBattleLost 与旧直调行为等价（严格同步）。
lifecycleBus.subscribe("battle", handleGameRoomConnectionEvent);

let connectionWiring: (() => void) | null = null;

/**
 * 接通 WebSocketClient.subscribeConnection → bus → SessionCoordinator 派生。
 * 幂等：重复调用返回既有解绑器（派生真相是应用级的，跨 Cocos 场景保持接通，
 * ⛔ 不随单个 Main 实例销毁——否则场景切换间隙的 closed{final-loss} 会丢失）。
 * 顺序：先挂派生订阅、再绑 transport（subscribeConnection 的快照回放要能到达派生层）。
 */
export function wireConnectionEvents(): () => void {
    if (connectionWiring) return connectionWiring;
    const unsubscribeDerive = lifecycleBus.subscribe("connection", handleLobbyConnectionEvent);
    const unsubscribeTransport = WebSocketClient.inst.subscribeConnection((event) => {
        lifecycleBus.publish("connection", event);
    });
    const dispose = (): void => {
        if (connectionWiring !== dispose) return;
        connectionWiring = null;
        unsubscribeTransport();
        unsubscribeDerive();
    };
    connectionWiring = dispose;
    return dispose;
}
