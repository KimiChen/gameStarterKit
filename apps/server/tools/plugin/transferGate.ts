/**
 * 卸载 kit 的交接闸（MMO MF8-B7；docs/MMO.md MF8 表「tools/plugin/uninstall.ts：world_transfer 有该 kit 在途行 → 拒」，自 MF7b 挪来 v1.2 P2）：
 * 该 kit 的 persona（persona.kit_id）还有在途交接（world_transfer.active_key IS NOT NULL：requested / prepared / committed / activated）⇒ 拒——
 * 卸载后没有房间能接住这些 persona，凭据与预留会悬空；连不上库 / 查询失败一律拒（fail-closed）；⛔ 无 bypass flag（先让在途交接收敛：
 * 客户端完成 resolveTransfer → 目标房 finalize，或 Committed 前的行按预留到期 cancelled）。
 * 变异验证：把在途计数改成恒 0 → 单测「带在途交接卸载被拒」转红。
 */
import { defaultOutboxConnection } from "./outboxGate";
import type { WorkerGateSqlConn, WorkerGateSqlConnection } from "./workerGate";

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;

/** 在途 = active_key 非 NULL（终态 finalized / cancelled 置 NULL）；按 persona.kit_id 归属到 kit。 */
export const IN_FLIGHT_TRANSFERS_SQL =
  "SELECT COUNT(*) AS n FROM world_transfer t JOIN persona p ON p.server_id = t.server_id AND p.persona_id = t.persona_id "
  + "WHERE p.kit_id = ? AND t.active_key IS NOT NULL";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function countInFlightTransfers(conn: WorkerGateSqlConn, kitId: string): Promise<number> {
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
  const [rows] = await conn.query(IN_FLIGHT_TRANSFERS_SQL, [kitId]);
  const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
  const n = row !== null && typeof row === "object" ? Number((row as { n?: unknown }).n) : Number.NaN;
  if (!Number.isInteger(n) || n < 0) { throw new Error(`[plugin] world_transfer 在途计数返回异常：${JSON.stringify(row)}`); }
  return n;
}

export interface KitTransferGateOptions {
  readonly kitId: string;
  /** 缺省按 MYSQL_URL 开 mysql2 连接；单测注入假连接。 */
  readonly connect?: () => Promise<WorkerGateSqlConnection>;
  readonly log?: (line: string) => void;
}

/** 卸载前的闸：在途交接 > 0 ⇒ 拒；连不上库 / 查询失败一律拒（fail-closed）；⛔ 无 bypass。返回在途条数（恒 0）。 */
export async function assertKitTransfersDrained(options: KitTransferGateOptions): Promise<number> {
  const { kitId } = options;
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
  let conn: WorkerGateSqlConnection;
  try {
    conn = await (options.connect ?? defaultOutboxConnection)();
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：连不上 MySQL，无法确认没有在途交接（fail-closed）：${errorText(error)}`);
  }
  let inFlight: number;
  try {
    inFlight = await countInFlightTransfers(conn, kitId);
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：world_transfer 在途查询失败（fail-closed）：${errorText(error)}`);
  } finally {
    await conn.end().catch(() => undefined);
  }
  if (inFlight > 0) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：world_transfer 还有 ${inFlight} 条该 kit persona 的在途交接（requested / prepared / committed / activated）——先让交接收敛（客户端 resolveTransfer → 目标房 finalize；Committed 前的行随预留到期 cancelled），⛔ 无 bypass`);
  }
  options.log?.(`world_transfer：kit "${kitId}" 无在途交接 ✔`);
  return inFlight;
}
