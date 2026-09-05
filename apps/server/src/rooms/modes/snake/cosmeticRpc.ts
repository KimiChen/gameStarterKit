/**
 * snakeCosmetic 三个 ws 端点的共享接缝：store 单例 + 领域失败 → 域错误码。
 *
 * ⛔ 本文件不能住在 `websocket/snakeCosmetic/` 下——loader 把域目录里每个非 `*.test.ts` /
 * `*.d.ts` 的 `.ts` 都当端点文件，放进去会因「缺少 defineRpc 的 default 导出」启动期 throw。
 *
 * 真状态在 `cosmeticProfile.ts` 的模块级 Map，本单例只持四个回调；
 * ⛔ 构造期不得建连接/读盘/起定时器——端点模块会被 `collectEndpoints()` 在纯内存测试里 import。
 */
import { RpcFault } from "../../../core/errors";
import { SnakeDemoCosmeticStore, type SnakeCosmeticFailure } from "./cosmeticProfile";

export const snakeCosmeticStore = new SnakeDemoCosmeticStore();

/**
 * 领域失败 → `RpcFault`。msg 是有界可公开文本（⛔ 不含 Redis key、payload、内部路径或栈）；
 * 客户端按 `code` 分支，⛔ 禁止解析 msg。
 *
 * ⚠ `insufficientFragments` 的 required/balance 在 wire 上只进 msg（RpcFault 只有 code + msg）。
 * UI 要算缺口请用 `getSnapshot` 返回的 `fragmentBalances` 自算，⛔ 不要去 parse 这段文本。
 */
export function snakeCosmeticFault(failure: SnakeCosmeticFailure): RpcFault {
    switch (failure.kind) {
        case "notOwned":
            return new RpcFault("SNAKE_SKIN_NOT_OWNED", "尚未拥有该皮肤");
        case "notCraftable":
            return new RpcFault("SNAKE_SKIN_NOT_CRAFTABLE", "该皮肤不支持碎片合成");
        case "insufficientFragments":
            return new RpcFault(
                "SNAKE_SKIN_FRAGMENTS_INSUFFICIENT",
                `碎片不足：需要 ${failure.required}，当前 ${failure.balance}`,
            );
        case "unknownSkin":
        default:
            return new RpcFault("SNAKE_SKIN_UNKNOWN", "皮肤不存在或不可用");
    }
}
