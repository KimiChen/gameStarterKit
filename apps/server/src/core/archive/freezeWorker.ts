/**
 * 冷档冻结 worker —— **独立单例进程**（[08 · Freeze](docs/SERVER.md)），
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
 * 启动：node --import tsx src/core/archive/freezeWorker.ts
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type Redis from "ioredis";
import {
  ACTIVE_LRU_BUCKETS, ARCHIVE_MAX_BYTES_PER_ZONE, ARCHIVE_MAX_ROWS_PER_ZONE,
  ARCHIVE_MAX_SNAPSHOT_BYTES, ARCHIVE_ZONES, COLD_DAYS, FREEZE_ENABLED,
  FREEZE_RATE, FREEZE_REDIS_HIGH_WATERMARK, FREEZE_SWEEP_BUDGET, LEASE_TTL_S,
  LOCK_RENEW_MS, OUTBOX_DEAD, OUTBOX_PENDING, SCHEMA_VERSION, WHALE_FIELDS,
  normalizeSId,
} from "../infra/config";
import {
  activeLruBucketOf, currentZoneId, kActiveLru, kApplied, kAppliedPayload,
  kArchiveProof, kBagAll, kFence, kSess, kUser, zoneCtx,
} from "../infra/keys";
import { clientFor, indexClientFor } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import {
  LeaseLostError, makeHolderId, tryAcquireLease, withLeaseTx, type SingletonLease,
} from "../infra/lease";
import { withUserLock } from "../locks";
import { freezeCommit, prepareArchiveCandidate, type ArchiveSnapshot } from "./archiveScripts";
import {
  archiveCounters, InProcTokenBucket, resolve, restoreActiveIndex, restoreFromArchive,
} from "./thaw";
import { optionalStoredInt, storedInt } from "../infra/numbers";
import { memoryPressureAllowsFreeze, utf8SnapshotBytes } from "./capacity";
import {
  archiveJsonStorageBytes, deleteArchiveWithUsage, lockArchiveStorageRow,
  lockArchiveUsage, planArchiveAdmission, rebuildArchiveUsage, writeArchiveUsage,
} from "./usageLedger";
import {
  ARCHIVE_PHASE_COMMITTED, ARCHIVE_PHASE_PREPARED, newFreezeId,
} from "./protocol";
import { validateArchiveSnapshotSchema } from "./lazyMigrate";
import { migrateLiveUserSchemaLocked } from "../liveSchema";

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
  /** 单档超过 admission 上限，热档保留。 */
  oversize: 0,
  /** 每区行数/字节投影超过上限，热档保留。 */
  capacityRejected: 0,
  /** 容量统计查询或返回值异常；fail-closed。 */
  capacityErrors: 0,
  /** Redis 尚未达到高水位（含 maxmemory=0），本候选不冻结。 */
  waterlineSkipped: 0,
  /** Redis INFO 请求或解析异常；fail-closed。 */
  waterlineErrors: 0,
  /** Redis 已完成冻结、MySQL phase finalize 待恢复的次数。 */
  finalizePending: 0,
  /** proof HASH 超过协议上限，拒绝新增 attempt 并保留热档。 */
  proofCapacityRejected: 0,
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
export interface ArchiveCapacityLimits {
  maxSnapshotBytes: number;
  maxRowsPerZone: number;
  maxBytesPerZone: number;
}

export const _freezeTestHooks: {
  afterUserScanPage?: (uid: string, cursor: string) => Promise<void>;
  afterSnapshot?: (uid: string) => Promise<void>;
  afterArchiveUpsert?: (uid: string, sId: number) => Promise<void>;
  afterFreezeCommit?: (uid: string, sId: number, freezeId: string) => Promise<void>;
  capacityLimits?: ArchiveCapacityLimits;
} = {};

// ───────────────────── 快照读取（09·R1 唯一豁免点） ─────────────────────

/**
 * 读整个 Hash：字段数 ≤ WHALE_FIELDS 用 HGETALL（**全设计唯一允许 HGETALL 的地方**：
 * 用户已冷、不在热路径、有限速、只在低峰跑，09·R1 豁免）；鲸鱼档改 HSCAN 分块，
 * 别一次 HGETALL 阻塞整个实例 5–10ms（08 · 限速与调度）。
 *
 * HSCAN 非点时一致——快照期间若有 applyEffect 混入，靠 freezeCommit 的 ver 复检兜底
 * （所以调用方必须**先读 user（定格 verAtRead）再读 bag/applied**，见 freezeUser）。
 */
async function readHashSafe(
  r: Redis,
  key: string,
  afterScanPage?: (cursor: string) => Promise<void>,
): Promise<Record<string, string>> {
  const len = await r.hlen(key);
  if (len === 0) { return {}; }
  if (len <= WHALE_FIELDS) { return r.hgetall(key); }
  const out: Record<string, string> = {};
  let cursor = "0";
  do {
    const [next, kv] = await r.hscan(key, cursor, "COUNT", 512);
    for (let i = 0; i < kv.length; i += 2) { out[kv[i]] = kv[i + 1]; }
    cursor = next;
    if (afterScanPage) { await afterScanPage(cursor); }
  } while (cursor !== "0");
  return out;
}

export type PinnedUserHashRead =
  | { readonly outcome: "ok"; readonly user: Record<string, string>; readonly verAtRead: string }
  | { readonly outcome: "empty"; readonly verAtRead: string }
  | { readonly outcome: "changed"; readonly verAtRead: string };

/** Pin `ver` before HSCAN begins. The explicit result makes a mixed whale scan
 * impossible to accidentally treat as an ordinary snapshot in freezeUser. */
export async function readPinnedUserHash(
  redis: Redis,
  key: string,
  afterScanPage?: (cursor: string) => Promise<void>,
): Promise<PinnedUserHashRead> {
  const verAtRead = await redis.hget(key, "ver");
  if (verAtRead === null) { throw new Error("user.ver 缺失"); }
  storedInt(verAtRead, "user.ver", { min: 0, max: Number.MAX_SAFE_INTEGER });
  const user = await readHashSafe(redis, key, afterScanPage);
  if (Object.keys(user).length === 0) { return { outcome: "empty", verAtRead }; }
  if (user.ver !== verAtRead) { return { outcome: "changed", verAtRead }; }
  return { outcome: "ok", user, verAtRead };
}

/** 冻结前置闸（09·F2）：status 0(pending)/2(dead) 都拦——dead 还等着人工重放。 */
async function hasOpenOutbox(uid: string, sId: number): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM gameplay_outbox WHERE user_id = ? AND server_id = ? AND status IN (?, ?) LIMIT 1",
    [uid, sId, OUTBOX_PENDING, OUTBOX_DEAD]);
  return rows.length > 0;
}

const productionCapacityLimits: ArchiveCapacityLimits = {
  maxSnapshotBytes: ARCHIVE_MAX_SNAPSHOT_BYTES,
  maxRowsPerZone: ARCHIVE_MAX_ROWS_PER_ZONE,
  maxBytesPerZone: ARCHIVE_MAX_BYTES_PER_ZONE,
};

/** 最后活跃时间：user hash 的 lastActiveAt（索引可由它全量重建，08）与索引 score 取大。 */
async function lastActiveMs(uid: string): Promise<number> {
  const bucket = activeLruBucketOf(uid);
  const [hashTs, score] = await Promise.all([
    clientFor(uid).hget(kUser(uid), "lastActiveAt"),
    indexClientFor(bucket).zscore(kActiveLru(bucket), uid),
  ]);
  return Math.max(
    optionalStoredInt(hashTs, 0, "user.lastActiveAt", { min: 0, max: Number.MAX_SAFE_INTEGER }),
    optionalStoredInt(score, 0, "active:lru score", { min: 0, max: Number.MAX_SAFE_INTEGER }),
  );
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
export async function freezeUser(
  uid: string,
  lease: SingletonLease,
  sId = currentZoneId(),
): Promise<"frozen" | "skipped" | "lost"> {
  const zone = normalizeSId(sId);
  if (zone === null) { throw new RangeError(`freezeUser sId 非法：「${String(sId)}」`); }
  return zoneCtx.run({ sId: zone }, () => withUserLock(uid, async (fence) => {
    const r = clientFor(uid);

    // ── 锁内双检（⚠ 锁外查一次不够：候选可能在排队等锁时刚提交 pending 行 / 刚上线，08 约束 2）──
    // 先按本区 fence 判权威。PITR 后 archive 较新时必须先恢复，绝不能把旧热档写回 archive。
    const authority = await resolve(uid, zone);
    if (authority.kind === "ARCHIVE_NEWER") {
      archiveCounters.archiveNewerRestored++;
      await restoreFromArchive(uid, fence, authority.row!, true);
      freezeCounters.skipped++;
      return "skipped";
    }
    if (authority.kind === "FROZEN" || authority.kind === "ABSENT") {
      await zremIndex(uid);
      freezeCounters.skipped++;
      return "skipped";
    }
    if (authority.kind === "CONFLICT") {
      freezeCounters.skipped++;
      return "skipped";
    }
    // freeze 已持 per-user 锁；合法 N-1 必须先原子迁到 N，再钉 ver 读快照。
    // future/corrupt/WRONGTYPE 在这里首写前失败，不得生成 PREPARED/proof 或删热档。
    await migrateLiveUserSchemaLocked(uid, fence);
    if (await r.exists(kSess(uid, zone))) { freezeCounters.skipped++; return "skipped"; }
    if (await hasOpenOutbox(uid, zone)) { freezeCounters.skipped++; return "skipped"; } // 09·F2 锁内复查
    if (await lastActiveMs(uid) > Date.now() - COLD_MS) { freezeCounters.skipped++; return "skipped"; }

    // ── ① 读快照。顺序敏感：**user 先读**定格 verAtRead——之后任何 applyEffect 都会 bump ver，
    //     被 ③ 的 ver 复检拦下；若 bag 先读，「旧 bag + 新 ver」的撕裂快照会漏检（08）──
    const userRead = await readPinnedUserHash(
      r,
      kUser(uid),
      _freezeTestHooks.afterUserScanPage
        ? (cursor) => _freezeTestHooks.afterUserScanPage!(uid, cursor)
        : undefined,
    );
    if (userRead.outcome === "empty") {
      await zremIndex(uid); // 快照为空：按 08「所有 skip 分支也必须 ZREM」清索引，防毒化吞吐
      freezeCounters.skipped++;
      return "skipped";
    }
    // HSCAN is not a point-in-time read. Pin ver before the first page and
    // reject a mixed scan immediately; FREEZE_COMMIT checks the same pinned
    // value again for writes that land after the final page.
    if (userRead.outcome === "changed") {
      freezeCounters.commitChanged++;
      return "lost";
    }
    const { user, verAtRead } = userRead;
    const schemaVersion = storedInt(user.schemaVersion, "user.schemaVersion", {
      min: 1,
      max: SCHEMA_VERSION,
    });
    const bag: Record<string, string>[] = [];
    for (const k of kBagAll(uid)) { bag.push(await readHashSafe(r, k)); }
    const applied = await r.zrange(kApplied(uid), 0, -1, "WITHSCORES");
    const appliedPayload = await readHashSafe(r, kAppliedPayload(uid));
    const snapshot: ArchiveSnapshot = { user, bag, applied, appliedPayload };
    validateArchiveSnapshotSchema(snapshot, schemaVersion);

    const limits = _freezeTestHooks.capacityLimits ?? productionCapacityLimits;
    const snapshotBytes = utf8SnapshotBytes(JSON.stringify(snapshot));
    if (snapshotBytes > limits.maxSnapshotBytes) {
      freezeCounters.oversize++;
      freezeCounters.skipped++;
      return "skipped";
    }
    // fence 高水位读自计数器（含本次抢锁的 INCR，恒 ≥ 一切已发出的 fence）：thaw 恢复到它
    // 之后，任何 pre-freeze 滞留 writer 的 casHset 都会 'stale'（08 约束 3）
    const fenceHwm = optionalStoredInt(await r.get(kFence(uid)), 0, "fence counter", { min: 0, max: Number.MAX_SAFE_INTEGER });

    const freezeId = newFreezeId();
    const expectedArchive = authority.row;
    const prepared = await prepareArchiveCandidate(
      uid,
      fence,
      verAtRead,
      freezeId,
      expectedArchive?.freezeId ?? null,
    );
    if (prepared !== "ok") {
      if (prepared === "proof_full") {
        freezeCounters.proofCapacityRejected++;
        freezeCounters.skipped++;
        console.error(`[freeze] archive proof 超过上限 uid=${uid} sId=${zone}`);
        return "skipped";
      }
      if (prepared === "lost") { freezeCounters.commitLost++; } else { freezeCounters.commitChanged++; }
      return "lost";
    }
    const snapshotJson = JSON.stringify(snapshot);

    if (_freezeTestHooks.afterSnapshot) { await _freezeTestHooks.afterSnapshot(uid); }

    // ── ② lease 使 freeze 成为唯一增加 archive 用量的 writer；同事务锁定 O(1)
    // zone ledger 与 `(uid,sId)` 行，admission、upsert 和 delta 更新原子提交。
    let archiveOutcome: "accepted" | "capacity" | "stale";
    try {
      archiveOutcome = await withLeaseTx(lease, async (conn) => {
        const usage = await lockArchiveUsage(conn, zone);
        const existing = await lockArchiveStorageRow(conn, uid, zone);
        const identityMatches = expectedArchive === undefined
          ? existing === null
          : existing !== null
            && existing.freezeId === expectedArchive.freezeId
            && existing.phase === expectedArchive.phase;
        if (!identityMatches) { return "stale"; }
        const incomingStorageBytes = await archiveJsonStorageBytes(conn, snapshotJson);
        const admission = await planArchiveAdmission(
          usage,
          incomingStorageBytes,
          existing?.storageBytes ?? null,
          limits.maxRowsPerZone,
          limits.maxBytesPerZone,
          () => rebuildArchiveUsage(conn, zone),
        );
        if (!admission.projection.allowed) { return "capacity"; }

        let written: ResultSetHeader;
        if (expectedArchive === undefined) {
          [written] = await conn.execute<ResultSetHeader>(
            `INSERT INTO user_archive (
               user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
             ) VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, ?)`,
            [uid, zone, snapshotJson, schemaVersion, fenceHwm, freezeId, ARCHIVE_PHASE_PREPARED],
          );
        } else {
          [written] = await conn.execute<ResultSetHeader>(
            `UPDATE user_archive
                SET snapshot = CAST(? AS JSON), schema_version = ?, frozen_at = NOW(3),
                    fence_hwm = GREATEST(fence_hwm, ?), freeze_id = ?, archive_phase = ?
              WHERE user_id = ? AND server_id = ? AND freeze_id = ? AND archive_phase = ?`,
            [snapshotJson, schemaVersion, fenceHwm, freezeId, ARCHIVE_PHASE_PREPARED,
              uid, zone, expectedArchive.freezeId, expectedArchive.phase],
          );
        }
        if (written.affectedRows !== 1) {
          throw new Error(
            `user_archive identity CAS 行数异常 uid=${uid} sId=${zone} affected=${written.affectedRows}`,
          );
        }
        if (_freezeTestHooks.afterArchiveUpsert) {
          await _freezeTestHooks.afterArchiveUpsert(uid, zone);
        }
        await writeArchiveUsage(conn, zone, admission.projection);
        return "accepted";
      });
    } catch (error) {
      await r.hdel(kArchiveProof(uid), freezeId).catch(() => {});
      if (error instanceof LeaseLostError) { throw error; }
      freezeCounters.capacityErrors++;
      freezeCounters.skipped++;
      console.error(`[freeze] archive ledger/admission 失败 uid=${uid} sId=${zone}`, error);
      return "skipped";
    }
    if (archiveOutcome === "capacity") {
      await r.hdel(kArchiveProof(uid), freezeId);
      freezeCounters.capacityRejected++;
      freezeCounters.skipped++;
      return "skipped";
    }
    if (archiveOutcome === "stale") {
      await r.hdel(kArchiveProof(uid), freezeId);
      freezeCounters.skipped++;
      return "skipped";
    }
    if (expectedArchive?.freezeId) {
      await r.hdel(kArchiveProof(uid), expectedArchive.freezeId);
    }

    // ── ③ Lua：复检锁归属 + ver 未变 → 才 UNLINK。原子，不可能盲删（09·L4）──
    const res = await freezeCommit(uid, zone, fence, verAtRead, freezeId);
    if (res !== "ok") {
      // 只删除本次 PREPARED 行；迟到 worker 的 freeze_id 不能命中新一代行。
      const cleaned = await withLeaseTx(lease, (conn) => deleteArchiveWithUsage(
        conn,
        uid,
        zone,
        { freezeId, phase: ARCHIVE_PHASE_PREPARED },
      ));
      if (cleaned !== "deleted" && cleaned !== "missing" && cleaned !== "mismatch") {
        throw new Error(`PREPARED cleanup 非法结果 uid=${uid} sId=${zone}`);
      }
      await r.hdel(kArchiveProof(uid), freezeId);
      if (res === "lost") { freezeCounters.commitLost++; } else { freezeCounters.commitChanged++; }
      return "lost";
    }

    if (_freezeTestHooks.afterFreezeCommit) {
      await _freezeTestHooks.afterFreezeCommit(uid, zone, freezeId);
    }

    try {
      await withLeaseTx(lease, async (conn) => {
        const [result] = await conn.execute<ResultSetHeader>(
          `UPDATE user_archive SET archive_phase = ?
            WHERE user_id = ? AND server_id = ? AND freeze_id = ? AND archive_phase = ?`,
          [ARCHIVE_PHASE_COMMITTED, uid, zone, freezeId, ARCHIVE_PHASE_PREPARED],
        );
        if (result.affectedRows === 1) { return; }
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT archive_phase FROM user_archive
            WHERE user_id = ? AND server_id = ? AND freeze_id = ? FOR UPDATE`,
          [uid, zone, freezeId],
        );
        if (rows.length === 1 && Number(rows[0].archive_phase) === ARCHIVE_PHASE_COMMITTED) { return; }
        throw new Error(`archive finalize CAS 失配 uid=${uid} sId=${zone} freezeId=${freezeId}`);
      });
    } catch (error) {
      if (error instanceof LeaseLostError) { throw error; }
      freezeCounters.finalizePending++;
      console.error(`[freeze] archive finalize 待恢复 uid=${uid} sId=${zone} freezeId=${freezeId}`, error);
    }

    freezeCounters.frozen++;
    await zremIndex(uid); // 失败/崩溃留幽灵项 → 候选筛选时 EXISTS 过滤并 ZREM 自愈（08 崩溃表）
    return "frozen";
  }, { renewMs: LOCK_RENEW_MS })); // 大 Hash 读 + JSON 序列化 + MySQL 大 blob 写，5s 盖不住（09·L6）
}

// ───────────────────── 候选扫描 ─────────────────────

export interface SweepStats {
  candidates: number;
  ghosts: number;
  frozen: number;
  skipped: number;
  lost: number;
  waterlineSkipped: number;
  waterlineErrors: number;
}

export interface SweepDependencies {
  zones: readonly number[];
  bucketCount: number;
  ratePerSec: number;
  queryCandidates: (sId: number, bucket: number, cutoff: number, limit: number) => Promise<readonly string[]>;
  userExists: (sId: number, uid: string) => Promise<boolean>;
  removeCandidate: (sId: number, bucket: number, uid: string, cutoff: number) => Promise<boolean>;
  deferCandidate: (sId: number, bucket: number, uid: string, cutoff: number) => Promise<void>;
  memoryInfo: (sId: number, uid: string) => Promise<string>;
  freeze: (uid: string, sId: number, lease: SingletonLease) => Promise<"frozen" | "skipped" | "lost">;
  takeRateToken: () => boolean;
  wait: (ms: number) => Promise<void>;
  guardLease: (lease: SingletonLease) => Promise<void>;
}

let sweepSlotCursor = 0;
export function resetSweepCursor(): void { sweepSlotCursor = 0; }

export async function removeGhostCandidate(
  uid: string,
  sId: number,
  bucket: number,
  cutoff: number,
): Promise<boolean> {
  return zoneCtx.run({ sId }, () => withUserLock(uid, async () => {
    const redis = clientFor(uid);
    // A login may have refreshed this candidate after ZRANGEBYSCORE returned.
    // Recheck user/session and score under the same lock as writeGroupSess;
    // never ZREM a newly active uid using a stale query result.
    if (await redis.exists(kUser(uid)) || await redis.exists(kSess(uid, sId))) { return false; }
    const score = await indexClientFor(bucket).zscore(kActiveLru(bucket), uid);
    if (score === null || storedInt(score, "active:lru score", {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    }) >= cutoff) { return false; }
    return (await indexClientFor(bucket).zrem(kActiveLru(bucket), uid)) === 1;
  }));
}

const productionSweepDependencies: SweepDependencies = {
  zones: ARCHIVE_ZONES,
  bucketCount: ACTIVE_LRU_BUCKETS,
  ratePerSec: FREEZE_RATE,
  queryCandidates: async (sId, bucket, cutoff, limit) => zoneCtx.run({ sId }, () =>
    indexClientFor(bucket).zrangebyscore(
      kActiveLru(bucket), "-inf", `(${cutoff}`, "LIMIT", 0, limit)),
  userExists: async (sId, uid) => zoneCtx.run({ sId }, async () =>
    (await clientFor(uid).exists(kUser(uid))) === 1),
  removeCandidate: (sId, bucket, uid, cutoff) => removeGhostCandidate(uid, sId, bucket, cutoff),
  deferCandidate: async (sId, bucket, uid, cutoff) => zoneCtx.run({ sId }, () =>
    indexClientFor(bucket).zadd(kActiveLru(bucket), "XX", "GT", cutoff, uid).then(() => undefined)),
  memoryInfo: async (_sId, uid) => clientFor(uid).info("memory"),
  freeze: (uid, sId, lease) => freezeUser(uid, lease, sId),
  takeRateToken: () => freezeLimiter.take(),
  wait: sleep,
  guardLease: (lease) => withLeaseTx(lease, async () => { /* heartbeat */ }),
};

/**
 * 单轮扫描：按 score < now - COLD_DAYS 取候选 + 幽灵项顺手清除（08 · 活跃索引）。
 * 速率 FREEZE_RATE per-instance；峰期强制 0 → 本轮直接空转（08 · 限速与调度）。
 */
async function runSweepOnce(
  lease: SingletonLease,
  totalBudget: number,
  deps: SweepDependencies,
): Promise<SweepStats> {
  const stats: SweepStats = {
    candidates: 0, ghosts: 0, frozen: 0, skipped: 0, lost: 0,
    waterlineSkipped: 0, waterlineErrors: 0,
  };
  // Every enabled loop consumes the singleton lease even when rate=0, zones
  // are empty, or every bucket is empty. Otherwise an expired worker can keep
  // scanning indefinitely without noticing that a successor took over.
  await deps.guardLease(lease);
  if (deps.ratePerSec <= 0 || deps.zones.length === 0) { return stats; }
  if (!Number.isSafeInteger(totalBudget) || totalBudget < 1) {
    throw new RangeError(`freeze sweep total budget 非法：「${String(totalBudget)}」`);
  }
  if (!Number.isSafeInteger(deps.bucketCount) || deps.bucketCount < 1) {
    throw new RangeError(`freeze sweep bucketCount 非法：「${String(deps.bucketCount)}」`);
  }
  const cutoff = Date.now() - COLD_MS;
  const slotCount = deps.zones.length * deps.bucketCount;
  let remaining = totalBudget;
  let visitedSlots = 0;
  while (remaining > 0 && visitedSlots < slotCount) {
    const slot = sweepSlotCursor % slotCount;
    const sId = deps.zones[Math.floor(slot / deps.bucketCount)];
    const bucket = slot % deps.bucketCount;
    sweepSlotCursor = (slot + 1) % slotCount;
    visitedSlots++;
    const candidates = await zoneCtx.run({ sId }, () =>
      deps.queryCandidates(sId, bucket, cutoff, remaining));
    if (candidates.length > remaining) {
      throw new Error(`freeze candidate query 超出请求预算：${candidates.length} > ${remaining}`);
    }
    // A probe is real Redis work even when the bucket is empty. Charging at
    // least one unit keeps a sparse `zones * buckets` deployment strictly
    // bounded; non-empty slots charge their candidate count, not 1 + count.
    remaining -= Math.max(1, candidates.length);
    for (const uid of candidates) {
      stats.candidates++;
      // 幽灵项：档已不在（freeze 崩溃在 ZREM 前 / ZREM 失败），清掉索引，
      // 否则每轮白吃一把锁 + 一次大 Hash 读，毒化吞吐且永不自愈（08）
      if (!(await zoneCtx.run({ sId }, () => deps.userExists(sId, uid)))) {
        const removed = await zoneCtx.run({ sId }, () =>
          deps.removeCandidate(sId, bucket, uid, cutoff));
        if (removed) {
          freezeCounters.ghosts++;
          stats.ghosts++;
        }
        continue;
      }
      let memoryAllowsFreeze: boolean;
      try {
        const info = await zoneCtx.run({ sId }, () => deps.memoryInfo(sId, uid));
        memoryAllowsFreeze = memoryPressureAllowsFreeze(info, FREEZE_REDIS_HIGH_WATERMARK);
      } catch (error) {
        freezeCounters.waterlineErrors++;
        stats.waterlineErrors++;
        console.error(`[freeze] Redis INFO MEMORY 失败 uid=${uid} sId=${sId}`, error);
        await zoneCtx.run({ sId }, () => deps.deferCandidate(sId, bucket, uid, cutoff));
        continue;
      }
      if (!memoryAllowsFreeze) {
        freezeCounters.waterlineSkipped++;
        stats.waterlineSkipped++;
        await zoneCtx.run({ sId }, () => deps.deferCandidate(sId, bucket, uid, cutoff));
        continue;
      }
      while (!deps.takeRateToken()) {
        await deps.wait(Math.ceil(1000 / Math.max(deps.ratePerSec, 1)));
      }
      try {
        const r = await zoneCtx.run({ sId }, () => deps.freeze(uid, sId, lease));
        stats[r === "frozen" ? "frozen" : r === "lost" ? "lost" : "skipped"]++;
        if (r !== "frozen") {
          // LIMIT 0 must not let one permanent skip monopolize a bucket. Move
          // it to this round's eligibility boundary; XX+GT preserves a newer
          // concurrent login score and never resurrects a removed member.
          await zoneCtx.run({ sId }, () => deps.deferCandidate(sId, bucket, uid, cutoff));
        }
        // skip（sess 在线 / outbox 未清 / 复核发现仍活跃）不 ZREM：条件消退后下轮重试；
        // 索引条目由 touchActive 维持新鲜，误删会让「此后零活动」的 uid 永远漏冻
      } catch (e) {
        if (e instanceof LeaseLostError) { throw e; } // 单例已被顶替：立即上抛自杀（09·X7）
        console.error(`[freeze] freezeUser 失败 uid=${uid} sId=${sId}`, e); // 单个失败不拖垮整轮
        await zoneCtx.run({ sId }, () => deps.deferCandidate(sId, bucket, uid, cutoff));
      }
    }
  }
  return stats;
}

export function sweepOnce(
  lease: SingletonLease,
  totalBudget = FREEZE_SWEEP_BUDGET,
  zones: readonly number[] = ARCHIVE_ZONES,
): Promise<SweepStats> {
  return runSweepOnce(lease, totalBudget, { ...productionSweepDependencies, zones });
}

export function sweepOnceWithDependencies(
  lease: SingletonLease,
  totalBudget: number,
  deps: SweepDependencies,
): Promise<SweepStats> {
  return runSweepOnce(lease, totalBudget, deps);
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
export interface JanitorSweepResult { scanned: number; deleted: number; repaired: number }
export interface JanitorCursor { frozenAt: Date | string; userId: string }

// janitor 是单例 worker，但测试/嵌入式宿主可能并发调用入口；用一个可等待的
// flight 保证游标与每轮预算不会被两个扫描同时推进。游标刻意只存在本模块：
// 重启后从头开始扫描仍然安全，且不会把数据库引入额外的协调状态。
const janitorCursors = new Map<number, JanitorCursor | null>();
let janitorZoneCursor = 0;
let janitorFlight: Promise<JanitorSweepResult> | null = null;

/** 测试/嵌入式重启时清空本进程 janitor 游标。 */
export function resetJanitorCursor(): void {
  janitorCursors.clear();
  janitorZoneCursor = 0;
}

/** `batch` 是单次 sweep 的总预算，而不是仅用于 SQL 分页的提示值。 */
export function normalizeJanitorBudget(batch: number): number {
  if (!Number.isFinite(batch)) {
    throw new RangeError(`janitor batch 非法：「${String(batch)}」`);
  }
  const n = Math.floor(batch);
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`janitor batch 超出安全整数范围：「${String(batch)}」`);
  }
  return Math.max(1, n);
}

/**
 * 统一校验 MySQL DATETIME 的 driver 形态。mysql2 默认返回 Date，但
 * `dateStrings`/自定义 typeCast 可返回日期字符串；纯数字字符串不接受，
 * 避免 `Date.parse("1")` 这类实现相关的伪日期穿过游标边界。
 */
export function normalizeJanitorFrozenAt(raw: unknown): Date | string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw new Error(`user_archive.frozen_at 非法：「${String(raw)}」`);
    }
    return new Date(raw.getTime());
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    // Require a date-shaped year/month/day prefix before consulting the
    // permissive JS parser (`Date.parse("123junk")` is surprisingly valid on
    // some runtimes and resolves to a year in the 1st century).
    const dateShaped = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.\d{1,9})?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})?)?$/;
    if (dateShaped.test(text) && Number.isFinite(Date.parse(text))) {
      return raw;
    }
  }
  throw new Error(`user_archive.frozen_at 非法：「${String(raw)}」`);
}

function janitorCursorOf(row: RowDataPacket): JanitorCursor {
  const frozenAt = normalizeJanitorFrozenAt(row.frozen_at);
  // Do not stringify malformed driver values: String(null) would create a
  // plausible-looking cursor and silently skip the real row on later pages.
  if (typeof row.user_id !== "string" || row.user_id.length === 0) {
    throw new Error(`user_archive.user_id 非法：「${String(row.user_id)}」`);
  }
  const userId = row.user_id;
  return { frozenAt, userId };
}

export type JanitorVisitResult = "unchanged" | "deleted" | "repaired";

/** Narrow I/O seam for the keyset algorithm; production supplies the functions below. */
export interface JanitorSweepDependencies {
  query: (sId: number, cursor: JanitorCursor | null, budget: number) => Promise<readonly RowDataPacket[]>;
  visit: (uid: string, sId: number, lease: SingletonLease) => Promise<JanitorVisitResult>;
  guardLease?: (lease: SingletonLease) => Promise<void>;
}

const productionJanitorDependencies: JanitorSweepDependencies = {
  query: async (sId, cursor, budget) => {
    const where = cursor === null
      ? "WHERE server_id = ?"
      : "WHERE server_id = ? AND (frozen_at, user_id) > (?, ?)";
    const params: unknown[] = cursor === null
      ? [sId, budget]
      : [sId, cursor.frozenAt, cursor.userId, budget];
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT user_id, frozen_at FROM user_archive ${where}
       ORDER BY frozen_at, user_id LIMIT ?`, params);
    return rows;
  },
  visit: async (uid, sId, lease) => zoneCtx.run({ sId }, async () => {
    if ((await clientFor(uid).exists(kUser(uid))) === 0) { return "unchanged"; }
    return withUserLock(uid, async (fence): Promise<JanitorVisitResult> => {
        const st = await resolve(uid, sId); // 锁内复判（09·F1）
        if (st.kind === "LIVE" && st.row) {
          if (st.row.freezeId === null) { return "unchanged"; }
          await migrateLiveUserSchemaLocked(uid, fence);
          await restoreActiveIndex(uid, sId, st.row.snapshot);
          const deleted = await withLeaseTx(lease, (conn) => deleteArchiveWithUsage(
            conn,
            uid,
            sId,
            { freezeId: st.row!.freezeId! },
          ));
          if (deleted === "mismatch") { return "unchanged"; }
          await clientFor(uid).hdel(kArchiveProof(uid), st.row.freezeId);
          return "deleted";
        }
        if (st.kind === "ARCHIVE_NEWER") {
          // PITR 修复：UNLINK 陈旧 Redis 档 → 从 archive 恢复（Lua 原子，overwrite=1）
          await restoreFromArchive(uid, fence, st.row!, true);
          return "repaired";
        }
        // FROZEN（预筛后被并发 freeze 变冷）→ 什么都不做，留给 thaw
        return "unchanged";
      }, { renewMs: LOCK_RENEW_MS });
  }),
  guardLease: (lease) => withLeaseTx(lease, async () => { /* heartbeat */ }),
};

async function runJanitorSweep(
  lease: SingletonLease,
  batch: number,
  zones: readonly number[],
  deps: JanitorSweepDependencies = productionJanitorDependencies,
): Promise<JanitorSweepResult> {
  const out = { scanned: 0, deleted: 0, repaired: 0 };
  let remaining = normalizeJanitorBudget(batch);
  if (zones.length === 0) { return out; }
  let probedZones = 0;
  while (remaining > 0 && probedZones < zones.length) {
    const zoneIndex = janitorZoneCursor % zones.length;
    const sId = zones[zoneIndex];
    janitorZoneCursor = (zoneIndex + 1) % zones.length;
    probedZones++;
    const cursor = janitorCursors.get(sId) ?? null;
    const queryBudget = remaining;
    const rows = await deps.query(sId, cursor, queryBudget);
    if (rows.length > queryBudget) {
      throw new Error(`janitor query 超出请求预算：${rows.length} > ${queryBudget}`);
    }
    remaining -= Math.max(1, rows.length);
    if (rows.length === 0) {
      janitorCursors.set(sId, null);
      continue;
    }

    for (const row of rows) {
      const point = janitorCursorOf(row);
      out.scanned++;
      // In particular, ARCHIVE_NEWER restores Redis without a MySQL business
      // write, so it must consume the singleton lease before entering visit.
      await deps.guardLease?.(lease);
      const result = await deps.visit(point.userId, sId, lease);
      if (result === "deleted") {
        freezeCounters.janitorDeleted++;
        out.deleted++;
      } else if (result === "repaired") {
        freezeCounters.janitorRepaired++;
        out.repaired++;
      }
      janitorCursors.set(sId, point);
    }
    if (rows.length < queryBudget) { janitorCursors.set(sId, null); }
  }
  return out;
}

/**
 * 执行一轮有界 janitor。并发调用共享同一个结果 Promise，避免总预算被叠加。
 */
export function janitorSweep(
  lease: SingletonLease,
  batch = 200,
  zones: readonly number[] = ARCHIVE_ZONES,
): Promise<JanitorSweepResult> {
  return startJanitorSweep(lease, batch, zones, productionJanitorDependencies);
}

/** Test-only entry point that exercises the production keyset state machine with injected I/O. */
export function janitorSweepWithDependencies(
  lease: SingletonLease,
  batch: number,
  zones: readonly number[],
  deps: JanitorSweepDependencies,
): Promise<JanitorSweepResult> {
  return startJanitorSweep(lease, batch, zones, deps);
}

function startJanitorSweep(
  lease: SingletonLease,
  batch: number,
  zones: readonly number[],
  deps: JanitorSweepDependencies,
): Promise<JanitorSweepResult> {
  if (janitorFlight) { return janitorFlight; }
  const run = runJanitorSweep(lease, batch, zones, deps);
  janitorFlight = run;
  // Observe both fulfillment and rejection while clearing the guard; the
  // caller still receives the original promise/rejection unchanged.
  void run.then(
    () => { if (janitorFlight === run) { janitorFlight = null; } },
    () => { if (janitorFlight === run) { janitorFlight = null; } },
  );
  return run;
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
