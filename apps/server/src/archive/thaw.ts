/**
 * 冷档解冻（[08 · Thaw](../../../../docs/server/08-cold-archive.md#thaw)）。
 *
 * 核心不变量（09·F1）：**权威 = fence 更大的一方**，⛔ 不是「谁存在」——按「谁存在」判定
 * 会在 Redis 点位恢复（PITR）后删掉更新的 archive 行，整批用户静默回档。平局判 LIVE。
 *
 * 一把锁串行一切（09·L1）：resolve / thaw / freeze / 清理任务对同一 uid 全走 `lock:{uid}`
 * （withUserLock）。⛔ `thaw:{uid}` 已废弃，禁止第二把 per-uid 锁。
 *
 * ⚠ ensureLive 内部会抢 `lock:{uid}`：调用方**不得已持有同 uid 的锁**（withUser 体内禁止调用，
 * 否则 localMutex 自等死锁）。relayer 不走 withUser（09·X5），是合法调用方。
 */
import { LOCK_RENEW_MS, THAW_RATE } from "../infra/config";
import { kFence, kNegcacheUser, kUser } from "../infra/keys";
import { cacheClient, clientFor } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { withUserLock } from "../core/locks";
import { BusyError, ThawingError, UserDataLostError } from "../core/errors";
import { thawRestore, type ArchiveSnapshot } from "./archiveScripts";
import { lazyMigrateSchema } from "./lazyMigrate";

// ───────────────────── 常量（07 已规定，随 M9 落地） ─────────────────────

/** negcache:user:{uid} TTL（07 key 全表：10s）。TODO(M10)：随 07 表补条目提升进 config.ts。 */
const NEGCACHE_TTL_S = 10;

// ───────────────────── 核心告警计数（10·M9：随本里程碑交付） ─────────────────────

/** console 计数即可（M10 收口接看板）。freeze 侧计数在 freezeWorker，经 freezeStats() 合并导出。 */
export const archiveCounters = {
  /** 解冻成功次数（含清理任务的 ARCHIVE_NEWER 修复）。解冻/冻结比接近 1 = COLD_DAYS 定错（08 · 监控）。 */
  thawed: 0,
  /** ⚠ **必须恒为 0**（08 · 监控）。非 0 = accounts 有号但热档冷档全无 = 真实数据丢失。 */
  userDataLost: 0,
  /** ARCHIVE_NEWER 恢复次数。非 0 说明发生过 PITR 或异常回滚（08 · 监控）。 */
  archiveNewerRestored: 0,
  /** resolve 判 LIVE 时删除的陈旧 archive 残留行（freeze/thaw 中断态收敛）。 */
  staleArchiveDeleted: 0,
  /** ABSENT 慢路径查 accounts 的次数（负缓存命中则不增——观测负缓存是否生效）。 */
  absentAccountChecks: 0,
  /** 负缓存命中次数。 */
  negcacheHits: 0,
};

// ───────────────────── per-instance 令牌桶（08 · 惊群防护） ─────────────────────

/**
 * 进程内令牌桶（速率是 per-instance，随分片/实例数线性扩，08 · 限速与调度）。
 * ⚠ 与 Redis 侧 tokenBucket Lua（跨节点限流）是两回事：这里限的是**本进程**发起的
 * freeze/thaw 吞吐，时钟只用于自己的配额计算，不做跨节点判定（不违反 09·R7）。
 * 字段刻意可变：测试可直接改 tokens/ratePerSec 构造超限场景。
 */
export class InProcTokenBucket {
  tokens: number;
  lastRefillMs = Date.now();
  constructor(public ratePerSec: number, public capacity: number = ratePerSec) {
    this.tokens = capacity;
  }
  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.lastRefillMs) / 1000) * this.ratePerSec);
    this.lastRefillMs = now;
    if (this.tokens < cost) { return false; }
    this.tokens -= cost;
    return true;
  }
}

/** thaw 令牌桶：THAW_RATE uid/s per-instance，超限抛 ThawingError（客户端退避比 IN_PROGRESS 更长）。 */
export const thawLimiter = new InProcTokenBucket(THAW_RATE);

// ───────────────────── resolve：fence 新鲜度判权威（09·F1） ─────────────────────

export type UserState = "LIVE" | "FROZEN" | "ARCHIVE_NEWER" | "ABSENT";

export interface ArchiveRow {
  snapshot: ArchiveSnapshot; // mysql2 已把 JSON 列解析成对象（09·DB8），传 Lua 前 stringify
  schemaVersion: number;
  fenceHwm: number;
}

/**
 * 锁内判定（⚠ 调用方必须已持 `lock:{uid}`——ensureLive / freeze worker / 清理任务都在锁内调）。
 *
 *   live && !archive → LIVE           正常热档
 *  !live &&  archive → FROZEN         冷档，访问时 thaw
 *  !live && !archive → ABSENT         查 accounts 判「新号」还是「数据丢失」
 *   live &&  archive → 比 fence：hwm 更大 → ARCHIVE_NEWER（PITR）；否则（平局判 LIVE）→ LIVE
 *
 * ⚠ Redis 侧 fence 取 **max(hash 的 fence 字段, fence:{uid} 计数器)**，不是只看 hash 字段：
 * freeze 快照的 fence_hwm 读自计数器（08），其中含 freeze worker 自己抢锁的 INCR——
 * 计数器恒 ≥ hash 字段（hash 只在 casHset 时推进）。若只比 hash，「② 之后 ③ 之前崩溃」的
 * 正常中断残留（hwm == 计数器 > hash）会被误判 ARCHIVE_NEWER，把崩溃后 relayer 刚 apply 的
 * 发货整个回滚成快照——违背 08 崩溃表「该格判 LIVE → 删 archive 行」。取 max 后：
 * 中断残留 → 计数器 ≥ hwm → LIVE ✅；PITR → 计数器与 hash 一起被回滚 < hwm → ARCHIVE_NEWER ✅。
 */
export async function resolve(uid: string): Promise<{ kind: UserState; row?: ArchiveRow }> {
  const r = clientFor(uid);
  const live = (await r.exists(kUser(uid))) === 1;
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT snapshot, schema_version, fence_hwm FROM user_archive WHERE user_id = ?", [uid]);
  const row: ArchiveRow | undefined = rows.length > 0
    ? {
        snapshot: rows[0].snapshot as ArchiveSnapshot,
        schemaVersion: Number(rows[0].schema_version),
        fenceHwm: Number(rows[0].fence_hwm),
      }
    : undefined;

  if (live && !row) { return { kind: "LIVE" }; }
  if (!live && row) { return { kind: "FROZEN", row }; }
  if (!live && !row) { return { kind: "ABSENT" }; }

  const [hashFence, counter] = await Promise.all([r.hget(kUser(uid), "fence"), r.get(kFence(uid))]);
  const redisFence = Math.max(Number(hashFence ?? 0), Number(counter ?? 0));
  // 平局（==）判 LIVE：freeze 写完 archive 没来得及 UNLINK、或 thaw 恢复完没来得及删行的
  // 中断态，两边数据相同，删 archive 行即可（08）
  return row!.fenceHwm > redisFence ? { kind: "ARCHIVE_NEWER", row } : { kind: "LIVE", row };
}

// ───────────────────── 恢复（thaw / 清理任务 ARCHIVE_NEWER 修复共用） ─────────────────────

async function deleteArchiveRow(uid: string): Promise<void> {
  await getPool().execute<ResultSetHeader>("DELETE FROM user_archive WHERE user_id = ?", [uid]);
}

async function archiveRowExists(uid: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM user_archive WHERE user_id = ? LIMIT 1", [uid]);
  return rows.length > 0;
}

/**
 * 建号成功后立即失效负缓存（09·F4）。⛔ M9 不改 auth 已有文件——建号路径（createUser 调用方）
 * 接线本函数是遗留 TODO，见交付说明；负缓存 TTL 10s 兜底了未接线窗口。
 */
export async function invalidateUserNegcache(uid: string): Promise<void> {
  await cacheClient().unlink(kNegcacheUser(uid));
}

/**
 * 从 archive 行恢复（调用方必须已持 `lock:{uid}`，myFence 为持锁 fence）。
 * overwrite=true 是 ARCHIVE_NEWER 修复路径：Lua 内先 UNLINK 陈旧 Redis 档再恢复（08）。
 *
 * 顺序：懒迁移（恢复前变换快照，09·S1）→ thawRestore 单条 Lua（09·F3）→ 失效负缓存（09·F4）
 * → **删 archive 行（最后一步，08）**。Lua 之后、删行之前崩溃 → 并存且 hwm == redis.fence
 * → 下次 resolve 判 LIVE → 清理任务删行收敛（08 · 崩溃分析表）。
 *
 * thaw 成功后 archive 行**删除**而非保留——08 的 ensureLive 与崩溃分析表都以「删行为最后一步、
 * 残留行由 resolve→LIVE 收敛」为准；保留行只会让每次 ensureLive 都掉进慢路径比 fence。
 */
export async function restoreFromArchive(
  uid: string, myFence: number, row: ArchiveRow, overwrite: boolean,
): Promise<void> {
  const snapshot = await lazyMigrateSchema(row.snapshot, row.schemaVersion);
  const res = await thawRestore(uid, myFence, row.fenceHwm, snapshot, overwrite);
  if (res !== "ok") { throw new BusyError("thawRestore lost"); } // 锁已易主：零破坏，archive 完好，重试即可
  archiveCounters.thawed++;
  await invalidateUserNegcache(uid); // thaw 成功立即失效（09·F4）
  await deleteArchiveRow(uid);
}

// ───────────────────── ensureLive（07 契约） ─────────────────────

/** 进程内 singleFlight：同 uid 并发 thaw 合并成一次（08 · 惊群防护第一道）。 */
const inflight = new Map<string, Promise<void>>();

/**
 * 确保 user:{uid} 在 Redis 中可用；必要时 thaw（07 契约）。收到 Lua 的 `cold` 后调用。
 *
 * - FROZEN / ARCHIVE_NEWER → thawRestore（慢路径开看门狗 renewMs=LOCK_RENEW_MS，09·L6）
 * - LIVE 且有 archive 残留行 → 删行（freeze/thaw 中断态收敛）
 * - ABSENT：accounts 有号 = **数据丢失，告警 + 拒绝建空档**，抛 UserDataLostError（09·F4）；
 *   无号 = 真新号，写负缓存后**正常返回不抛**——上层见 user 仍不存在自走建号路径
 *   （08 原文抛 UserNotFoundError 由建号接住；本实现按 07「Promise<void>」契约与 M9 任务口径
 *   收敛为不抛，语义等价：都不建档、都放行建号）。
 * - THAW_RATE 超限抛 ThawingError（错误码 THAWING，客户端退避比 IN_PROGRESS 更长）。
 */
export async function ensureLive(uid: string): Promise<void> {
  const r = clientFor(uid);
  if ((await r.exists(kUser(uid))) === 1) {
    if (!(await archiveRowExists(uid))) { return; } // 快路径：纯热档
    // live && archive 并存（中断残留或 PITR）→ 掉进慢路径锁内 resolve
  } else {
    // 负缓存读点必须在 EXISTS user **之后**（09·F4）：先 EXISTS 保证刚建号的用户
    // 绝不会被残留负缓存误判成不存在
    if ((await cacheClient().exists(kNegcacheUser(uid))) === 1) {
      archiveCounters.negcacheHits++;
      return; // 已知不存在：跳过锁与 MySQL，语义同 ABSENT-无号（不抛、放行建号）
    }
  }

  // singleFlight（同进程同 uid 合并）→ withUserLock（跨实例同 uid 串行）→ 锁内 resolve
  let p = inflight.get(uid);
  if (!p) {
    p = thawSlowPath(uid).finally(() => { inflight.delete(uid); });
    inflight.set(uid, p);
  }
  return p;
}

async function thawSlowPath(uid: string): Promise<void> {
  await withUserLock(uid, async (fence) => {
    const st = await resolve(uid); // 锁内判定（08）
    switch (st.kind) {
      case "LIVE": {
        if (st.row) { // freeze ②③ 间 / thaw 删行前的中断残留：archive 已陈旧，删（08 情形表）
          await deleteArchiveRow(uid);
          archiveCounters.staleArchiveDeleted++;
        }
        return;
      }
      case "ABSENT": {
        archiveCounters.absentAccountChecks++;
        const [acct] = await getPool().query<RowDataPacket[]>(
          "SELECT 1 FROM accounts WHERE user_id = ? LIMIT 1", [uid]);
        if (acct.length > 0) {
          // accounts 有号但热档冷档全无 = 真实数据丢失。⛔ 拒绝建空档（09·F4）：
          // 建了空档就把数据丢失伪装成正常注册，30 天存档无声蒸发
          archiveCounters.userDataLost++;
          console.error(`[thaw] ☠ USER_DATA_LOST uid=${uid}：accounts 有号但 Redis 与 user_archive 全无（≡0 告警线）`);
          throw new UserDataLostError(uid);
        }
        // 真新号：负缓存挡住重复穿透（cache 实例，TTL 10s）；建号成功后由建号路径立即失效
        await cacheClient().set(kNegcacheUser(uid), "1", "EX", NEGCACHE_TTL_S);
        return;
      }
      case "FROZEN":
      case "ARCHIVE_NEWER": {
        if (!thawLimiter.take()) { throw new ThawingError(); } // per-instance 限速（08 · 惊群防护）
        if (st.kind === "ARCHIVE_NEWER") { archiveCounters.archiveNewerRestored++; }
        // ARCHIVE_NEWER = Redis 被回滚到更早时点（PITR）：先 UNLINK 陈旧档再恢复（08）
        await restoreFromArchive(uid, fence, st.row!, st.kind === "ARCHIVE_NEWER");
        return;
      }
    }
  }, { renewMs: LOCK_RENEW_MS }); // thaw 是全系统最慢操作之一，5s 锁盖不住：开看门狗（09·L6）
}
