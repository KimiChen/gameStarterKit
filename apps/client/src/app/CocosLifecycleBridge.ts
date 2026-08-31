/**
 * CocosLifecycleBridge（Non-intrusive §7.3）：把 Cocos 宿主前后台事件
 * （Game.EVENT_HIDE / EVENT_SHOW）以独立 bridge 注入 LifecycleBus 的 host 通道。
 *
 * 本文件是 app/ 下允许 cc 值导入的清单文件（与 Main.ts 同列）：bridge 只做事件搬运，
 * ⛔ 不做任何派生（hide 只应暂停本地 ticker/禁止新意图——消费者在阶段 5b 接入）。
 * `host` 注入 seam 供无头测试传入 stub game 对象。
 */
import { game, Game } from "cc";
import type { LifecycleBus } from "./LifecycleBus";

/** 最小宿主事件面（Cocos `game` 的 on/off 子集）。 */
export interface CocosGameLike {
    on(type: string, callback: () => void): unknown;
    off(type: string, callback: () => void): unknown;
}

/** host 事件单调 sequence（模块级：跨 install 世代单调递增）。 */
let hostEventSeq = 0;

/**
 * 安装宿主生命周期桥。返回幂等的卸载函数（Main/AppRuntime dispose 时调用）。
 * 发布严格同步：EVENT_HIDE/EVENT_SHOW 回调栈内直接 bus.publish。
 */
export function installCocosLifecycleBridge(bus: LifecycleBus, host: CocosGameLike = game): () => void {
    const onHide = (): void => { bus.publish("host", { kind: "hide", seq: ++hostEventSeq }); };
    const onShow = (): void => { bus.publish("host", { kind: "show", seq: ++hostEventSeq }); };
    host.on(Game.EVENT_HIDE, onHide);
    host.on(Game.EVENT_SHOW, onShow);
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        host.off(Game.EVENT_HIDE, onHide);
        host.off(Game.EVENT_SHOW, onShow);
    };
}
