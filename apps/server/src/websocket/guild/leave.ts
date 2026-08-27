/**
 * 退出工会（写路径 + 在线索引清除；事件通知留在原工会频道）。
 */
import { z } from "zod";
import { GuildRpc, LobbyPush } from "@game/shared";
import { guildExists } from "../../core/guild/catalog";
import { emitGuildEvent } from "../../core/guild/events";
import { withUser } from "../../core/uow";
import { pushToGuild, setOnlineGuild } from "../push";
import { defineRpc } from "../rpc";
import { currentZoneId } from "../../core/infra/keys";
import { optionalStoredInt } from "../../core/infra/numbers";

export default defineRpc(GuildRpc.Leave, {
  schema: z.object({ clientReqId: z.string().min(1).max(64) }).strict(),
  idem: true,
  handler: async (ctx) => {
    const prevGid = await withUser(ctx.uid, async (uow) => {
      const f = await uow.loadFields(["guildId"]);
      const gid = optionalStoredInt(f.guildId, 0, "guildId", { min: 0 });
      if (gid > 0) { uow.set("guildId", "0"); }
      return gid;
    });
    setOnlineGuild(ctx.uid, null, currentZoneId()); // 只清本区；同 uid 在其它区的公会在线态必须保留
    // ⚠ 同 join：档已提交后 emit 失败，重试读到 guildId=0 不会补发通知（尽力通知契约所容忍）。
    // guildExists 兜底：档里若残留目录外 gid（目录裁撤/脏数据），退会不得为其铸事件键
    if (prevGid > 0 && guildExists(prevGid)) {
      const seq = await emitGuildEvent(prevGid, "memberLeave", { uid: ctx.uid });
      pushToGuild(prevGid, LobbyPush.GuildEvent, { seq, guildId: prevGid }, currentZoneId()); // ⚠ 按区（A2）
    }
    return { ok: true };
  },
});
