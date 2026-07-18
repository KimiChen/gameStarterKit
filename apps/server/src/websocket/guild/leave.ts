/**
 * 退出工会（写路径 + 在线索引清除；事件通知留在原工会频道）。
 */
import { z } from "zod";
import { GuildRpc, LobbyPush } from "@game/shared";
import { emitGuildEvent } from "../../core/guild/events";
import { withUser } from "../../core/uow";
import { pushToGuild, setOnlineGuild } from "../push";
import { defineRpc } from "../rpc";

export default defineRpc(GuildRpc.Leave, {
  schema: z.object({ clientReqId: z.string().min(1).max(64) }),
  idem: true,
  handler: async (ctx) => {
    const prevGid = await withUser(ctx.uid, async (uow) => {
      const f = await uow.loadFields(["guildId"]);
      const gid = Number(f.guildId ?? 0);
      if (gid > 0) { uow.set("guildId", "0"); }
      return gid;
    });
    setOnlineGuild(ctx.uid, null); // 换会维护点
    // ⚠ 同 join：档已提交后 emit 失败，重试读到 guildId=0 不会补发通知（尽力通知契约所容忍）
    if (prevGid > 0) {
      const seq = await emitGuildEvent(prevGid, "memberLeave", { uid: ctx.uid });
      pushToGuild(prevGid, LobbyPush.GuildEvent, { seq, guildId: prevGid });
    }
    return { ok: true };
  },
});
