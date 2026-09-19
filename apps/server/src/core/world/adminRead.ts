/**
 * 运维只读面（MMO MF10-B3，docs/MMO.md §5.4 MF10「世界房 / 分线 / 在途交接 / 事件积压只读面」）：三条 POST + 密钥的只读端点的领域逻辑。
 *  - instances：world_instance 行（权威真源）+ WorldRegistry 实时登记（seated / capacity / publicAddress；无登记 = null，⛔ 猜）；
 *  - transfers：world_transfer 行，缺省只列在途（active_key 非 NULL），includeFinal 连终态（上限 500，最新在前）；
 *  - events：各 kit role:"world-event" 表的 worldEventStats（pending / done / dead / superseded / executable=门内 pending）。
 * 全部只读、⛔ 不改任何行；SQL / Redis 失败原样抛给端点（500），⛔ 降级成空结果。
 */
import { SERVER_KIT_CATALOG } from "../../kits/catalog.generated";
import { getPool, type RowDataPacket } from "../infra/mysql";
import { worldEventTablesOfKit } from "../infra/kitApi";
import { worldEventStats, type WorldEventSql } from "../../rooms/core/WorldEventPort";
import type { WorldInstanceInfo, WorldRegistryPort } from "../../rooms/core/WorldRegistry";
import { redisWorldRegistry } from "../../rooms/core/WorldRegistry";
import type { IAdminWorldEventsRes, IAdminWorldInstancesRes, IAdminWorldTransfersRes } from "@game/shared";

export interface AdminWorldInstanceSql {
    readonly instanceId: string; readonly mapId: string; readonly line: number; readonly state: string; readonly authorityEpoch: number; readonly holder: string;
    readonly checkpointRev: number; readonly writeSeq: number;
}
export interface AdminWorldTransferSql {
    readonly transferId: string; readonly personaId: string; readonly fromInstance: string; readonly toMap: string; readonly toLine: number; readonly toInstance: string;
    readonly state: string; readonly controlEpoch: number; readonly reserveExpiresAt: number | null; readonly active: boolean;
}

export interface AdminWorldReadDeps {
    listInstances(sId: number, mapId: string | undefined): Promise<AdminWorldInstanceSql[]>;
    registry: Pick<WorldRegistryPort, "read">;
    listTransfers(sId: number, personaId: string | undefined, includeFinal: boolean): Promise<AdminWorldTransferSql[]>;
    /** 目录里全部 role:"world-event" 表（kitId → 表名）。 */
    worldEventTables(): ReadonlyArray<{ readonly kitId: string; readonly table: string }>;
    eventStats(table: string, sId: number, instanceId: string | undefined): Promise<{ pending: number; done: number; dead: number; superseded: number; executable: number }>;
}

interface InstanceRow extends RowDataPacket { instance_id: string; map_id: string; line: number; state: string; authority_epoch: number | string; holder: string; checkpoint_rev: number | string; write_seq: number | string }
interface TransferRow extends RowDataPacket { transfer_id: string; persona_id: string; from_instance: string; to_map: string; to_line: number; to_instance: string; state: string; control_epoch: number | string; reserve_expires_ms: number | string | null; active_key: string | null }

export const productionAdminWorldReadDeps: AdminWorldReadDeps = {
    async listInstances(sId, mapId) {
        const [rows] = await getPool().query<InstanceRow[]>(
            `SELECT instance_id, map_id, line, state, authority_epoch, holder, checkpoint_rev, write_seq FROM world_instance WHERE server_id = ?${mapId === undefined ? "" : " AND map_id = ?"} ORDER BY map_id, line LIMIT 4096`,
            mapId === undefined ? [sId] : [sId, mapId]);
        return rows.map((row) => ({
            instanceId: row.instance_id, mapId: row.map_id, line: Number(row.line), state: row.state, authorityEpoch: Number(row.authority_epoch), holder: row.holder,
            checkpointRev: Number(row.checkpoint_rev), writeSeq: Number(row.write_seq),
        }));
    },
    registry: redisWorldRegistry,
    async listTransfers(sId, personaId, includeFinal) {
        const where = [`server_id = ?`];
        const params: (string | number)[] = [sId];
        if (personaId !== undefined) { where.push("persona_id = ?"); params.push(personaId); }
        if (!includeFinal) where.push("active_key IS NOT NULL");
        const [rows] = await getPool().query<TransferRow[]>(
            "SELECT transfer_id, persona_id, from_instance, to_map, to_line, to_instance, state, control_epoch, ROUND(UNIX_TIMESTAMP(reserve_expires_at) * 1000) AS reserve_expires_ms, active_key "
            + `FROM world_transfer WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 500`, params);
        return rows.map((row) => ({
            transferId: row.transfer_id, personaId: row.persona_id, fromInstance: row.from_instance, toMap: row.to_map, toLine: Number(row.to_line), toInstance: row.to_instance,
            state: row.state, controlEpoch: Number(row.control_epoch), reserveExpiresAt: row.reserve_expires_ms === null ? null : Number(row.reserve_expires_ms), active: row.active_key !== null,
        }));
    },
    worldEventTables: () => SERVER_KIT_CATALOG.flatMap((kit) => worldEventTablesOfKit(kit.id, SERVER_KIT_CATALOG).map((table) => ({ kitId: kit.id, table }))),
    eventStats: (table, sId, instanceId) => worldEventStats(getPool() as unknown as WorldEventSql, table, sId, instanceId),
};

const infoOrNull = (info: WorldInstanceInfo | null) => ({
    seated: info?.seated ?? null, capacity: info?.capacity ?? null, publicAddress: info?.publicAddress ?? null, updatedAt: info?.updatedAt ?? null,
});

export async function readAdminWorldInstances(sId: number, mapId: string | undefined, deps: AdminWorldReadDeps = productionAdminWorldReadDeps): Promise<IAdminWorldInstancesRes> {
    const rows = await deps.listInstances(sId, mapId);
    const instances = await Promise.all(rows.map(async (row) => ({ ...row, ...infoOrNull(await deps.registry.read(sId, row.instanceId)) })));
    return { instances };
}

export async function readAdminWorldTransfers(sId: number, personaId: string | undefined, includeFinal: boolean, deps: AdminWorldReadDeps = productionAdminWorldReadDeps): Promise<IAdminWorldTransfersRes> {
    return { transfers: await deps.listTransfers(sId, personaId, includeFinal) };
}

export async function readAdminWorldEvents(sId: number, kitId: string | undefined, instanceId: string | undefined, deps: AdminWorldReadDeps = productionAdminWorldReadDeps): Promise<IAdminWorldEventsRes> {
    const tables = deps.worldEventTables().filter((entry) => kitId === undefined || entry.kitId === kitId);
    const rows = await Promise.all(tables.map(async (entry) => ({ kitId: entry.kitId, table: entry.table, ...(await deps.eventStats(entry.table, sId, instanceId)) })));
    return { tables: rows };
}
