/**
 * snakeCosmetic.unlock——碎片合成解锁。
 *
 * natural-write：已拥有时 store 直接返回快照且⛔ 不再扣碎片，重复执行安全，
 * ⛔ 不进通用幂等层、请求不带 clientReqId。
 */
import { SnakeCosmeticRpc } from "@game/shared/protocol/lobbyRpc/domains/snakeCosmetic";
import { assertSnakeCosmeticWritesEnabled, snakeCosmeticFault, snakeCosmeticStore } from "../../rooms/modes/snake/cosmeticRpc";
import { defineRpc } from "../rpc";

export default defineRpc(SnakeCosmeticRpc.Unlock, {
  handler: async (ctx, payload) => {
    // 外观经济写总闸（不变量 8 的锚点）：关闭时整条写路径 fail-closed。
    assertSnakeCosmeticWritesEnabled();
    await snakeCosmeticStore.hydrate(ctx.uid);
    const result = snakeCosmeticStore.unlock(ctx.uid, payload.skinId);
    if (result.kind !== "ok") throw snakeCosmeticFault(result);
    return { profile: result.profile };
  },
});
