/**
 * 冷档冻结 worker —— **独立单例进程**（[08 · Freeze](../../../../docs/server/08-cold-archive.md#freeze)），
 * 含清理任务 janitor（10·M9：合入本文件）。
 *
 * - `singleton_lease('freeze_worker')` 抢占单例（09·X7）；user_archive upsert 走
 *   withLeaseTx（续租守卫与业务写同一 MySQL 事务、守卫作第一句、0 行即自杀）。
 * - `FREEZE_ENABLED` 默认关（09·F5：按内存水位 used_memory/maxmemory > 0.6 启用，
 *   ⛔ 不按注册数）——不开则空转心跳只续租。
 * - 候选来自 active:lru:{bucket}（⛔ 不 SCAN 遍历百万 key，08）；hash-tag 是 {bucket}
 *   不是 {uid}，走 indexClientFor 两次寻址（08）。
 * - freeze/thaw 是全系统最慢的操作，5s 锁盖不住：withUserLock 开看门狗
 *   （renewMs=LOCK_RENEW_MS，09·L6）；破坏性 UNLINK 在 freezeCommit Lua 内复检锁归属（09·L4）。
 * - ⚠ PITR 恢复后必须**先停本 worker 与 janitor**，做完 fence 对账再放开（09·F5 / 06·DR）。
 *
 * 启动：node --import tsx src/archive/freezeWorker.ts
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type Redis from "ioredis";
import {
  ACTIVE_LRU_BUCKETS, COLD_DAYS, FREEZE_ENABLED, FREEZE_RATE, LEASE_TTL_S,
  LOCK_RENEW_MS, OUTBOX_DEAD, OUTBOX_PENDING, SCHEMA_VERSION, WHALE_FIELDS,
} from "../infra/config";
import {
  activeLruBucketOf, kActiveLru, kApplied, kBagAll, kFence, kSess, kUser,
} from "../infra/keys";
import { clientFor, indexClientFor } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import {
  LeaseLostError, makeHolderId, tryAcquireLease, withLeaseTx, type SingletonLease,
} from "../infra/lease";
import { withUserLock } from "../core/locks";
import { freezeCommit, type ArchiveSnapshot } from "./archiveScripts";
import { archiveCounters, InProcTokenBucket, resolve, restoreFromArchive } from "./thaw";

const COLD_MS = COLD_DAYS * 86_400_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ───────────────────── 核心告警计数（10·M9） ─────────────────────

const freezeCounters = {
  frozen: 0,
  skipped: 0,
  /** freezeCommit 返回 lost 次数。lost/changed 比例高 = 锁 TTL 太短或 freeze 太慢（08 · 监控）。 */
  commitLost: 0,
  /** freezeCommit 返回 changed 次数（快照期间玩法写，如 relayer applyEffect）。 */
  commitChanged: 0,
  /** 索引幽灵项清除数（freeze 崩溃在 ZREM 前 / ZREM 失败的残留，08）。 */
  ghosts: 0,
  /** janitor 删除的陈旧 archive 残留行。 */
  janitorDeleted: 0,
  /** janitor 的 ARCHIVE_NEWER 修复数。非 0 说明发生过 PITR 或异常回滚（08 · 监控）。 */
  janitorRepaired: 0,
};

/** M9 核心告警数据源：冻结侧计数 + thaw 侧计数（USER_DATA_LOST ≡0 告警线）合并导出。 */
export function freezeStats(): Record<string, number> {
  return { ...freezeCounters, ...archiveCounters };
}

/** FREEZE_RATE uid/s per-instance（峰期 0 → sweep 直接空转，08 · 限速与调度）。 */
export const freezeLimiter = new InProcTokenBucket(FREEZE_RATE, Math.max(FREEZE_RATE, 1));

/**
 * 测试注入点：快照读取之后、MySQL upsert 之前调用——模拟「快照期间并发玩法写 / 锁易主」
 * 竞态窗口（10·M9 DoD：freeze 与玩法写并发 → 'changed' 放弃）。生产恒为空。
 */
export const _freezeTestHooks: { afterSnapshot?: (uid: string) => Promise<void> } = {};

// ───────────────────── 快照读取（09·R1 唯一豁免点） ─────────────────────

/**
 * 读整个 Hash：字段数 ≤ WHALE_FIELDS 用 HGETALL（**全设计唯一允许 HGETALL 的地方**：
 * 用户已冷、不在热路径、有限速、只在低峰跑，09·R1 豁免）；鲸鱼档改 HSCAN 分块，
 * 别一次 HGETALL 阻塞整个实例 5–10ms（08 · 限速与调度）。
 *
 * HSCAN 非点时一致——快照期间若有 applyEffect 混入，靠 freezeCommit 的 ver 复检兜底
 * （所以调用方必须**先读 user（定格 verAtRead）再读 bag/applied**，见 freezeUser）。
 */
async function readHashSafe(r: Redis, key: string): Promise<Record<string, string>> {
  const len = await r.hlen(key);
  if (len === 0) { return {}; }
  if (len <= WHALE_FIELDS) { return r.hgetall(key); }
  const out: Record<string, string> = {};
  let cursor = "0";
  do {
    const [next, kv] = await r.hscan(key, cursor, "COUNT", 512);
    for (let i = 0; i < kv.length; i += 2) { out[kv[i]] = kv[i + 1]; }
    cursor = next;
  } while (cursor !== "0");
  return out;
}

/** 冻结前置闸（09·F2）：status 0(pending)/2(dead) 都拦——dead 还等着人工重放。 */
async function hasOpenOutbox(uid: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM gameplay_outbox WHERE user_id = ? AND status IN (?, ?) LIMIT 1",
    [uid, OUTBOX_PENDING, OUTBOX_DEAD]);
  return rows.length > 0;
}

/** 最后活跃时间：user hash 的 lastActiveAt（索引可由它全量重建，08）与索引 score 取大。 */
async function lastActiveMs(uid: string): Promise<number> {
  const bucket = activeLruBucketOf(uid);
  const [hashTs, score] = await Promise.all([
    clientFor(uid).hget(kUser(uid), "lastActiveAt"),
    indexClientFor(bucket).zscore(kActiveLru(bucket), uid),
  ]);
  return Math.max(Number(hashTs ?? 0), Number(score ?? 0));
}

async function zremIndex(uid: string): Promise<void> {
  const bucket = activeLruBucketOf(uid);
  await indexClientFor(bucket).zrem(kActiveLru(bucket), uid);
}

// ───────────────────── freezeUser（08 原文结构） ─────────────────────

/**
 * 冻结单个 uid。锁内双检 → 快照 → MySQL upsert（fence_hwm 取 GREATEST）→ freezeCommit Lua。
 * 返回 'frozen' | 'skipped' | 'lost'（lost 含 changed：放弃本轮，archive 行留给 janitor 收敛）。
 */
export async function freezeUser(uid: string, lease: SingletonLease): Promise<"frozen" | "skipped" | "lost"> {
  return withUserLock(uid, async (fence) => {
    const r = clientFor(uid);

    // ── 锁内双检（⚠ 锁外查一次不够：候选可能在排队等锁时刚提交 pending 行 / 刚上线，08 约束 2）──
    if (await r.exists(kSess(uid))) { freezeCounters.skipped++; return "skipped"; }
    if (await hasOpenOutbox(uid)) { freezeCounters.skipped++; return "skipped"; } // 09·F2 锁内复查
    if (await lastActiveMs(uid) > Date.now() - COLD_MS) { freezeCounters.skipped++; return "skipped"; }

    // ── ① 读快照。顺序敏感：**user 先读**定格 verAtRead——之后任何 applyEffect 都会 bump ver，
    //     被 ③ 的 ver 复检拦下；若 bag 先读，「旧 bag + 新 ver」的撕裂快照会漏检（08）──
    const user = await readHashSafe(r, kUser(uid));
    if (Object.keys(user).length === 0) {
      await zremIndex(uid); // 快照为空：按 08「所有 skip 分支也必须 ZREM」清索引，防毒化吞吐
      freezeCounters.skipped++;
      return "skipped";
    }
    const bag: Record<string, string>[] = [];
    for (const k of kBagAll(uid)) { bag.push(await readHashSafe(r, k)); }
    const applied = await r.zrange(kApplied(uid), 0, -1, "WITHSCORES");
    const snapshot: ArchiveSnapshot = { user, bag, applied };

    const verAtRead = user.ver ?? "0";
    // fence 高水位读自计数器（含本次抢锁的 INCR，恒 ≥ 一切已发出的 fence）：thaw 恢复到它
    // 之后，任何 pre-freeze 滞留 writer 的 casHset 都会 'stale'（08 约束 3）
    const fenceHwm = Number(await r.get(kFence(uid)) ?? 0);

    if (_freezeTestHooks.afterSnapshot) { await _freezeTestHooks.afterSnapshot(uid); }

    // ── ② 先写 MySQL（幂等 upsert，fence_hwm 取大，05/08）。lease 守卫同事务（09·X7）──
    await withLeaseTx(lease, async (conn) => {
      const [w] = await conn.execute<ResultSetHeader>(
        `INSERT INTO user_archive (user_id, snapshot, schema_version, fence_hwm)
         VALUES (?, CAST(? AS JSON), ?, ?) AS new
         ON DUPLICATE KEY UPDATE
           snapshot = new.snapshot, schema_version = new.schema_version,
           fence_hwm = GREATEST(user_archive.fence_hwm, new.fence_hwm),
           frozen_at = NOW(3)`,
        [uid, JSON.stringify(snapshot), Number(user.schemaVersion ?? SCHEMA_VERSION), fenceHwm]);
      // -FOUND_ROWS 下 ODKU：插入=1 / 更新=2 / 完全未变=0——frozen_at=NOW(3) 恒变，0 即异常
      if (w.affectedRows === 0) { throw new Error(`user_archive upsert 0 行 uid=${uid}`); }
    });

    // ── ③ Lua：复检锁归属 + ver 未变 → 才 UNLINK。原子，不可能盲删（09·L4）──
    const res = await freezeCommit(uid, fence, verAtRead);
    if (res !== "ok") {
      // 放弃：未删任何东西，archive 行陈旧（hwm ≤ 计数器）→ janitor resolve 判 LIVE 后删（08 崩溃表）
      if (res === "lost") { freezeCounters.commitLost++; } else { freezeCounters.commitChanged++; }
      return "lost";
    }

    freezeCounters.frozen++;
    await zremIndex(uid); // 失败/崩溃留幽灵项 → 候选筛选时 EXISTS 过滤并 ZREM 自愈（08 崩溃表）
    return "frozen";
  }, { renewMs: LOCK_RENEW_MS }); // 大 Hash 读 + JSON 序列化 + MySQL 大 blob 写，5s 盖不住（09·L6）
}

// ───────────────────── 候选扫描 ─────────────────────

export interface SweepStats { candidates: number; ghosts: number; frozen: number; skipped: number; lost: number }

/**
 * 单轮扫描：按 score < now - COLD_DAYS 取候选 + 幽灵项顺手清除（08 · 活跃索引）。
 * 速率 FREEZE_RATE per-instance；峰期强制 0 → 本轮直接空转（08 · 限速与调度）。
 */
export async function sweepOnce(lease: SingletonLease, perBucket = 100): Promise<SweepStats> {
  const stats: SweepStats = { candidates: 0, ghosts: 0, frozen: 0, skipped: 0, lost: 0 };
  if (FREEZE_RATE <= 0) { return stats; } // 峰期 0：不扫
  const cutoff = Date.now() - COLD_MS;

  for (let b = 0; b < ACTIVE_LRU_BUCKETS; b++) {
    const idx = indexClientFor(b);
    const key = kActiveLru(b);
    const candidates = await idx.zrangebyscore(key, "-inf", `(${cutoff}`, "LIMIT", 0, perBucket);
    for (const uid of candidates) {
      stats.candidates++;
      // 幽灵项：档已不在（freeze 崩溃在 ZREM 前 / ZREM 失败），清掉索引，
      // 否则每轮白吃一把锁 + 一次大 Hash 读，毒化吞吐且永不自愈（08）
      if ((await clientFor(uid).exists(kUser(uid))) === 0) {
        await idx.zrem(key, uid);
        freezeCounters.ghosts++;
        stats.ghosts++;
        continue;
      }
      while (!freezeLimiter.take()) { await sleep(Math.ceil(1000 / Math.max(freezeLimiter.ratePerSec, 1))); }
      try {
        const r = await freezeUser(uid, lease);
        stats[r === "frozen" ? "frozen" : r === "lost" ? "lost" : "skipped"]++;
        // skip（sess 在线 / outbox 未清 / 复核发现仍活跃）不 ZREM：条件消退后下轮重试；
        // 索引条目由 touchActive 维持新鲜，误删会让「此后零活动」的 uid 永远漏冻
      } catch (e) {
        if (e instanceof LeaseLostError) { throw e; } // 单例已被顶替：立即上抛自杀（09·X7）
        console.error(`[freeze] freezeUser 失败 uid=${uid}`, e); // 单个失败不拖垮整轮
      }
    }
  }
  return stats;
}

// ───────────────────── janitor 清理任务（08） ─────────────────────

/**
 * 清理任务：⚠ **必须持 `lock:{uid}`**（08——不持锁会撞上 freeze「写 archive → UNLINK」的
 * 正常中间态，把整档删光）。低频跑（每小时）。
 *
 * - resolve 判 LIVE 且有 archive 行 → 删陈旧残留行（freeze ②③ 间崩溃 / thaw 删行前崩溃的收敛）
 * - resolve 判 ARCHIVE_NEWER → thawOverwrite 修复（PITR 后 Redis 是旧副本，08）
 *
 * 无锁 EXISTS 只是**预筛**（跳过海量正常冷档 FROZEN 行，不给它们上锁）；
 * 判决一律在锁内 resolve 重做。
 */
export async function janitorSweep(lease: SingletonLease, batch = 200): Promise<{ scanned: number; deleted: number; repaired: number }> {
  const out = { scanned: 0, deleted: 0, repaired: 0 };
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT user_id FROM user_archive ORDER BY frozen_at LIMIT ${Math.floor(batch)}`);
  for (const row of rows) {
    const uid = String(row.user_id);
    out.scanned++;
    if ((await clientFor(uid).exists(kUser(uid))) === 0) { continue; } // 正常冷档：无锁预筛跳过
    await withUserLock(uid, async (fence) => {
      const st = await resolve(uid); // 锁内复判（09·F1）
      if (st.kind === "LIVE" && st.row) {
        await withLeaseTx(lease, async (conn) => { // 业务删行与续租守卫同事务（09·X7）
          await conn.execute<ResultSetHeader>("DELETE FROM user_archive WHERE user_id = ?", [uid]);
        });
        freezeCounters.janitorDeleted++;
        out.deleted++;
      } else if (st.kind === "ARCHIVE_NEWER") {
        // PITR 修复：UNLINK 陈旧 Redis 档 → 从 archive 恢复（Lua 原子，overwrite=1）
        await restoreFromArchive(uid, fence, st.row!, true);
        freezeCounters.janitorRepaired++;
        out.repaired++;
      }
      // FROZEN（预筛后被并发 freeze 变冷）→ 什么都不做，留给 thaw
    }, { renewMs: LOCK_RENEW_MS });
  }
  return out;
}

// ───────────────────── 主循环（独立进程） ─────────────────────

const JANITOR_INTERVAL_MS = 3_600_000; // 低频：每小时（08 · 清理任务）
const SWEEP_IDLE_MS = 5_000;

export async function freezeWorkerMain(): Promise<never> {
  const holder = makeHolderId();
  let lease: SingletonLease | null = null;
  while (!lease) {
    lease = await tryAcquireLease("freeze_worker", holder);
    if (!lease) { await sleep(LEASE_TTL_S * 1000 / 3); }
  }
  console.log(`[freeze] lease acquired holder=${holder} fence=${lease.fenceToken}`);

  let lastJanitor = 0;
  let lastStats = 0;
  for (;;) {
    try {
      if (!FREEZE_ENABLED) {
        // 默认关（09·F5：内存水位 > 0.6 才开）：空转心跳，只续租不动业务
        await withLeaseTx(lease, async () => { /* 纯续租 */ });
        await sleep(LEASE_TTL_S * 1000 / 3);
      } else {
        await sweepOnce(lease);
        if (Date.now() - lastJanitor > JANITOR_INTERVAL_MS) {
          lastJanitor = Date.now();
          await janitorSweep(lease);
        }
        await sleep(SWEEP_IDLE_MS);
      }
      if (Date.now() - lastStats > 30_000) {
        lastStats = Date.now();
        const s = freezeStats();
        // USER_DATA_LOST ≡0 告警线；lost/changed 比例高 = 锁 TTL 太短或 freeze 太慢（08 · 监控）
        const level = s.userDataLost > 0 ? "☠" : s.commitLost + s.commitChanged > s.frozen ? "⚠" : "·";
        console.log(`[freeze] ${level} enabled=${FREEZE_ENABLED} frozen=${s.frozen} thawed=${s.thawed} `
          + `lost=${s.commitLost} changed=${s.commitChanged} ghosts=${s.ghosts} dataLost=${s.userDataLost}`);
      }
    } catch (e) {
      if (e instanceof LeaseLostError) {
        console.error("[freeze] 守卫 UPDATE 0 行——已被顶替，自杀（09·X7）");
        process.exit(1);
      }
      console.error("[freeze] loop 失败", e);
      await sleep(SWEEP_IDLE_MS);
    }
  }
}

// 独立进程入口（对齐 economy/relayer.ts 写法）
const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  freezeWorkerMain().catch((e) => { console.error("[freeze] 致命错误", e); process.exit(1); });
}
