/** Cold-archive admission checks. This module is pure so malformed runtime
 * metrics and boundary arithmetic can be tested without Redis or MySQL. */

export interface RedisMemoryUsage {
  usedBytes: number;
  maxBytes: number;
}

export interface ArchiveUsage {
  rows: number;
  bytes: number;
}

export interface ArchiveProjection extends ArchiveUsage {
  allowed: boolean;
}

function safeStoredBytes(raw: string, field: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Redis INFO MEMORY ${field} 非法：「${raw}」`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Redis INFO MEMORY ${field} 超出安全整数范围：「${raw}」`);
  }
  return value;
}

/** Parse the two authoritative byte counters without accepting duplicates,
 * suffixes, floating point values, or implementation-dependent coercions. */
export function parseRedisMemoryInfo(info: string): RedisMemoryUsage {
  let usedBytes: number | undefined;
  let maxBytes: number | undefined;
  for (const rawLine of info.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) { continue; }
    const match = /^(used_memory|maxmemory):(.+)$/.exec(line);
    if (!match) { continue; }
    const value = safeStoredBytes(match[2], match[1]);
    if (match[1] === "used_memory") {
      if (usedBytes !== undefined) { throw new Error("Redis INFO MEMORY used_memory 重复"); }
      usedBytes = value;
    } else {
      if (maxBytes !== undefined) { throw new Error("Redis INFO MEMORY maxmemory 重复"); }
      maxBytes = value;
    }
  }
  if (usedBytes === undefined || maxBytes === undefined) {
    throw new Error("Redis INFO MEMORY 缺少 used_memory 或 maxmemory");
  }
  return { usedBytes, maxBytes };
}

/** maxmemory=0 means Redis has no configured ceiling, so pressure cannot be
 * proven and the destructive worker must fail closed. */
export function memoryPressureAllowsFreeze(info: string, threshold: number): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new RangeError(`freeze Redis high watermark 非法：「${String(threshold)}」`);
  }
  const usage = parseRedisMemoryInfo(info);
  return usage.maxBytes > 0 && usage.usedBytes / usage.maxBytes >= threshold;
}

export function utf8SnapshotBytes(snapshotJson: string): number {
  return Buffer.byteLength(snapshotJson, "utf8");
}

/** Project the zone totals after an insert or replacement. Existing archive
 * authority is accounted for, never deleted merely to satisfy a limit. */
export function projectArchiveUsage(
  current: ArchiveUsage,
  incomingBytes: number,
  existingBytes: number | null,
  maxRows: number,
  maxBytes: number,
): ArchiveProjection {
  for (const [name, value] of Object.entries({
    currentRows: current.rows,
    currentBytes: current.bytes,
    incomingBytes,
    maxRows,
    maxBytes,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`archive capacity ${name} 非法：「${String(value)}」`);
    }
  }
  if (existingBytes !== null && (!Number.isSafeInteger(existingBytes) || existingBytes < 0)) {
    throw new RangeError(`archive capacity existingBytes 非法：「${String(existingBytes)}」`);
  }
  if (maxRows < 1 || maxBytes < 1) {
    throw new RangeError("archive capacity 上限必须为正整数");
  }
  if (existingBytes !== null && current.rows < 1) {
    throw new Error("archive capacity usage 不一致：存在替换行但 rows=0");
  }

  const rows = current.rows + (existingBytes === null ? 1 : 0);
  const bytes = current.bytes - (existingBytes ?? 0) + incomingBytes;
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError("archive capacity 投影超出安全整数范围或为负数");
  }
  return { rows, bytes, allowed: rows <= maxRows && bytes <= maxBytes };
}
