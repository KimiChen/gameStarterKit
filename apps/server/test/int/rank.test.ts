/**
 * M7 DoD 集成测试（10·M7）——全部真实 Redis，⛔ 不 mock：
 *  1. 同分两人先达者靠前（先 A 后 B 同 intScore → ZREVRANGE 里 A 在前，09·K1 tie-break）
 *  2. 合成 matchId：同一局两名玩家各自更新成功；同 (matchId, uid) 重放被 dedup 挡住（09·K2）
 *  3. 累加正确：两次 +10 → decodeScore = 20（Lua 内 ZSCORE→floor→加 delta→ZADD，⛔ 无 ZINCRBY）
 *  4. getRank 两段式返回 rank/uid/score/sub；自己未上榜补头部（rank=-1）
 *  5. rotateIfNeeded：旧季 rank/rank_sub 设上 TTL，当季 key 不动，重复调用幂等
 * 前置：npm --workspace @game/server run stack（matchId 为合成值，真实结算接线归 M8，09·K4）
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { encodeProvince, getRank, selfEntry, updateScore } from "../../src/rank/rankService";
import { rotateIfNeeded } from "../../src/rank/seasonRotation";
import { decodeScore } from "../../src/rank/score";
import { SEASON_BASE, SEASON_LEN_S } from "../../src/infra/config";
import { kLbDedup, kRank, kRankProv, kRankSub } from "../../src/infra/keys";
import { clientForKey, closeRedis } from "../../src/infra/redisRoute";
import { assertRedisUp, sleep, testUid } from "./helpers";

// 榜是跨用户 key：type 段带运行期随机，整个测试文件的 key 空间与并行运行互相隔离
const rankType = testUid("rt");
const usedKeys = new Set<string>();
const season = (s: string): string => { usedKeys.add(kRank(rankType, s)); usedKeys.add(kRankSub(rankType, s)); return s; };
const matchId = (name: string, ...uids: string[]): string => {
  const m = testUid(`m_${name}`);
  for (const u of uids) { usedKeys.add(kLbDedup(m, u)); }
  return m;
};

before(async () => { await assertRedisUp(); });
after(async () => {
  for (const k of usedKeys) { await clientForKey(k).unlink(k); }
  await closeRedis();
});

// ── 1. 同分先达者靠前 ───────────────────────────────────────────

test("同分两人先达者靠前：先 A 后 B 同 intScore，ZREVRANGE 里 A 在前", async () => {
  const s = season("s_tie");
  // uidA < uidB（字典序）：若 frac 失效退化成 ZSET 的同分 member 排序，ZREVRANGE 会把 B 排前——
  // A 在前只能是 tie-break 小数的功劳
  const uidA = testUid("tie_a");
  const uidB = testUid("tie_b");

  assert.equal(await updateScore(rankType, s, uidA, 30, matchId("tie1", uidA), { nick: "A" }), "ok");
  await sleep(1200); // 跨过 Redis TIME 的秒边界（tie-break 分辨率是秒级）
  assert.equal(await updateScore(rankType, s, uidB, 30, matchId("tie2", uidB), { nick: "B" }), "ok");

  const c = clientForKey(kRank(rankType, s));
  assert.deepEqual(await c.zrevrange(kRank(rankType, s), 0, -1), [uidA, uidB]);
  // 两人整数分相同，编码分 A > B（早到 frac 大）
  const [sa, sb] = await Promise.all([c.zscore(kRank(rankType, s), uidA), c.zscore(kRank(rankType, s), uidB)]);
  assert.equal(decodeScore(Number(sa)), 30);
  assert.equal(decodeScore(Number(sb)), 30);
  assert.ok(Number(sa) > Number(sb));
});

// ── 2. 合成 matchId：per (matchId, uid) 去重 ────────────────────

test("同一局两名玩家各自更新成功；同 (matchId, uid) 重放被 dedup 挡住", async () => {
  const s = season("s_dedup");
  const uidA = testUid("dd_a");
  const uidB = testUid("dd_b");
  const m = matchId("dd", uidA, uidB); // 一局 ≥2 名玩家共用一个 matchId

  // 同 matchId 不同 uid：都要能写（09·K2：⛔ 只按 matchId 去重会让第二人丢更新）
  assert.equal(await updateScore(rankType, s, uidA, 10, m, {}), "ok");
  assert.equal(await updateScore(rankType, s, uidB, 10, m, {}), "ok");

  // 同 (matchId, uid) 重放：挡住且分数不变
  assert.equal(await updateScore(rankType, s, uidA, 10, m, {}), "dup");
  const c = clientForKey(kRank(rankType, s));
  assert.equal(decodeScore(Number(await c.zscore(kRank(rankType, s), uidA))), 10);
  assert.equal(decodeScore(Number(await c.zscore(kRank(rankType, s), uidB))), 10);
});

// ── 3. 累加正确 ────────────────────────────────────────────────

test("累加：两次 +10 → decodeScore = 20（frac 不被累进整数位）", async () => {
  const s = season("s_acc");
  const u = testUid("acc");

  assert.equal(await updateScore(rankType, s, u, 10, matchId("acc1", u), { nick: "n" }), "ok");
  assert.equal(await updateScore(rankType, s, u, 10, matchId("acc2", u), { nick: "n" }), "ok");

  const raw = Number(await clientForKey(kRank(rankType, s)).zscore(kRank(rankType, s), u));
  assert.equal(decodeScore(raw), 20);          // 若走了 ZINCRBY，旧 frac 会混进整数位使其 ≠ 20
  const frac = raw - 20;
  assert.ok(frac > 0 && frac <= 0.1, `frac 应在 (0, 0.1]，实际 ${frac}`);
});

test("负 delta 穿 0 被 Lua 钳回 0（并发/陈旧读防御），不产出负段位星", async () => {
  const s = season("s_clamp");
  const u = testUid("clamp");

  assert.equal(await updateScore(rankType, s, u, 5, matchId("cl1", u), { nick: "n" }), "ok");
  assert.equal(await updateScore(rankType, s, u, -30, matchId("cl2", u), { nick: "n" }), "ok");

  const raw = Number(await clientForKey(kRank(rankType, s)).zscore(kRank(rankType, s), u));
  assert.equal(decodeScore(raw), 0, "5 - 30 应钳回 0 而非 -25");
});

test("省榜：双写 + 写路径自管 TTL + province 读切换；展示信息复用 rank_sub", async () => {
  const s = season("s_prov");
  const u = testUid("prov");
  const prov = "广东省"; // 中文省名走 encodeURIComponent 键段
  const provKey = kRankProv(rankType, encodeProvince(prov), s);
  usedKeys.add(provKey);

  assert.equal(await updateScore(rankType, s, u, 12, matchId("pv1", u), { nick: "粤" }, prov), "ok");

  const c = clientForKey(provKey);
  assert.equal(decodeScore(Number(await c.zscore(provKey, u))), 12, "省榜有分");
  assert.ok((await c.ttl(provKey)) > 0, "省榜 TTL 由写路径设置");
  assert.equal(await clientForKey(kRank(rankType, s)).ttl(kRank(rankType, s)), -1, "当季总榜无 TTL");

  const provList = await getRank(rankType, s, u, 0, 10, prov);
  assert.equal(provList[0].uid, u);
  assert.deepEqual(provList[0].sub, { nick: "粤" }, "展示信息复用 rank_sub");
  const self = await selfEntry(rankType, s, u, prov);
  assert.equal(self.rank, 1);

  // 无省份的更新不写省榜（游客/未填省份）
  const u2 = testUid("noprov");
  assert.equal(await updateScore(rankType, s, u2, 8, matchId("pv2", u2), {}), "ok");
  assert.equal(await c.zscore(provKey, u2), null);
});

// ── 4. getRank 两段式 + 补自己 ──────────────────────────────────

test("getRank：两段式返回 rank/uid/score/sub；自己未上榜补头部", async () => {
  const s = season("s_page");
  const u1 = testUid("pg_1");
  const u2 = testUid("pg_2");
  const u3 = testUid("pg_3");
  await updateScore(rankType, s, u1, 300, matchId("pg1", u1), { nick: "一号", avatarId: 1 });
  await updateScore(rankType, s, u2, 200, matchId("pg2", u2), { nick: "二号", avatarId: 2 });
  await updateScore(rankType, s, u3, 100, matchId("pg3", u3), { nick: "三号", avatarId: 3 });

  // 上榜者视角：无补头，rank 连续、sub 已 hydrate、本人行带 self
  const onBoard = await getRank(rankType, s, u2, 0, 10);
  assert.deepEqual(
    onBoard.map((e) => ({ rank: e.rank, uid: e.uid, score: e.score })),
    [{ rank: 1, uid: u1, score: 300 }, { rank: 2, uid: u2, score: 200 }, { rank: 3, uid: u3, score: 100 }]);
  assert.deepEqual(onBoard[0].sub, { nick: "一号", avatarId: 1 }); // rank_sub JSON 逐条对齐（09·R9 zip）
  assert.equal(onBoard[1].self, true);
  assert.equal(onBoard[0].self, undefined);

  // 未上榜者视角：selfEntry 补头部（rank=-1 对齐 shared 的 RANK_UNLISTED）
  const stranger = testUid("pg_x");
  const offBoard = await getRank(rankType, s, stranger, 0, 2);
  assert.equal(offBoard.length, 3); // 头部 self + 榜页 2 条
  assert.deepEqual(offBoard[0], { rank: -1, uid: stranger, score: 0, sub: {}, self: true });
  assert.deepEqual(offBoard.slice(1).map((e) => e.uid), [u1, u2]);

  // 分页第二页：start 偏移生效
  const page2 = await getRank(rankType, s, u1, 2, 2);
  assert.deepEqual(page2.map((e) => ({ rank: e.rank, uid: e.uid })), [{ rank: 3, uid: u3 }]);

  // selfEntry 单查（07 契约）
  const self2 = await selfEntry(rankType, s, u2);
  assert.deepEqual(self2, { rank: 2, uid: u2, score: 200, sub: { nick: "二号", avatarId: 2 }, self: true });
});

// ── 5. 赛季轮换：旧季设 TTL、幂等 ───────────────────────────────

test("rotateIfNeeded：旧季 rank/rank_sub 设 TTL，当季不动，重复调用幂等", async () => {
  // 用推导出的 s1/s2 真名（rotateIfNeeded 内部按 seasonIndex 拼 key），type 隔离保证不撞库
  const prev = season("s1");
  const cur = season("s2");
  const u = testUid("rot");
  const c = clientForKey(kRank(rankType, prev));
  await c.zadd(kRank(rankType, prev), 100.05, u); // 直接种上季数据（值不重要，key 存在即可）
  await c.hset(kRankSub(rankType, prev), u, "{}");
  await c.zadd(kRank(rankType, cur), 200.05, u);

  const nowSec = SEASON_BASE + 2 * SEASON_LEN_S + 10; // 当季 = s2 → 给 s1 设 TTL
  const r1 = await rotateIfNeeded(nowSec, [rankType]);
  assert.equal(r1.seasonId, "s2");
  assert.deepEqual(r1.expired.sort(), [kRank(rankType, prev), kRankSub(rankType, prev)].sort());

  assert.ok((await c.ttl(kRank(rankType, prev))) > 0, "旧季 rank 应带 TTL");
  assert.ok((await c.ttl(kRankSub(rankType, prev))) > 0, "旧季 rank_sub 应带 TTL");
  assert.equal(await c.ttl(kRank(rankType, cur)), -1, "当季 key 不得被设 TTL");
  assert.equal(await c.zscore(kRank(rankType, prev), u), "100.05", "设 TTL 不动数据（不搬榜）");

  // 幂等：重复调用只是重设同样的 TTL（EXPIRE 重复设置无害）
  const r2 = await rotateIfNeeded(nowSec, [rankType]);
  assert.deepEqual(r2.expired.sort(), r1.expired.sort());

  // s0 进行中无上一季 → no-op
  const r0 = await rotateIfNeeded(SEASON_BASE + 10, [rankType]);
  assert.deepEqual(r0, { seasonId: "s0", expired: [] });
});
