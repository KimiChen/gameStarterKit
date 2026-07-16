/**
 * 写路径样板：withUser（localMutex → 跨实例锁 → UoW → casHset）。后续玩法写端点照此模式。
 * 开幂等占位以演示完整链路（IN_PROGRESS / 结果缓存）；天然幂等的纯覆写也无害。
 */
import { z } from "zod";
import { UserRpc } from "@game/shared";
import { withUser } from "../../../core/uow";
import { defineRpc } from "../../rpc";

export default defineRpc(UserRpc.UpdateProfile, {
  schema: z.object({
    clientReqId: z.string().min(1).max(64),
    nickname: z.string().max(24).optional(),
    avatarId: z.number().int().min(-1).max(999).optional(),
    province: z.string().max(16).optional(),
    // 音频偏好字段级上云：覆写 last-write-wins；读侧在 user.getInfo（缺失=默认开，07 字段表）
    musicOn: z.boolean().optional(),
    sfxOn: z.boolean().optional(),
  }),
  idem: true,
  handler: async (ctx, p) =>
    withUser(ctx.uid, async (uow) => {
      if (p.nickname !== undefined) { uow.set("nickname", p.nickname); }
      if (p.avatarId !== undefined) { uow.set("avatarId", String(p.avatarId)); }
      if (p.province !== undefined) { uow.set("province", p.province); }
      if (p.musicOn !== undefined) { uow.set("musicOn", p.musicOn ? "1" : "0"); }
      if (p.sfxOn !== undefined) { uow.set("sfxOn", p.sfxOn ? "1" : "0"); }
      return { ok: true };
    }),
});
