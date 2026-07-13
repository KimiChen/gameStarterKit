import { createEndpoint, createRouter } from "@colyseus/core";
import { z } from "zod";
import {
  PROTOCOL_VERSION, RANK_UNLISTED, FRIEND_RANK_KV_KEY, advanceCurStar, decodeRank,
  type FriendRankValue, type IClockNowRes, type IVersionRes, type RankListResponse, type RankReportRes,
} from "@game/shared";
import { verifyBearer } from "../auth/session";
import { wxLogin } from "../auth/wxLogin";
import { toErrCode } from "../core/errors";
import { loadFields } from "../gameplay/userStore";
import { getRank, selfEntry, updateScore } from "../rank/rankService";
import { seasonIdAt } from "../rank/score";

/** 榜类型与页长（rankService.RANK_TYPES 注册的段位星数榜；页长登记于 07 常量表）。 */
const RANK_TYPE = "star";
const RANK_PAGE_LEN = 50;

/** body.token → uid（09·G1：⛔ 不信客户端单独传的 userId，一律 token 反查）。失败返回 null，调用方回 401。 */
async function uidFromToken(token: string): Promise<string | null> {
  try {
    return await verifyBearer(token, false);
  } catch {
    return null;
  }
}

/**
 * 类型化 HTTP 端点（Colyseus 0.17 createRouter，better-call）——服务端框架的**真实**接口。
 * `/api/*` 的 mock 接口仍在 mock/routes.ts（express 挂载），替换时逐个删掉 mock。
 *
 * ⚠ 本组端点依赖本地栈（Redis + MySQL，`npm --workspace @game/server run stack`）
 *   与微信凭证（WX_APPID / WX_SECRET 环境变量）；纯 mock 联调不受影响。
 */
export const routes = createRouter({
  // 部署自检：协议版本随 shared 同源下发，灰度/热更混跑期客户端启动时探测双端是否匹配
  version: createEndpoint("/version", { method: "GET" }, async (ctx) => {
    return ctx.json({ name: "game-server", protocol: PROTOCOL_VERSION } satisfies IVersionRes);
  }),

  // 服务端权威时钟（无鉴权）：每日奖励/跨天判定/体力恢复展示的对时真源，防改本地时钟
  clockNow: createEndpoint("/clock/now", { method: "GET" }, async (ctx) => {
    return ctx.json({ serverTime: Date.now() } satisfies IClockNowRes);
  }),

  // wx-login（10·M3）：框架鉴权入口，签发不透明 token（{uid}.{hex}）。
  // 出参只有 { userId, token }，⛔ 禁含 openid/unionid/session_key（09·G8）
  wxLogin: createEndpoint("/account/wx-login", {
    method: "POST",
    body: z.object({
      code: z.string().min(1),
      deviceId: z.string().optional(),
    }),
  }, async (ctx) => {
    // 真实 IP 取 XFF **最右段**：可信 LB 把真实对端 append 到末尾，最左段是客户端可伪造的
    // （伪造最左段可每请求换 IP 绕过登录限流桶，09·G5）。部署要求网关前置恰一层可信 LB
    const xff = ctx.headers?.get?.("x-forwarded-for") ?? "";
    const ip = xff.split(",").map((s: string) => s.trim()).filter(Boolean).pop() ?? "0.0.0.0";
    try {
      return await wxLogin({ code: ctx.body.code, ip, deviceId: ctx.body.deviceId });
    } catch (e) {
      const code = toErrCode(e);
      const http = code === "ACCOUNT_BANNED" ? 403 : code === "RATE_LIMITED" ? 429
        : code === "AUTH_REQUIRED" || code === "AUTH_EPOCH_STALE" ? 401 : 500;
      throw ctx.error(http, { error: code });
    }
  }),

  // 微信支付回调（10·M6）。⚠ 首版用共享密钥头校验（WXPAY_NOTIFY_SECRET），
  // 上线前必须换微信支付平台证书验签（APIv3）
  wxPayNotify: createEndpoint("/pay/wx-notify", {
    method: "POST",
    body: z.object({
      orderId: z.string().min(1).max(64),
      wxTxnId: z.string().min(1).max(64),
      amountFen: z.number().int().positive(),
    }),
  }, async (ctx) => {
    const secret = process.env.WXPAY_NOTIFY_SECRET ?? "";
    if (!secret || ctx.headers?.get?.("x-notify-secret") !== secret) {
      throw ctx.error(401, { error: "AUTH_REQUIRED" });
    }
    const { handleWxPayNotify } = await import("../economy/purchases");
    const r = await handleWxPayNotify(ctx.body);
    if (r === "mismatch") { throw ctx.error(400, { error: "ORDER_MISMATCH" }); }
    return { code: "SUCCESS" }; // ok / already 都 ack（微信要求幂等应答）
  }),

  // 上报战绩（回流自 Arthur，鉴权改框架 token）：客户端**只报胜负**，分数服务端经共享公式
  // advanceCurStar 推导（⛔ 客户端不许直接报分数）；(matchId, uid) 幂等，重试复用同一 matchId。
  // 回包附带服务端签发的好友榜托管 KV——客户端原样写 wx.setUserCloudStorage，无法自行组装刷分。
  rankReport: createEndpoint("/rank/report", {
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
    // 展示信息与省份取自档（只读，无锁 09·G2）
    const f = await loadFields(uid, ["nickname", "avatarId", "province"]);
    try {
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
      throw ctx.error(503, { error: "RANK_UNAVAILABLE" });
    }
  }),

  // 取榜（shared/protocol/rank.ts 契约）：总榜 + 省榜；省份取自档，未设省份返回空省榜
  //（客户端引导补资料）。userId 字段兼容接收但⛔不消费——uid 一律 token 反查（09·G1）。
  rankList: createEndpoint("/rank/list", {
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
    let province: string | undefined;
    if (ctx.body.scope === "province") {
      const f = await loadFields(uid, ["province"]);
      if (!f.province) { return ctx.json({ rankList: [], selfRanking: RANK_UNLISTED } satisfies RankListResponse); }
      province = f.province;
    }
    try {
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
      throw ctx.error(503, { error: "RANK_UNAVAILABLE" });
    }
  }),
});
