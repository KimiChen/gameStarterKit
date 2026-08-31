/**
 * app 层接线（Non-intrusive §7.3 阶段 5a）：transport 连接事件 → LifecycleBus →
 * SessionCoordinator 派生。单向依赖：transport 只发布事件、⛔ 不知道 session；
 * 本文件是唯一同时 import 两侧的地方（Main.start 调用，5b 迁入 bootstrap）。
 */
import { WebSocketClient } from "../net/WebSocketClient";
import { LifecycleBus } from "./LifecycleBus";
import { handleLobbyConnectionEvent } from "./SessionCoordinator";

/** 应用级 LifecycleBus 单例（宿主 hide/show 与连接事件共用；5b 归入 AppRuntime）。 */
export const lifecycleBus = new LifecycleBus();

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
