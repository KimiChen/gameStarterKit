/**
 * 冷档解冻（[08 · Thaw](docs/SERVER.md)）。
 *
 * 核心不变量（09·F1）：双存态只按 archive phase 与当前行 freeze_id 的精确 proof membership
 * 判权；`fence_hwm` 只用于 thaw 后拦截僵尸写，不参与 authority ordering。
 *
 * 一把锁串行一切（09·L1）：resolve / thaw / freeze / 清理任务对同一 uid 全走 `lock:{uid}`
 * （withUserLock）。⛔ `thaw:{uid}` 已废弃，禁止第二把 per-uid 锁。
 *
 * ⚠ ensureLive 内部会抢 `lock:{uid}`：调用方**不得已持有同 uid 的锁**（withUser 体内禁止调用，
 * 否则 localMutex 自等死锁）。relayer 不走 withUser（09·X5），是合法调用方。
 */
import type Redis from "ioredis";
import { LOCK_RENEW_MS, THAW_RATE, normalizeSId } from "../infra/config";
import {
  activeLruBucketOf, currentZoneId, kActiveLru, kApplied, kAppliedPayload, kArchiveProof,
  kBagAll, kNegcacheUser, kUser, zoneCtx,
} from "../infra/keys";
import { cacheClient, clientFor, indexClientFor } from "../infra/redisRoute";
import { getPool, withRcTx } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { withUserLock } from "../locks";
import {
  ArchiveAuthorityConflictError, BusyError, ThawingError, UserDataLostError,
} from "../errors";
import {
  kitUserKeyEntries, thawRestore, unknownSnapshotKits, type ArchiveSnapshot,
} from "./archiveScripts";
import { SERVER_KIT_CATALOG } from "../../kits/catalog.generated";
import type { ServerKitCatalogEntry } from "../../kits/catalogTypes";
import { lazyMigrateSchema, validateArchiveSnapshotSchema } from "./lazyMigrate";
import { webPlatformClient } from "../../platform/webPlatformClient";
import { optionalStoredInt, storedInt } from "../infra/numbers";
import { deleteArchiveWithUsage } from "./usageLedger";
import {
  ARCHIVE_PHASE_COMMITTED, ARCHIVE_PHASE_LEGACY, ARCHIVE_PHASE_PREPARED,
  newFreezeId, parseArchivePhase, parseFreezeId, type ArchivePhase,
} from "./protocol";
import {
  inspectLiveUserSchema, migrateLiveUserSchemaLocked, readLiveUserFields,
} from "../liveSchema";

// ───────────────────── 常量（模块私有；跨模块配置见 core/infra/config.ts） ─────────────────────

/** negcache:user:{uid} TTL（10s）。⚠ 模块私有常量，尚未提升进 `core/infra/config.ts`——
 *  docs/SERVER.md §13 登记表已注明「少量模块私有常量仍在实现文件内」，本条即其一。 */
const NEGCACHE_TTL_S = 10;

// ───────────────────── 核心告警计数（10·M9：随本里程碑交付） ─────────────────────

/** console 计数即可（M10 收口接看板）。freeze 侧计数在 freezeWorker，经 freezeStats() 合并导出。 */
export const archiveCounters = {
  /** 解冻成功次数（含清理任务的 ARCHIVE_NEWER 修复）。解冻/冻结比接近 1 = COLD_DAYS 定错（08 · 监控）。 */
  thawed: 0,
  /** ⚠ **必须恒为 0**（08 · 监控）。非 0 = WebPlatform 有角色登记但热档冷档全无 = 真实数据丢失。 */
  userDataLost: 0,
  /** ARCHIVE_NEWER 恢复次数。非 0 说明发生过 PITR 或异常回滚（08 · 监控）。 */
  archiveNewerRestored: 0,
  /** resolve 判 LIVE 时删除的陈旧 archive 残留行（freeze/thaw 中断态收敛）。 */
  staleArchiveDeleted: 0,
  /** ABSENT 慢路径查 WebPlatform 角色登记的次数（负缓存命中则不增——观测负缓存是否生效）。 */
  absentAccountChecks: 0,
  /** 负缓存命中次数。 */
  negcacheHits: 0,
  /** 双存态无法用当前 freeze_id 证明同源；必须恒为 0，非 0 时保留两边并人工处置。 */
  authorityConflicts: 0,
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

// ───────────────────── resolve：phase + 精确 proof membership 判权威（09·F1） ─────────────────────

export type UserState = "LIVE" | "FROZEN" | "ARCHIVE_NEWER" | "CONFLICT" | "ABSENT";

export interface ArchiveRow {
  serverId: number;
  snapshot: ArchiveSnapshot; // mysql2 已把 JSON 列解析成对象（09·DB8），传 Lua 前 stringify
  schemaVersion: number;
  fenceHwm: number;
  freezeId: string | null;
  phase: ArchivePhase;
}

function archiveRowOf(row: RowDataPacket): ArchiveRow {
  const phase = parseArchivePhase(row.archive_phase);
  const freezeId = row.freeze_id === null ? null : parseFreezeId(row.freeze_id);
  if ((phase === ARCHIVE_PHASE_LEGACY) !== (freezeId === null)) {
    throw new Error(
      `user_archive phase/freeze_id 不一致 uid=${String(row.user_id)} sId=${String(row.server_id)}`,
    );
  }
  const archive = {
    serverId: storedInt(row.server_id, "user_archive.server_id", { min: 0, max: 65535 }),
    snapshot: row.snapshot as ArchiveSnapshot,
    schemaVersion: storedInt(row.schema_version, "user_archive.schema_version", { min: 1 }),
    fenceHwm: storedInt(row.fence_hwm, "user_archive.fence_hwm", { min: 0 }),
    freezeId,
    phase,
  };
  validateArchiveSnapshotSchema(archive.snapshot, archive.schemaVersion);
  return archive;
}

function authorityConflict(
  uid: string,
  sId: number,
  row: ArchiveRow,
  detail?: string,
): { kind: "CONFLICT"; row: ArchiveRow } {
  archiveCounters.authorityConflicts++;
  console.error(
    `[archive] ARCHIVE_AUTHORITY_CONFLICT uid=${uid} sId=${sId}`
    + ` phase=${row.phase} freezeId=${row.freezeId ?? "legacy"}`
    + `${detail ? ` detail=${detail}` : ""}; live/archive 均保留`,
  );
  return { kind: "CONFLICT", row };
}

async function validateDualStateLiveBranch(
  redis: Redis,
  uid: string,
  catalog: readonly ServerKitCatalogEntry[],
): Promise<{ valid: true } | { valid: false; reason: string }> {
  try {
    const read = await readLiveUserFields(uid, []);
    if (read.kind !== "live") { return { valid: false, reason: "user_absent" }; }
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : "user_metadata_invalid",
    };
  }

  const typedKeys: ReadonlyArray<readonly [string, "hash" | "zset"]> = [
    [kApplied(uid), "zset"],
    [kAppliedPayload(uid), "hash"],
    ...kBagAll(uid).map((key) => [key, "hash"] as const),
    // kit per-user 键（KIT.md §5）：快照只能表达 HASH，其它类型在这里与 bag 一样按具名原因拒绝
    ...kitUserKeyEntries(uid, catalog).map((entry) => [entry.key, "hash"] as const),
  ];
  const types = await Promise.all(typedKeys.map(([key]) => redis.type(key)));
  for (let index = 0; index < typedKeys.length; index++) {
    const actual = types[index];
    const expected = typedKeys[index][1];
    if (actual !== "none" && actual !== expected) {
      return { valid: false, reason: `related_key_type_${actual}_expected_${expected}` };
    }
  }
  return { valid: true };
}

/**
 * 锁内判定（⚠ 调用方必须已持 `lock:{uid}`——ensureLive / freeze worker / 清理任务都在锁内调）。
 *
 *   live && !archive → LIVE           正常热档
 *  !live &&  archive → FROZEN         冷档，访问时 thaw
 *  !live && !archive → ABSENT         查 WebPlatform 角色登记判「新角」还是「数据丢失」
 *   live &&  archive → 按 phase + 当前行 freeze_id 的 proof membership 判定；fence_hwm 不参与判权
 *
 * `archive:proof:{uid}` 是同槽 HASH（field=freeze_id）。resolve 只 HEXISTS 当前行自己的 id：
 * 后续/失败 attempt 写入别的成员不会遮蔽本行，Redis PITR 丢失该成员时 COMMITTED 行重新成为权威。
 * LEGACY 双存和 PREPARED+proof mismatch 都无法证明先后，必须 CONFLICT、保留两侧。
 */
export async function resolve(
  uid: string,
  sId = currentZoneId(),
  catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG,
): Promise<{ kind: UserState; row?: ArchiveRow }> {
  const r = clientFor(uid);
  const live = (await r.exists(kUser(uid))) === 1;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT user_id, server_id, snapshot, schema_version, fence_hwm, freeze_id, archive_phase
       FROM user_archive WHERE user_id = ? AND server_id = ?`,
    [uid, sId]);
  if (rows.length > 1) { throw new Error(`user_archive identity 非唯一 uid=${uid} sId=${sId}`); }
  const row: ArchiveRow | undefined = rows.length === 1 ? archiveRowOf(rows[0]) : undefined;

  if (live && !row) {
    const liveBranch = await validateDualStateLiveBranch(r, uid, catalog);
    if (!liveBranch.valid) {
      throw new Error(`live user schema/key 非法 uid=${uid} sId=${sId}: ${liveBranch.reason}`);
    }
    return { kind: "LIVE" };
  }
  if (!live && row) { return { kind: "FROZEN", row }; }
  if (!live && !row) { return { kind: "ABSENT" }; }

  if (row!.phase === ARCHIVE_PHASE_LEGACY) { return authorityConflict(uid, sId, row!); }
  const liveBranch = await validateDualStateLiveBranch(r, uid, catalog);
  if (!liveBranch.valid) {
    return authorityConflict(uid, sId, row!, liveBranch.reason);
  }
  const hasProof = (await r.hexists(kArchiveProof(uid), row!.freezeId!)) === 1;
  if (row!.phase === ARCHIVE_PHASE_PREPARED) {
    return hasProof ? { kind: "LIVE", row } : authorityConflict(uid, sId, row!);
  }
  return hasProof ? { kind: "LIVE", row } : { kind: "ARCHIVE_NEWER", row };
}

// ───────────────────── 恢复（thaw / 清理任务 ARCHIVE_NEWER 修复共用） ─────────────────────

async function deleteArchiveRow(uid: string, row: ArchiveRow): Promise<void> {
  if (row.freezeId === null) {
    throw new Error(`legacy archive 删除前未升级 uid=${uid} sId=${row.serverId}`);
  }
  const deleted = await withRcTx((conn) => deleteArchiveWithUsage(
    conn,
    uid,
    row.serverId,
    { freezeId: row.freezeId! },
  ));
  if (deleted === "mismatch") {
    throw new ArchiveAuthorityConflictError(
      `archive 删除 CAS 失配 uid=${uid} sId=${row.serverId} freezeId=${row.freezeId}`,
    );
  }
  await clientFor(uid).hdel(kArchiveProof(uid), row.freezeId);
}

async function archiveRowExists(uid: string, sId: number): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM user_archive WHERE user_id = ? AND server_id = ? LIMIT 1", [uid, sId]);
  return rows.length > 0;
}

/** Test-only fault injection; production leaves it empty. */
export const _thawTestHooks: {
  beforeActiveIndexRestore?: (uid: string, sId: number) => Promise<void>;
} = {};

/** Freeze removes this derived index after committing the cold authority. A
 * background thaw has no login/UoW tail to recreate it, so restore the archived
 * activity score without manufacturing fresh user activity. GT preserves a
 * concurrent login's newer score. Failure is rethrown so the archive row remains
 * as the durable retry marker for the next LIVE + archive reconciliation. */
export async function restoreActiveIndex(
  uid: string,
  sId: number,
  snapshot: ArchiveSnapshot,
): Promise<void> {
  try {
    const score = optionalStoredInt(
      snapshot.user.lastActiveAt ?? null,
      0,
      "archive snapshot.user.lastActiveAt",
      { min: 0, max: Number.MAX_SAFE_INTEGER },
    );
    const bucket = activeLruBucketOf(uid);
    if (_thawTestHooks.beforeActiveIndexRestore) {
      await _thawTestHooks.beforeActiveIndexRestore(uid, sId);
    }
    await zoneCtx.run({ sId }, () => indexClientFor(bucket).zadd(kActiveLru(bucket), "GT", score, uid));
  } catch (error) {
    console.error(`[archive] active:lru 恢复失败 uid=${uid} sId=${sId}`, error);
    throw error;
  }
}

/**
 * 建号成功后立即失效负缓存（09·F4）。建档路径已接线：`player/character.ts` 是 createUser 的唯一调用点，
 * 在 createUser + 角色登记之后调用本函数。负缓存 TTL 10s 仍是兜底，不再是唯一保护。
 */
export async function invalidateUserNegcache(uid: string): Promise<void> {
  await cacheClient().unlink(kNegcacheUser(uid));
}

/**
 * 从 archive 行恢复（调用方必须已持 `lock:{uid}`，myFence 为持锁 fence）。
 * overwrite=true 是 ARCHIVE_NEWER 修复路径：Lua 内先 UNLINK 陈旧 Redis 档再恢复（08）。
 *
 * 顺序：懒迁移（恢复前变换快照，09·S1）→ thawRestore 单条 Lua（09·F3）→ 恢复 active:lru
 * → 失效负缓存（09·F4）→ **删 archive 行（最后一步，08）**。Lua 之后任一步失败 → 并存，
 * 下次 resolve 判 LIVE 后先补齐派生索引，再删行收敛（08 · 崩溃分析表）。
 *
 * thaw 成功后 archive 行**删除**而非保留——08 的 ensureLive 与崩溃分析表都以「删行为最后一步、
 * 残留行由 resolve→LIVE 收敛」为准；保留行只会让每次 ensureLive 都掉进慢路径比 fence。
 *
 * kit per-user 键（KIT.md §5）：快照 `kits` 成员随 user/bag 在同一条 Lua 里恢复；快照含目录里已没有的 kit
 * （卸载后 thaw）时**照样恢复**并告警——数据永不静默丢弃，pre-K0 无 `kits` 的快照原样可 thaw。
 */
export async function restoreFromArchive(
  uid: string, myFence: number, row: ArchiveRow, overwrite: boolean,
  catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG,
): Promise<void> {
  if (currentZoneId() !== row.serverId) {
    throw new Error(`archive zone context mismatch uid=${uid} row=s${row.serverId} ctx=s${currentZoneId()}`);
  }
  // Validate/migrate before changing a LEGACY/PREPARED row. A future or corrupt
  // cold snapshot must leave both MySQL metadata and Redis completely untouched.
  const snapshot = await lazyMigrateSchema(row.snapshot, row.schemaVersion);
  const unknownKits = unknownSnapshotKits(snapshot, catalog);
  if (unknownKits.length > 0) {
    console.warn(
      `[thaw] 快照含目录未登记的 kit 键（仍恢复，⛔ 不丢数据）uid=${uid} sId=${row.serverId} kits=${unknownKits.join(",")}`,
    );
  }
  const materialized = await materializeArchiveIdentity(uid, row);
  const res = await thawRestore(
    uid,
    myFence,
    materialized.fenceHwm,
    snapshot,
    overwrite,
    materialized.freezeId!,
    catalog,
  );
  if (res !== "ok") { throw new BusyError("thawRestore lost"); } // 锁已易主：零破坏，archive 完好，重试即可
  archiveCounters.thawed++;
  await restoreActiveIndex(uid, materialized.serverId, snapshot);
  await invalidateUserNegcache(uid); // thaw 成功立即失效（09·F4）
  await deleteArchiveRow(uid, materialized);
}

async function materializeArchiveIdentity(uid: string, row: ArchiveRow): Promise<ArchiveRow> {
  if (row.phase === ARCHIVE_PHASE_COMMITTED) { return row; }
  if (row.phase === ARCHIVE_PHASE_LEGACY) {
    const freezeId = newFreezeId();
    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE user_archive
          SET freeze_id = ?, archive_phase = ?
        WHERE user_id = ? AND server_id = ? AND archive_phase = ? AND freeze_id IS NULL`,
      [freezeId, ARCHIVE_PHASE_COMMITTED, uid, row.serverId, ARCHIVE_PHASE_LEGACY],
    );
    if (result.affectedRows !== 1) {
      throw new ArchiveAuthorityConflictError(`legacy archive 升级 CAS 失配 uid=${uid} sId=${row.serverId}`);
    }
    return { ...row, freezeId, phase: ARCHIVE_PHASE_COMMITTED };
  }
  const [result] = await getPool().execute<ResultSetHeader>(
    `UPDATE user_archive SET archive_phase = ?
      WHERE user_id = ? AND server_id = ? AND freeze_id = ? AND archive_phase = ?`,
    [ARCHIVE_PHASE_COMMITTED, uid, row.serverId, row.freezeId, ARCHIVE_PHASE_PREPARED],
  );
  if (result.affectedRows !== 1) {
    throw new ArchiveAuthorityConflictError(
      `PREPARED archive finalize CAS 失配 uid=${uid} sId=${row.serverId} freezeId=${row.freezeId}`,
    );
  }
  return { ...row, phase: ARCHIVE_PHASE_COMMITTED };
}

// ───────────────────── ensureLive（07 契约） ─────────────────────

/**
 * 进程内按 `(sId, uid)` 合并慢路径。仅按 uid 做 key 会把第一个区的
 * AsyncLocalStorage 上下文借给另一个区，进而读错 Redis 前缀或
 * WebPlatform 角色登记；这里同时固定 key 和执行上下文。
 */
export class ZoneSingleFlight<T> {
  private readonly flights = new Map<string, Promise<T>>();

  run(uid: string, sId: number, task: () => Promise<T>): Promise<T> {
    // JSON tuple avoids delimiter collisions if a future uid validator permits
    // control characters.
    const key = JSON.stringify([sId, uid]);
    const existing = this.flights.get(key);
    if (existing) { return existing; }

    // Install the promise before invoking user code. Starting on a microtask
    // keeps the map visible to re-entrant calls while preserving ALS context.
    const work = Promise.resolve().then(() => zoneCtx.run({ sId }, task));
    this.flights.set(key, work);
    const settle = (): void => {
      if (this.flights.get(key) === work) { this.flights.delete(key); }
    };
    // Observe both outcomes so an ignored/timeout caller cannot turn a failed
    // underlying flight into an unhandled rejection.
    void work.then(settle, settle);
    return work;
  }

  get size(): number { return this.flights.size; }
}

const ensureLiveFlights = new ZoneSingleFlight<void>();

/**
 * 确保 user:{uid} 在 Redis 中可用；必要时 thaw（07 契约）。收到 Lua 的 `cold` 后调用。
 *
 * - FROZEN / ARCHIVE_NEWER → thawRestore（慢路径开看门狗 renewMs=LOCK_RENEW_MS，09·L6）
 * - LIVE 且有 archive 残留行 → 删行（freeze/thaw 中断态收敛）
 * - ABSENT：WebPlatform 有本区角色登记 = **数据丢失，告警 + 拒绝建空档**，抛 UserDataLostError（09·F4）；
 *   无登记 = 真新角，写负缓存后**正常返回不抛**——上层见 user 仍不存在自走建角路径
 *   （08 原文抛 UserNotFoundError 由建号接住；本实现按 07「Promise<void>」契约与 M9 任务口径
 *   收敛为不抛，语义等价：都不建档、都放行建号）。
 * - THAW_RATE 超限抛 ThawingError（错误码 THAWING，客户端退避比 IN_PROGRESS 更长）。
 */
export async function ensureLive(uid: string, sId?: number): Promise<void> {
  // Legacy callers may omit sId while already inside an ALS request. Explicit
  // callers (character/relayer paths) never rely on ambient state.
  const zone = sId === undefined ? currentZoneId() : normalizeSId(sId);
  if (zone === null) {
    throw new RangeError(`ensureLive sId 非法：「${String(sId)}」`);
  }

  // Keep the complete fast path in the explicit zone context too. This is
  // required for callers such as relayer that have no request ALS store.
  return zoneCtx.run({ sId: zone }, async () => {
    let schemaState: "absent" | "current" | "previous";
    try {
      schemaState = await inspectLiveUserSchema(uid);
    } catch (error) {
      // A malformed live key beside an archive row is an authority conflict,
      // not permission to prefer either side. Enter locked resolve so it can
      // preserve both branches; pure-hot corruption still surfaces directly.
      if (await archiveRowExists(uid, zone)) {
        return ensureLiveFlights.run(uid, zone, () => thawSlowPath(uid, zone));
      }
      throw error;
    }
    if (schemaState !== "absent") {
      if (schemaState === "previous") {
        return ensureLiveFlights.run(uid, zone, () => thawSlowPath(uid, zone));
      }
      if (!(await archiveRowExists(uid, zone))) { return; } // 快路径：纯热档
      // live && archive 并存（中断残留或 PITR）→ 掉进慢路径锁内 resolve
    } else {
      // 负缓存读点必须在 EXISTS user **之后**（09·F4）：先 EXISTS 保证刚建号的用户
      // 绝不会被残留负缓存误判成不存在
      if ((await cacheClient().exists(kNegcacheUser(uid))) === 1) {
        archiveCounters.negcacheHits++;
        return; // 已知不存在：跳过锁与 MySQL，语义同 ABSENT-无号（不抛、放行建号）
      }
    }

    // singleFlight（同区同 uid 合并）→ withUserLock（跨实例同 uid 串行）→ 锁内 resolve
    return ensureLiveFlights.run(uid, zone, () => thawSlowPath(uid, zone));
  });
}

async function thawSlowPath(uid: string, sId: number): Promise<void> {
  // `ensureLiveFlights` already wraps this callback, but retaining an explicit
  // run here makes the invariant hold for future internal callers as well.
  await zoneCtx.run({ sId }, () => withUserLock(uid, async (fence) => {
    const st = await resolve(uid, sId); // 锁内判定（08）
    switch (st.kind) {
      case "LIVE": {
        // 合法 N-1 双存态也只能在迁移成功后删除 archive；纯热档 N-1 同样走本锁内路径。
        await migrateLiveUserSchemaLocked(uid, fence);
        if (st.row) { // freeze ②③ 间 / thaw 删行前的中断残留：archive 已陈旧，删（08 情形表）
          await restoreActiveIndex(uid, sId, st.row.snapshot);
          await deleteArchiveRow(uid, st.row);
          archiveCounters.staleArchiveDeleted++;
        }
        return;
      }
      case "ABSENT": {
        archiveCounters.absentAccountChecks++;
        // 「本区建过角没」判据统一走 WebPlatform character registry；所有 sId 使用同一语义。
        // 有登记 + 热档冷档全无 = 真实数据丢失（拒建空档，09·F4）；无登记 = 未在本区建过角 → 放行建角。
        // WebPlatform 不可达时让异常向上冒泡：F4 不能把基础设施故障猜成「没建过角」。
        if (await webPlatformClient.hasCharacter(uid, sId)) {
          archiveCounters.userDataLost++;
          console.error(`[thaw] ☠ USER_DATA_LOST uid=${uid} sId=${sId}：WebPlatform 有本区角色登记但 Redis 与 user_archive 全无（≡0 告警线）`);
          throw new UserDataLostError(uid);
        }
        // 未在本区建过角（真新号/首进区）：负缓存挡重复穿透（per-zone，cache TTL 10s）；建号/建角成功后失效
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
      case "CONFLICT":
        throw new ArchiveAuthorityConflictError(
          `archive authority conflict uid=${uid} sId=${sId} freezeId=${st.row?.freezeId ?? "legacy"}`,
        );
    }
  }, { renewMs: LOCK_RENEW_MS })); // thaw 是全系统最慢操作之一，5s 锁盖不住：开看门狗（09·L6）
}
