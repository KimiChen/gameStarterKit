/**
 * kit worker 的租约行（docs/MMO.md §5.4 MF7a；docs/MMO-PLAN.md MF7a-B2）。
 *
 * - 每个 `kit.json.workers[]` 对应一行 `singleton_lease('kit:<kitId>:<workerId>')`：`db:bootstrap` 按 catalog 预置
 *   （`INSERT … ON DUPLICATE KEY UPDATE lease_name = lease_name`，ODKU no-op ⇒ 两遍零新行），worker 进程只 `tryAcquireLease`
 *   已有的行（缺行即拒——⛔ worker 自己 INSERT 会让「未登记的 worker」也能上岗）。
 * - 删 kit 后行保留（同 kit 表 / 账本行的保留口径，KIT.md §5）；`plugin -- check` 用 `orphanKitWorkerLeases` 告警。
 * 连接面与 tools/kit-migrations.ts 的 SqlConn 同形（mysql2 Connection 与测试假连接都满足）。租约命名在 src/kits/workerLease.ts。
 */
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import { KIT_WORKER_LEASE_PREFIX, kitWorkerLeaseName } from "../src/kits/workerLease";

export { KIT_WORKER_LEASE_PREFIX, kitWorkerLeaseName };

export interface KitWorkerSqlConn {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

/** catalog 里全部 worker 的租约名（按 kit id、worker id 排序）。 */
export function expectedKitWorkerLeases(catalog: readonly ServerKitCatalogEntry[]): string[] {
  const names: string[] = [];
  for (const kit of [...catalog].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    for (const worker of [...(kit.workers ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      names.push(kitWorkerLeaseName(kit.id, worker.id));
    }
  }
  return names;
}

/** 与 schema.sql 预置行同形：幂等 ODKU no-op（⛔ 绝不 INSERT IGNORE / REPLACE，09·DB1），已有行的 holder / fence_token / expires_at 零触碰。 */
export const PRESET_KIT_WORKER_LEASE_SQL =
  "INSERT INTO singleton_lease (lease_name, holder, fence_token, expires_at) VALUES (?, '', 0, NOW(3)) ON DUPLICATE KEY UPDATE lease_name = lease_name";
const LIST_KIT_WORKER_LEASE_SQL = "SELECT lease_name FROM singleton_lease WHERE lease_name LIKE ? ORDER BY lease_name";

export interface PresetKitWorkerLeasesReport {
  readonly inserted: readonly string[];
  readonly existing: readonly string[];
}

async function listKitWorkerLeaseNames(conn: KitWorkerSqlConn): Promise<string[]> {
  const [rows] = await conn.query(LIST_KIT_WORKER_LEASE_SQL, [`${KIT_WORKER_LEASE_PREFIX}%`]);
  if (!Array.isArray(rows)) { throw new Error("[kit-worker] singleton_lease 读取返回形状异常"); }
  return rows.map((row) => String((row as { lease_name?: unknown }).lease_name ?? "")).filter((name) => name.length > 0);
}

/**
 * bootstrap 预置：每个 worker 一行；分类（新增 / 已有）按预置前的读取，⛔ 不按 affectedRows——mysql2 默认连接带
 * CLIENT_FOUND_ROWS，ODKU no-op 也报 affectedRows=1（matched 语义），与 -FOUND_ROWS 的池连接不一致。
 */
export async function presetKitWorkerLeases(conn: KitWorkerSqlConn, catalog: readonly ServerKitCatalogEntry[]): Promise<PresetKitWorkerLeasesReport> {
  const present = new Set(await listKitWorkerLeaseNames(conn));
  const inserted: string[] = [];
  const existing: string[] = [];
  for (const name of expectedKitWorkerLeases(catalog)) {
    await conn.query(PRESET_KIT_WORKER_LEASE_SQL, [name]);
    (present.has(name) ? existing : inserted).push(name);
  }
  return { inserted, existing };
}

/** 库里 `kit:%` 租约行中不在 catalog 里的（kit 已删 / worker 已改名）：只告警不删（KIT.md §5 保留口径）。 */
export async function orphanKitWorkerLeases(conn: KitWorkerSqlConn, catalog: readonly ServerKitCatalogEntry[]): Promise<string[]> {
  const expected = new Set(expectedKitWorkerLeases(catalog));
  return (await listKitWorkerLeaseNames(conn)).filter((name) => !expected.has(name));
}
