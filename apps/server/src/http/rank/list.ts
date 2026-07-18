/**
 * POST /rank/list —— 取榜（shared/protocol/rank.ts 契约）：总榜 + 省榜；省份取自档，
 * 未设省份返回空省榜（客户端引导补资料）。userId 字段兼容接收但⛔不消费——uid 一律
 * token 反查（09·G1）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { RANK_UNLISTED, type RankListResponse, type RpcErrCode } from "@game/shared";
import { loadFields } from "../../core/userRecord";
import { getRank, selfEntry } from "../../core/rank/rankService";
import { seasonIdAt } from "../../core/rank/score";
import { uidFromToken } from "../common";
import { RANK_PAGE_LEN, RANK_TYPE } from "./common";

export default createEndpoint("/rank/list", {
  method: "POST",
  body: z.object({
    token: z.string().min(1),
    scope: z.enum(["country", "province"]),
    userId: z.string().optional(), // 兼容 shared RankQuery 线格式，服务端忽略
    type: z.number().optional(),   // 历史语义遗留字段，兼容接收，服务端不消费
  }),
}, async (ctx) => {
  const uid = await uidFromToken(ctx.body.token);
  if (!uid) { throw ctx.error(401, { error: "AUTH_REQUIRED" }); }
  const season = seasonIdAt(Math.floor(Date.now() / 1000));
  try {
    // 省份取自档（loadFields 同样走 Redis，属「排行不可用」同一语义，放 try 内统一 503）
    let province: string | undefined;
    if (ctx.body.scope === "province") {
      const f = await loadFields(uid, ["province"]);
      if (!f.province) { return ctx.json({ rankList: [], selfRanking: RANK_UNLISTED } satisfies RankListResponse); }
      province = f.province;
    }
    const [page, self] = await Promise.all([
      getRank(RANK_TYPE, season, uid, 0, RANK_PAGE_LEN, province),
      selfEntry(RANK_TYPE, season, uid, province),
    ]);
    return ctx.json({
      // getRank 对未上榜者会补一条 rank=-1 的本人行到头部——列表契约里过滤掉，本人名次走 selfRanking
      rankList: page.filter((e) => e.rank !== RANK_UNLISTED).map((e) => ({
        userId: e.uid,
        ranking: e.rank,
        star: e.score,
        nick: String(e.sub.nick ?? ""),
        avatarId: Number(e.sub.avatarId ?? -1),
        province: String(e.sub.province ?? ""),
      })),
      selfRanking: self.rank,
    } satisfies RankListResponse);
  } catch (e) {
    console.warn("[rank/list] Redis 不可用:", (e as Error).message);
    throw ctx.error(503, { error: "RANK_UNAVAILABLE" satisfies RpcErrCode });
  }
});
