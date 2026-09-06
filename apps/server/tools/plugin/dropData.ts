/**
 * `plugin -- uninstall <kitId> --drop-data` 的数据清理（docs/KIT.md §5「卸载」）：
 * - MySQL：drop 清单来自 INFORMATION_SCHEMA 的 `k_<id 小写>_` 前缀（⛔ 不读 kit 的文件——它们可能已被删），
 *   在同一连接上先 `SET FOREIGN_KEY_CHECKS = 0` 再逐张 DROP TABLE（lint 只放行 kit 内互引的外键，父表按名排序
 *   先于子表时不能被 FK 挡住半途而废），再删 kit_migration 账本行；
 * - Redis：对服务端路由到的每个 durable 节点按 `*kt:<kitId>:*` SCAN 有界清理（UNLINK ≤500 一批）；
 *   MATCH 只是粗筛，落 UNLINK 前按 `^<项目前缀>(s<sId>_)?kt:<kitId>:` 精确过滤——别的包里恰好含 `kt:<kitId>:`
 *   子串的键（如 `pl:mkt:kfix:{uid}`）⛔ 不能被误删。
 * `dryRun` 只数不删。⛔ 本文件不解析 CLI 参数（uninstall.ts / cli.ts 由集成者接线）。
 *
 * `dropKitTables` / `dropKitRedisKeys` 各自注入连接（单测用假连接 / 假客户端）；`dropKitData` 是真连接编排。
 */
import mysql from "mysql2/promise";
import { MYSQL_URL, REDIS_KEY_PREFIX } from "../../src/core/infra/config";
import { closeRedis, durableClients } from "../../src/core/infra/redisRoute";
import { assertKitTablePrefixesUnique, kitTablePrefix } from "../../src/core/infra/zoneTables";
import { SERVER_KIT_CATALOG } from "../../src/kits/catalog.generated";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";

export interface DropKitDataOptions {
  readonly kitId: string;
  readonly dryRun?: boolean;
  readonly mysqlUrl?: string;
  readonly log?: (line: string) => void;
  /** 已登记 kit 目录（缺省生成物）：只用来拒绝「与另一个已登记 kit 只差大小写、共用表前缀」的 id。 */
  readonly catalog?: readonly ServerKitCatalogEntry[];
}

export interface DropKitDataReport {
  /** 被 drop（或 dryRun 下将被 drop）的表，按名排序。 */
  readonly tables: string[];
  /** 被删（或将被删）的 kit_migration 账本行数。 */
  readonly ledgerRows: number;
  /** 被 UNLINK（或将被 UNLINK）的 Redis 键数。 */
  readonly redisKeys: number;
}

/** 最小连接面（与 tools/kit-migrations.ts 的 SqlConn 同形）：mysql2 Connection 与测试假连接都满足。 */
export interface DropSqlConn {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

/** 最小 Redis 面：ioredis Redis 与测试假客户端都满足。 */
export interface ScanUnlinkClient {
  scan(cursor: string, matchToken: "MATCH", pattern: string, countToken: "COUNT", count: number): Promise<[string, string[]]>;
  unlink(...keys: string[]): Promise<number>;
}

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/;
const UNLINK_BATCH = 500;

/** glob 元字符转义（MATCH 模式里 kitId 本身不该有，但 fail-closed）。 */
function escapeGlob(s: string): string {
  return s.replace(/[\\*?[\]]/g, (ch) => `\\${ch}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
}

/** MySQL LIKE 通配转义（`_` 在前缀里是字面量）。 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 反引号标识符转义（表名来自 INFORMATION_SCHEMA，理论上可含反引号）。 */
function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function assertKitId(kitId: string): void {
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
}

/** SCAN 粗筛模式：`*kt:<kitId>:*`。 */
export function kitRedisScanPattern(kitId: string): string {
  return `*kt:${escapeGlob(kitId)}:*`;
}

/**
 * 精确判定：键是否属于 kit `kitId`（`<项目前缀>kt:<kitId>:…` 或 `<项目前缀>s<sId>_kt:<kitId>:…`，
 * 与 keys.ts 的 kKitUser 形态一致）。
 */
export function isKitRedisKey(key: string, kitId: string, keyPrefix: string = REDIS_KEY_PREFIX): boolean {
  return new RegExp(`^${escapeRe(keyPrefix)}(?:s[0-9]+_)?kt:${escapeRe(kitId)}:`, "u").test(key);
}

type Row = Record<string, unknown>;
function rowsOf(result: unknown): Row[] {
  return Array.isArray(result) ? (result as Row[]) : [];
}
function countOf(result: unknown): number {
  const rows = rowsOf(result);
  return Number(rows[0]?.n ?? 0);
}

export interface DropKitTablesOptions {
  readonly conn: DropSqlConn;
  readonly dbName: string;
  readonly kitId: string;
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
}

/**
 * MySQL 侧：按前缀取表、关外键检查后逐张 DROP、删账本行。
 * 传入的连接应是专用连接（`SET FOREIGN_KEY_CHECKS = 0` 是会话级；被 drop 的表全部属于本 kit，lint 禁止跨 kit REFERENCES）。
 */
export async function dropKitTables(options: DropKitTablesOptions): Promise<{ tables: string[]; ledgerRows: number }> {
  const { conn, dbName, kitId } = options;
  assertKitId(kitId);
  const dryRun = options.dryRun === true;
  const log = options.log ?? ((): void => undefined);
  const prefix = kitTablePrefix(kitId);
  const [tableRows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE ?`,
    [dbName, `${escapeLike(prefix)}%`],
  );
  const tables = rowsOf(tableRows).map((r) => String(r.TABLE_NAME)).filter((name) => name.startsWith(prefix)).sort();
  const [countRows] = await conn.query("SELECT COUNT(*) AS n FROM kit_migration WHERE kit_id = ?", [kitId]);
  const ledgerRows = countOf(countRows);
  if (dryRun) {
    for (const table of tables) { log(`  [dry-run] DROP TABLE ${table}`); }
    log(`  [dry-run] DELETE kit_migration（${ledgerRows} 行）`);
    return { tables, ledgerRows };
  }
  if (tables.length > 0) {
    // kit 内父子表按名排序可能父在前：关掉本会话的外键检查，整批 drop 不会半途卡在 ER_FK_CANNOT_DROP_PARENT
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  }
  try {
    for (const table of tables) {
      await conn.query(`DROP TABLE ${quoteIdent(table)}`);
      log(`  DROP TABLE ${table}`);
    }
  } finally {
    if (tables.length > 0) { await conn.query("SET FOREIGN_KEY_CHECKS = 1"); }
  }
  await conn.query("DELETE FROM kit_migration WHERE kit_id = ?", [kitId]);
  log(`  DELETE kit_migration（${ledgerRows} 行）`);
  return { tables, ledgerRows };
}

export interface DropKitRedisKeysOptions {
  readonly clients: readonly ScanUnlinkClient[];
  readonly kitId: string;
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
  /** 项目键前缀（缺省 config.REDIS_KEY_PREFIX）。 */
  readonly keyPrefix?: string;
}

/** Redis 侧：每个节点 SCAN 粗筛 + 精确过滤 + 有界 UNLINK；返回（将）删除的键数。 */
export async function dropKitRedisKeys(options: DropKitRedisKeysOptions): Promise<number> {
  const { clients, kitId } = options;
  assertKitId(kitId);
  const dryRun = options.dryRun === true;
  const log = options.log ?? ((): void => undefined);
  const keyPrefix = options.keyPrefix ?? REDIS_KEY_PREFIX;
  const pattern = kitRedisScanPattern(kitId);
  let total = 0;
  for (const client of clients) {
    let cursor = "0";
    let batch: string[] = [];
    const flush = async (): Promise<void> => {
      if (batch.length === 0) { return; }
      if (!dryRun) { await client.unlink(...batch); }
      total += batch.length;
      batch = [];
    };
    do {
      const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 1000);
      cursor = next;
      for (const key of keys) {
        if (!isKitRedisKey(key, kitId, keyPrefix)) { continue; } // MATCH 粗筛的误中：别的包的键
        batch.push(key);
        if (batch.length >= UNLINK_BATCH) { await flush(); }
      }
    } while (cursor !== "0");
    await flush();
  }
  log(`  ${dryRun ? "[dry-run] " : ""}Redis ${pattern}：${total} 个键`);
  return total;
}

export async function dropKitData(options: DropKitDataOptions): Promise<DropKitDataReport> {
  const { kitId } = options;
  assertKitId(kitId);
  const catalog = options.catalog ?? SERVER_KIT_CATALOG;
  // 表前缀是小写归一的：目录里若有另一个只差大小写的 kit，前缀清单会把它的表一起 drop ⇒ 拒绝
  assertKitTablePrefixesUnique([...catalog, { id: kitId, sqlTables: [] } as unknown as ServerKitCatalogEntry]);
  const dryRun = options.dryRun === true;
  const log = options.log ?? ((): void => undefined);
  const url = new URL(options.mysqlUrl ?? MYSQL_URL());
  const dbName = url.pathname.replace(/^\//, "") || "game";

  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
    database: dbName,
    multipleStatements: false,
  });
  let tables: string[];
  let ledgerRows: number;
  try {
    ({ tables, ledgerRows } = await dropKitTables({ conn, dbName, kitId, dryRun, log }));
  } finally {
    await conn.end();
  }

  let redisKeys: number;
  try {
    redisKeys = await dropKitRedisKeys({ clients: durableClients(), kitId, dryRun, log });
  } finally {
    await closeRedis();
  }
  return { tables, ledgerRows, redisKeys };
}
