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
 * 旧 op_id dup、cold→ensureLive 重试（relayerTick）、singleFlight、outbox 前置闸；
 * 以及 ARCHIVE_NEWER（PITR）修复、鲸鱼档 HSCAN。
 *
 * 前置：npm --workspace @game/server run stack
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  COLD_DAYS, OUTBOX_DEAD, OUTBOX_DONE, OUTBOX_PENDING, SCHEMA_VERSION, WHALE_FIELDS,
} from "../../src/core/infra/config";
import {
  activeLruBucketOf, kActiveLru, kApplied, kAppliedPayload, kArchiveProof, kBag, kBagAll, kFence, kLock, kNegcacheUser, kSess, kUser,
  zoneCtx,
} from "../../src/core/infra/keys";
import { cacheClient, clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { CAS_HSET, evalshaWithReload } from "../../src/core/infra/redisScripts";
import { closeMysql, getPool, withRcTx } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { makeHolderId, tryAcquireLease, type SingletonLease } from "../../src/core/infra/lease";
import { acquireLease, withUserLock } from "../../src/core/locks";
import { ArchiveAuthorityConflictError, BusyError, ThawingError } from "../../src/core/errors";
import { withUser } from "../../src/core/uow";
import { createUser } from "../../src/core/userRecord";
import { writeGroupSess } from "../../src/core/auth/session";
import { deriveOpId, redisApply } from "../../src/core/economy/outbox";
import { relayerTick } from "../../src/core/economy/relayer"; // cold 行内部直接走 ensureLive 解冻重试（09·X5）
import {
  prepareArchiveCandidate, thawRestore, type ArchiveSnapshot,
} from "../../src/core/archive/archiveScripts";
import {
  _thawTestHooks, archiveCounters, ensureLive, resolve, thawLimiter,
} from "../../src/core/archive/thaw";
import {
  _freezeTestHooks, freezeUser, janitorSweep, removeGhostCandidate, resetJanitorCursor,
  resetSweepCursor, sweepOnce,
} from "../../src/core/archive/freezeWorker";
import {
  _archiveUsageTestHooks, archiveJsonStorageBytes, lockArchiveUsage, rebuildArchiveUsage,
  writeArchiveUsage,
} from "../../src/core/archive/usageLedger";
import {
  ARCHIVE_PHASE_COMMITTED, ARCHIVE_PHASE_LEGACY, ARCHIVE_PHASE_PREPARED, newFreezeId,
  type ArchivePhase,
} from "../../src/core/archive/protocol";
import {
  _characterStateTestHooks, markCharacterRegistrationReady,
} from "../../src/player/characterState";
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
  const seedOp = await seedFullUserInZone(u, 0, "旅人");
  return { uid: u, seedOp };
}

async function seedFullUserInZone(u: string, sId: number, nickname: string): Promise<string> {
  return zoneCtx.run({ sId }, async () => {
    assert.equal(await createUser(u, { nickname, star: "0" }), "ok");
    await withUser(u, async (uow) => { uow.set("maxRound", "12"); uow.set("stamina", "5"); });
    const seedOp = deriveOpId(u, sId, "seed", `r${sId}`);
    assert.equal(await redisApply(u, seedOp, [
      { kind: "item", itemId: 5, count: 3 }, { kind: "item", itemId: 6, count: 2 }, { kind: "star", delta: 4 },
    ]), "ok");
    return seedOp;
  });
}

/** 把 uid 拨成 91 天前不活跃（hash lastActiveAt + 索引 score 双拨旧）。 */
async function makeCold(u: string, sId = 0): Promise<void> {
  await zoneCtx.run({ sId }, async () => {
    const old = Date.now() - COLD_MS - 3_600_000;
    await clientFor(u).hset(kUser(u), "lastActiveAt", String(old)); // 测试直捣：uow 会自动刷新此字段
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zadd(kActiveLru(b), old, u);
  });
}

interface Dump {
  user: Record<string, string>;
  bags: Record<string, string>[];
  applied: string[];
  appliedPayload: Record<string, string>;
  counter: string | null;
}
/** 测试专用全量 dump（生产代码 ⛔ HGETALL，测试断言豁免）。 */
async function dumpAll(u: string, sId = 0): Promise<Dump> {
  return zoneCtx.run({ sId }, async () => {
    const c = clientFor(u);
    return {
      user: await c.hgetall(kUser(u)),
      bags: await Promise.all(kBagAll(u).map((k) => c.hgetall(k))),
      applied: await c.zrange(kApplied(u), 0, -1, "WITHSCORES"),
      appliedPayload: await c.hgetall(kAppliedPayload(u)),
      counter: await c.get(kFence(u)),
    };
  });
}

async function archiveRow(u: string, sId = 0): Promise<{
  fenceHwm: number;
  snapshot: ArchiveSnapshot;
  freezeId: string | null;
  phase: ArchivePhase;
} | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT snapshot, fence_hwm, freeze_id, archive_phase
       FROM user_archive WHERE user_id = ? AND server_id = ?`, [u, sId]);
  if (rows.length === 0) { return null; }
  return {
    fenceHwm: Number(rows[0].fence_hwm),
    snapshot: rows[0].snapshot as ArchiveSnapshot,
    freezeId: rows[0].freeze_id === null ? null : String(rows[0].freeze_id),
    phase: Number(rows[0].archive_phase) as ArchivePhase,
  };
}

async function exactUsage(sId: number): Promise<{ rows: number; bytes: number }> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS row_count,
            COALESCE(SUM(JSON_STORAGE_SIZE(snapshot)), 0) AS byte_count
       FROM user_archive WHERE server_id = ?`,
    [sId],
  );
  return { rows: Number(rows[0].row_count), bytes: Number(rows[0].byte_count) };
}

async function ledgerUsage(sId: number): Promise<{ rows: number; bytes: number }> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT row_count, byte_count FROM archive_zone_usage WHERE server_id = ?", [sId],
  );
  assert.equal(rows.length, 1, `s${sId} ledger row`);
  return { rows: Number(rows[0].row_count), bytes: Number(rows[0].byte_count) };
}

async function rebuildUsage(sId: number): Promise<void> {
  await withRcTx(async (conn) => { await rebuildArchiveUsage(conn, sId); });
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
    for (const sId of [0, 1, 2]) {
      await zoneCtx.run({ sId }, async () => {
        await cleanupUser(u);
        await clientFor(u).unlink(kSess(u, sId));
        const b = activeLruBucketOf(u);
        await indexClientFor(b).zrem(kActiveLru(b), u);
        await cacheClient().unlink(kNegcacheUser(u));
      });
    }
    await pool.execute("DELETE FROM user_archive WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM gameplay_outbox WHERE user_id = ?", [u]);
  }
  for (const sId of [0, 1, 2]) { await rebuildUsage(sId); }
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

test("同 uid 跨区：archive/LRU/freeze/thaw 物理隔离，一区恢复不触碰另一区", async () => {
  const u = uid("zone_dual");
  await seedFullUserInZone(u, 1, "一区");
  await seedFullUserInZone(u, 2, "二区");
  await makeCold(u, 1);
  await makeCold(u, 2);
  const bucket = activeLruBucketOf(u);
  const key1 = await zoneCtx.run({ sId: 1 }, async () => kActiveLru(bucket));
  const key2 = await zoneCtx.run({ sId: 2 }, async () => kActiveLru(bucket));
  assert.notEqual(key1, key2, "s1/s2 active:lru 必须是不同物理键");
  assert.ok(await indexClientFor(bucket).zscore(key1, u));
  assert.ok(await indexClientFor(bucket).zscore(key2, u));

  assert.equal(await freezeUser(u, freezeLease, 1), "frozen");
  assert.ok(await archiveRow(u, 1));
  assert.equal(await archiveRow(u, 2), null);
  assert.equal(await zoneCtx.run({ sId: 1 }, () => clientFor(u).exists(kUser(u))), 0);
  assert.equal(await zoneCtx.run({ sId: 2 }, () => clientFor(u).exists(kUser(u))), 1);
  assert.equal(await indexClientFor(bucket).zscore(key1, u), null);
  assert.ok(await indexClientFor(bucket).zscore(key2, u), "冻结 s1 不得删除 s2 LRU");

  assert.equal(await freezeUser(u, freezeLease, 2), "frozen");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id FROM user_archive WHERE user_id = ? ORDER BY server_id", [u],
  );
  assert.deepEqual(rows.map((row) => Number(row.server_id)), [1, 2]);

  await ensureLive(u, 1);
  assert.equal((await dumpAll(u, 1)).user.nickname, "一区");
  assert.equal(await archiveRow(u, 1), null);
  assert.ok(await archiveRow(u, 2), "thaw s1 不得删除 s2 archive");
  assert.equal(await zoneCtx.run({ sId: 2 }, () => clientFor(u).exists(kUser(u))), 0);
  await ensureLive(u, 2);
  assert.equal((await dumpAll(u, 2)).user.nickname, "二区");
});

test("真实 Redis maxmemory=0：worker 水位 fail-closed，候选保持热档", async () => {
  const u = uid("waterline");
  await seedFullUserInZone(u, 1, "水位");
  await makeCold(u, 1);
  resetSweepCursor();
  let candidates = 0;
  let waterlineSkipped = 0;
  for (let probe = 0; probe < 256 && candidates === 0; probe++) {
    const stats = await sweepOnce(freezeLease, 1, [1]);
    candidates += stats.candidates;
    waterlineSkipped += stats.waterlineSkipped;
  }
  assert.equal(candidates, 1, "每轮单 probe，最多一圈应轮转到目标桶");
  assert.equal(waterlineSkipped, 1, "本地 durable Redis 未配置 maxmemory，必须拒绝 freeze");
  assert.equal(await zoneCtx.run({ sId: 1 }, () => clientFor(u).exists(kUser(u))), 1);
  assert.equal(await archiveRow(u, 1), null);
  await zoneCtx.run({ sId: 1 }, () => withUser(u, async (uow) => { uow.set("waterlineChecked", "1"); }));
});

test("outbox gate 按区：s2 pending/dead 不拦 s1，但会拦同区 freeze", async () => {
  const u = uid("zone_outbox");
  await seedFullUserInZone(u, 1, "一区");
  await seedFullUserInZone(u, 2, "二区");
  await makeCold(u, 1);
  await makeCold(u, 2);
  const op = deriveOpId(u, 2, "late", "zone-gate");
  await getPool().execute(
    `INSERT INTO gameplay_outbox (op_id, user_id, server_id, effect, status)
     VALUES (?, ?, 2, CAST(? AS JSON), ?)`,
    [op, u, JSON.stringify([{ kind: "item", itemId: 3, count: 1 }]), OUTBOX_PENDING],
  );

  assert.equal(await freezeUser(u, freezeLease, 1), "frozen", "他区 pending 不得误拦");
  assert.equal(await freezeUser(u, freezeLease, 2), "skipped", "同区 pending 必须拦截");
  await getPool().execute("UPDATE gameplay_outbox SET status = ? WHERE op_id = ?", [OUTBOX_DEAD, op]);
  assert.equal(await freezeUser(u, freezeLease, 2), "skipped", "同区 dead 仍须拦截");
  await getPool().execute("UPDATE gameplay_outbox SET status = ? WHERE op_id = ?", [OUTBOX_DONE, op]);
  assert.equal(await freezeUser(u, freezeLease, 2), "frozen");
  await ensureLive(u, 1);
  await ensureLive(u, 2);
});

test("单档过大与每区容量不足只停止冻结，不删热档或既有 archive", async () => {
  const oversize = uid("oversize");
  await seedFullUserInZone(oversize, 1, "过大");
  await makeCold(oversize, 1);
  _freezeTestHooks.capacityLimits = {
    maxSnapshotBytes: 1,
    maxRowsPerZone: 10,
    maxBytesPerZone: 10,
  };
  try {
    assert.equal(await freezeUser(oversize, freezeLease, 1), "skipped");
  } finally {
    delete _freezeTestHooks.capacityLimits;
  }
  assert.equal(await zoneCtx.run({ sId: 1 }, () => clientFor(oversize).exists(kUser(oversize))), 1);
  assert.equal(await archiveRow(oversize, 1), null);

  const capped = uid("capacity");
  await seedFullUserInZone(capped, 1, "热档");
  await makeCold(capped, 1);
  const before = await dumpAll(capped, 1);
  const filler = uid("capacity_fill");
  const preserved: ArchiveSnapshot = {
    user: { schemaVersion: "1", fence: "0", ver: "1", star: "777", nickname: "保留" },
    bag: [{}, {}, {}, {}],
    applied: [],
  };
  await getPool().execute(
    `INSERT INTO user_archive (user_id, server_id, snapshot, schema_version, fence_hwm)
     VALUES (?, 1, CAST(? AS JSON), 1, 0)`,
    [filler, JSON.stringify(preserved)],
  );
  await rebuildUsage(1);
  _freezeTestHooks.capacityLimits = {
    maxSnapshotBytes: 1024 * 1024,
    maxRowsPerZone: 1,
    maxBytesPerZone: 1024 * 1024,
  };
  try {
    assert.equal(await freezeUser(capped, freezeLease, 1), "skipped");
  } finally {
    delete _freezeTestHooks.capacityLimits;
  }
  assert.deepEqual((await archiveRow(filler, 1))!.snapshot, preserved, "容量拒绝不得删改既有 authority");
  assert.equal(await archiveRow(capped, 1), null, "容量拒绝不得为目标留下 PREPARED 行");
  assert.equal(await zoneCtx.run({ sId: 1 }, () => clientFor(capped).hlen(kArchiveProof(capped))), 0,
    "容量拒绝应清理本次 proof membership");
  assert.deepEqual((await dumpAll(capped, 1)).bags, before.bags, "热档保持完整");
  assert.deepEqual(await ledgerUsage(1), await exactUsage(1), "生产 admission 拒绝后 ledger 精确");
});

test("PITR 回归：freezeUser 不得用旧热档覆盖较新的本区 archive", async () => {
  const u = uid("pitr_freeze");
  await seedFullUserInZone(u, 1, "旧热档");
  await makeCold(u, 1);
  const current = await dumpAll(u, 1);
  const hwm = Number(current.counter) + 1;
  const freezeId = newFreezeId();
  const newer: ArchiveSnapshot = {
    user: {
      schemaVersion: "1", fence: "0", ver: "99", star: "999",
      nickname: "较新冷档", lastActiveAt: String(Date.now()),
    },
    bag: [{}, { "17": "8" }, {}, {}],
    applied: [],
  };
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 1, CAST(? AS JSON), 1, ?, ?, ?)`,
    [u, JSON.stringify(newer), hwm, freezeId, ARCHIVE_PHASE_COMMITTED],
  );
  await rebuildUsage(1);

  assert.equal(await freezeUser(u, freezeLease, 1), "skipped");
  const restored = await dumpAll(u, 1);
  assert.equal(restored.user.nickname, "较新冷档");
  assert.equal(restored.user.maxRound, undefined, "旧热档独有字段不得残留");
  assert.equal(restored.bags[1]["17"], "8");
  assert.equal(await archiveRow(u, 1), null, "较新 archive 已按权威恢复并在最后删除");
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

  // 冻结后：user/bag/applied UNLINK；fence 计数器**保留**（评审修正，偏离 08 原文——
  // 「永不重置」契约：删除会让冷档期重新计数，若反超 hwm 则 thaw 绝对写回 = 计数回退，
  // 滞留 writer 的大号 fence 可穿过 hash CAS）
  for (const k of [kUser(u), kApplied(u), kAppliedPayload(u), ...kBagAll(u)]) {
    assert.equal(await c.exists(k), 0, `${k} 应已 UNLINK`);
  }
  assert.equal(await c.exists(kFence(u)), 1, "fence 计数器保留（永不重置契约）");
  assert.ok(Number(await c.get(kFence(u))) >= f0, "保留的计数器不回退");
  const b = activeLruBucketOf(u);
  assert.equal(await indexClientFor(b).zscore(kActiveLru(b), u), null, "冻结成功后 ZREM 索引");
  const row = await archiveRow(u);
  assert.ok(row, "archive 行已写");
  assert.ok(row!.fenceHwm >= f0, "fence_hwm ≥ 冻结前计数器");

  // 冻结后写路径 → cold，且未凭空造残档（09·R2；错误路径 = 30 天存档被一条 grant 覆盖）
  assert.equal(await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(f0), "f", "v"]), "cold");
  assert.equal(await redisApply(u, deriveOpId(u, 0, "t", "after-freeze"), [{ kind: "item", itemId: 7, count: 1 }]), "cold");
  assert.equal(await c.exists(kUser(u)), 0, "cold 未创建任何 key");

  await ensureLive(u); // thaw（也是 thaw 崩溃表①的「重试」形态：Lua 前无任何变更）

  const after = await dumpAll(u);
  // fence 语义（评审修正）：thaw 写 MAX(计数器, hwm)——thaw 自身抢锁 INCR 过计数器，
  // 故 fence ≥ hwm 且 hash 字段与计数器一致；其余字段严格全等（09·F3）
  const fenceAfter = Number(after.user.fence);
  assert.ok(fenceAfter >= row!.fenceHwm, `thaw 后 fence(${fenceAfter}) ≥ hwm(${row!.fenceHwm})`);
  assert.equal(String(fenceAfter), after.counter, "hash fence 与计数器一致（约束 3 双写）");
  const cmpAfter = { ...after.user }; delete (cmpAfter as Record<string, string>).fence;
  const cmpBefore = { ...before.user }; delete (cmpBefore as Record<string, string>).fence;
  assert.deepEqual(cmpAfter, cmpBefore, "user 全字段等值（除 fence 语义变更外，09·F3）");
  assert.deepEqual(after.bags, before.bags, "背包全等");
  assert.deepEqual(after.applied, before.applied, "applied 全等（09·F2）");
  assert.deepEqual(after.appliedPayload, before.appliedPayload, "applied payload 绑定全等（P0-03）");
  assert.ok(Number(after.counter) >= f0, "fence 计数器 ≥ 冻结前（僵尸写仍被拦）");
  assert.equal(await archiveRow(u), null, "thaw 最后一步删 archive 行（08）");

  // thaw 后旧 fence casHset → stale（10·M9 DoD）
  assert.equal(await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(lingering.fence), "f", "zombie"]), "stale");
  assert.equal(await c.hget(kUser(u), "f"), null, "僵尸写零破坏");

  // applied 归档恢复后旧 op_id 重放 → dup（09·F2 二次发货防线，含 dead 行人工重放场景）
  assert.equal(await redisApply(u, seedOp, [
    { kind: "item", itemId: 5, count: 3 }, { kind: "item", itemId: 6, count: 2 }, { kind: "star", delta: 4 },
  ]), "dup");
  assert.equal(await c.hget(kBag(u, 5 % 4), "5"), "3", "重放未二次发货");
});

// ── freeze 与玩法写并发（10·M9 DoD / freeze 表③ 的 changed 分支） ───────────

test("freeze 与玩法写并发：快照后 relayer applyEffect → freezeCommit 'changed' 放弃、档完好", async () => {
  const { uid: u } = await seedFullUser("chg");
  await makeCold(u);
  const racedOp = deriveOpId(u, 0, "grant", "raced");
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
  assert.equal(await archiveRow(u), null, "changed 只 CAS 删除自己的 PREPARED 行");
  assert.equal(await c.hlen(kArchiveProof(u)), 0, "changed 清理自己的 proof membership");
  assert.deepEqual(await ledgerUsage(0), await exactUsage(0), "changed 清理与 ledger 同事务");
  assert.equal(await c.hget(kBag(u, 9 % 4), "9"), "1", "发的货不因修复回滚");
});

test("freeze archive upsert 后出现 session：commit 二次闸保留热档并回滚 PREPARED+ledger", async () => {
  const { uid: u } = await seedFullUser("session_commit_gate");
  await makeCold(u);
  try {
    _freezeTestHooks.afterArchiveUpsert = async (hookUid, sId) => {
      assert.equal(hookUid, u);
      assert.equal(sId, 0);
      await clientFor(hookUid).hset(kSess(hookUid, sId), "tokenHash", "late-login");
    };
    assert.equal(await freezeUser(u, freezeLease), "lost");
    assert.equal(await clientFor(u).exists(kUser(u)), 1, "active 返回前不得 UNLINK 热档");
    assert.equal(await archiveRow(u), null, "只清理本 attempt 的 PREPARED authority");
    assert.equal(await clientFor(u).hlen(kArchiveProof(u)), 0);
    assert.deepEqual(await ledgerUsage(0), await exactUsage(0), "PREPARED 删除与 ledger decrement 同事务");
  } finally {
    delete _freezeTestHooks.afterArchiveUpsert;
    await clientFor(u).unlink(kSess(u, 0));
  }
});

// ── Freeze 表③：锁易主 → Lua 'lost' 零破坏 ────────────────────────────────

test("freezeCommit 锁易主 → 'lost' 保留热档并精确清理自己的 PREPARED 行", async () => {
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
  assert.equal(await archiveRow(u), null, "lost 只 CAS 删除自己的 PREPARED 行");
  assert.equal(await clientFor(u).hlen(kArchiveProof(u)), 0, "lost 清理自己的 proof membership");
  assert.deepEqual(await ledgerUsage(0), await exactUsage(0), "lost 清理与 ledger 同事务");

  // 「锁已过期且被别人写入」：B 用更高 fence 写，旧 PREPARED 清理不得碰 B。
  await withUser(u, async (uow) => { uow.set("afterHijack", "1"); });
  assert.equal(await clientFor(u).hget(kUser(u), "afterHijack"), "1", "B 的新数据完好");
});

// ── Freeze 表②：② 后 ③ 前崩溃 → 并存 → resolve LIVE → janitor 删行 ────────

test("freeze ② 后 ③ 前崩溃：archive 与 Redis 并存 → resolve LIVE → janitor 删行、Redis 完好", async () => {
  const { uid: u } = await seedFullUser("cr23");
  const before = await dumpAll(u);
  const counter = Number(before.counter);
  const freezeId = newFreezeId();
  // 手工构造 PREPARE + MySQL PREPARED 完成、Redis commit 尚未执行的中断态。
  await clientFor(u).hset(kArchiveProof(u), freezeId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), ?, ?, ?, ?)`,
    [u, JSON.stringify({ user: before.user, bag: before.bags, applied: before.applied }),
      SCHEMA_VERSION, counter, freezeId, ARCHIVE_PHASE_PREPARED]);
  await rebuildUsage(0);

  const st = await withUserLock(u, async () => resolve(u));
  assert.equal(st.kind, "LIVE", "PREPARED 行命中自己的 proof membership → 热档分支可收敛");
  assert.ok(st.row, "LIVE 且带残留行");

  await janitorSweep(freezeLease, 500, [0]);
  assert.equal(await archiveRow(u), null, "陈旧残留行已删");
  assert.equal(await clientFor(u).hexists(kArchiveProof(u), freezeId), 0, "行删除后清理对应 proof member");
  const afterDump = await dumpAll(u);
  assert.deepEqual(afterDump.user, before.user, "Redis 档完好，任何路径不丢数据");
  assert.deepEqual(afterDump.bags, before.bags);
});

test("freezeCommit 后 finalize 前崩溃：PREPARED 冷档仍是权威，thaw 可 finalize 并恢复", async () => {
  const { uid: u } = await seedFullUser("commit_prepared");
  await makeCold(u);
  const injected = new Error("crash after freeze commit");
  _freezeTestHooks.afterFreezeCommit = async () => { throw injected; };
  try {
    await assert.rejects(freezeUser(u, freezeLease), (error: unknown) => error === injected);
  } finally {
    delete _freezeTestHooks.afterFreezeCommit;
  }

  const row = await archiveRow(u);
  assert.ok(row);
  assert.equal(row!.phase, ARCHIVE_PHASE_PREPARED);
  assert.ok(row!.freezeId);
  assert.equal(await clientFor(u).exists(kUser(u)), 0, "Redis commit 已删除热档");
  assert.equal(await clientFor(u).hexists(kArchiveProof(u), row!.freezeId!), 1);
  assert.equal((await withUserLock(u, () => resolve(u))).kind, "FROZEN");

  await ensureLive(u);
  assert.equal(await clientFor(u).hget(kUser(u), "nickname"), "旅人");
  assert.equal(await archiveRow(u), null);
  assert.equal(await clientFor(u).hexists(kArchiveProof(u), row!.freezeId!), 0);
  assert.deepEqual(await ledgerUsage(0), await exactUsage(0));
});

// ── Freeze 表④：③ 后崩溃（ZREM 未执行）→ 幽灵项自愈 ───────────────────────

test("freeze ③ 后崩溃（ZREM 未执行）→ 候选筛选 EXISTS 过滤幽灵项并 ZREM（08）", async () => {
  const { uid: u } = await seedFullUser("ghost");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  // 模拟 ZREM 未执行：把幽灵项塞回索引
  const b = activeLruBucketOf(u);
  await indexClientFor(b).zadd(kActiveLru(b), Date.now() - COLD_MS - 3_600_000, u);

  resetSweepCursor();
  let ghosts = 0;
  for (let pass = 0; pass < 6 && ghosts === 0; pass++) {
    ghosts += (await sweepOnce(freezeLease, 50, [0])).ghosts;
  }
  assert.ok(ghosts >= 1, "有界 probe 轮转一圈内识别幽灵项");
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
    assert.equal(await thawRestore(u, fence, row.fenceHwm, row.snapshot, false, row.freezeId!), "ok");
  });
  assert.equal(await clientFor(u).exists(kUser(u)), 1, "已恢复");
  assert.ok(await archiveRow(u), "行未删：并存中断态");

  assert.equal((await withUserLock(u, async () => resolve(u))).kind, "LIVE", "平局判 LIVE（09·F1）");
  await janitorSweep(freezeLease, 500, [0]);
  assert.equal(await archiveRow(u), null, "清理任务删 archive 收敛");
  const afterDump = await dumpAll(u);
  assert.deepEqual(afterDump.bags, before.bags, "档完好");
  assert.deepEqual(afterDump.applied, before.applied);
});

test("后台 thaw 恢复 LRU 失败：保留 LIVE + archive，重试补索引后才删行", async () => {
  const { uid: u } = await seedFullUser("lru_retry");
  await makeCold(u);
  const archivedLastActiveAt = Number(await clientFor(u).hget(kUser(u), "lastActiveAt"));
  const bucket = activeLruBucketOf(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  assert.equal(await indexClientFor(bucket).zscore(kActiveLru(bucket), u), null);

  const injected = new Error("injected active:lru write failure");
  let attempts = 0;
  _thawTestHooks.beforeActiveIndexRestore = async (hookUid, sId) => {
    assert.equal(hookUid, u);
    assert.equal(sId, 0);
    attempts++;
    if (attempts === 1) { throw injected; }
  };
  try {
    await assert.rejects(ensureLive(u), (error: unknown) => error === injected);
    assert.equal(await clientFor(u).exists(kUser(u)), 1, "thaw Lua 已把用户恢复为热档");
    assert.ok(await archiveRow(u), "LRU 未恢复时 archive 必须保留为重试标记");
    assert.equal(await indexClientFor(bucket).zscore(kActiveLru(bucket), u), null,
      "首次 ZADD 失败不得伪装为索引恢复成功");

    await ensureLive(u);
  } finally {
    delete _thawTestHooks.beforeActiveIndexRestore;
  }

  assert.equal(attempts, 2, "第二次 ensureLive 必须进入 LIVE + archive 收敛分支重试 ZADD");
  assert.equal(
    Number(await indexClientFor(bucket).zscore(kActiveLru(bucket), u)),
    archivedLastActiveAt,
    "重试按归档 lastActiveAt 恢复索引",
  );
  assert.equal(await archiveRow(u), null, "索引恢复成功后才删除 archive");
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
    assert.equal(await thawRestore(u, lease.fence, row.fenceHwm, row.snapshot, false, row.freezeId!), "lost");
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
  const freezeId = newFreezeId();
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), 1, ?, ?, ?)`,
    [u, JSON.stringify(snap), hwm, freezeId, ARCHIVE_PHASE_COMMITTED]);
  await rebuildUsage(0);

  assert.equal((await withUserLock(u, async () => resolve(u))).kind, "ARCHIVE_NEWER",
    "COMMITTED 行的 freeze_id proof 缺失时 archive 权威，与 fence counter 无关");

  const jr = await janitorSweep(freezeLease, 500, [0]);
  assert.ok(jr.repaired >= 1, "修复路径触发");
  assert.equal(await c.hget(kUser(u), "star"), "999", "陈旧 Redis 档被 archive 覆盖");
  assert.equal(await c.hget(kUser(u), "maxRound"), null, "陈旧字段一并 UNLINK（overwrite=1）");
  assert.equal(await c.hget(kUser(u), "fence"), String(hwm), "hash fence = hwm（09·F3）");
  assert.equal(await c.get(kFence(u)), String(hwm), "计数器 = hwm（09·F3）");
  assert.equal(await c.hget(kBag(u, 17 % 4), "17"), "8", "背包按快照恢复");
  assert.deepEqual(await c.zrange(kApplied(u), 0, -1, "WITHSCORES"), ["op_x", "1700000000000"]);
  assert.equal(await archiveRow(u), null, "修复后删行");
});

test("proof 精确 membership：无关 attempt 与失败抢锁推高 fence 都不能掩盖当前 COMMITTED 行", async () => {
  const { uid: u } = await seedFullUser("proof_exact");
  const c = clientFor(u);
  const counter = Number(await c.get(kFence(u)));
  const freezeId = newFreezeId();
  const unrelatedId = newFreezeId();
  const hwm = counter + 1;
  const snap: ArchiveSnapshot = {
    user: {
      schemaVersion: "1", fence: "0", ver: "50", star: "505",
      nickname: "proof archive", lastActiveAt: String(Date.now()),
    },
    bag: [{}, {}, {}, {}],
    applied: [],
  };
  await c.hset(kArchiveProof(u), unrelatedId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), 1, ?, ?, ?)`,
    [u, JSON.stringify(snap), hwm, freezeId, ARCHIVE_PHASE_COMMITTED],
  );
  await rebuildUsage(0);

  const holder = await acquireLease(u);
  try {
    await Promise.all(Array.from({ length: 8 }, () =>
      assert.rejects(acquireLease(u), BusyError)));
  } finally {
    await holder.release();
  }
  assert.ok(Number(await c.get(kFence(u))) > hwm, "失败抢锁已把 fence counter 推过 archive hwm");
  assert.equal(await c.hexists(kArchiveProof(u), unrelatedId), 1);
  assert.equal(await c.hexists(kArchiveProof(u), freezeId), 0);
  assert.equal((await withUserLock(u, () => resolve(u))).kind, "ARCHIVE_NEWER");

  await ensureLive(u);
  assert.equal(await c.hget(kUser(u), "nickname"), "proof archive");
  assert.equal(await archiveRow(u), null);
});

test("PREPARE 崩溃孤儿有界清理：后续 attempt 只留自己，异常大 HASH fail-closed 不继续增长", async () => {
  const { uid: u } = await seedFullUser("proof_orphan");
  await makeCold(u);
  const c = clientFor(u);

  await withUserLock(u, async (fence) => {
    const ver = await c.hget(kUser(u), "ver");
    assert.ok(ver);
    for (let attempt = 0; attempt < 20; attempt++) {
      const freezeId = newFreezeId();
      assert.equal(
        await prepareArchiveCandidate(u, fence, ver!, freezeId, null),
        "ok",
      );
      assert.deepEqual(await c.hkeys(kArchiveProof(u)), [freezeId],
        "模拟 PREPARE 后进程崩溃：下一 attempt 必须有界清掉上一孤儿");
    }

    await c.unlink(kArchiveProof(u));
    const fields: string[] = [];
    for (let i = 0; i < 65; i++) { fields.push(newFreezeId(), "1"); }
    await c.hset(kArchiveProof(u), ...fields);
    const rejectedId = newFreezeId();
    assert.equal(
      await prepareArchiveCandidate(u, fence, ver!, rejectedId, null),
      "proof_full",
    );
    assert.equal(await c.hlen(kArchiveProof(u)), 65, "超限分支不扫描/改写既有 HASH");
    assert.equal(await c.hexists(kArchiveProof(u), rejectedId), 0, "超限不得再增加字段");
  });
  await c.unlink(kArchiveProof(u));
});

test("stale-live 冷档只按旧 freeze_id+phase 精确替换，行数不变且旧 proof 被清理", async () => {
  const { uid: u } = await seedFullUser("exact_replace");
  await makeCold(u);
  const before = await dumpAll(u);
  const oldFreezeId = newFreezeId();
  await clientFor(u).hset(kArchiveProof(u), oldFreezeId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), ?, ?, ?, ?)`,
    [u, JSON.stringify({
      user: before.user,
      bag: before.bags,
      applied: before.applied,
      appliedPayload: before.appliedPayload,
    }), SCHEMA_VERSION, Number(before.counter), oldFreezeId, ARCHIVE_PHASE_PREPARED],
  );
  await rebuildUsage(0);
  const usageBefore = await exactUsage(0);
  _freezeTestHooks.afterArchiveUpsert = async (hookUid) => {
    assert.equal(hookUid, u);
    assert.equal(await clientFor(u).hexists(kArchiveProof(u), oldFreezeId), 1,
      "MySQL replacement 提交前仍须保留旧行同源证明");
    assert.equal(await clientFor(u).hlen(kArchiveProof(u)), 2,
      "PREPARE 只保留旧 authority 与当前 attempt");
  };
  try {
    assert.equal(await freezeUser(u, freezeLease), "frozen");
  } finally {
    delete _freezeTestHooks.afterArchiveUpsert;
  }

  const replaced = (await archiveRow(u))!;
  assert.notEqual(replaced.freezeId, oldFreezeId);
  assert.equal(replaced.phase, ARCHIVE_PHASE_COMMITTED);
  assert.equal((await exactUsage(0)).rows, usageBefore.rows, "replacement 不增加行数");
  assert.equal(await clientFor(u).hexists(kArchiveProof(u), oldFreezeId), 0);
  assert.equal(await clientFor(u).hexists(kArchiveProof(u), replaced.freezeId!), 1);
  assert.deepEqual(await ledgerUsage(0), await exactUsage(0), "replacement byte delta 精确入 ledger");
  await ensureLive(u);
});

test("freeze 事务前旧行 identity 被换：不得按 fence 覆盖新行，当前 attempt proof 精确回收", async () => {
  const { uid: u } = await seedFullUser("identity_race");
  await makeCold(u);
  const before = await dumpAll(u);
  const oldFreezeId = newFreezeId();
  const racerFreezeId = newFreezeId();
  await clientFor(u).hset(kArchiveProof(u), oldFreezeId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), ?, ?, ?, ?)`,
    [u, JSON.stringify({
      user: before.user,
      bag: before.bags,
      applied: before.applied,
      appliedPayload: before.appliedPayload,
    }), SCHEMA_VERSION, Number(before.counter), oldFreezeId, ARCHIVE_PHASE_PREPARED],
  );
  await rebuildUsage(0);
  _freezeTestHooks.afterSnapshot = async () => {
    const [updated] = await getPool().execute(
      `UPDATE user_archive SET freeze_id = ?, archive_phase = ?
        WHERE user_id = ? AND server_id = 0 AND freeze_id = ? AND archive_phase = ?`,
      [racerFreezeId, ARCHIVE_PHASE_PREPARED, u, oldFreezeId, ARCHIVE_PHASE_PREPARED],
    );
    assert.equal((updated as { affectedRows: number }).affectedRows, 1);
    await clientFor(u).hset(kArchiveProof(u), racerFreezeId, "1");
  };
  try {
    assert.equal(await freezeUser(u, freezeLease), "skipped");
  } finally {
    delete _freezeTestHooks.afterSnapshot;
  }

  const preserved = (await archiveRow(u))!;
  assert.equal(preserved.freezeId, racerFreezeId, "事务锁内 identity mismatch 必须 fail-closed");
  assert.equal(preserved.phase, ARCHIVE_PHASE_PREPARED);
  assert.equal(await clientFor(u).exists(kUser(u)), 1, "热档不被 UNLINK");
  const proofFields = new Set(await clientFor(u).hkeys(kArchiveProof(u)));
  assert.deepEqual(proofFields, new Set([oldFreezeId, racerFreezeId]),
    "只回收本 attempt；不得删除后来者或旧 identity 的 proof");
  assert.deepEqual(await ledgerUsage(0), await exactUsage(0));
});

test("archive upsert 后注错：authority 与容量 ledger 同事务回滚，旧 proof 保留", async () => {
  const { uid: u } = await seedFullUser("replace_rollback");
  await makeCold(u);
  const before = await dumpAll(u);
  const oldFreezeId = newFreezeId();
  await clientFor(u).hset(kArchiveProof(u), oldFreezeId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), ?, ?, ?, ?)`,
    [u, JSON.stringify({
      user: before.user,
      bag: before.bags,
      applied: before.applied,
      appliedPayload: before.appliedPayload,
    }), SCHEMA_VERSION, Number(before.counter), oldFreezeId, ARCHIVE_PHASE_PREPARED],
  );
  await rebuildUsage(0);
  const ledgerBefore = await ledgerUsage(0);
  _freezeTestHooks.afterArchiveUpsert = async () => { throw new Error("injected rollback"); };
  try {
    assert.equal(await freezeUser(u, freezeLease), "skipped");
  } finally {
    delete _freezeTestHooks.afterArchiveUpsert;
  }
  assert.equal((await archiveRow(u))!.freezeId, oldFreezeId, "MySQL authority replacement 已回滚");
  assert.deepEqual(await ledgerUsage(0), ledgerBefore, "ledger delta 同事务回滚");
  assert.equal(await clientFor(u).hexists(kArchiveProof(u), oldFreezeId), 1);
  assert.deepEqual(await clientFor(u).hkeys(kArchiveProof(u)), [oldFreezeId],
    "失败 attempt proof 已精确删除");
});

test("legacy 双存态 fail-closed，legacy 纯冷档可先升级 freeze_id 再 thaw", async () => {
  const dual = uid("legacy_dual");
  await seedFullUserInZone(dual, 0, "legacy live");
  const legacySnapshot: ArchiveSnapshot = {
    user: {
      schemaVersion: "1", fence: "0", ver: "1", star: "9",
      nickname: "legacy archive", lastActiveAt: String(Date.now()),
    },
    bag: [{}, {}, {}, {}],
    applied: [],
  };
  await getPool().execute(
    `INSERT INTO user_archive (user_id, server_id, snapshot, schema_version, fence_hwm)
     VALUES (?, 0, CAST(? AS JSON), 1, 1)`,
    [dual, JSON.stringify(legacySnapshot)],
  );
  await rebuildUsage(0);
  assert.equal((await withUserLock(dual, () => resolve(dual))).kind, "CONFLICT");
  await assert.rejects(ensureLive(dual), ArchiveAuthorityConflictError);
  assert.equal(await freezeUser(dual, freezeLease), "skipped");
  await janitorSweep(freezeLease, 500, [0]);
  assert.equal(await clientFor(dual).hget(kUser(dual), "nickname"), "legacy live");
  assert.equal((await archiveRow(dual))!.phase, ARCHIVE_PHASE_LEGACY);

  const cold = uid("legacy_cold");
  await getPool().execute(
    `INSERT INTO user_archive (user_id, server_id, snapshot, schema_version, fence_hwm)
     VALUES (?, 0, CAST(? AS JSON), 1, 7)`,
    [cold, JSON.stringify(legacySnapshot)],
  );
  await rebuildUsage(0);
  await ensureLive(cold);
  assert.equal(await clientFor(cold).hget(kUser(cold), "nickname"), "legacy archive");
  assert.deepEqual(
    await clientFor(cold).hmget(kUser(cold), "schemaVersion", "characterRegistrationCheckedAt", "ver"),
    [String(SCHEMA_VERSION), "0", "2"],
    "cold v1 复用同一 registry：缺 checkedAt 补 0 且 ver bump 一次",
  );
  assert.equal(await archiveRow(cold), null);
  assert.equal(await clientFor(cold).hlen(kArchiveProof(cold)), 0,
    "legacy thaw 删除 archive 后清理临时升级出的 proof member");
});

test("双存态热档 WRONGTYPE 或坏 metadata 时保留 archive、ledger 与 proof", async () => {
  const cases = [
    {
      name: "dual_wrongtype",
      phase: ARCHIVE_PHASE_COMMITTED,
      corrupt: async (u: string): Promise<void> => {
        const redis = clientFor(u);
        await redis.unlink(kUser(u));
        await redis.set(kUser(u), "wrong-type");
      },
    },
    {
      name: "dual_bad_schema",
      phase: ARCHIVE_PHASE_PREPARED,
      corrupt: async (u: string): Promise<void> => {
        await clientFor(u).hset(kUser(u), "schemaVersion", String(SCHEMA_VERSION + 1));
      },
    },
    {
      name: "dual_bad_ver",
      phase: ARCHIVE_PHASE_COMMITTED,
      corrupt: async (u: string): Promise<void> => {
        await clientFor(u).hset(kUser(u), "ver", "bad");
      },
    },
  ] as const;

  for (const item of cases) {
    const { uid: u } = await seedFullUser(item.name);
    const before = await dumpAll(u);
    const freezeId = newFreezeId();
    await getPool().execute(
      `INSERT INTO user_archive (
         user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
       ) VALUES (?, 0, CAST(? AS JSON), ?, ?, ?, ?)`,
      [u, JSON.stringify({
        user: before.user,
        bag: before.bags,
        applied: before.applied,
        appliedPayload: before.appliedPayload,
      }), SCHEMA_VERSION, Number(before.counter), freezeId, item.phase],
    );
    await rebuildUsage(0);
    await clientFor(u).hset(kArchiveProof(u), freezeId, "1");
    const rowBefore = await archiveRow(u);
    const ledgerBefore = await ledgerUsage(0);
    const proofBefore = await clientFor(u).hgetall(kArchiveProof(u));

    await item.corrupt(u);
    await assert.rejects(ensureLive(u), ArchiveAuthorityConflictError);
    resetJanitorCursor();
    await janitorSweep(freezeLease, 10_000, [0]);

    assert.deepEqual(await archiveRow(u), rowBefore, `${item.name}: archive authority 必须保留`);
    assert.deepEqual(await ledgerUsage(0), ledgerBefore, `${item.name}: ledger 不得扣减`);
    assert.deepEqual(await clientFor(u).hgetall(kArchiveProof(u)), proofBefore,
      `${item.name}: proof 不得清理`);
  }
});

test("freeze 缺 ver/schemaVersion fail-closed：不写 PREPARED、不登记 proof、不删热档", async () => {
  for (const field of ["ver", "schemaVersion"] as const) {
    const { uid: u } = await seedFullUser(`missing_${field}`);
    await makeCold(u);
    await clientFor(u).hdel(kUser(u), field);
    await assert.rejects(freezeUser(u, freezeLease), new RegExp(`user\\.${field}`));
    assert.equal(await archiveRow(u), null);
    assert.equal(await clientFor(u).hlen(kArchiveProof(u)), 0);
    assert.equal(await clientFor(u).exists(kUser(u)), 1);
  }
});

test("freeze 对合法热档 v1 先锁内迁移再 snapshot；缺 checkedAt 补 0 且 migration 单独 bump ver", async () => {
  const { uid: u } = await seedFullUser("freeze_schema_v1");
  const c = clientFor(u);
  await makeCold(u);
  await c.hset(kUser(u), "schemaVersion", "1", "ver", "10");
  await c.hdel(kUser(u), "characterRegistrationCheckedAt");

  assert.equal(await freezeUser(u, freezeLease), "frozen");
  const row = await archiveRow(u);
  assert.ok(row);
  assert.deepEqual(
    [row!.snapshot.user.schemaVersion, row!.snapshot.user.characterRegistrationCheckedAt, row!.snapshot.user.ver],
    [String(SCHEMA_VERSION), "0", "11"],
  );
  const [stored] = await getPool().query<RowDataPacket[]>(
    "SELECT schema_version FROM user_archive WHERE user_id = ? AND server_id = 0",
    [u],
  );
  assert.equal(Number(stored[0].schema_version), SCHEMA_VERSION, "freeze 只落当前 schema 冷档");
});

test("freeze 对 v1 畸形 checkedAt 在首个 archive/proof 写前失败并完整保留热档", async () => {
  const { uid: u } = await seedFullUser("freeze_schema_corrupt");
  const c = clientFor(u);
  await makeCold(u);
  await c.hset(
    kUser(u), "schemaVersion", "1", "ver", "10", "characterRegistrationCheckedAt", "-1",
  );
  const before = await c.hgetall(kUser(u));

  await assert.rejects(freezeUser(u, freezeLease), /characterRegistrationCheckedAt/);
  assert.deepEqual(await c.hgetall(kUser(u)), before);
  assert.equal(await archiveRow(u), null);
  assert.equal(await c.hlen(kArchiveProof(u)), 0);
});

test("LIVE+archive 的合法 v1 先迁移成功再删陈旧行；proof 与 ledger 一并收敛", async () => {
  const { uid: u } = await seedFullUser("dual_schema_v1");
  const c = clientFor(u);
  await c.hset(kUser(u), "schemaVersion", "1", "ver", "20");
  await c.hdel(kUser(u), "characterRegistrationCheckedAt");
  const live = await dumpAll(u);
  const snapshot: ArchiveSnapshot = {
    user: live.user,
    bag: live.bags,
    applied: live.applied,
    appliedPayload: live.appliedPayload,
  };
  const freezeId = newFreezeId();
  await c.hset(kArchiveProof(u), freezeId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), 1, 0, ?, ?)`,
    [u, JSON.stringify(snapshot), freezeId, ARCHIVE_PHASE_PREPARED],
  );
  await rebuildUsage(0);

  await ensureLive(u);
  assert.deepEqual(
    await c.hmget(kUser(u), "schemaVersion", "characterRegistrationCheckedAt", "ver"),
    [String(SCHEMA_VERSION), "0", "21"],
  );
  assert.equal(await archiveRow(u), null, "只有迁移成功后才可删陈旧 archive");
  assert.equal(await c.hexists(kArchiveProof(u), freezeId), 0);
  assert.deepEqual(await ledgerUsage(0), await exactUsage(0));
});

test("janitor 的 LIVE+archive v1 分支同样先迁移再删行", async () => {
  const { uid: u } = await seedFullUser("janitor_schema_v1");
  const c = clientFor(u);
  await c.hset(kUser(u), "schemaVersion", "1", "ver", "30");
  await c.hdel(kUser(u), "characterRegistrationCheckedAt");
  const live = await dumpAll(u);
  const snapshot: ArchiveSnapshot = {
    user: live.user, bag: live.bags, applied: live.applied, appliedPayload: live.appliedPayload,
  };
  const freezeId = newFreezeId();
  await c.hset(kArchiveProof(u), freezeId, "1");
  await getPool().execute(
    `INSERT INTO user_archive (
       user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
     ) VALUES (?, 0, CAST(? AS JSON), 1, 0, ?, ?)`,
    [u, JSON.stringify(snapshot), freezeId, ARCHIVE_PHASE_PREPARED],
  );
  await rebuildUsage(0);

  resetJanitorCursor();
  const result = await janitorSweep(freezeLease, 10_000, [0]);
  assert.ok(result.deleted >= 1);
  assert.deepEqual(
    await c.hmget(kUser(u), "schemaVersion", "characterRegistrationCheckedAt", "ver"),
    [String(SCHEMA_VERSION), "0", "31"],
  );
  assert.equal(await archiveRow(u), null);
});

test("ready marker 写前对账且只在真实变化时 bump ver；坏 ver/schema 零部分写", async () => {
  const { uid: u } = await seedFullUser("ready_marker_guard");
  const c = clientFor(u);
  const checkedAt = Date.now();
  const ver0 = Number(await c.hget(kUser(u), "ver"));
  await markCharacterRegistrationReady(u, 0, checkedAt);
  assert.equal(await c.hget(kUser(u), "characterRegistration"), "ready");
  assert.equal(await c.hget(kUser(u), "characterRegistrationCheckedAt"), String(checkedAt));
  assert.equal(Number(await c.hget(kUser(u), "ver")), ver0 + 1);

  await markCharacterRegistrationReady(u, 0, checkedAt);
  assert.equal(Number(await c.hget(kUser(u), "ver")), ver0 + 1, "重复相同 marker 不 bump ver");

  await c.hset(kUser(u), "ver", "bad");
  await assert.rejects(markCharacterRegistrationReady(u, 0, checkedAt + 1), /user\.ver/);
  assert.equal(await c.hget(kUser(u), "characterRegistrationCheckedAt"), String(checkedAt));
  assert.equal(await c.hget(kUser(u), "ver"), "bad");

  await c.hset(kUser(u), "ver", String(ver0 + 1), "schemaVersion", String(SCHEMA_VERSION + 1));
  await assert.rejects(markCharacterRegistrationReady(u, 0, checkedAt + 2), /user\.schemaVersion/);
  assert.equal(await c.hget(kUser(u), "characterRegistrationCheckedAt"), String(checkedAt));
  assert.equal(await c.hget(kUser(u), "schemaVersion"), String(SCHEMA_VERSION + 1));
});

test("ready marker 在 ensureLive 后出现 v1 也会在同一业务锁内先迁移再写 marker", async () => {
  const { uid: u } = await seedFullUser("ready_marker_schema_window");
  const c = clientFor(u);
  let injected = false;
  _characterStateTestHooks.afterEnsureLive = async (hookUid) => {
    if (hookUid !== u || injected) { return; }
    injected = true;
    await c.hset(kUser(u), "schemaVersion", "1", "ver", "40");
    await c.hdel(kUser(u), "characterRegistrationCheckedAt");
  };
  try {
    await markCharacterRegistrationReady(u, 0, 777);
  } finally {
    delete _characterStateTestHooks.afterEnsureLive;
  }
  assert.deepEqual(
    await c.hmget(
      kUser(u), "schemaVersion", "characterRegistration", "characterRegistrationCheckedAt", "ver",
    ),
    [String(SCHEMA_VERSION), "ready", "777", "42"],
    "migration 40->41，marker 41->42",
  );
});

test("cold v1 lazy thaw 保留合法 checkedAt，迁移为 v2 后再执行原子恢复", async () => {
  const u = uid("cold_v1_checked_at");
  const snapshot: ArchiveSnapshot = {
    user: {
      schemaVersion: "1",
      ver: "8",
      fence: "0",
      createdAt: "100",
      characterRegistration: "ready",
      characterRegistrationCheckedAt: "456",
    },
    bag: [{}, {}, {}, {}],
    applied: [],
  };
  await getPool().execute(
    `INSERT INTO user_archive (user_id, server_id, snapshot, schema_version, fence_hwm)
     VALUES (?, 0, CAST(? AS JSON), 1, 3)`,
    [u, JSON.stringify(snapshot)],
  );
  await rebuildUsage(0);

  await ensureLive(u);
  assert.deepEqual(
    await clientFor(u).hmget(kUser(u), "schemaVersion", "characterRegistrationCheckedAt", "ver"),
    [String(SCHEMA_VERSION), "456", "9"],
  );
  assert.equal(await archiveRow(u), null);
});

test("THAW_RESTORE 全量 preflight：WRONGTYPE、坏快照与 future schema 均在 overwrite 前零破坏", async () => {
  const { uid: u } = await seedFullUser("thaw_preflight");
  const c = clientFor(u);
  const before = await dumpAll(u);
  const valid: ArchiveSnapshot = {
    user: before.user,
    bag: before.bags,
    applied: before.applied,
    appliedPayload: before.appliedPayload,
  };
  await c.unlink(kBag(u, 0));
  await c.set(kBag(u, 0), "wrong-type");
  await withUserLock(u, async (fence) => {
    await assert.rejects(
      thawRestore(u, fence, Number(before.counter), valid, true, newFreezeId()),
      /archive restore key type/,
    );
  });
  assert.equal(await c.hget(kUser(u), "nickname"), before.user.nickname, "WRONGTYPE 前置检查不得 UNLINK user");
  assert.equal(await c.get(kBag(u, 0)), "wrong-type", "错误类型目标原样保留");

  await c.unlink(kBag(u, 0));
  const malformed = { ...valid, bag: valid.bag.slice(0, -1) } as ArchiveSnapshot;
  await withUserLock(u, async (fence) => {
    await assert.rejects(
      thawRestore(u, fence, Number(before.counter), malformed, true, newFreezeId()),
      /archive snapshot bag invalid/,
    );
  });
  assert.equal(await c.hget(kUser(u), "nickname"), before.user.nickname, "坏 snapshot 不得 UNLINK user");

  const badCheckedAt: ArchiveSnapshot = {
    ...valid,
    user: { ...valid.user, characterRegistrationCheckedAt: "-1" },
  };
  await withUserLock(u, async (fence) => {
    await assert.rejects(
      thawRestore(u, fence, Number(before.counter), badCheckedAt, true, newFreezeId()),
      /archive snapshot characterRegistrationCheckedAt invalid/,
    );
  });
  assert.equal(await c.hget(kUser(u), "nickname"), before.user.nickname,
    "v2 checkedAt 损坏必须在 overwrite UNLINK 前失败");

  const future: ArchiveSnapshot = {
    ...valid,
    user: { ...valid.user, schemaVersion: String(SCHEMA_VERSION + 1) },
  };
  await withUserLock(u, async (fence) => {
    await assert.rejects(
      thawRestore(u, fence, Number(before.counter), future, true, newFreezeId()),
      /archive snapshot schema invalid/,
    );
  });
  assert.equal(await c.hget(kUser(u), "nickname"), before.user.nickname, "future schema 不得 UNLINK user");
  assert.equal(await c.hlen(kArchiveProof(u)), 0, "所有失败分支都不得登记 proof");
});

test("冷档 corrupt/future snapshot 在 identity materialize 前失败，MySQL 与 Redis 业务键零变化", async () => {
  const cases: ReadonlyArray<{ name: string; outer: number; snapshot: ArchiveSnapshot }> = [
    {
      name: "v1-bad-checked-at",
      outer: 1,
      snapshot: {
        user: {
          schemaVersion: "1", ver: "1", fence: "0",
          characterRegistrationCheckedAt: "-1",
        },
        bag: [{}, {}, {}, {}],
        applied: [],
      },
    },
    {
      name: "corrupt",
      outer: SCHEMA_VERSION,
      snapshot: {
        user: { schemaVersion: String(SCHEMA_VERSION), ver: "1", fence: "0" },
        bag: [{}, {}, {}],
        applied: [],
      },
    },
    {
      name: "future",
      outer: SCHEMA_VERSION + 1,
      snapshot: {
        user: { schemaVersion: String(SCHEMA_VERSION + 1), ver: "1", fence: "0" },
        bag: [{}, {}, {}, {}],
        applied: [],
      },
    },
  ];
  for (const item of cases) {
    const u = uid(`snapshot_${item.name}`);
    await getPool().execute(
      `INSERT INTO user_archive (user_id, server_id, snapshot, schema_version, fence_hwm)
       VALUES (?, 0, CAST(? AS JSON), ?, 3)`,
      [u, JSON.stringify(item.snapshot), item.outer],
    );
    await rebuildUsage(0);
    await assert.rejects(ensureLive(u), /archive (?:snapshot|schema)/);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT freeze_id, archive_phase, snapshot, schema_version
         FROM user_archive WHERE user_id = ? AND server_id = 0`,
      [u],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].freeze_id, null, "LEGACY identity 不得提前 materialize");
    assert.equal(Number(rows[0].archive_phase), ARCHIVE_PHASE_LEGACY);
    assert.equal(Number(rows[0].schema_version), item.outer);
    assert.deepEqual(rows[0].snapshot, item.snapshot);
    const c = clientFor(u);
    for (const key of [kUser(u), kApplied(u), kAppliedPayload(u), ...kBagAll(u), kArchiveProof(u)]) {
      assert.equal(await c.exists(key), 0, `${item.name} 不得恢复业务 key ${key}`);
    }
  }
});

test("ledger 缺行时并发事务先建 sentinel 再重建，最终 row/byte 精确", async () => {
  const sId = 65_000;
  const users = [uid("ledger_missing_a"), uid("ledger_missing_b")];
  const snapshots: ArchiveSnapshot[] = users.map((u, index) => ({
    user: {
      schemaVersion: String(SCHEMA_VERSION), ver: String(index), fence: "0", owner: u,
      characterRegistrationCheckedAt: "0",
    },
    bag: [{}, {}, {}, {}],
    applied: [],
  }));
  await getPool().execute("DELETE FROM user_archive WHERE server_id = ?", [sId]);
  await getPool().execute("DELETE FROM archive_zone_usage WHERE server_id = ?", [sId]);
  try {
    let arrived = 0;
    let release!: () => void;
    const bothMissing = new Promise<void>((resolve) => { release = resolve; });
    _archiveUsageTestHooks.afterMissingProbe = async (hookSId) => {
      if (hookSId !== sId) { return; }
      arrived++;
      if (arrived === 2) { release(); }
      await bothMissing;
    };
    try {
      await Promise.all(users.map((u, index) => withRcTx(async (conn) => {
        const usage = await lockArchiveUsage(conn, sId);
        const json = JSON.stringify(snapshots[index]);
        const bytes = await archiveJsonStorageBytes(conn, json);
        await conn.execute(
          `INSERT INTO user_archive (user_id, server_id, snapshot, schema_version, fence_hwm)
           VALUES (?, ?, CAST(? AS JSON), ?, 0)`,
          [u, sId, json, SCHEMA_VERSION],
        );
        await writeArchiveUsage(conn, sId, { rows: usage.rows + 1, bytes: usage.bytes + bytes });
      })));
    } finally {
      delete _archiveUsageTestHooks.afterMissingProbe;
    }
    assert.equal(arrived, 2, "两个 RC 事务都先观察到 missing ledger");
    const exact = await exactUsage(sId);
    assert.deepEqual(await ledgerUsage(sId), exact);
    assert.equal(exact.rows, 2);
    assert.ok(exact.bytes > 0);
  } finally {
    delete _archiveUsageTestHooks.afterMissingProbe;
    await getPool().execute("DELETE FROM user_archive WHERE server_id = ?", [sId]);
    await getPool().execute("DELETE FROM archive_zone_usage WHERE server_id = ?", [sId]);
  }
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
  const op = deriveOpId(u, 0, "late", "r-gate");
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
  await clientFor(u).hset(kSess(u, 0), "connId", "c1");
  try {
    assert.equal(await freezeUser(u, freezeLease), "skipped");
    assert.equal(await archiveRow(u), null);
  } finally {
    await clientFor(u).unlink(kSess(u, 0));
  }
});

test("新登录与 freeze 共用同区用户锁：登录先排队时 session gate 必须胜出", async () => {
  const { uid: u } = await seedFullUser("sess_race");
  await makeCold(u);
  let login!: Promise<"written" | "unchanged" | "stale">;
  let freezing!: Promise<"frozen" | "skipped" | "lost">;

  await withUserLock(u, async () => {
    login = writeGroupSess(u, "session-race-token", 0, "", 101);
    freezing = freezeUser(u, freezeLease, 0);
    await new Promise<void>((resolveNow) => setImmediate(resolveNow));
    assert.equal(await clientFor(u).exists(kSess(u, 0)), 0,
      "外层 user lock 释放前，session writer 不得越过 freeze 的串行边界");
  });

  assert.equal(await login, "written");
  assert.equal(await freezing, "skipped", "先排队的登录写入 sess 后，后继 freeze 必须命中在线闸");
  assert.equal(await archiveRow(u), null);
  assert.equal(await clientFor(u).exists(kUser(u)), 1);
  const score = await indexClientFor(activeLruBucketOf(u)).zscore(kActiveLru(activeLruBucketOf(u)), u);
  assert.ok(score && Number(score) > Date.now() - 10_000, "登录的 touchActive 与 session 写在同一锁次序内完成");
});

test("幽灵候选清理与新登录串行：陈旧查询不得删除刚刷新的 fresh LRU", async () => {
  const u = uid("ghost_login_race");
  const bucket = activeLruBucketOf(u);
  const cutoff = Date.now() - COLD_MS;
  await indexClientFor(bucket).zadd(kActiveLru(bucket), cutoff - 1_000, u);
  let login!: Promise<"written" | "unchanged" | "stale">;
  let cleanup!: Promise<boolean>;

  await withUserLock(u, async () => {
    login = writeGroupSess(u, "ghost-login-token", 0, "", 201);
    cleanup = removeGhostCandidate(u, 0, bucket, cutoff);
    await new Promise<void>((resolveNow) => setImmediate(resolveNow));
    assert.equal(await clientFor(u).exists(kSess(u, 0)), 0);
  });

  assert.equal(await login, "written");
  assert.equal(await cleanup, false, "后继 ghost cleanup 必须看到新 session/fresh score 并放弃 ZREM");
  const score = await indexClientFor(bucket).zscore(kActiveLru(bucket), u);
  assert.ok(score && Number(score) >= cutoff, "刚登录的 LRU 仍在且已刷新");
});

// ── relayer 接线（09·X5：冻结后仍可能有后到 outbox 行；任何 apply 前先 thaw） ──

test("relayer 收 cold → ensureLive → 重试成功：后到 outbox 行照常发货", async () => {
  const { uid: u } = await seedFullUser("rly");
  await makeCold(u);
  const archivedLastActiveAt = Number(await clientFor(u).hget(kUser(u), "lastActiveAt"));
  const activeBucket = activeLruBucketOf(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  assert.equal(await indexClientFor(activeBucket).zscore(kActiveLru(activeBucket), u), null,
    "freeze 必须先移除热档候选索引");

  // 冻结**之后**插入的后到行（活动发奖 / T+1 退款 / GM 补偿场景）；created_at 拨旧越过可见性窗口
  const op = deriveOpId(u, 0, "grant", "r-late");
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
  assert.equal(
    Number(await indexClientFor(activeBucket).zscore(kActiveLru(activeBucket), u)),
    archivedLastActiveAt,
    "后台 thaw 必须按归档 lastActiveAt 恢复 LRU，不能伪造为当前时间",
  );
});

test("relayer 对热档 v1 必须先经 ensureLive 迁移，再执行无 fence effect", async () => {
  const { uid: u } = await seedFullUser("relayer_hot_schema_v1");
  const c = clientFor(u);
  await c.hset(kUser(u), "schemaVersion", "1", "ver", "50");
  await c.hdel(kUser(u), "characterRegistrationCheckedAt");
  const op = deriveOpId(u, 0, "grant", "schema-v1");
  await getPool().execute(
    `INSERT INTO gameplay_outbox (op_id, user_id, effect, status, created_at)
     VALUES (?,?,CAST(? AS JSON),?, NOW(3) - INTERVAL 30 SECOND)`,
    [op, u, JSON.stringify([{ kind: "item", itemId: 19, count: 2 }]), OUTBOX_PENDING],
  );

  await expireLease("outbox_relayer");
  const lease = await tryAcquireLease("outbox_relayer", makeHolderId(), 60);
  assert.ok(lease);
  try {
    await relayerTick(lease!);
  } finally {
    await expireLease("outbox_relayer");
  }
  assert.deepEqual(
    await c.hmget(kUser(u), "schemaVersion", "characterRegistrationCheckedAt", "ver"),
    [String(SCHEMA_VERSION), "0", "52"],
    "migration 50->51，applyEffect 51->52",
  );
  assert.equal(await c.hget(kBag(u, 19 % 4), "19"), "2");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status FROM gameplay_outbox WHERE op_id = ? AND server_id = 0",
    [op],
  );
  assert.equal(Number(rows[0].status), OUTBOX_DONE);
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
  // fence 语义（评审修正）：thaw 写 MAX(计数器, hwm)——thaw 自己的抢锁会 INCR 计数器，
  // 故 fence ≥ hwm 且与计数器一致；其余字段严格全等
  const fenceAfter = Number(afterUser.fence);
  assert.ok(fenceAfter >= hwm, `thaw 后 fence(${fenceAfter}) ≥ hwm(${hwm})`);
  assert.equal(String(fenceAfter), await c.get(kFence(u)), "hash fence 与计数器一致（约束 3）");
  delete (afterUser as Record<string, string>).fence;
  const beforeNoFence = { ...before };
  delete (beforeNoFence as Record<string, string>).fence;
  assert.deepEqual(afterUser, beforeNoFence, "HSCAN 快照往返全等（除 fence 语义变更外）");
});

test("鲸鱼档 HSCAN 分页期间 apply：初始 ver 钉住混合快照并 fail-closed", async () => {
  const { uid: u } = await seedFullUser("whale_race");
  const c = clientFor(u);
  const total = WHALE_FIELDS + 300;
  for (let i = 0; i < total; i += 500) {
    const fields: string[] = [];
    for (let j = i; j < Math.min(i + 500, total); j++) { fields.push(`race${j}`, `before${j}`); }
    await c.hset(kUser(u), ...fields);
  }
  await makeCold(u);
  const op = deriveOpId(u, 0, "whale-scan-race", "v1");
  let injected = false;
  _freezeTestHooks.afterUserScanPage = async () => {
    if (injected) { return; }
    injected = true;
    assert.equal(await redisApply(u, op, [
      { kind: "item", itemId: 31, count: 1 },
      { kind: "setField", field: "nickname", value: "scan-writer" },
    ]), "ok");
  };
  try {
    assert.equal(await freezeUser(u, freezeLease), "lost");
  } finally {
    delete _freezeTestHooks.afterUserScanPage;
  }

  assert.equal(injected, true, "真实 Redis HSCAN 至少返回一个分页并触发并发 writer");
  assert.equal(await archiveRow(u), null, "混合扫描不得写入 PREPARED authority");
  assert.equal(await c.hlen(kArchiveProof(u)), 0);
  assert.equal(await c.exists(kUser(u)), 1, "热档必须保留");
  assert.equal(await c.hget(kUser(u), "nickname"), "scan-writer");
  assert.equal(await c.hget(kBag(u, 31 % 4), "31"), "1");
});

// ── fence 单调性回归（评审修正：冷档期计数反超 hwm 时 thaw 不得回退） ─────────

test("fence 不回退：冷档期计数器发号反超 hwm → thaw 取 MAX，滞留大号 fence 仍被拦", async () => {
  const { uid: u } = await seedFullUser("fmax");
  const c = clientFor(u);
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  const hwm = (await archiveRow(u))!.fenceHwm;

  // 冷档期长跑场景：计数器（评审修正后保留不删）继续发号，反超 hwm
  await c.incrby(kFence(u), 5);
  const inflated = Number(await c.get(kFence(u)));
  assert.ok(inflated > hwm, "构造前提：计数器已反超 hwm");

  await ensureLive(u); // thaw：旧实现绝对写回 hwm（回退！），修正后取 MAX(计数器, hwm)

  const counter = Number(await c.get(kFence(u)));
  const hashFence = Number(await c.hget(kUser(u), "fence"));
  assert.ok(counter >= inflated, `计数器不回退（${counter} ≥ ${inflated}）——旧实现此处 = ${hwm}`);
  assert.equal(hashFence, counter, "hash fence 与计数器一致（约束 3）");

  // 红线：滞留 writer 持有「hwm < fence ≤ 反超值」的号——旧实现回退后它能穿过 CAS
  const zombieFence = hwm + 2;
  assert.equal(await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(zombieFence), "z", "boom"]), "stale");
  assert.equal(await c.hget(kUser(u), "z"), null, "僵尸写零破坏");
});

test("thawRestore overwrite 契约：计数器反超 hwm 也不回退（评审修正：overwrite 分支保留计数器）", async () => {
  // ⚠ 该场景**真实可达**（评审二轮修正认知）：acquireLease 先 INCR 再抢锁，失败抢锁者
  // 也推计数器——resolve 读完计数器到 Lua 执行之间（TOCTOU）计数可反超 hwm。
  // 本用例直测脚本自身契约（旧实现 overwrite 先 UNLINK 计数器再写 hwm：回退、号复用）。
  const { uid: u } = await seedFullUser("pitr2");
  const c = clientFor(u);
  const lease = await acquireLease(u);
  await c.incrby(kFence(u), 800); // 抢锁后计数器反超 hwm（INCR 与 hash fence 无关，合法可达态）
  const inflated = Number(await c.get(kFence(u)));
  const hwm = inflated - 500;
  const snap: ArchiveSnapshot = {
    user: {
      schemaVersion: String(SCHEMA_VERSION), fence: "0", ver: "50", star: "7",
      lastActiveAt: String(Date.now()), characterRegistrationCheckedAt: "0",
    },
    bag: [{}, {}, {}, {}],
    applied: [],
  };
  assert.equal(await thawRestore(u, lease.fence, hwm, snap, true, newFreezeId()), "ok");
  await lease.release();

  const counter = Number(await c.get(kFence(u)));
  assert.ok(counter >= inflated, `计数器不回退（${counter} ≥ ${inflated}）——旧实现此处 = ${hwm}`);
  assert.equal(await c.hget(kUser(u), "fence"), String(counter), "hash fence = MAX（与计数器一致）");
  assert.equal(await c.hget(kUser(u), "star"), "7", "档按快照恢复（overwrite）");
});

// ── withUser 冷档自愈（评审接线：通用写路径 cold → 锁外 ensureLive → 重试） ──

test("withUser 对冻结用户：自动 ensureLive 解冻后写入成功（不再裸抛 THAWING）", async () => {
  const { uid: u } = await seedFullUser("uowcold");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");
  assert.equal(await clientFor(u).exists(kUser(u)), 0, "前置：档已冻结");

  await withUser(u, async (uow) => { uow.set("maxRound", "77"); });

  assert.equal(await clientFor(u).hget(kUser(u), "maxRound"), "77", "解冻后写入生效");
  assert.equal(await clientFor(u).hget(kUser(u), "stamina"), "5", "冻结前字段随快照恢复");
  assert.equal(await archiveRow(u), null, "thaw 完成删 archive 行");
});

// ── withUser 冷档预检（评审二轮：条件读后写不得假成功，callback 冷路径零执行） ──

test("withUser 冷档条件读后写：预检先解冻，loadFields 读到归档真值（guild.leave 反例封堵）", async () => {
  const { uid: u } = await seedFullUser("precheck");
  await withUser(u, async (uow) => { uow.set("guildId", "3"); });
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");

  // 复刻 guild.leave 的条件读后写形态：旧实现下 loadFields 全 null → gid=0 → 空 commit 假成功
  let fnRuns = 0;
  const prevGid = await withUser(u, async (uow) => {
    fnRuns++;
    const f = await uow.loadFields(["guildId"]);
    const gid = Number(f.guildId ?? 0);
    if (gid > 0) { uow.set("guildId", "0"); }
    return gid;
  });
  assert.equal(prevGid, 3, "读到归档真值而非 0（旧实现此处 = 0 假成功）");
  assert.equal(fnRuns, 1, "冷路径 callback 零执行：预检先抛 cold，解冻后 callback 恰好跑一次");
  assert.equal(await clientFor(u).hget(kUser(u), "guildId"), "0", "退会写入生效");
  assert.equal(await archiveRow(u), null, "已解冻删行");
});

test("withUser 冷档并发写：singleFlight 合并解冻、无死锁，两笔写都落", async () => {
  const { uid: u } = await seedFullUser("precheck2");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");

  const [a, b] = await Promise.all([
    withUser(u, async (uow) => { uow.set("maxRound", "21"); return "a"; }),
    withUser(u, async (uow) => { uow.set("stamina", "9"); return "b"; }),
  ]);
  assert.deepEqual([a, b], ["a", "b"]);
  const f = await clientFor(u).hmget(kUser(u), "maxRound", "stamina");
  assert.deepEqual(f, ["21", "9"], "两笔并发冷写都生效（thaw singleFlight + per-uid 锁串行）");
});

test("withUser 冷档 + thaw 限流：ThawingError 原样上抛（客户端拿 THAWING 退避），档保持冻结", async () => {
  const { uid: u } = await seedFullUser("precheck3");
  await makeCold(u);
  assert.equal(await freezeUser(u, freezeLease), "frozen");

  const save = { tokens: thawLimiter.tokens, rate: thawLimiter.ratePerSec };
  thawLimiter.tokens = 0;
  thawLimiter.ratePerSec = 0;
  try {
    await assert.rejects(withUser(u, async (uow) => { uow.set("x", "1"); }), ThawingError);
  } finally {
    thawLimiter.tokens = save.tokens;
    thawLimiter.ratePerSec = save.rate;
  }
  assert.equal(await clientFor(u).exists(kUser(u)), 0, "限流未解冻，档保持冻结");
  assert.ok(await archiveRow(u), "archive 行未动");
});
