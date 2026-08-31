/**
 * 写路径样板：withUser（localMutex → 跨实例锁 → UoW → casHset）。后续玩法写端点照此模式。
 * 开幂等占位以演示完整链路（IN_PROGRESS / 结果缓存）；天然幂等的纯覆写也无害。
 *
 * 幂等审计（阶段 4，§6.12）：**idempotent-write，无 durable 收据**——通用 idem 结果缓存是
 * 唯一重放源，v2 的契约版本 fail-closed 与 done-oversize 墓碑**直接影响**本路由：缓存不可得
 * 时客户端只能重试新 clientReqId（幸而纯覆写重执行无害），没有领域收据可查。
 */
import { UserRpc } from "@game/shared";
import { withUser } from "../../core/uow";
import { defineRpc } from "../rpc";

export default defineRpc(UserRpc.UpdateProfile, {
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
