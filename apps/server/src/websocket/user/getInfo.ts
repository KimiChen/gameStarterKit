/**
 * 只读自档（10·M5 首批）：⛔ 无锁无脏表（09·G2）。
 * 冷档自愈（08：访问冷 uid 必须先 ensureLive）：档缺失先解冻再重读——登录侧已解冻，
 * 这里兜「会话中途被冻结」的残余窗口；解冻后仍无档由 ensureLive 抛 USER_DATA_LOST。
 */
import { z } from "zod";
import { UserRpc } from "@game/shared";
import { ensureLive } from "../../core/archive/thaw";
import { readUser } from "../../player/userStore";
import { defineRpc } from "../rpc";

export default defineRpc(UserRpc.GetInfo, {
  schema: z.object({}),
  handler: async (ctx) => {
    let user = await readUser(ctx.uid);
    if (!user) {
      await ensureLive(ctx.uid);
      user = await readUser(ctx.uid);
    }
    return { user };
  },
});
