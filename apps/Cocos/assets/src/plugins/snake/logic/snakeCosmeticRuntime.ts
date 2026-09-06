/**
 * 衣柜的宿主接线面：snake plugin module install 时由 PluginHost 注入 ports 组装，
 * View 打开时读取（route 形态入口的 navigation.open 不带 setup，故走与 redeem 同形的
 * 模块级 holder + 注销）。⛔ 不 import cc（铁律 9）。
 *
 * ⚠ 衣柜并入 snake 后入口在**结算页**（SnakeWorldView 的「我的衣柜」），不再是设置面板菜单项：
 * 结算页那颗按钮经 gameplay 装配件读本 holder 的 open()。snake 因此在 plugin.json 里是
 * `resident: true`——否则关掉衣柜 route 时 route refcount 归零会把 snake plugin 拆掉
 * （PluginHost.releaseIfIdle），holder 变 null，同一局里第二次点「我的衣柜」就成了哑键。
 */
import type {
    ISnakeCosmeticProfileRes,
    ISnakeCosmeticSnapshotRes,
} from "../../../shared/protocol/lobbyRpc/domains/snakeCosmetic";

export interface SnakeCosmeticRuntime {
    /** 只读查询；⛔ 同时是「预热」入口——服务端首次调用才会从 Redis 回灌 profile。 */
    getSnapshot(): Promise<ISnakeCosmeticSnapshotRes>;
    /** natural-write：重复装备同一皮肤是 no-op，⛔ 无 clientReqId、不进幂等层。 */
    equip(skinId: number): Promise<ISnakeCosmeticProfileRes>;
    /** natural-write：已拥有则直接返回快照且不再扣碎片。 */
    unlock(skinId: number): Promise<ISnakeCosmeticProfileRes>;
    /** 打开衣柜 route（结算页入口用；⛔ 不经菜单——衣柜没有菜单入口了）。 */
    open(): Promise<void>;
    /** 关闭本 plugin 的 route。 */
    close(): void;
}

let current: SnakeCosmeticRuntime | null = null;

export function setSnakeCosmeticRuntime(runtime: SnakeCosmeticRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getSnakeCosmeticRuntime(): SnakeCosmeticRuntime | null {
    return current;
}
