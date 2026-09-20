/**
 * 卸载 kit 前的 worker 闸（docs/MMO.md MF7a-B5；docs/MMO-PLAN.md MF7a-B5）：
 *  - `role:"world-event"` 表里 `status = 0`（pending）的行 > 0 ⇒ 拒——卸载后没有 worker 再消费它们，事件永久丢失；
 *  - 该 kit 的 worker 租约 `kit:<id>:%` 有 `holder <> ''` 且 `expires_at > NOW(3)` 的行 ⇒ 拒——worker 在役，卸载会让它
 *    下一轮写已删的表 / 失租自杀；先 SIGTERM 停进程并等租约到期；
 *  - 连不上库 / 查不出来 ⇒ 拒（fail-closed，⛔ 不猜）；⛔ 没有 bypass flag（停 worker、排空事件是两个明确的人工动作，
 *    与 `--allow-pending-outbox` 的「开发期清库」不同类）。
 * `plugin -- check` 用同一查询只告警不失败，另报 catalog 里没有的 `kit:%` 孤儿租约行（删 kit 后行保留，KIT.md §5）。
 * 表名只认生成目录里带 role 的声明（`k_<kit 小写>_*` 形态机检），⛔ 不拼接任何来自锁 / 命令行的名字。
 * 连接面与 tools/plugin/outboxGate.ts 同形，单测 ⛔ 不连真库；真库回归在 test/int/kit-worker-lease.test.ts。
 */
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { KIT_WORKER_LEASE_PREFIX } from "../../src/kits/workerLease";
import { orphanKitWorkerLeases } from "../kit-workers";
import { defaultOutboxConnection } from "./outboxGate";

export interface WorkerGateSqlConn {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

export interface WorkerGateSqlConnection extends WorkerGateSqlConn {
  end(): Promise<void>;
}

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;
/** kit 表形态：`k_<kit 小写>_<名>`（kitTablePrefix 口径）；⛔ backtick / 点 / 分号。 */
const KIT_TABLE_RE = /^k_[a-z0-9]{1,64}_[A-Za-z0-9_]{1,64}$/u;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 租约行 LIKE 模式：`kit:<id>:%`——冒号是边界，`kit:kfi:%` 不会匹配 `kit:kfix:tick`。 */
export function kitWorkerLeasePattern(kitId: string): string {
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
  return `${KIT_WORKER_LEASE_PREFIX}${escapeLike(kitId)}:%`;
}

/** 在役 = holder 非空且未过期（bootstrap 预置行 holder 空 / 已过期，停掉的 worker 到期后同样不算）。 */
export const HELD_KIT_WORKER_LEASES_SQL =
  "SELECT lease_name, holder FROM singleton_lease WHERE lease_name LIKE ? AND holder <> '' AND expires_at > NOW(3) ORDER BY lease_name";

/** 只数 pending（status = 0）；表名过形态闸后 backtick 包裹。 */
export function pendingWorldEventSql(table: string): string {
  if (!KIT_TABLE_RE.test(table)) { throw new Error(`[plugin] world-event 表名非法：${table}`); }
  return `SELECT COUNT(*) AS n FROM \`${table}\` WHERE status = 0`;
}

export function worldEventTablesOf(kit: Pick<ServerKitCatalogEntry, "sqlTables"> | undefined): string[] {
  return kit === undefined ? [] : kit.sqlTables.filter((table) => table.role === "world-event").map((table) => table.name);
}

export interface KitWorkerState {
  readonly pendingEvents: readonly { readonly table: string; readonly n: number }[];
  readonly heldLeases: readonly { readonly leaseName: string; readonly holder: string }[];
}

export async function inspectKitWorkers(conn: WorkerGateSqlConn, kitId: string, worldEventTables: readonly string[]): Promise<KitWorkerState> {
  const pattern = kitWorkerLeasePattern(kitId);
  const pendingEvents: { table: string; n: number }[] = [];
  for (const table of worldEventTables) {
    const [rows] = await conn.query(pendingWorldEventSql(table));
    const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
    const n = isRecord(row) ? Number(row.n) : Number.NaN;
    if (!Number.isInteger(n) || n < 0) { throw new Error(`[plugin] ${table} 的 pending 计数返回异常：${JSON.stringify(row)}`); }
    pendingEvents.push({ table, n });
  }
  const [leaseRows] = await conn.query(HELD_KIT_WORKER_LEASES_SQL, [pattern]);
  if (!Array.isArray(leaseRows)) { throw new Error("[plugin] singleton_lease 读取返回形状异常"); }
  const heldLeases = leaseRows
    .map((row) => ({ leaseName: String(isRecord(row) ? row.lease_name ?? "" : ""), holder: String(isRecord(row) ? row.holder ?? "" : "") }))
    .filter((row) => row.leaseName.length > 0);
  return { pendingEvents, heldLeases };
}

export interface KitWorkerGateOptions {
  readonly kitId: string;
  /** 生成目录里该 kit 带 role=world-event 的表名（`worldEventTablesOf`）；目录无该 kit 时传空，只核租约行。 */
  readonly worldEventTables: readonly string[];
  /** 缺省按 MYSQL_URL 开 mysql2 连接；单测注入假连接。 */
  readonly connect?: () => Promise<WorkerGateSqlConnection>;
  readonly log?: (line: string) => void;
}

/**
 * 卸载前的闸：pending 事件行 > 0 或租约在役 ⇒ 拒；连不上库 / 查询失败一律拒（fail-closed）；⛔ 无 bypass。
 * 变异验证：把 pending 判定改成恒空 → 单测「带 pending 事件行卸载被拒」转红。
 */
export async function assertKitWorkersQuiescent(options: KitWorkerGateOptions): Promise<KitWorkerState> {
  const { kitId } = options;
  kitWorkerLeasePattern(kitId);
  let conn: WorkerGateSqlConnection;
  try {
    conn = await (options.connect ?? defaultOutboxConnection)();
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：连不上 MySQL，无法确认没有 pending 事件行 / 在役 worker（fail-closed）：${errorText(error)}`);
  }
  let state: KitWorkerState;
  try {
    state = await inspectKitWorkers(conn, kitId, options.worldEventTables);
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：kit worker 状态查询失败（fail-closed）：${errorText(error)}`);
  } finally {
    await conn.end().catch(() => undefined);
  }
  const pending = state.pendingEvents.filter((event) => event.n > 0);
  if (pending.length > 0) {
    throw new Error(
      `[plugin] 拒绝卸载 kit "${kitId}"：role=world-event 表还有 pending 事件行（${pending.map((event) => `${event.table}: ${event.n}`).join("、")}）——`
      + `先让 worker 消费完（npm --workspace @game/server run worker -- ${kitId}:<worker>）再卸载；⛔ 本闸无 bypass flag`,
    );
  }
  if (state.heldLeases.length > 0) {
    throw new Error(
      `[plugin] 拒绝卸载 kit "${kitId}"：worker 租约在役（${state.heldLeases.map((lease) => `${lease.leaseName} holder=${lease.holder}`).join("、")}）——`
      + "先停掉 worker 进程（SIGTERM：跑完当前事务即停）并等租约到期再卸载",
    );
  }
  return state;
}

/** `plugin -- check` 用：逐 kit 只产出提示行 + 目录里没有的 `kit:%` 孤儿租约行；连不上库 / 查询失败给一条「未核」提示，⛔ 不让 check 失败。 */
export async function describeKitWorkerBacklog(
  kitIds: readonly string[],
  catalog: readonly ServerKitCatalogEntry[],
  connect: () => Promise<WorkerGateSqlConnection> = defaultOutboxConnection,
): Promise<string[]> {
  if (kitIds.length === 0) { return []; }
  let conn: WorkerGateSqlConnection;
  try {
    conn = await connect();
  } catch (error) {
    return [`⚠ 未核 kit worker（连不上 MySQL：${errorText(error)}）——卸载 kit 时会再次核对并 fail-closed`];
  }
  try {
    const lines: string[] = [];
    for (const kitId of kitIds) {
      const entry = catalog.find((kit) => kit.id === kitId);
      if (entry === undefined) { lines.push(`⚠ kit "${kitId}" 不在生成目录（codegen:plugins 未刷新？）：world-event 表未核，只核了租约行`); }
      const state = await inspectKitWorkers(conn, kitId, worldEventTablesOf(entry));
      const pending = state.pendingEvents.filter((event) => event.n > 0);
      if (pending.length > 0) {
        lines.push(`⚠ kit "${kitId}" 的 world-event 表还有 pending 事件行（${pending.map((event) => `${event.table}: ${event.n}`).join("、")}）：uninstall 会拒绝，先让 worker 消费完`);
      }
      if (state.heldLeases.length > 0) {
        lines.push(`⚠ kit "${kitId}" 的 worker 租约在役（${state.heldLeases.map((lease) => `${lease.leaseName} holder=${lease.holder}`).join("、")}）：uninstall 会拒绝，先停 worker`);
      }
    }
    for (const orphan of await orphanKitWorkerLeases(conn, catalog)) {
      lines.push(`⚠ singleton_lease 有 kit worker 租约行 '${orphan}' 而目录无该 worker（删 kit 后行保留；确认弃用后可手工 DELETE）`);
    }
    return lines;
  } catch (error) {
    return [`⚠ 未核 kit worker（查询失败：${errorText(error)}）`];
  } finally {
    await conn.end().catch(() => undefined);
  }
}
