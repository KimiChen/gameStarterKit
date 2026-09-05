/**
 * snakeCosmetic.equip——装备皮肤。
 *
 * natural-write：目标状态赋值，重复执行天然无害（重装同一皮肤在 store 内是 no-op），
 * ⛔ 不进通用幂等层、请求不带 clientReqId。
 * 拍板 A「服务端单方面权威」：入参只有 skinId，⛔ 不接受客户端自报的目录 hash。
 */
import { SnakeCosmeticRpc } from "@game/shared/protocol/lobbyRpc/domains/snakeCosmetic";
import { assertSnakeCosmeticWritesEnabled, snakeCosmeticFault, snakeCosmeticStore } from "../../rooms/modes/snake/cosmeticRpc";
import { defineRpc } from "../rpc";

export default defineRpc(SnakeCosmeticRpc.Equip, {
  handler: async (ctx, payload) => {
    // 外观经济写总闸（不变量 8 的锚点）：关闭时整条写路径 fail-closed。
    assertSnakeCosmeticWritesEnabled();
    // 写前也要保证已回灌，否则会在默认 profile 上把已拥有的皮肤误判成 notOwned。
    await snakeCosmeticStore.hydrate(ctx.uid);
    const result = snakeCosmeticStore.equip(ctx.uid, payload.skinId);
    if (result.kind !== "ok") throw snakeCosmeticFault(result);
    return { profile: result.profile };
  },
});
