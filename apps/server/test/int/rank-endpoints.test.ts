import "./env-setup"; // ⚠ 必须第一个 import

/**
 * /rank/report + /rank/list 集成测试（回流批次）——真实 Colyseus HTTP 端点 + 真实 Redis/MySQL：
 *  1. 客户端只报胜负：分数服务端经 advanceCurStar 推导（0 → 胜 → 2 星）
 *  2. (matchId, uid) 幂等：重放 dup=true、分数不变；friendKv 照常签发
 *  3. 好友榜托管 KV：value 为服务端组装的权威 FriendRankValue
 *  4. 省榜联动：报分双写省榜；/rank/list scope=province 读省榜；未设省份返回空省榜
 *  5. 鉴权：坏 token 401（uid 一律 token 反查，09·G1）
 * 前置：npm --workspace @game/server run stack（且 dev server 未占 2568）。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  FRIEND_RANK_KV_KEY, RANK_UNLISTED, type FriendRankValue, type RankListResponse, type RankReportRes,
} from "@game/shared";
import { issueSession } from "../../src/auth/session";
import { createUser } from "../../src/gameplay/userStore";
import { encodeProvince } from "../../src/rank/rankService";
import { seasonIdAt } from "../../src/rank/score";
import { kLbDedup, kRank, kRankProv, kRankSub } from "../../src/infra/keys";
import { clientForKey, closeRedis } from "../../src/infra/redisRoute";
import { closeMysql, getPool, type ResultSetHeader } from "../../src/infra/mysql";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

let colyseus: ColyseusTestServer;
const BASE = `http://127.0.0.1:${process.env.PORT ?? "2568"}`;
const RANK_TYPE = "star";
const season = () => seasonIdAt(Math.floor(Date.now() / 1000));

const uids: string[] = [];
const extraKeys = new Set<string>();

/** 造号：accounts 行 + Redis 档（带省份）+ 会话（同 gateway.test 模式，绕过 wxLogin）。 */
async function makeUser(name: string, province = ""): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  await createUser(uid, { nickname: `n_${name}`, avatarId: "1", ...(province ? { province } : {}) });
  const { token } = await issueSession(uid, 0, null);
  return { uid, token };
}

const post = async (path: string, body: unknown): Promise<{ status: number; json: any }> => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

before(async () => {
  await assertRedisUp();
  colyseus = await boot((await import("../../src/app.config")).server);
});
after(async () => {
  await colyseus.shutdown();
  for (const u of uids) {
    await getPool().execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u);
  }
  for (const k of extraKeys) { await clientForKey(k).unlink(k); }
  await closeRedis();
  await closeMysql();
});

test("report：只报胜负 → 服务端推导 star；matchId 幂等重放 dup 且分数不变", async () => {
  const { uid, token } = await makeUser("rpt", "广东省");
  const s = season();
  extraKeys.add(kRank(RANK_TYPE, s)).add(kRankSub(RANK_TYPE, s))
    .add(kRankProv(RANK_TYPE, encodeProvince("广东省"), s));
  const matchId = testUid("m_rpt");
  extraKeys.add(kLbDedup(matchId, uid));

  const r1 = await post("/rank/report", { token, matchId, result: "win" });
  assert.equal(r1.status, 200);
  const rep = r1.json as RankReportRes;
  assert.equal(rep.star, 2, "0 星首胜 → advanceCurStar(0,true) = 2");
  assert.equal(rep.dup, false);

  // friendKv：服务端签发的权威载荷
  assert.equal(rep.friendKv.key, FRIEND_RANK_KV_KEY);
  const kv = JSON.parse(rep.friendKv.value) as FriendRankValue;
  assert.equal(kv.s, 2);
  assert.equal(kv.n, "n_rpt");

  // 幂等重放：同 matchId → dup、分数不变、KV 照常签发
  const r2 = await post("/rank/report", { token, matchId, result: "win" });
  assert.equal((r2.json as RankReportRes).dup, true);
  assert.equal((r2.json as RankReportRes).star, 2);

  // 省榜已双写
  const provKey = kRankProv(RANK_TYPE, encodeProvince("广东省"), s);
  assert.ok(await clientForKey(provKey).zscore(provKey, uid), "省榜有分");
});

test("list：country 返回榜行；province 读省榜；未设省份空省榜；坏 token 401", async () => {
  const { uid, token } = await makeUser("lst", "浙江省");
  const s = season();
  extraKeys.add(kRank(RANK_TYPE, s)).add(kRankSub(RANK_TYPE, s))
    .add(kRankProv(RANK_TYPE, encodeProvince("浙江省"), s));
  const matchId = testUid("m_lst");
  extraKeys.add(kLbDedup(matchId, uid));
  await post("/rank/report", { token, matchId, result: "win" });

  const country = (await post("/rank/list", { token, scope: "country" })).json as RankListResponse;
  const mine = country.rankList.find((e) => e.userId === uid);
  assert.ok(mine, "总榜应有本人行");
  assert.equal(mine!.star, 2);
  assert.equal(mine!.province, "浙江省", "展示信息来自 rank_sub");
  assert.ok(country.selfRanking >= 1);

  const prov = (await post("/rank/list", { token, scope: "province" })).json as RankListResponse;
  assert.ok(prov.rankList.some((e) => e.userId === uid), "省榜应有本人行");

  // 未设省份：空省榜 + 未上榜哨兵（引导客户端补资料）
  const bare = await makeUser("bare");
  const empty = (await post("/rank/list", { token: bare.token, scope: "province" })).json as RankListResponse;
  assert.deepEqual(empty, { rankList: [], selfRanking: RANK_UNLISTED });

  // 鉴权：坏 token 401（uid 从 token 反查，09·G1）
  assert.equal((await post("/rank/list", { token: "bad.token", scope: "country" })).status, 401);
  assert.equal((await post("/rank/report", { token: "bad.token", matchId: testUid("m_bad"), result: "win" })).status, 401);
});
