/**
 * 只读自档（10·M5 首批）：⛔ 无锁无脏表（09·G2）。
 * 档不存在返回 null（冷档 ensureLive 在 M9 接线）。
 */
import { z } from "zod";
import { UserRpc } from "@game/shared";
import { readUser } from "../../player/userStore";
import { defineRpc } from "../rpc";

export default defineRpc(UserRpc.GetInfo, {
  schema: z.object({}),
  handler: async (ctx) => ({ user: await readUser(ctx.uid) }),
});
