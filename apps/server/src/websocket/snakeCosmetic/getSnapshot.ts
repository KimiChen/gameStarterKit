/**
 * snakeCosmetic.getSnapshot——衣柜只读端点（query：⛔ 无锁、无脏表）。
 *
 * uid 取自 onAuth 反查的 ctx，⛔ 不信客户端上报的身份。
 * ⚠ 必须 `hydrate` 而不是同步 `getSnapshot`：后者纯内存，首跑拿不到 Redis 回灌值。
 * 同时下发展示目录——业务真源在服务端，客户端没有这份数据（⛔ 不得自建第二份）。
 */
import { SnakeCosmeticRpc } from "@game/shared/protocol/lobbyRpc/domains/snakeCosmetic";
import { SNAKE_COSMETIC_WIRE_CATALOG, snakeCosmeticStore } from "../../rooms/modes/snake/cosmeticRpc";
import { defineRpc } from "../rpc";

export default defineRpc(SnakeCosmeticRpc.GetSnapshot, {
  handler: async (ctx) => ({
    profile: await snakeCosmeticStore.hydrate(ctx.uid),
    catalog: SNAKE_COSMETIC_WIRE_CATALOG,
  }),
});
