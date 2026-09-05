/**
 * snakeCosmetic 三个 ws 端点的共享接缝：store 单例 + 领域失败 → 域错误码。
 *
 * ⛔ 本文件不能住在 `websocket/snakeCosmetic/` 下——loader 把域目录里每个非 `*.test.ts` /
 * `*.d.ts` 的 `.ts` 都当端点文件，放进去会因「缺少 defineRpc 的 default 导出」启动期 throw。
 *
 * 真状态在 `cosmeticProfile.ts` 的模块级 Map，本单例只持四个回调；
 * ⛔ 构造期不得建连接/读盘/起定时器——端点模块会被 `collectEndpoints()` 在纯内存测试里 import。
 */
import type { ISnakeCosmeticCatalogEntry } from "@game/shared/protocol/lobbyRpc/domains/snakeCosmetic";
import { RpcFault } from "../../../core/errors";
import { SnakeDemoCosmeticStore, type SnakeCosmeticFailure } from "./cosmeticProfile";
import { SNAKE_SKIN_BUSINESS_CATALOG } from "./skinBusinessCatalog";

export const snakeCosmeticStore = new SnakeDemoCosmeticStore();

/**
 * 业务目录 → wire 展示目录。常量投影，进程内算一次。
 *
 * ⚠ 只下发展示用字段。判定材料（拥有集、门槛裁决）仍全在服务端，⛔ 下发目录不改变拍板 A 的
 * 安全模型——客户端拿到门槛数值也无法据此少扣碎片，扣减发生在 store 内。
 */
export const SNAKE_COSMETIC_WIRE_CATALOG: readonly ISnakeCosmeticCatalogEntry[] =
    SNAKE_SKIN_BUSINESS_CATALOG.map((entry) => ({
        skinId: entry.skinId,
        displayName: entry.displayName.value,
        rarity: entry.rarity.value,
        acquisition: entry.acquisition.value,
        fragmentThreshold: entry.fragmentThreshold.state === "approved" ? entry.fragmentThreshold.value : null,
    }));

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
