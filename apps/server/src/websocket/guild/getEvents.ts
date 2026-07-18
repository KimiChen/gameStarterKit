/**
 * 拉取工会事件增量——唤醒式推送的自愈端（只读：⛔ 无锁无脏表，09·G2）。
 * 客户端在 上线首拉 / 断线重连 / 推送 seq 不连续 三种情况下调用，同一条自愈路径。
 */
import { z } from "zod";
import { GuildRpc } from "@game/shared";
import { readGuildEvents } from "../../core/guild/events";
import { loadFields } from "../../core/userRecord";
import { defineRpc } from "../rpc";

export default defineRpc(GuildRpc.GetEvents, {
  schema: z.object({ sinceSeq: z.number().int().min(0) }),
  handler: async (ctx, p) => {
    const f = await loadFields(ctx.uid, ["guildId"]);
    const gid = Number(f.guildId ?? 0);
    if (!(gid > 0)) { return { events: [], latestSeq: 0, guildId: 0 }; }
    const r = await readGuildEvents(gid, p.sinceSeq);
    return { ...r, guildId: gid }; // guildId 必带：客户端据此识别换会并重置 seq 水位
  },
});
