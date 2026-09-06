/**
 * 按区表登记（docs/KIT.md §5「区」/ docs/SERVER.md §3）：框架表的 per-zone / global 分类 + kit 表按
 * `kit.json.sql.tables[].zone` 汇入。关单区 / 统计 / 冷档遍历与 smoke 的「表齐全」都从这里取全集，
 * ⛔ 不再各处手抄表名清单。
 *
 * - per-zone 表：有 `server_id SMALLINT UNSIGNED NOT NULL` 且进主键与每个 UNIQUE（kit 表由
 *   tools/kit-migrations.ts 的 verifyKitTableShapes 机检；框架表 `match_results` 是刻意例外——
 *   分区表 PK 不含 server_id，见 schema.sql 表头注释）。
 * - global 表：不得有 server_id（`match_index` / `singleton_lease` / `kit_migration`）。
 *
 * catalog 参数缺省为生成物 SERVER_KIT_CATALOG；测试注入自己的目录，⛔ 不 mock 生成物。
 */
import { SERVER_KIT_CATALOG } from "../../kits/catalog.generated";
import type { KitTableZone, ServerKitCatalogEntry } from "../../kits/catalogTypes";

/** 框架 per-zone 表（schema.sql 顺序）。 */
export const FRAMEWORK_PER_ZONE_TABLES: readonly string[] = [
  "user_currency",
  "currency_ledger",
  "gameplay_outbox",
  "purchases",
  "match_results",
  "mail",
  "user_archive",
  "archive_zone_usage",
  "user_snapshot_readonly",
];

/** 框架全局表（刻意无 server_id，⛔ 不能机械加区）。 */
export const FRAMEWORK_GLOBAL_TABLES: readonly string[] = [
  "singleton_lease",
  "match_index",
  "kit_migration",
];

/** kit 表名前缀：`k_<id 小写>_`（KIT.md §2）。 */
export function kitTablePrefix(kitId: string): string {
  return `k_${kitId.toLowerCase()}_`;
}

function kitTablesByZone(catalog: readonly ServerKitCatalogEntry[], zone: KitTableZone): string[] {
  const out: string[] = [];
  for (const kit of catalog) {
    for (const table of kit.sqlTables) {
      if (table.zone === zone) { out.push(table.name); }
    }
  }
  return out;
}

/** 框架 ∪ 全部 kit 的 per-zone 表。 */
export function perZoneTables(catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG): string[] {
  return [...FRAMEWORK_PER_ZONE_TABLES, ...kitTablesByZone(catalog, "per-zone")];
}

/** 框架 ∪ 全部 kit 的 global 表。 */
export function globalTables(catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG): string[] {
  return [...FRAMEWORK_GLOBAL_TABLES, ...kitTablesByZone(catalog, "global")];
}

/** 全部表（框架 ∪ 每个 kit 的 sqlTables，不分区）。 */
export function allTables(catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG): string[] {
  return [...perZoneTables(catalog), ...globalTables(catalog)];
}
