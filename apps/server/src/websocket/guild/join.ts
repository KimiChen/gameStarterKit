/**
 * 加入工会——「档字段 + 在线索引 + 事件 + 唤醒推送」四件套的组合样板（demo 级：
 * 无成员上限/审批等真实工会规则，真实工会系统落地时在本域扩展并更新本头注释）。
 */
import { z } from "zod";
import { GuildRpc, LobbyPush } from "@game/shared";
import { emitGuildEvent } from "../../core/guild/events";
import { withUser } from "../../core/uow";
import { pushToGuild, setOnlineGuild } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(GuildRpc.Join, {
  schema: z.object({
    clientReqId: z.string().min(1).max(64),
    // ⚠ demo 级上限兜底：真实工会系统必须校验工会存在性（否则任意 gid 都会创建
    // 一对无 TTL 的事件 key，恶意刷 = 无限建 key）
    guildId: z.number().int().positive().max(999_999_999),
  }),
  idem: true,
  handler: async (ctx, p) => {
    await withUser(ctx.uid, async (uow) => { uow.set("guildId", String(p.guildId)); });
    setOnlineGuild(ctx.uid, p.guildId); // 换会维护点（工会在线索引三点之一）
    // ⚠ 写档与 emit 非原子：档已提交但 emit 失败时，幂等重试不会补发本条通知
    //（事件非权威、尽力通知的契约所容忍；要求强通知的场景走 outbox/邮件）
    const seq = await emitGuildEvent(p.guildId, "memberJoin", { uid: ctx.uid });
    pushToGuild(p.guildId, LobbyPush.GuildEvent, { seq, guildId: p.guildId });
    return { ok: true, seq };
  },
});
