/**
 * M9 冷档冻结层 DoD 集成测试（10·M9）——真实 Redis + MySQL，⛔ 不 mock。
 *
 * [08](docs/SERVER.md) 两张崩溃 / 锁过期分析表**逐格**对应：
 *
 * Freeze 表                         │ 用例
 *  ① ② 之前崩溃/中止 → 无事发生      │ 「冻结前置闸」（skipped 后无 archive、Redis 完好）
 *  ② ②后③前崩溃 → resolve LIVE 删行 │ 「freeze ② 后 ③ 前崩溃」
 *  ③ 锁易主 → Lua lost 零破坏        │ 「freezeCommit 锁易主」
 *  ④ ③后崩溃(ZREM 漏) → 幽灵项自愈  │ 「freeze ③ 后崩溃」
 *
 * Thaw 表                           │ 用例
 *  ① Lua 前崩溃 → 什么都没变、重试   │ 「thaw Lua 之前失败」（THAWING 限速构造）
 *  ② Lua后删行前崩溃 → LIVE 删行     │ 「thaw Lua 后、删行前崩溃」
 *  ③ 锁易主 → lost 未恢复、重试      │ 「thaw 锁易主」
 *
 * 外加 10·M9 DoD 点名：freeze/玩法写并发 changed、往返全等、旧 fence stale、
 * 旧 op_id dup、cold→ensureLive 重试（relayerTick）、USER_DATA_LOST、singleFlight、
 * 负缓存、outbox 前置闸；以及 ARCHIVE_NEWER（PITR）修复、鲸鱼档 HSCAN。
 *
 * 前置：npm --workspace @game/server run stack
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  COLD_DAYS, OUTBOX_DEAD, OUTBOX_DONE, OUTBOX_PENDING, WHALE_FIELDS,
} from "../../src/core/infra/config";
import {
  activeLruBucketOf, kActiveLru, kApplied, kBag, kBagAll, kFence, kLock, kNegcacheUser, kSess, kUser,
} from "../../src/core/infra/keys";
import { cacheClient, clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { CAS_HSET, evalshaWithReload } from "../../src/core/infra/redisScripts";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { makeHolderId, tryAcquireLease, type SingletonLease } from "../../src/core/infra/lease";
import { acquireLease, withUserLock } from "../../src/core/locks";
import { ThawingError, UserDataLostError } from "../../src/core/errors";
import { withUser } from "../../src/core/uow";
import { createUser } from "../../src/core/userRecord";
import { deriveOpId, redisApply } from "../../src/core/economy/outbox";
import { relayerTick } from "../../src/core/economy/relayer"; // cold 行内部直接走 ensureLive 解冻重试（09·X5）
import { thawRestore, type ArchiveSnapshot } from "../../src/core/archive/archiveScripts";
import {
  archiveCounters, ensureLive, invalidateUserNegcache, resolve, thawLimiter,
} from "../../src/core/archive/thaw";
import { _freezeTestHooks, freezeUser, janitorSweep, sweepOnce } from "../../src/core/archive/freezeWorker";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

const COLD_MS = COLD_DAYS * 86_400_000;

const usedUids: string[] = [];
const uid = (name: string): string => { const u = testUid(name).slice(0, 32); usedUids.push(u); return u; };

let freezeLease: SingletonLease;

/** 让 lease 立即可抢（上一批测试可能留下未过期租约）。 */
async function expireLease(name: string): Promise<void> {
  await getPool().execute(
    "UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE lease_name = ?", [name]);
}

/** 造一个「字段 + 背包 + applied」齐全的档。 */
async function seedFullUser(name: string): Promise<{ uid: string; seedOp: string }> {
  const u = uid(name);
  assert.equal(await createUser(u, { nickname: "旅人", star: "0" }), "ok");
  await withUser(u, async (uow) => { uow.set("maxRound", "12"); uow.set("stamina", "5"); });
  const seedOp = deriveOpId(u, "seed", "r1");
  assert.equal(await redisApply(u, seedOp, [
    { kind: "item", itemId: 5, count: 3 }, { kind: "item", itemId: 6, count: 2 }, { kind: "star", delta: 4 },
  ]), "ok");
  return { uid: u, seedOp };
}

/** 把 uid 拨成 91 天前不活跃（hash lastActiveAt + 索引 score 双拨旧）。 */
async function makeCold(u: string): Promise<void> {
  const old = Date.now() - COLD_MS - 3_600_000;
  await clientFor(u).hset(kUser(u), "lastActiveAt", String(old)); // 测试直捣：uow 会自动刷新此字段
  const b = activeLruBucketOf(u);
  await indexClientFor(b).zadd(kActiveLru(b), old, u);
}

interface Dump { user: Record<string, string>; bags: Record<string, string>[]; applied: string[]; counter: string | null }
/** 测试专用全量 dump（生产代码 ⛔ HGETALL，测试断言豁免）。 */
async function dumpAll(u: string): Promise<Dump> {
  const c = clientFor(u);
  return {
    user: await c.hgetall(kUser(u)),
    bags: await Promise.all(kBagAll(u).map((k) => c.hgetall(k))),
    applied: await c.zrange(kApplied(u), 0, -1, "WITHSCORES"),
    counter: await c.get(kFence(u)),
  };
}

async function archiveRow(u: string): Promise<{ fenceHwm: number; snapshot: ArchiveSnapshot } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT snapshot, fence_hwm FROM user_archive WHERE user_id = ?", [u]);
  if (rows.length === 0) { return null; }
  return { fenceHwm: Number(rows[0].fence_hwm), snapshot: rows[0].snapshot as ArchiveSnapshot };
}

before(async () => {
  await assertRedisUp();
  await expireLease("freeze_worker");
  const l = await tryAcquireLease("freeze_worker", makeHolderId(), 3600); // 长 TTL：测试全程持有
  assert.ok(l, "抢不到 freeze_worker 租约");
  freezeLease = l!;
});

after(async () => {
  const pool = getPool();
  for (const u of usedUids) {
    await cleanupUser(u);
    await clientFor(u).unlink(kSess(u));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
    await cacheClient().unlink(kNegcacheUser(u));
    await pool.execute("DELETE FROM user_archive WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM gameplay_outbox WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
  }
  await expireLease("freeze_worker");
  await expireLease("outbox_relayer");
  await closeRedis();
  await closeMysql();
});

// ── resolve 四态（09·F1：fence 新鲜度，锁内判定） ────────────────────────────

test("resolve 四态：ABSENT / LIVE / FROZEN（ARCHIVE_NEWER 见 PITR 用例）", async () => {
  const u1 = uid("st_absent");
  assert.equal((await withUserLock(u1, async () => resolve(u1))).kind, "ABSENT");

  const { uid: u2 } = await seedFullUser("st_live");
  assert.equal((await withUserLock(u2, async () => resolve(u2))).kind, "LIVE");

  await makeCold(u2);
  assert.equal(await freezeUser(u2, freezeLease), "frozen");
  const st = await withUserLock(u2, async () => resolve(u2));
  assert.equal(st.kind, "FROZEN");
  assert.ok(st.row, "FROZEN 携带 archive 行");
});

// ── 完整 freeze→thaw 往返（10·M9 DoD 核心） ─────────────────────────────────

test("完整往返：字段/背包/applied 全等；fence ≥ 冻结前；旧 fence stale；旧 op_id dup；冻结期 cold", async () => {
  const { uid: u, seedOp } = await seedFullUser("rt");
  const c = clientFor(u);
  // 预制一个「滞留 writer」的旧 fence（thaw 后 casHset 必须 stale）
  const lingering = await acquireLease(u);
  await lingering.release();
  await makeCold(u);
  const before = await dumpAll(u);
  const f0 = Number(before.counter);

  assert.equal(await freezeUser(u, freezeLease), "frozen");

  // 冻结后：user/bag/applied/fence 计数器全部 UNLINK（08 freezeCommit Lua 原文含 KEYS[3]=fence）
  for (const k of [kUser(u), kApplied(u), kFence(u), ...kBagAll(u)]) {
    assert.equal(await c.exists(k), 0, `${k} 应已 UNLINK`);
  }
  const b = activeLruBucketOf(u);
  assert.equal(await indexClientFor(b).zscore(kActiveLru(b), u), null, "冻结成功后 ZREM 索引");
  const row = await archiveRow(u);
  assert.ok(row, "archive 行已写");
  assert.ok(row!.fenceHwm >= f0, "fence_hwm ≥ 冻结前计数器");

  // 冻结后写路径 → cold，且未凭空造残档（09·R2；错误路径 = 30 天存档被一条 grant 覆盖）
  assert.equal(await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(f0), "f", "v"]), "cold");
  assert.equal(await redisApply(u, deriveOpId(u, "t", "after-freeze"), [{ kind: "item", itemId: 7, count: 1 }]), "cold");
  assert.equal(await c.exists(kUser(u)), 0, "cold 未创建任何 key");

  await ensureLive(u); // thaw（也是 thaw 崩溃表①的「重试」形态：Lua 前无任何变更）

  const after = await dumpAll(u);
  assert.deepEqual(after.user, { ...before.user, fence: String(row!.fenceHwm) }, "user 全字段等值，fence 提到 hwm（09·F3）");
  assert.deepEqual(after.bags, before.bags, "背包全等");
  assert.deepEqual(after.applied, before.applied, "applied 全等（09·F2）");
  assert.equal(Number(after.counter), row!.fenceHwm, "计数器 = hwm（约束 3 双写）");
  assert.ok(Number(after.counter) >= f0, "fence 计数器 ≥ 冻结前（僵尸写仍被拦）");
  assert.equal(await archiveRow(u), null, "thaw 最后一步删 archive 行（08）");

  // thaw 后旧 fence casHset → stale（10·M9 DoD）
  assert.equal(await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(lingering.fence), "f", "zombie"]), "stale");
  assert.equal(await c.hget(kUser(u), "f"), null, "僵尸写零破坏");

  // applied 归档恢复后旧 op_id 重放 → dup（09·F2 二次发货防线，含 dead 行人工重放场景）
  assert.equal(await redisApply(u, seedOp, [{ kind: "item", itemId: 5, count: 3 }]), "dup");
  assert.equal(await c.hget(kBag(u, 5 % 4), "5"), "3", "重放未二次发货");
});

// ── freeze 与玩法写并发（10·M9 DoD / freeze 表③ 的 changed 分支） ───────────

test("freeze 与玩法写并发：快照后 relayer applyEffect → freezeCommit 'changed' 放弃、档完好", async () => {
  const { uid: u } = await seedFullUser("chg");
  await makeCold(u);
  const racedOp = deriveOpId(u, "grant", "raced");
  _freezeTestHooks.afterSnapshot = async (hookUid) => {
    // relayer 式无锁 apply（09·X5：relayer 不走 withUser）——bump ver，暴露快照已过期
    assert.equal(await redisApply(hookUid, racedOp, [{ kind: "item", itemId: 9, count: 1 }]), "ok");
  };
  try {
    assert.equal(await freezeUser(u, freezeLease), "lost"); // 08：res !== 'ok' 统一按放弃处理
  } finally {
    delete _freezeTestHooks.afterSnapshot;
  }

  const c = clientFor(u);
  assert.equal(await c.exists(kUser(u)), 1, "未删任何东西");
  assert.equal(await c.hget(kBag(u, 9 % 4), "9"), "1", "竞态发的货完好");
  assert.ok(await archiveRow(u), "archive 行已写（②）但陈旧——留给清理任务");

  // janitor：锁内 resolve 判 LIVE（hwm ≤ redis fence）→ 删陈旧行；竞态发的货绝不回滚
  await janitorSweep(freezeLease, 500);
  assert.equal(await archiveRow(u), null, "陈旧 archive 行已删");
  assert.equal(await c.hget(kBag(u, 9 % 4), "9"), "1", "发的货不因修复回滚");
});

// ── Freeze 表③：锁易主 → Lua 'lost' 零破坏 ────────────────────────────────

test("freezeCommit 锁易主 → 'lost' 未删任何东西；他人更高 fence 写入后 janitor 删陈旧行", async () => {
  const { uid: u } = await seedFullUser("hij");
  await makeCold(u);
  const before = await dumpAll(u);
  _freezeTestHooks.afterSnapshot = async (hookUid) => {
    await clientFor(hookUid).set(kLock(hookUid), "hijacker", "PX", 30_000, "XX"); // 模拟锁过期后被别人持有
  };
  try {
    assert.equal(await freezeUser(u, freezeLease), "lost");
  } finally {
    delete _freezeTestHooks.afterSnapshot;
    await clientFor(u).unlink(kLock(u)); // 清掉伪造锁
  }
  const mid = await dumpAll(u);
  assert.deepEqual(mid.user, before.user, "Lua 'lost'：未删任何东西（09·L4）");
  assert.deepEqual(mid.bags, before.bags);
  assert.deepEqual(mid.applied, before.applied);
  assert.ok(await archiveRow(u), "archive 行已写但陈旧");

  // 「锁已过期且被别人写入」：B 用更高 fence 写 → redis.fence 超过 hwm（08 崩溃表第 3 行原句）
  await withUser(u, async (uow) => { uow.set("afterHijack", "1"); });
  const hwm = (await archiveRow(u))!.fenceHwm;
  assert.ok(Number(await clientFor(u).hget(kUser(u), "fence")) > hwm, "B 的写使 redis.fence > hwm");

  await janitorSweep(freezeLease, 500);
  assert.equal(await archiveRow(u), null, "下次 resolve 判 LIVE → 删 archive");
  assert.equal(await clientFor(u).hget(kUser(u), "afterHijack"), "1", "B 的新数据完好");
});

// ── Freeze 表②：② 后 ③ 前崩溃 → 并存 → resolve LIVE → janitor 删行 ────────

test("freeze ② 后 ③ 前崩溃：archive 与 Redis 并存 → resolve LIVE → janitor 删行、Redis 完好", async () => {
  const { uid: u } = await seedFullUser("cr23");
  const before = await dumpAll(u);
  const counter = Number(before.counter);
  // 手工构造 ② 完成态：archive 行 fence_hwm = 当前计数器（= freeze worker 自己的锁 fence）
  await getPool().execute(
    "INSERT INTO user_archive (user_id, snapshot, schema_version, fence_hwm) VALUES (?, CAST(? AS JSON), 1, ?)",
    [u, JSON.stringify({ user: before.user, bag: before.bags, applied: before.applied }), counter]);

  const st = await withUserLock(u, async () => resolve(u));
  assert.equal(st.kind, "LIVE", "并存且 hwm 未超 Redis fence → 平局/更小判 LIVE（09·F1）");
  assert.ok(st.row, "LIVE 且带残留行");

  await janitorSweep(freezeLease, 500);
  assert.equal(await archiveRow(u), null, "陈旧残留行已删");
  const afterDump = await dumpAll(u);
  assert.deepEqual(afterDump.user, before.user, "Redis 档完好，任何路径不丢数据");
  assert.deepEqual(afterDump.bags, before.bags);
});

// ── Freeze 表④：③ 后崩溃（ZREM 未执行）→ 幽灵项自愈 ───────────────────────

test("freeze ③ 后崩溃（ZREM 未执行）→ 候选筛选 EXISTS 过滤幽灵项并 ZREM（08）", async () => {
  const { uid: u } = await seedFullUser("ghost");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  // 模拟 ZREM 未执行：把幽灵项塞回索引
  const b = activeLruBucketOf(u);
  await indexClientFor(b).zadd(kActiveLru(b), Date.now() - COLD_MS - 3_600_000, u);

  const sw = await sweepOnce(freezeLease, 50);
  assert.ok(sw.ghosts >= 1, "幽灵项被识别");
  assert.equal(await indexClientFor(b).zscore(kActiveLru(b), u), null, "幽灵项已 ZREM，不再毒化吞吐");
  assert.ok(await archiveRow(u), "档仍安全冻结在 archive");
  await ensureLive(u); // 归位便于清理
});

// ── Thaw 表①：Lua 之前失败 → 什么都没变 → 重试（兼 THAW_RATE 超限 THAWING） ──

test("thaw Lua 之前失败（THAW_RATE 超限 → ThawingError）：什么都没变，archive 完好，重试成功", async () => {
  const { uid: u } = await seedFullUser("pre");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");

  const save = { tokens: thawLimiter.tokens, rate: thawLimiter.ratePerSec };
  thawLimiter.tokens = 0;
  thawLimiter.ratePerSec = 0; // 构造超限（per-instance 令牌桶，08 · 惊群防护）
  try {
    await assert.rejects(ensureLive(u), ThawingError);
  } finally {
    thawLimiter.tokens = save.tokens;
    thawLimiter.ratePerSec = save.rate;
  }
  assert.equal(await clientFor(u).exists(kUser(u)), 0, "什么都没变");
  assert.ok(await archiveRow(u), "archive 完好");

  await ensureLive(u); // 重试
  assert.equal(await clientFor(u).exists(kUser(u)), 1, "重试成功");
  assert.equal(await archiveRow(u), null);
});

// ── Thaw 表②：Lua 后、删行前崩溃 → 并存 → LIVE → janitor 删行 ──────────────

test("thaw Lua 后、删行前崩溃：并存（hwm == redis.fence）→ resolve LIVE → janitor 删行", async () => {
  const { uid: u } = await seedFullUser("mid");
  await makeCold(u);
  const before = await dumpAll(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  const row = (await archiveRow(u))!;

  // 手工执行恢复 Lua，但「崩」在 DELETE archive 之前
  await withUserLock(u, async (fence) => {
    assert.equal(await thawRestore(u, fence, row.fenceHwm, row.snapshot, false), "ok");
  });
  assert.equal(await clientFor(u).exists(kUser(u)), 1, "已恢复");
  assert.ok(await archiveRow(u), "行未删：并存中断态");

  assert.equal((await withUserLock(u, async () => resolve(u))).kind, "LIVE", "平局判 LIVE（09·F1）");
  await janitorSweep(freezeLease, 500);
  assert.equal(await archiveRow(u), null, "清理任务删 archive 收敛");
  const afterDump = await dumpAll(u);
  assert.deepEqual(afterDump.bags, before.bags, "档完好");
  assert.deepEqual(afterDump.applied, before.applied);
});

// ── Thaw 表③：锁易主 → 'lost' 未恢复任何东西 → 重试 ────────────────────────

test("thaw 锁易主 → thawRestore 'lost' 未恢复任何东西，archive 完好，重试成功", async () => {
  const { uid: u } = await seedFullUser("thij");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  const row = (await archiveRow(u))!;

  const lease = await acquireLease(u);
  await clientFor(u).set(kLock(u), "hijacker", "PX", 30_000, "XX"); // 锁易主
  try {
    assert.equal(await thawRestore(u, lease.fence, row.fenceHwm, row.snapshot, false), "lost");
  } finally {
    await clientFor(u).unlink(kLock(u));
  }
  // fence:{uid} 计数器因 acquireLease 的 INCR 复活，属锁协调 key，不在「恢复」范围
  for (const k of [kUser(u), kApplied(u), ...kBagAll(u)]) {
    assert.equal(await clientFor(u).exists(k), 0, `${k} 未被恢复（零破坏）`);
  }
  assert.ok(await archiveRow(u), "archive 完好");

  await ensureLive(u); // 重试
  assert.equal(await clientFor(u).exists(kUser(u)), 1);
  assert.equal(await archiveRow(u), null);
});

// ── ARCHIVE_NEWER（PITR）修复路径（08 情形表 + 清理任务） ───────────────────

test("ARCHIVE_NEWER（PITR）：janitor 持锁修复——UNLINK 陈旧档并从 archive 恢复，fence 双写 hwm", async () => {
  const { uid: u } = await seedFullUser("pitr");
  const c = clientFor(u);
  const counter = Number(await c.get(kFence(u)));
  // 构造 PITR 态：archive 比 Redis 新（hwm 远超计数器），快照内容不同
  const snap: ArchiveSnapshot = {
    user: { schemaVersion: "1", fence: "0", ver: "99", star: "999", nickname: "新档", lastActiveAt: String(Date.now()) },
    bag: [{}, { "17": "8" }, {}, {}],
    applied: ["op_x", "1700000000000"],
  };
  const hwm = counter + 1000;
  await getPool().execute(
    "INSERT INTO user_archive (user_id, snapshot, schema_version, fence_hwm) VALUES (?, CAST(? AS JSON), 1, ?)",
    [u, JSON.stringify(snap), hwm]);

  assert.equal((await withUserLock(u, async () => resolve(u))).kind, "ARCHIVE_NEWER", "hwm > redis fence（09·F1）");

  const jr = await janitorSweep(freezeLease, 500);
  assert.ok(jr.repaired >= 1, "修复路径触发");
  assert.equal(await c.hget(kUser(u), "star"), "999", "陈旧 Redis 档被 archive 覆盖");
  assert.equal(await c.hget(kUser(u), "maxRound"), null, "陈旧字段一并 UNLINK（overwrite=1）");
  assert.equal(await c.hget(kUser(u), "fence"), String(hwm), "hash fence = hwm（09·F3）");
  assert.equal(await c.get(kFence(u)), String(hwm), "计数器 = hwm（09·F3）");
  assert.equal(await c.hget(kBag(u, 17 % 4), "17"), "8", "背包按快照恢复");
  assert.deepEqual(await c.zrange(kApplied(u), 0, -1, "WITHSCORES"), ["op_x", "1700000000000"]);
  assert.equal(await archiveRow(u), null, "修复后删行");
});

// ── ABSENT：数据丢失 vs 真新号（09·F4） ─────────────────────────────────────

test("ABSENT + accounts 有号 → UserDataLostError 告警 + 拒绝建空档（09·F4）", async () => {
  const u = uid("lostx");
  await getPool().execute("INSERT INTO accounts (user_id, status) VALUES (?, 0)", [u]);
  const lost0 = archiveCounters.userDataLost;
  await assert.rejects(ensureLive(u), UserDataLostError);
  assert.equal(archiveCounters.userDataLost, lost0 + 1, "USER_DATA_LOST 计数（≡0 告警线）");
  assert.equal(await clientFor(u).exists(kUser(u)), 0, "拒绝建空档");
  assert.equal(await cacheClient().exists(kNegcacheUser(u)), 0, "数据丢失不写负缓存");
});

test("ABSENT 无号：不抛、允许建号；负缓存二次查询命中；建号后立即失效（09·F4）", async () => {
  const u = uid("neg");
  const checks0 = archiveCounters.absentAccountChecks;
  const hits0 = archiveCounters.negcacheHits;

  await ensureLive(u); // 真新号：不抛
  assert.equal(archiveCounters.absentAccountChecks, checks0 + 1, "首查打 MySQL accounts");
  assert.equal(await cacheClient().exists(kNegcacheUser(u)), 1, "负缓存已写（cache 实例，TTL 10s）");

  await ensureLive(u); // 二次查询走负缓存（读点在 EXISTS user 之后）
  assert.equal(archiveCounters.negcacheHits, hits0 + 1, "负缓存命中");
  assert.equal(archiveCounters.absentAccountChecks, checks0 + 1, "accounts 未再查");

  assert.equal(await createUser(u), "ok"); // 建号路径
  await invalidateUserNegcache(u);         // 建号成功立即失效（建号侧接线契约）
  assert.equal(await cacheClient().exists(kNegcacheUser(u)), 0);
  await ensureLive(u); // 纯热档快路径
  assert.equal(await clientFor(u).exists(kUser(u)), 1);
});

// ── singleFlight（08 · 惊群防护第一道） ─────────────────────────────────────

test("ensureLive 并发 singleFlight：同 uid 100 并发只 thaw 一次", async () => {
  const { uid: u } = await seedFullUser("sf");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");

  const thawed0 = archiveCounters.thawed;
  await Promise.all(Array.from({ length: 100 }, () => ensureLive(u)));
  assert.equal(archiveCounters.thawed, thawed0 + 1, "100 并发合并成一次 thaw");
  assert.equal(await clientFor(u).exists(kUser(u)), 1);
  assert.equal(await archiveRow(u), null);
});

// ── 冻结前置闸（09·F2）＝ Freeze 表①（skip → 无 archive、Redis 完好、无事发生） ──

test("冻结前置闸：pending / dead outbox 行锁内拦下冻结；闸清后可冻结", async () => {
  const { uid: u } = await seedFullUser("gate");
  await makeCold(u);
  const op = deriveOpId(u, "late", "r-gate");
  await getPool().execute(
    "INSERT INTO gameplay_outbox (op_id, user_id, effect, status) VALUES (?,?,CAST(? AS JSON),?)",
    [op, u, JSON.stringify([{ kind: "item", itemId: 3, count: 1 }]), OUTBOX_PENDING]);

  assert.equal(await freezeUser(u, freezeLease), "skipped", "pending 行拦下（锁内复查）");
  assert.equal(await archiveRow(u), null, "无 archive、Redis 完好（=② 之前中止，无事发生）");
  assert.equal(await clientFor(u).exists(kUser(u)), 1);
  const b = activeLruBucketOf(u);
  assert.ok(await indexClientFor(b).zscore(kActiveLru(b), u), "skip 不清索引：闸清后下轮重试");

  await getPool().execute("UPDATE gameplay_outbox SET status = ? WHERE op_id = ?", [OUTBOX_DEAD, op]);
  assert.equal(await freezeUser(u, freezeLease), "skipped", "dead(2) 也拦——还等着人工重放（09·F2）");

  await getPool().execute("UPDATE gameplay_outbox SET status = ? WHERE op_id = ?", [OUTBOX_DONE, op]);
  assert.equal(await freezeUser(u, freezeLease), "frozen", "闸清 → 冻结");
  await ensureLive(u); // 归位便于清理
});

test("锁内双检：sess 在线 → skipped 不冻结", async () => {
  const { uid: u } = await seedFullUser("sess");
  await makeCold(u);
  await clientFor(u).hset(kSess(u), "connId", "c1");
  try {
    assert.equal(await freezeUser(u, freezeLease), "skipped");
    assert.equal(await archiveRow(u), null);
  } finally {
    await clientFor(u).unlink(kSess(u));
  }
});

// ── relayer 接线（09·X5：冻结后仍可能有后到 outbox 行；任何 apply 前先 thaw） ──

test("relayer 收 cold → ensureLive → 重试成功：后到 outbox 行照常发货", async () => {
  const { uid: u } = await seedFullUser("rly");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");

  // 冻结**之后**插入的后到行（活动发奖 / T+1 退款 / GM 补偿场景）；created_at 拨旧越过可见性窗口
  const op = deriveOpId(u, "grant", "r-late");
  await getPool().execute(
    `INSERT INTO gameplay_outbox (op_id, user_id, effect, status, created_at)
     VALUES (?,?,CAST(? AS JSON),?, NOW(3) - INTERVAL 30 SECOND)`,
    [op, u, JSON.stringify([{ kind: "item", itemId: 11, count: 2 }]), OUTBOX_PENDING]);

  await expireLease("outbox_relayer");
  const rl = await tryAcquireLease("outbox_relayer", makeHolderId(), 60);
  assert.ok(rl, "抢不到 outbox_relayer 租约");
  try {
    await relayerTick(rl!);
  } finally {
    await expireLease("outbox_relayer");
  }

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status FROM gameplay_outbox WHERE op_id = ?", [op]);
  assert.equal(Number(rows[0].status), OUTBOX_DONE, "cold → ensureLive → 重试 → done");
  assert.equal(await clientFor(u).exists(kUser(u)), 1, "已解冻");
  assert.equal(await clientFor(u).hget(kBag(u, 11 % 4), "11"), "2", "道具到账");
  assert.equal(await archiveRow(u), null);
});

// ── 鲸鱼档（09·R1 唯一豁免 + HSCAN 分块，08 · 限速与调度） ──────────────────

test("鲸鱼档：字段数 > WHALE_FIELDS 走 HSCAN 分块快照，往返全等", async () => {
  const { uid: u } = await seedFullUser("whale");
  const c = clientFor(u);
  const N = WHALE_FIELDS + 300;
  for (let i = 0; i < N; i += 500) {
    const args: string[] = [];
    for (let j = i; j < Math.min(i + 500, N); j++) { args.push(`wf${j}`, `v${j}`); }
    await c.hset(kUser(u), ...args);
  }
  await makeCold(u);
  const before = await c.hgetall(kUser(u));
  assert.ok(Object.keys(before).length > WHALE_FIELDS, "确为鲸鱼档");

  assert.equal(await freezeUser(u, freezeLease), "frozen");
  const hwm = (await archiveRow(u))!.fenceHwm;
  await ensureLive(u);
  const afterUser = await c.hgetall(kUser(u));
  assert.deepEqual(afterUser, { ...before, fence: String(hwm) }, "HSCAN 快照往返全等");
});
