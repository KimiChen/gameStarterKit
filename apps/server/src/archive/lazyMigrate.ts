/**
 * 冷档懒迁移挂接点（[08 · user_archive 表](../../../../docs/server/08-cold-archive.md#user_archive-表) /
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

/**
 * 把 fromVersion 格式的快照迁移到当前 SCHEMA_VERSION 格式。
 * 纯函数：只变换快照对象，⛔ 不碰 Redis / MySQL（原子恢复仍由 thawRestore 单条 Lua 完成，09·F3）。
 */
export async function lazyMigrateSchema(
  snapshot: ArchiveSnapshot,
  fromVersion: number, // eslint-disable-line @typescript-eslint/no-unused-vars -- 首版恒等，签名为真迁移预留
): Promise<ArchiveSnapshot> {
  // SCHEMA_VERSION == 1：唯一存在过的格式，恒等返回（09·S1）。
  // 未来样例：
  //   if (fromVersion < 2) { snapshot = migrateV1toV2(snapshot); }
  //   snapshot.user.schemaVersion = String(SCHEMA_VERSION);
  return snapshot;
}
