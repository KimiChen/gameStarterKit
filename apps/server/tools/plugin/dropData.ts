/**
 * `uninstall --drop-data`（docs/KIT.md §5）：kit 卸载默认**保留**表；显式 --drop-data 才按账本 + INFORMATION_SCHEMA 的
 * `k_<id>_` 前缀 drop，并按 `kt:<id>:` 前缀 SCAN 有界清理 Redis。⛔ 不读 kit 的文件（它们可能已经删了）。
 * 占位：K0 框架 PR（sql-bootstrap 区）落地后由其实现替换。
 */
export interface DropKitDataOptions {
  readonly kitId: string;
  readonly dryRun?: boolean;
  readonly mysqlUrl?: string;
}

export interface DropKitDataReport {
  readonly tables: readonly string[];
  readonly ledgerRows: number;
  readonly redisKeys: number;
}

export async function dropKitData(options: DropKitDataOptions): Promise<DropKitDataReport> {
  throw new Error(`[plugin] --drop-data 尚未实现（kit ${options.kitId}）：等 kit_migration 账本落地`);
}
