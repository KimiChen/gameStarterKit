/**
 * POST /rank/report —— 上报战绩（回流自 Arthur，鉴权改框架 token）：客户端**只报胜负**，
 * 分数服务端经共享公式 advanceCurStar 推导（⛔ 客户端不许直接报分数）；(matchId, uid) 幂等，
 * 重试复用同一 matchId。回包附带服务端签发的好友榜托管 KV——客户端原样写
 * wx.setUserCloudStorage，无法自行组装刷分。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import {
  FRIEND_RANK_KV_KEY, advanceCurStar, decodeRank,
  type FriendRankValue, type RankReportRes, type RpcErrCode,
} from "@game/shared";
import { loadFields } from "../../core/userRecord";
import { selfEntry, updateScore } from "../../core/rank/rankService";
import { seasonIdAt } from "../../core/rank/score";
import { uidFromToken } from "../common";
import { RANK_TYPE } from "./common";

export default createEndpoint("/rank/report", {
  method: "POST",
  body: z.object({
    token: z.string().min(1),
    matchId: z.string().min(8).max(80),
    result: z.enum(["win", "lose"]),
  }),
}, async (ctx) => {
  const uid = await uidFromToken(ctx.body.token);
  if (!uid) { throw ctx.error(401, { error: "AUTH_REQUIRED" }); }
  const season = seasonIdAt(Math.floor(Date.now() / 1000));
  try {
    // 展示信息与省份取自档（只读，无锁 09·G2；loadFields 同样走 Redis，放 try 内统一 503）
    const f = await loadFields(uid, ["nickname", "avatarId", "province"]);
    const cur = (await selfEntry(RANK_TYPE, season, uid)).score;
    const next = advanceCurStar(cur, ctx.body.result === "win");
    const r = await updateScore(
      RANK_TYPE, season, uid, next - cur, ctx.body.matchId,
      { nick: f.nickname ?? "", avatarId: Number(f.avatarId ?? -1), province: f.province ?? "" },
      f.province || undefined,
    );
    const star = r === "dup" ? cur : next;
    const { rank, level } = decodeRank(star);
    const kvValue: FriendRankValue = {
      s: star, r: rank, l: level,
      n: (f.nickname ?? "").slice(0, 24),
      t: Math.floor(Date.now() / 1000),
    };
    return ctx.json({
      ok: true, dup: r === "dup", star,
      // dup 也签发（幂等重写无害）：客户端重试链路上 KV 始终能修复
      friendKv: { key: FRIEND_RANK_KV_KEY, value: JSON.stringify(kvValue) },
    } satisfies RankReportRes);
  } catch (e) {
    console.warn("[rank/report] Redis 不可用:", (e as Error).message);
    throw ctx.error(503, { error: "RANK_UNAVAILABLE" satisfies RpcErrCode });
  }
});
