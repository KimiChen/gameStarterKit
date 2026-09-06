/**
 * 服务端 kit 登记形态（手写，框架文件）：在 shared 条目之上加只有服务端要知道的面——SQL 迁移与表的区、
 * 冷档要快照的 per-user 键（docs/KIT.md §5）。`catalog.generated.ts` 由 codegen:plugins 写出。
 */
import type { KitCatalogEntry } from "@game/shared/kits/catalogTypes";

export type KitTableZone = "per-zone" | "global";

export interface KitSqlTableSpec {
  readonly name: string;
  readonly zone: KitTableZone;
}

export interface ServerKitCatalogEntry extends KitCatalogEntry {
  /** 相对 `apps/kits/<id>/` 的迁移文件（顺序即应用顺序）。 */
  readonly sqlFiles: readonly string[];
  readonly sqlTables: readonly KitSqlTableSpec[];
  /** per-user Redis 键名（kKitUser 的 name 段）；freeze/thaw 按它快照与 UNLINK。 */
  readonly userKeys: readonly string[];
}
