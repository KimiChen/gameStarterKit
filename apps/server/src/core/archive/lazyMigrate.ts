/**
 * 冷档懒迁移挂接点（[08 · user_archive 表](docs/SERVER.md) /
 * 09·S1：Redis 玩法档 blob 带 schemaVersion，读侧强制兼容 N 与 N-1）。
 *
 * thaw 在把快照写回 Redis **之前**经过这里：把 `user_archive.schema_version` 的旧格式
 * 迁到当前 SCHEMA_VERSION。冷档可能一冻数月，跨越多个 schema 版本——这里是唯一能把
 * N-k 老档拉回 N 的地方（在线档由 S1 的双读/灰度双写覆盖，只保证 N 与 N-1）。
 *
 * **首版恒等函数**（10·M9 / 09·S1）：SCHEMA_VERSION 仍是 1，无历史格式可迁。
 * ⚠ 第一次 schema 变更前必须实现真迁移（10 · 范围裁剪指引：懒迁移 worker 可以晚，
 * 但「第一次 schema 变更前必须就绪」）。
 */
import type { ArchiveSnapshot } from "./archiveScripts";
import { BAG_SHARDS, SCHEMA_VERSION } from "../infra/config";
import { storedInt } from "../infra/numbers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateStringRecord(value: unknown, label: string): asserts value is Record<string, string> {
  if (!isRecord(value)) { throw new Error(`${label} 形状非法`); }
  for (const [field, stored] of Object.entries(value)) {
    if (typeof stored !== "string") {
      throw new Error(`${label}.${field} 不是字符串`);
    }
  }
}

export function validateArchiveSnapshotSchema(
  snapshot: ArchiveSnapshot,
  fromVersion: number,
): void {
  if (!Number.isSafeInteger(fromVersion) || fromVersion < 1 || fromVersion > SCHEMA_VERSION) {
    throw new Error(
      `archive schema_version 不受支持：${String(fromVersion)}（current=${SCHEMA_VERSION}）`,
    );
  }
  if (!isRecord(snapshot)) { throw new Error("archive snapshot 形状非法"); }
  const keys = Object.keys(snapshot);
  if (!keys.includes("user") || !keys.includes("bag") || !keys.includes("applied")
    || keys.some((key) => !["user", "bag", "applied", "appliedPayload"].includes(key))) {
    throw new Error("archive snapshot 字段集合非法");
  }
  validateStringRecord(snapshot.user, "archive snapshot.user");
  const embeddedRaw = snapshot.user.schemaVersion;
  if (typeof embeddedRaw !== "string" || !/^[1-9]\d*$/.test(embeddedRaw)) {
    throw new Error(`archive snapshot.user.schemaVersion 非法：「${String(embeddedRaw)}」`);
  }
  const embedded = Number(embeddedRaw);
  if (!Number.isSafeInteger(embedded) || embedded !== fromVersion) {
    throw new Error(
      `archive schema 里外不一致：outer=${fromVersion} embedded=${String(embeddedRaw)}`,
    );
  }
  storedInt(snapshot.user.ver, "archive snapshot.user.ver", {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });
  if (!Array.isArray(snapshot.bag) || snapshot.bag.length !== BAG_SHARDS) {
    throw new Error(`archive snapshot.bag 分片数非法：${String(snapshot.bag?.length)}`);
  }
  snapshot.bag.forEach((shard, index) => {
    validateStringRecord(shard, `archive snapshot.bag[${index}]`);
  });
  if (!Array.isArray(snapshot.applied) || snapshot.applied.length % 2 !== 0) {
    throw new Error("archive snapshot.applied 形状非法");
  }
  for (let i = 0; i < snapshot.applied.length; i += 2) {
    const member = snapshot.applied[i];
    const score = snapshot.applied[i + 1];
    if (typeof member !== "string" || typeof score !== "string") {
      throw new Error(`archive snapshot.applied[${i}] 类型非法`);
    }
    storedInt(score, `archive snapshot.applied[${i + 1}]`, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
  }
  if (snapshot.appliedPayload !== undefined) {
    validateStringRecord(snapshot.appliedPayload, "archive snapshot.appliedPayload");
  }
}

/**
 * 把 fromVersion 格式的快照迁移到当前 SCHEMA_VERSION 格式。
 * 纯函数：只变换快照对象，⛔ 不碰 Redis / MySQL（原子恢复仍由 thawRestore 单条 Lua 完成，09·F3）。
 */
export async function lazyMigrateSchema(
  snapshot: ArchiveSnapshot,
  // ⚠ `_` 前缀 = 有意未用（TS 的 noUnusedParameters 内置逃生口）：首版恒等，签名为真迁移预留。
  // ⛔ 别删这个参数——删了将来加迁移要改所有调用点。（原先挂的 eslint-disable 是死注释：本仓无 eslint。）
  fromVersion: number,
): Promise<ArchiveSnapshot> {
  validateArchiveSnapshotSchema(snapshot, fromVersion);
  // SCHEMA_VERSION == 1：唯一存在过的格式，恒等返回（09·S1）。
  // 未来样例：
  //   if (fromVersion < 2) { snapshot = migrateV1toV2(snapshot); }
  //   snapshot.user.schemaVersion = String(SCHEMA_VERSION);
  return snapshot;
}
