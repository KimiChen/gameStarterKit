/**
 * 卸载 kit 前的 outbox 闸（docs/KIT.md §5「卸载」行的 K1 待做项；docs/MMO.md MF0；docs/MMO-PLAN.md MF0-B3）。
 *
 * kit 的 effect kind 形如 `kit:<id>:<name>`（docs/KIT.md §4）。卸载后该 kind 离开生成物 KIT_EFFECT_KINDS，
 * `gameplay_outbox` 里仍 pending（status = 0）的该 kit intent 会在 relayer 处变成永久 EFFECT_UNKNOWN_KIND 死信。所以：
 *  - 卸载前数「status = 0 且 effect.grants[*].kind 以 `kit:<id>:` 开头」的行，> 0 即拒（fail-closed）；
 *  - 连不上库 / 数不出来同样拒——不知道就不放行，⛔ 不猜；
 *  - `--allow-pending-outbox` 只在 NODE_ENV !== "production" 放行并打印警告（开发期清库场景）；生产环境连这个 flag 都拒。
 * `plugin -- check` 用同一计数只告警不失败（check 是只读核对，数据面异常给一条「未核」提示）。
 *
 * 连接面与 tools/plugin/dropData.ts 同形（mysql2 Connection 与测试假连接都满足），单测 ⛔ 不连真库；
 * 真库回归在 test/int/kit-migrations.test.ts。
 */
import mysql from "mysql2/promise";
import { MYSQL_URL } from "../../src/core/infra/config";

/** 最小连接面：`query` 返回 mysql2 的 `[rows, fields]`。 */
export interface OutboxSqlConn {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

export interface OutboxSqlConnection extends OutboxSqlConn {
  end(): Promise<void>;
}

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/;

/** MySQL LIKE / JSON_SEARCH 通配转义（kit id 形态上不含这些字符，仍 fail-closed 地转）。 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** JSON_SEARCH 的搜索模式：`kit:<id>:%`——冒号是边界，`kit:kfi:%` 不会匹配 `kit:kfix:trophy`。 */
export function kitEffectKindPattern(kitId: string): string {
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
  return `kit:${escapeLike(kitId)}:%`;
}

/** 只数 pending（status = 0）；effect 是 JSON 信封 `{ schemaVersion, grants: [{ kind, … }] }`（shared IEffect）。 */
export const PENDING_KIT_OUTBOX_SQL =
  "SELECT COUNT(*) AS n FROM gameplay_outbox WHERE status = 0 AND JSON_SEARCH(effect, 'one', ?, NULL, '$.grants[*].kind') IS NOT NULL";

export async function countPendingKitOutbox(conn: OutboxSqlConn, kitId: string): Promise<number> {
  const pattern = kitEffectKindPattern(kitId);
  const [rows] = await conn.query(PENDING_KIT_OUTBOX_SQL, [pattern]);
  const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
  const n = isRecord(row) ? Number(row.n) : Number.NaN;
  if (!Number.isInteger(n) || n < 0) { throw new Error(`[plugin] gameplay_outbox 计数返回异常：${JSON.stringify(row)}`); }
  return n;
}

export interface KitOutboxGateOptions {
  readonly kitId: string;
  /** 非生产环境放行并告警；生产环境带此 flag 直接拒。 */
  readonly allowPendingOutbox?: boolean;
  /** 缺省 process.env.NODE_ENV。 */
  readonly nodeEnv?: string;
  /** 缺省按 MYSQL_URL 开 mysql2 连接；单测注入假连接。 */
  readonly connect?: () => Promise<OutboxSqlConnection>;
  readonly log?: (line: string) => void;
}

export interface KitOutboxGateReport {
  readonly pending: number;
  /** true = pending > 0 但被 --allow-pending-outbox 放行。 */
  readonly bypassed: boolean;
}

export async function defaultOutboxConnection(mysqlUrl: string = MYSQL_URL()): Promise<OutboxSqlConnection> {
  const url = new URL(mysqlUrl);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
    database: url.pathname.replace(/^\//, ""),
    multipleStatements: false,
  });
  return conn;
}

/**
 * 卸载 kit 前的闸：pending > 0 拒（或非生产 + flag 放行并告警）；连不上库 / 计数失败一律拒（fail-closed）。
 * 变异验证：把 countPendingKitOutbox 的返回改成常量 0 → 单测「带 pending 卸载被拒」转红。
 */
export async function assertKitOutboxDrained(options: KitOutboxGateOptions): Promise<KitOutboxGateReport> {
  const { kitId } = options;
  kitEffectKindPattern(kitId);
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "";
  const log = options.log ?? ((line: string): void => { console.log(line); });
  if (options.allowPendingOutbox && nodeEnv === "production") {
    throw new Error(`[plugin] --allow-pending-outbox 只在非生产环境可用（当前 NODE_ENV=production）：kit "${kitId}" 的 pending outbox 必须先由 relayer 排空`);
  }
  let conn: OutboxSqlConnection;
  try {
    conn = await (options.connect ?? defaultOutboxConnection)();
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：连不上 MySQL，无法确认 gameplay_outbox 里没有该 kit 的 pending intent（fail-closed）：${errorText(error)}`);
  }
  let pending: number;
  try {
    pending = await countPendingKitOutbox(conn, kitId);
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：gameplay_outbox 计数失败（fail-closed）：${errorText(error)}`);
  } finally {
    await conn.end().catch(() => undefined);
  }
  if (pending === 0) { return { pending: 0, bypassed: false }; }
  if (options.allowPendingOutbox) {
    log(`⚠ kit "${kitId}" 仍有 ${pending} 条 pending outbox intent（kind kit:${kitId}:*），--allow-pending-outbox 放行：卸载后它们会成为 relayer 的 EFFECT_UNKNOWN_KIND 死信`);
    return { pending, bypassed: true };
  }
  throw new Error(
    `[plugin] 拒绝卸载 kit "${kitId}"：gameplay_outbox 里还有 ${pending} 条 status=0 的 kit:${kitId}:* intent——`
    + "先让 relayer 排空（npm --workspace @game/server run relayer）再卸载；非生产环境可加 --allow-pending-outbox 强行放行（这些行会变成永久死信）",
  );
}

/** `plugin -- check` 用：逐 kit 计数只产出提示行；连不上库 / 计数失败给一条「未核」提示，⛔ 不让 check 失败。 */
export async function describeKitOutboxBacklog(
  kitIds: readonly string[],
  connect: () => Promise<OutboxSqlConnection> = defaultOutboxConnection,
): Promise<string[]> {
  if (kitIds.length === 0) { return []; }
  let conn: OutboxSqlConnection;
  try {
    conn = await connect();
  } catch (error) {
    return [`⚠ 未核 gameplay_outbox（连不上 MySQL：${errorText(error)}）——卸载 kit 时会再次核对并 fail-closed`];
  }
  try {
    const lines: string[] = [];
    for (const kitId of kitIds) {
      const pending = await countPendingKitOutbox(conn, kitId);
      if (pending > 0) { lines.push(`⚠ kit "${kitId}" 仍有 ${pending} 条 pending outbox intent（kind kit:${kitId}:*）：uninstall 会拒绝，先让 relayer 排空`); }
    }
    return lines;
  } catch (error) {
    return [`⚠ 未核 gameplay_outbox（计数失败：${errorText(error)}）`];
  } finally {
    await conn.end().catch(() => undefined);
  }
}
