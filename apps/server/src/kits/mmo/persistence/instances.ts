/**
 * mmo kit 内部模块：分线语义表 SQL（k_mmo_instance；以框架 world_instance.instance_id 为键，只存 pack_id / pack_version / script_rev）。
 * 经 KitTx / KitWorldTx.query（表闸只放行 k_mmo_*）。⛔ 插件不得 import 本文件。
 */
import type { ResultSetHeader, RowDataPacket } from "../../../core/infra/kitApi";
import type { IInstanceMeta } from "@game/shared/kits/mmo/api/world/index";

export interface InstanceSql {
    readonly sId: number;
    query<T = RowDataPacket[] | ResultSetHeader>(sql: string, params?: unknown[]): Promise<T>;
}

interface InstancePacket extends RowDataPacket { instance_id: string; map_id: string; pack_id: string; pack_version: number; script_rev: number | string }

export async function upsertInstanceMeta(tx: InstanceSql, meta: { readonly instanceId: string; readonly mapId: string; readonly packId: string; readonly packVersion: number }): Promise<void> {
    await tx.query<ResultSetHeader>(
        "INSERT INTO k_mmo_instance (server_id, instance_id, map_id, pack_id, pack_version) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE map_id = VALUES(map_id), pack_id = VALUES(pack_id), pack_version = VALUES(pack_version)",
        [tx.sId, meta.instanceId, meta.mapId, meta.packId, meta.packVersion]);
}

export async function selectInstanceMeta(tx: InstanceSql, instanceId: string, line: number): Promise<IInstanceMeta | null> {
    const rows = await tx.query<InstancePacket[]>("SELECT instance_id, map_id, pack_id, pack_version, script_rev FROM k_mmo_instance WHERE server_id = ? AND instance_id = ? LIMIT 1", [tx.sId, instanceId]);
    const row = rows[0];
    if (!row) return null;
    return { instanceId: String(row.instance_id), mapId: String(row.map_id), line, packId: String(row.pack_id), packVersion: Number(row.pack_version), scriptRev: Number(row.script_rev) };
}
