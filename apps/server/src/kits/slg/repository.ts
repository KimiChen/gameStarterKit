/** SLG 内部存储；所有 SQL 仅经受限 KitTx，调用方必须先持有本区 revision 行锁。 */
import type { ISlgMarch } from "@game/shared/kits/slg/api/march/index";
import {
  SLG_CHUNK_SIZE, SLG_MAX_GUARD_POWER,
  type ISlgChunkRect, type ISlgTile, slgMapIndex, slgMapInfo, tileIdFromGrid, validateSlgTileId,
} from "@game/shared/kits/slg/api/worldmap/index";
import type { KitTx, RowDataPacket } from "../../core/infra/kitApi";

export type SlgReceiptKind = "capture" | "dispatch" | "recall" | "settle";
export interface SlgReceipt {
  readonly opId: string;
  readonly uid: string;
  readonly hash: string;
  readonly contractVersion: number;
  readonly kind: SlgReceiptKind;
  readonly response: unknown;
}
export interface SlgChange {
  readonly revision: number;
  readonly entity: "tile" | "march";
  readonly operation: string;
  readonly payload: unknown;
  readonly tombstone: boolean;
}

/** 此接口仅供 kit 内部事务编排与无头测试注入，插件消费 api/ 门面。 */
export interface SlgRepository {
  lockRevision(): Promise<number>;
  readTile(tileId: number): Promise<ISlgTile>;
  insertTile(tile: ISlgTile): Promise<boolean>;
  updateTile(tile: ISlgTile): Promise<void>;
  readTiles(mapId: string, rect: ISlgChunkRect): Promise<ISlgTile[]>;
  readReceipt(kind: SlgReceiptKind, opId: string): Promise<SlgReceipt | null>;
  insertReceipt(receipt: SlgReceipt): Promise<void>;
  updateReceipt(kind: SlgReceiptKind, opId: string, response: unknown): Promise<void>;
  readMarch(marchId: string): Promise<ISlgMarch | null>;
  insertMarch(march: ISlgMarch): Promise<void>;
  updateMarch(march: ISlgMarch): Promise<void>;
  readDue(now: number, limit: number): Promise<ISlgMarch[]>;
  countActive(uid: string): Promise<number>;
  appendTile(tile: ISlgTile, operation: string): Promise<number>;
  appendMarch(march: ISlgMarch, operation: string): Promise<number>;
  readChanges(after: number, limit: number): Promise<SlgChange[]>;
  readonly revision: number;
}

function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(`SLG ${label} 数据异常`);
  return n;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`SLG ${label} 数据异常`);
  return value;
}
function json(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}
function tileOf(row: RowDataPacket): ISlgTile {
  return {
    tileId: validateSlgTileId(integer(row.tile_id, "tile_id")),
    ownerUid: text(row.owner_uid, "owner_uid"),
    guardPower: integer(row.guard_power, "guard_power", SLG_MAX_GUARD_POWER),
  };
}
function marchOf(row: RowDataPacket): ISlgMarch {
  const status = row.status;
  if (status !== "marching" && status !== "arrived" && status !== "recalled") throw new Error("SLG march status 数据异常");
  const departAt = integer(row.depart_at, "depart_at");
  const arriveAt = integer(row.arrive_at, "arrive_at");
  if (arriveAt <= departAt) throw new Error("SLG 行军时间异常");
  return {
    marchId: text(row.march_id, "march_id"), uid: text(row.uid, "uid"),
    fromTile: validateSlgTileId(integer(row.from_tile, "from_tile")),
    toTile: validateSlgTileId(integer(row.to_tile, "to_tile")), departAt, arriveAt, status,
  };
}
const MARCH_COLUMNS = "march_id, uid, from_tile, to_tile, depart_at, arrive_at, status";

export function createSqlSlgRepository(tx: KitTx, sId: number): SlgRepository {
  let revision = -1;
  function assertLocked(): void {
    if (revision < 0) throw new Error("SLG repository 使用前须锁定 revision");
  }
  async function nextRevision(): Promise<number> {
    assertLocked();
    if (revision >= Number.MAX_SAFE_INTEGER) throw new Error("SLG revision 已耗尽");
    revision += 1;
    await tx.query("UPDATE k_slg_revision SET revision = ? WHERE server_id = ?", [revision, sId]);
    return revision;
  }
  return {
    get revision() { assertLocked(); return revision; },
    async lockRevision() {
      if (revision >= 0) return revision;
      await tx.query("INSERT INTO k_slg_revision (server_id, revision) VALUES (?, 0) ON DUPLICATE KEY UPDATE server_id = VALUES(server_id)", [sId]);
      const rows = await tx.query<RowDataPacket[]>("SELECT revision FROM k_slg_revision WHERE server_id = ? FOR UPDATE", [sId]);
      if (rows.length !== 1) throw new Error("SLG revision 行缺失");
      revision = integer(rows[0].revision, "revision");
      return revision;
    },
    async readTile(tileId) {
      assertLocked();
      const rows = await tx.query<RowDataPacket[]>("SELECT tile_id, owner_uid, guard_power FROM k_slg_tile WHERE server_id = ? AND tile_id = ? FOR UPDATE", [sId, tileId]);
      return rows.length ? tileOf(rows[0]) : { tileId, ownerUid: "", guardPower: 0 };
    },
    async insertTile(tile) {
      assertLocked();
      try {
        await tx.query("INSERT INTO k_slg_tile (server_id, tile_id, owner_uid, guard_power) VALUES (?, ?, ?, ?)", [sId, tile.tileId, tile.ownerUid, tile.guardPower]);
        return true;
      } catch (error) {
        if (typeof error === "object" && error !== null && (error as { errno?: number }).errno === 1062) return false;
        throw error;
      }
    },
    async updateTile(tile) {
      assertLocked();
      await tx.query("UPDATE k_slg_tile SET owner_uid = ?, guard_power = ? WHERE server_id = ? AND tile_id = ?", [tile.ownerUid, tile.guardPower, sId, tile.tileId]);
    },
    async readTiles(mapId, rect) {
      assertLocked();
      const mapIndex = slgMapIndex(mapId);
      const info = slgMapInfo(mapId);
      const minX = rect.minX * SLG_CHUNK_SIZE;
      const maxX = Math.min(info.width, (rect.maxX + 1) * SLG_CHUNK_SIZE) - 1;
      const maxY = Math.min(info.height, (rect.maxY + 1) * SLG_CHUNK_SIZE) - 1;
      const ranges: string[] = [];
      const params: unknown[] = [sId];
      for (let y = rect.minY * SLG_CHUNK_SIZE; y <= maxY; y += 1) {
        ranges.push("tile_id BETWEEN ? AND ?");
        params.push(tileIdFromGrid(mapIndex, minX, y), tileIdFromGrid(mapIndex, maxX, y));
      }
      const rows = await tx.query<RowDataPacket[]>(`SELECT tile_id, owner_uid, guard_power FROM k_slg_tile WHERE server_id = ? AND (${ranges.join(" OR ")}) ORDER BY tile_id`, params);
      return rows.map(tileOf);
    },
    async readReceipt(kind, opId) {
      assertLocked();
      const table = kind === "capture" ? "k_slg_capture" : "k_slg_march_receipt";
      const rows = await tx.query<RowDataPacket[]>(`SELECT uid, payload_hash, contract_version, response_json${kind === "capture" ? "" : ", kind"} FROM ${table} WHERE server_id = ? AND op_id = ?`, [sId, opId]);
      if (!rows.length) return null;
      const row = rows[0];
      const storedKind = kind === "capture" ? "capture" : text(row.kind, "receipt kind");
      if (!["capture", "dispatch", "recall", "settle"].includes(storedKind)) throw new Error("SLG receipt kind 数据异常");
      return { opId, uid: text(row.uid, "receipt uid"), hash: text(row.payload_hash, "payload_hash"), contractVersion: integer(row.contract_version, "contract_version"), kind: storedKind as SlgReceiptKind, response: json(row.response_json) };
    },
    async insertReceipt(receipt) {
      assertLocked();
      const params = [sId, receipt.opId, receipt.uid, receipt.hash, receipt.contractVersion, JSON.stringify(receipt.response)];
      if (receipt.kind === "capture") {
        await tx.query("INSERT INTO k_slg_capture (server_id, op_id, uid, payload_hash, contract_version, response_json) VALUES (?, ?, ?, ?, ?, ?)", params);
      } else {
        await tx.query("INSERT INTO k_slg_march_receipt (server_id, op_id, uid, payload_hash, contract_version, response_json, kind) VALUES (?, ?, ?, ?, ?, ?, ?)", [...params, receipt.kind]);
      }
    },
    async updateReceipt(kind, opId, response) {
      assertLocked();
      const table = kind === "capture" ? "k_slg_capture" : "k_slg_march_receipt";
      await tx.query(`UPDATE ${table} SET response_json = ? WHERE server_id = ? AND op_id = ?`, [JSON.stringify(response), sId, opId]);
    },
    async readMarch(marchId) {
      assertLocked();
      const rows = await tx.query<RowDataPacket[]>(`SELECT ${MARCH_COLUMNS} FROM k_slg_march WHERE server_id = ? AND march_id = ? FOR UPDATE`, [sId, marchId]);
      return rows.length ? marchOf(rows[0]) : null;
    },
    async insertMarch(march) {
      assertLocked();
      await tx.query("INSERT INTO k_slg_march (server_id, march_id, uid, from_tile, to_tile, depart_at, arrive_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [sId, march.marchId, march.uid, march.fromTile, march.toTile, march.departAt, march.arriveAt, march.status]);
    },
    async updateMarch(march) {
      assertLocked();
      await tx.query("UPDATE k_slg_march SET status = ? WHERE server_id = ? AND march_id = ?", [march.status, sId, march.marchId]);
    },
    async readDue(now, limit) {
      assertLocked();
      if (!Number.isInteger(limit) || limit < 1 || limit > 129) throw new RangeError("SLG due limit");
      const rows = await tx.query<RowDataPacket[]>(`SELECT ${MARCH_COLUMNS} FROM k_slg_march WHERE server_id = ? AND status = 'marching' AND arrive_at <= ? ORDER BY arrive_at, march_id LIMIT ${limit}`, [sId, now]);
      return rows.map(marchOf);
    },
    async countActive(uid) {
      assertLocked();
      const rows = await tx.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM k_slg_march WHERE server_id = ? AND uid = ? AND status = 'marching'", [sId, uid]);
      return integer(rows[0].count, "active march count");
    },
    async appendTile(tile, operation) {
      const rev = await nextRevision();
      await tx.query("INSERT INTO k_slg_tile_log (server_id, revision, tile_id, operation, payload, tombstone) VALUES (?, ?, ?, ?, ?, ?)", [sId, rev, tile.tileId, operation, JSON.stringify(tile), tile.ownerUid === "" ? 1 : 0]);
      return rev;
    },
    async appendMarch(march, operation) {
      const rev = await nextRevision();
      await tx.query("INSERT INTO k_slg_march_log (server_id, revision, march_id, operation, payload, tombstone) VALUES (?, ?, ?, ?, ?, ?)", [sId, rev, march.marchId, operation, JSON.stringify(march), march.status === "marching" ? 0 : 1]);
      return rev;
    },
    async readChanges(after, limit) {
      assertLocked();
      if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new RangeError("SLG change limit");
      const rows = await tx.query<RowDataPacket[]>("SELECT revision, 'tile' AS entity, operation, payload, tombstone FROM k_slg_tile_log WHERE server_id = ? AND revision > ?"
        + " UNION ALL SELECT revision, 'march' AS entity, operation, payload, tombstone FROM k_slg_march_log WHERE server_id = ? AND revision > ?"
        + ` ORDER BY revision LIMIT ${limit}`, [sId, after, sId, after]);
      return rows.map((row) => ({ revision: integer(row.revision, "log revision"), entity: row.entity === "tile" ? "tile" : "march", operation: text(row.operation, "log operation"), payload: json(row.payload), tombstone: integer(row.tombstone, "tombstone", 1) === 1 }));
    },
  };
}
