/**
 * arena kit 内部模块：k_arena_board / k_arena_attempt 的 SQL 访问（只经 `tx.query`，表闸由 kit-api 运行时保证）。
 * ⛔ 插件不得 import 本文件——插件可见面只有 api/<surface>/index.ts（docs/KIT.md §4）。
 */
import type { KitTx, ResultSetHeader, RowDataPacket } from "../../core/infra/kitApi";
import { ARENA_MAX_POWER, type IArenaTile, fillArenaBoard } from "@game/shared/kits/arena/api/board/index";

interface BoardRow extends RowDataPacket {
  tile: number;
  owner_uid: string;
  power: number;
}

/**
 * 行 → 格。`power` 钳到 ARENA_MAX_POWER：列是 INT UNSIGNED 无 CHECK，一行越界（人工种子 / 未来迁移）不该让
 * arena.board 的响应 validator（上限 ARENA_MAX_POWER）把整张棋盘打成契约错误——不变量在数据出口处兜住。
 */
function toTile(row: { tile: unknown; owner_uid: unknown; power: unknown }): IArenaTile {
  const tile = Number(row.tile);
  const power = Number(row.power);
  if (!Number.isSafeInteger(tile) || !Number.isSafeInteger(power) || power < 0) {
    throw new Error(`k_arena_board 行形状异常：${JSON.stringify(row)}`);
  }
  return { tile, ownerUid: typeof row.owner_uid === "string" ? row.owner_uid : "", power: Math.min(ARENA_MAX_POWER, power) };
}

/** 整张棋盘（缺失格补成无主格，恰好 ARENA_TILE_COUNT 项）。 */
export async function selectBoard(tx: KitTx, sId: number): Promise<IArenaTile[]> {
  const rows = await tx.query<BoardRow[]>(
    "SELECT tile, owner_uid, power FROM k_arena_board WHERE server_id = ? ORDER BY tile",
    [sId],
  );
  return fillArenaBoard(rows.map(toTile));
}

/** 单格加锁读（事务内 FOR UPDATE）；不存在 = 无主格。 */
export async function selectTileForUpdate(tx: KitTx, sId: number, tile: number): Promise<IArenaTile> {
  const rows = await tx.query<BoardRow[]>(
    "SELECT tile, owner_uid, power FROM k_arena_board WHERE server_id = ? AND tile = ? FOR UPDATE",
    [sId, tile],
  );
  return rows.length > 0 ? toTile(rows[0]) : { tile, ownerUid: "", power: 0 };
}

/** upsert 一格。 */
export async function upsertTile(tx: KitTx, sId: number, tile: IArenaTile): Promise<void> {
  await tx.query(
    "INSERT INTO k_arena_board (server_id, tile, owner_uid, power) VALUES (?, ?, ?, ?)"
    + " ON DUPLICATE KEY UPDATE owner_uid = VALUES(owner_uid), power = VALUES(power)",
    [sId, tile.tile, tile.ownerUid, tile.power],
  );
}

// ── 占领回执（k_arena_attempt）：每次 arena.capture 按 opId 记一行，重放只回读 ────────────────────

export type ArenaAttemptOutcome = "captured" | "reinforced" | "taken";

/** 一次占领尝试的回执（与棋盘写同一事务提交；`ownerUid` = 操作后该格主人）。 */
export interface ArenaAttemptReceipt {
  readonly opId: string;
  readonly uid: string;
  readonly tile: number;
  readonly outcome: ArenaAttemptOutcome;
  readonly power: number;
  readonly ownerUid: string;
}

interface AttemptRow extends RowDataPacket {
  op_id: string;
  uid: string;
  tile: number;
  outcome: string;
  power: number;
  owner_uid: string;
}

const OUTCOMES: readonly ArenaAttemptOutcome[] = ["captured", "reinforced", "taken"];

function toReceipt(row: AttemptRow): ArenaAttemptReceipt {
  const tile = Number(row.tile);
  const power = Number(row.power);
  const outcome = String(row.outcome) as ArenaAttemptOutcome;
  if (!Number.isSafeInteger(tile) || !Number.isSafeInteger(power) || power < 0 || !OUTCOMES.includes(outcome)) {
    throw new Error(`k_arena_attempt 行形状异常：${JSON.stringify(row)}`);
  }
  return { opId: String(row.op_id), uid: String(row.uid), tile, outcome, power: Math.min(ARENA_MAX_POWER, power), ownerUid: String(row.owner_uid) };
}

/** 同 opId 的既有回执（事务内 FOR UPDATE：与并发同 opId 串行）；null = 首次。 */
export async function selectAttemptForUpdate(tx: KitTx, sId: number, opId: string): Promise<ArenaAttemptReceipt | null> {
  const rows = await tx.query<AttemptRow[]>(
    "SELECT op_id, uid, tile, outcome, power, owner_uid FROM k_arena_attempt WHERE server_id = ? AND op_id = ? FOR UPDATE",
    [sId, opId],
  );
  return rows.length > 0 ? toReceipt(rows[0]) : null;
}

/**
 * 写回执。裸 INSERT（⛔ 不 ODKU / INSERT IGNORE）：同 opId 并发到达时第二个事务在这里撞主键抛出、整体回滚——
 * fail-closed 而不是两次改棋盘（dispatcher 的 idem 租约本已挡住同 clientReqId 并发，这里是数据层兜底）。
 */
export async function insertAttempt(tx: KitTx, sId: number, receipt: ArenaAttemptReceipt): Promise<void> {
  const result = await tx.query<ResultSetHeader>(
    "INSERT INTO k_arena_attempt (server_id, op_id, uid, tile, outcome, power, owner_uid) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [sId, receipt.opId, receipt.uid, receipt.tile, receipt.outcome, receipt.power, receipt.ownerUid],
  );
  if (result.affectedRows !== 1) { throw new Error(`k_arena_attempt 回执未写入（opId ${receipt.opId}）`); }
}
