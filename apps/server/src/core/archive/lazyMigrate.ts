/**
 * 冷档懒迁移挂接点（[08 · user_archive 表](docs/SERVER.md) /
 * 09·S1：Redis 玩法档 blob 带 schemaVersion，读侧强制兼容 N 与 N-1）。
 *
 * thaw 在把快照写回 Redis **之前**经过这里：把 `user_archive.schema_version` 的旧格式
 * 迁到当前 SCHEMA_VERSION。冷档可能一冻数月，跨越多个 schema 版本——这里是唯一能把
 * N-k 老档拉回 N 的地方（在线档由 S1 的双读/灰度双写覆盖，只保证 N 与 N-1）。
 *
 * 实际迁移步骤与热档共用 `core/userSchema.ts` 的 registry；本文件只负责 archive
 * 容器（bag/applied/payload/kits）深校验与不可变地替换 migrated user。
 */
import { splitKitSnapshotName, type ArchiveSnapshot } from "./archiveScripts";
import { BAG_SHARDS, SCHEMA_VERSION } from "../infra/config";
import { isKitKeySegment } from "../infra/keys";
import { storedInt } from "../infra/numbers";
import { migrateUserSchemaToCurrent, validateUserSchema } from "../userSchema";

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

/**
 * 可选顶层成员 `kits`（KIT.md §5）：`<kitId>:<name>` → string→string HASH。pre-K0 快照没有它；
 * 有则每个成员名必须是合法的两段（thaw 会按它拼 kKitUser，畸形名在这里 fail-closed，⛔ 不能带进 Lua）。
 */
function validateKitsMember(value: unknown): asserts value is Record<string, Record<string, string>> {
  if (!isRecord(value)) { throw new Error("archive snapshot.kits 形状非法"); }
  for (const [snapshotName, hash] of Object.entries(value)) {
    const { kitId, name } = splitKitSnapshotName(snapshotName);
    // 与 kKitUser 同一判据（keys.ts 唯一真源，⛔ 不复制正则）：校验器放行的名字 thaw 建 KEYS 时必能进 kKitUser
    if (!isKitKeySegment(kitId) || !isKitKeySegment(name)) {
      throw new Error(`archive snapshot.kits 键名非法：「${snapshotName}」（分段不得含 ':' / '{' / '}'）`);
    }
    validateStringRecord(hash, `archive snapshot.kits[${snapshotName}]`);
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
    || keys.some((key) => !["user", "bag", "applied", "appliedPayload", "kits"].includes(key))) {
    throw new Error("archive snapshot 字段集合非法");
  }
  validateStringRecord(snapshot.user, "archive snapshot.user");
  try {
    validateUserSchema(snapshot.user, fromVersion);
  } catch (error) {
    throw new Error(
      `archive snapshot user schema 非法：${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
  if (snapshot.kits !== undefined) {
    validateKitsMember(snapshot.kits);
  }
}

/**
 * 把 fromVersion 格式的快照迁移到当前 SCHEMA_VERSION 格式。
 * 纯函数：只变换快照对象，⛔ 不碰 Redis / MySQL（原子恢复仍由 thawRestore 单条 Lua 完成，09·F3）。
 */
export async function lazyMigrateSchema(
  snapshot: ArchiveSnapshot,
  fromVersion: number,
): Promise<ArchiveSnapshot> {
  validateArchiveSnapshotSchema(snapshot, fromVersion);
  const user = migrateUserSchemaToCurrent(snapshot.user, fromVersion);
  const migrated: ArchiveSnapshot = { ...snapshot, user };
  validateArchiveSnapshotSchema(migrated, SCHEMA_VERSION);
  return migrated;
}
