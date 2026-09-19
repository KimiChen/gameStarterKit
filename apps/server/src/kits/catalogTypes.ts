/**
 * 服务端 kit 登记形态（手写，框架文件）：在 shared 条目之上加只有服务端要知道的面——SQL 迁移与表的区、
 * 冷档要快照的 per-user 键（docs/KIT.md §5）。`catalog.generated.ts` 由 codegen:plugins 写出。
 */
import type { KitCatalogEntry } from "@game/shared/kits/catalogTypes";

export type KitTableZone = "per-zone" | "global";
/** 表角色（docs/MMO.md §5.4 MF7a / MF7b）：`world-event` = 框架固定形态的世界事件表（列集由 verifyKitTableShapes 机检）。 */
export type KitTableRole = "world-event";

export interface KitSqlTableSpec {
  readonly name: string;
  readonly zone: KitTableZone;
  readonly role?: KitTableRole;
}

/** kit 后台 worker（MF7a）：`npm --workspace @game/server run worker -- <kit>:<id>` 按 entry 装载。 */
export interface KitWorkerSpec {
  readonly id: string;
  /** 相对仓根：`apps/server/src/kits/<kitId>/workers/<id>.ts`，默认导出 defineKitWorker(...)。 */
  readonly entry: string;
}

export interface ServerKitCatalogEntry extends KitCatalogEntry {
  /** 相对 `apps/kits/<id>/` 的迁移文件（顺序即应用顺序）。 */
  readonly sqlFiles: readonly string[];
  readonly sqlTables: readonly KitSqlTableSpec[];
  /** per-user Redis 键名（kKitUser 的 name 段）；freeze/thaw 按它快照与 UNLINK。 */
  readonly userKeys: readonly string[];
  /** 后台 worker 清单（bootstrap 预置 `singleton_lease('kit:<id>:<worker>')`）；生成物恒写出，手写 / 测试字面量缺省 = 空。 */
  readonly workers?: readonly KitWorkerSpec[];
}
