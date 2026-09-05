/**
 * 衣柜 feature 的宿主接线面：feature module install 时由 FeatureHost 注入 ports 组装，
 * View 打开时读取（route 形态入口的 navigation.open 不带 setup，故走与 redeem 同形的
 * 模块级 holder + 注销）。⛔ 不 import cc（铁律 9）。
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
    /** 关闭本 feature 的 route。 */
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
