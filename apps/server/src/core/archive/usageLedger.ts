import type { PoolConnection, ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { storedInt } from "../infra/numbers";
import { projectArchiveUsage, type ArchiveProjection, type ArchiveUsage } from "./capacity";
import {
  ARCHIVE_PHASE_LEGACY, parseArchivePhase, parseFreezeId, type ArchivePhase,
} from "./protocol";

export interface ArchiveStorageRow {
  fenceHwm: number;
  storageBytes: number;
  freezeId: string | null;
  phase: ArchivePhase;
}

export interface ArchiveDeleteExpectation {
  freezeId: string;
  phase?: ArchivePhase;
}

export type ArchiveDeleteResult = "deleted" | "missing" | "mismatch";

/** Test-only race barrier; production leaves it empty. */
export const _archiveUsageTestHooks: {
  afterMissingProbe?: (sId: number) => Promise<void>;
} = {};

function usageOf(row: RowDataPacket): ArchiveUsage {
  return {
    rows: storedInt(row.row_count, "archive_zone_usage.row_count", { min: 0 }),
    bytes: storedInt(row.byte_count, "archive_zone_usage.byte_count", { min: 0 }),
  };
}

export async function rebuildArchiveUsage(
  conn: PoolConnection,
  sId: number,
): Promise<ArchiveUsage> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS row_count,
            COALESCE(SUM(JSON_STORAGE_SIZE(snapshot)), 0) AS byte_count
       FROM user_archive
      WHERE server_id = ?`,
    [sId],
  );
  if (rows.length !== 1) { throw new Error(`archive usage rebuild 返回 ${rows.length} 行 sId=${sId}`); }
  const usage = usageOf(rows[0]);
  const [result] = await conn.execute<ResultSetHeader>(
    `INSERT INTO archive_zone_usage (server_id, row_count, byte_count)
     VALUES (?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE
       row_count = new.row_count,
       byte_count = new.byte_count,
       updated_at = NOW(3)`,
    [sId, usage.rows, usage.bytes],
  );
  if (![0, 1, 2].includes(result.affectedRows)) {
    throw new Error(`archive usage rebuild 行数异常 sId=${sId} affected=${result.affectedRows}`);
  }
  return usage;
}

/** Lock the O(1) zone ledger. A missing row is rebuilt exactly once for a new
 * zone or after operator damage; rebuild only reads archive authority. */
export async function lockArchiveUsage(
  conn: PoolConnection,
  sId: number,
): Promise<ArchiveUsage> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT row_count, byte_count
       FROM archive_zone_usage
      WHERE server_id = ?
      FOR UPDATE`,
    [sId],
  );
  if (rows.length === 1) { return usageOf(rows[0]); }
  if (rows.length > 1) { throw new Error(`archive_zone_usage 重复 server_id=${sId}`); }
  if (_archiveUsageTestHooks.afterMissingProbe) {
    await _archiveUsageTestHooks.afterMissingProbe(sId);
  }
  // RC does not gap-lock a missing equality probe. Materialize one sentinel
  // row first: concurrent missing-ledger transactions now serialize on this
  // PK before either derives totals or applies a delta.
  const [sentinel] = await conn.execute<ResultSetHeader>(
    `INSERT INTO archive_zone_usage (server_id, row_count, byte_count)
     VALUES (?, 0, 0) AS new
     ON DUPLICATE KEY UPDATE server_id = new.server_id`,
    [sId],
  );
  if (![0, 1, 2].includes(sentinel.affectedRows)) {
    throw new Error(`archive_zone_usage sentinel 行数异常 sId=${sId} affected=${sentinel.affectedRows}`);
  }
  // The INSERT/ODKU holds the unique row lock until transaction end. Rebuild
  // only after acquiring it, so a waiter observes all prior authority deltas.
  return rebuildArchiveUsage(conn, sId);
}

export async function archiveJsonStorageBytes(
  conn: PoolConnection,
  snapshotJson: string,
): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT JSON_STORAGE_SIZE(CAST(? AS JSON)) AS storage_bytes",
    [snapshotJson],
  );
  if (rows.length !== 1) { throw new Error("archive incoming JSON_STORAGE_SIZE 返回行数异常"); }
  return storedInt(rows[0].storage_bytes, "archive incoming storage_bytes", { min: 0 });
}

export async function lockArchiveStorageRow(
  conn: PoolConnection,
  uid: string,
  sId: number,
): Promise<ArchiveStorageRow | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT fence_hwm, freeze_id, archive_phase,
            JSON_STORAGE_SIZE(snapshot) AS storage_bytes
       FROM user_archive
      WHERE user_id = ? AND server_id = ?
      FOR UPDATE`,
    [uid, sId],
  );
  if (rows.length === 0) { return null; }
  if (rows.length !== 1) { throw new Error(`user_archive identity 非唯一 uid=${uid} sId=${sId}`); }
  const phase = parseArchivePhase(rows[0].archive_phase);
  const freezeId = rows[0].freeze_id === null
    ? null
    : parseFreezeId(rows[0].freeze_id);
  if ((phase === ARCHIVE_PHASE_LEGACY) !== (freezeId === null)) {
    throw new Error(`user_archive phase/freeze_id 不一致 uid=${uid} sId=${sId}`);
  }
  return {
    fenceHwm: storedInt(rows[0].fence_hwm, "user_archive.fence_hwm", { min: 0 }),
    storageBytes: storedInt(rows[0].storage_bytes, "user_archive.storage_bytes", { min: 0 }),
    freezeId,
    phase,
  };
}

export async function writeArchiveUsage(
  conn: PoolConnection,
  sId: number,
  usage: ArchiveUsage,
): Promise<void> {
  const [result] = await conn.execute<ResultSetHeader>(
    `UPDATE archive_zone_usage
        SET row_count = ?, byte_count = ?, updated_at = NOW(3)
      WHERE server_id = ?`,
    [usage.rows, usage.bytes, sId],
  );
  if (result.affectedRows === 1) { return; }
  if (result.affectedRows === 0) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT row_count, byte_count
         FROM archive_zone_usage
        WHERE server_id = ?
        FOR UPDATE`,
      [sId],
    );
    if (rows.length === 1) {
      const stored = usageOf(rows[0]);
      if (stored.rows === usage.rows && stored.bytes === usage.bytes) { return; }
    }
  }
  throw new Error(`archive_zone_usage 更新行数异常 sId=${sId} affected=${result.affectedRows}`);
}

/** Plan against the locked O(1) ledger. Only a rejection invokes the exact
 * refresh, allowing external/manual archive deletions to release capacity
 * without making every successful freeze scan the zone. */
export async function planArchiveAdmission(
  current: ArchiveUsage,
  incomingBytes: number,
  existingBytes: number | null,
  maxRows: number,
  maxBytes: number,
  refresh: () => Promise<ArchiveUsage>,
): Promise<{ projection: ArchiveProjection; refreshed: boolean }> {
  let projection = projectArchiveUsage(current, incomingBytes, existingBytes, maxRows, maxBytes);
  if (projection.allowed) { return { projection, refreshed: false }; }
  const exact = await refresh();
  projection = projectArchiveUsage(exact, incomingBytes, existingBytes, maxRows, maxBytes);
  return { projection, refreshed: true };
}

/** Delete authority and decrement its derived ledger in the same transaction.
 * Callers decide whether the transaction also needs a singleton lease guard. */
export async function deleteArchiveWithUsage(
  conn: PoolConnection,
  uid: string,
  sId: number,
  expected: ArchiveDeleteExpectation,
): Promise<ArchiveDeleteResult> {
  let usage = await lockArchiveUsage(conn, sId);
  const row = await lockArchiveStorageRow(conn, uid, sId);
  if (row === null) { return "missing"; }
  if (row.freezeId !== expected.freezeId
    || (expected.phase !== undefined && row.phase !== expected.phase)) {
    return "mismatch";
  }
  if (usage.rows < 1 || usage.bytes < row.storageBytes) {
    usage = await rebuildArchiveUsage(conn, sId);
  }
  if (usage.rows < 1 || usage.bytes < row.storageBytes) {
    throw new Error(`archive_zone_usage 与 authority 不一致 uid=${uid} sId=${sId}`);
  }
  const [deleted] = await conn.execute<ResultSetHeader>(
    `DELETE FROM user_archive
      WHERE user_id = ? AND server_id = ? AND freeze_id = ? AND archive_phase = ?`,
    [uid, sId, expected.freezeId, row.phase],
  );
  if (deleted.affectedRows === 0) { return "mismatch"; }
  if (deleted.affectedRows !== 1) {
    throw new Error(`user_archive 删除行数异常 uid=${uid} sId=${sId} affected=${deleted.affectedRows}`);
  }
  await writeArchiveUsage(conn, sId, {
    rows: usage.rows - 1,
    bytes: usage.bytes - row.storageBytes,
  });
  return "deleted";
}
