/**
 * 加入工会——「档字段 + 在线索引 + 事件 + 唤醒推送」四件套的组合样板（demo 级：
 * 无成员上限/审批等真实工会规则，真实工会系统落地时在本域扩展并更新本头注释）。
 * gid 必须在 core/guild/catalog 目录内——铸键权归目录，⛔ 任意 gid 放行 = 恶意
 * 遍历可无限创建无 TTL 事件键（durable noeviction，写满即全服故障），见 catalog 头注释。
 */
import { z } from "zod";
import { GuildRpc, LobbyPush } from "@game/shared";
import { InvalidPayloadError } from "../../core/errors";
import { guildExists } from "../../core/guild/catalog";
import { emitGuildEvent } from "../../core/guild/events";
import { withUser } from "../../core/uow";
import { pushToGuild, setOnlineGuild } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(GuildRpc.Join, {
  schema: z.object({
    clientReqId: z.string().min(1).max(64),
    guildId: z.number().int().positive().max(999_999_999),
  }),
  idem: true,
  handler: async (ctx, p) => {
    // 存在性校验先于一切写路径（档/索引/事件键都不许为未知 gid 产生）
    if (!guildExists(p.guildId)) { throw new InvalidPayloadError(`未知工会: ${p.guildId}`); }
    await withUser(ctx.uid, async (uow) => { uow.set("guildId", String(p.guildId)); });
    setOnlineGuild(ctx.uid, p.guildId); // 换会维护点（工会在线索引三点之一）
    // ⚠ 写档与 emit 非原子：档已提交但 emit 失败时，幂等重试不会补发本条通知
    //（事件非权威、尽力通知的契约所容忍；要求强通知的场景走 outbox/邮件）
    const seq = await emitGuildEvent(p.guildId, "memberJoin", { uid: ctx.uid });
    pushToGuild(p.guildId, LobbyPush.GuildEvent, { seq, guildId: p.guildId });
    return { ok: true, seq };
  },
});
