/**
 * 竞技场商店 plugin 的宿主接线面：plugin module install 时由 PluginHost 注入 ports 组装，View 打开时读取
 * （route 形态入口的 navigation.open 不带 setup，故走与 redeem 同形的模块级 holder + 身份守卫注销）。⛔ 不 import cc（铁律 9）。
 */
import type { IArenaBoardRes } from "../../../kits/arena/api/board/index";
import type { IArenaShopBuyBoostRes } from "../../../shared/protocol/lobbyRpc/domains/arenaShop";

export interface ArenaShopRuntime {
    selfUid(): string;
    /** 只读：整张棋盘（经 kit 的 client board 面 fetchArenaBoard）。 */
    board(): Promise<IArenaBoardRes>;
    /** 幂等写：clientReqId 由宿主 sendIdempotent 生成，本层只传 tile。 */
    buyBoost(tile: number): Promise<IArenaShopBuyBoostRes>;
    /** 关闭本 plugin 的 route。 */
    close(): void;
}

let current: ArenaShopRuntime | null = null;

export function setArenaShopRuntime(runtime: ArenaShopRuntime): () => void {
    current = runtime;
    return () => {
        if (current === runtime) current = null;
    };
}

export function getArenaShopRuntime(): ArenaShopRuntime | null {
    return current;
}
