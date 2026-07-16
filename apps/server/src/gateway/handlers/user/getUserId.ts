/**
 * 取当前登录用户 uid —— 只读端点的最小样板。
 *
 * 只读路径：⛔ 无锁无脏表（09·G2）。uid 来自 onAuth token 反查后的 ctx（09·G1，
 * ⛔ 不信客户端上报）——本接口连 Redis 都不必碰，鉴权上下文即答案。
 */
import { z } from "zod";
import { UserRpc } from "@game/shared";
import { defineRpc } from "../../rpc";

export default defineRpc(UserRpc.GetUserId, {
  schema: z.object({}),
  handler: async (ctx) => ({ uid: ctx.uid }),
});
