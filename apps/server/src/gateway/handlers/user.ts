/**
 * 用户档 handlers（10·M5 首批）。
 *
 * 读写分路（09·G2）：getInfo/getProfile 只读——不取分布式锁、不进脏表；
 * updateProfile 是走 withUser 的写路径样板（后续玩法写 handler 照此模式）。
 */
import { z } from "zod";
import { withUser } from "../../core/uow";
import { readUser, readUserReadonly } from "../../gameplay/userStore";
import { registerRoute } from "../dispatcher";

export function registerUserRoutes(): void {
  // 只读自档：⛔ 无锁无脏表（09·G2）。档不存在返回 null（冷档 ensureLive 在 M9 接线）
  registerRoute("user.getInfo", {
    schema: z.object({}),
    handler: async (ctx) => ({ user: await readUser(ctx.uid) }),
  });

  // 只读他档：readonly 冻结对象，不含私有字段
  registerRoute("user.getProfile", {
    schema: z.object({ uid: z.string().min(1).max(32) }),
    handler: async (_ctx, p) => ({ profile: await readUserReadonly(p.uid) }),
  });

  // 写路径样板：withUser（localMutex → 跨实例锁 → UoW → casHset）。
  // 开幂等占位以演示完整链路（IN_PROGRESS / 结果缓存）；天然幂等的纯覆写也无害
  registerRoute("user.updateProfile", {
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
}
