/**
 * `plugin -- uninstall <kitId> --drop-data` 的数据清理（docs/KIT.md §5「卸载」）：
 * - MySQL：drop 清单来自 INFORMATION_SCHEMA 的 `k_<id 小写>_` 前缀（⛔ 不读 kit 的文件——它们可能已被删），
 *   DROP TABLE 每一张，再删 kit_migration 账本行；
 * - Redis：对服务端路由到的每个 durable 节点按 `*kt:<kitId>:*` SCAN 有界清理（UNLINK ≤500 一批）。
 * `dryRun` 只数不删。⛔ 本文件不解析 CLI 参数（uninstall.ts / cli.ts 由集成者接线）。
 */
import mysql from "mysql2/promise";
import { MYSQL_URL } from "../../src/core/infra/config";
import { closeRedis, durableClients } from "../../src/core/infra/redisRoute";
import { kitTablePrefix } from "../../src/core/infra/zoneTables";

export interface DropKitDataOptions {
  readonly kitId: string;
  readonly dryRun?: boolean;
  readonly mysqlUrl?: string;
  readonly log?: (line: string) => void;
}

export interface DropKitDataReport {
  /** 被 drop（或 dryRun 下将被 drop）的表，按名排序。 */
  readonly tables: string[];
  /** 被删（或将被删）的 kit_migration 账本行数。 */
  readonly ledgerRows: number;
  /** 被 UNLINK（或将被 UNLINK）的 Redis 键数。 */
  readonly redisKeys: number;
}

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/;
const UNLINK_BATCH = 500;

/** glob 元字符转义（MATCH 模式里 kitId 本身不该有，但 fail-closed）。 */
function escapeGlob(s: string): string {
  return s.replace(/[\\*?[\]]/g, (ch) => `\\${ch}`);
}

interface CountRow extends mysql.RowDataPacket { n: number }
interface TableRow extends mysql.RowDataPacket { TABLE_NAME: string }

export async function dropKitData(options: DropKitDataOptions): Promise<DropKitDataReport> {
  const { kitId } = options;
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
  const dryRun = options.dryRun === true;
  const log = options.log ?? ((): void => undefined);
  const url = new URL(options.mysqlUrl ?? MYSQL_URL());
  const dbName = url.pathname.replace(/^\//, "") || "game";
  const prefix = kitTablePrefix(kitId);

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
    const [tableRows] = await conn.query<TableRow[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE ?`,
      [dbName, `${prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`],
    );
    tables = tableRows.map((r) => r.TABLE_NAME).filter((name) => name.startsWith(prefix)).sort();
    const [countRows] = await conn.query<CountRow[]>(
      "SELECT COUNT(*) AS n FROM kit_migration WHERE kit_id = ?",
      [kitId],
    );
    ledgerRows = Number(countRows[0]?.n ?? 0);
    for (const table of tables) {
      if (dryRun) { log(`  [dry-run] DROP TABLE ${table}`); continue; }
      await conn.query(`DROP TABLE \`${table}\``);
      log(`  DROP TABLE ${table}`);
    }
    if (!dryRun) {
      await conn.query("DELETE FROM kit_migration WHERE kit_id = ?", [kitId]);
      log(`  DELETE kit_migration（${ledgerRows} 行）`);
    }
  } finally {
    await conn.end();
  }

  // Redis：按 kt:<kitId>: 前缀有界 SCAN；服务端路由到的每个 durable 节点各扫一遍
  const pattern = `*kt:${escapeGlob(kitId)}:*`;
  let redisKeys = 0;
  try {
    for (const client of durableClients()) {
      let cursor = "0";
      let batch: string[] = [];
      const flush = async (): Promise<void> => {
        if (batch.length === 0) { return; }
        if (!dryRun) { await client.unlink(...batch); }
        redisKeys += batch.length;
        batch = [];
      };
      do {
        const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 1000);
        cursor = next;
        for (const key of keys) {
          batch.push(key);
          if (batch.length >= UNLINK_BATCH) { await flush(); }
        }
      } while (cursor !== "0");
      await flush();
    }
  } finally {
    await closeRedis();
  }
  log(`  ${dryRun ? "[dry-run] " : ""}Redis ${pattern}：${redisKeys} 个键`);
  return { tables, ledgerRows, redisKeys };
}
