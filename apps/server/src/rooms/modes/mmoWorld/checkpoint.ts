/**
 * mmoWorld 检查点端口（mmo kit 的 CheckpointPort 实现；MMO MF7b 形态，docs/MMO.md §7.3 M08）：
 *  - persona 信封 → k_mmo_character_checkpoint（按 persona_id 查 character_id；同一世界事务里同步推进 k_mmo_character.checkpoint_rev）；
 *  - 分线信封 → k_mmo_instance_checkpoint + k_mmo_instance（pack_id / pack_version 语义行同事务 upsert）；
 *  - load* 走 kit-api withKitTx（kit 自己的读事务）取最大 rev；同 rev 重放（提交丢响应）1062 视为幂等。
 * 端口住 mode 目录而非 kit 目录：K1 规则 ① 不允许 kit 目录 import WorldMode 契约类型（MF11 偏差 ⑤；kit-api 再导出后可迁回）。
 * 只经 WorldMode 契约类型（`WorldModeCheckpointCapability["port"]`）与 kit-api 门面消费，⛔ 不 import rooms/core 内核。
 */
import { withKitTx, type KitWorldTx, type ResultSetHeader, type RowDataPacket } from "../../../core/infra/kitApi";
import { MMO_KIT_ID } from "../../../kits/mmo/host";
import { upsertInstanceMeta } from "../../../kits/mmo/persistence/instances";
import type { WorldModeCheckpointCapability } from "../../WorldMode";

type CheckpointPort = WorldModeCheckpointCapability["port"];
type CheckpointEnvelope = Parameters<CheckpointPort["saveInstance"]>[2];

export const MMO_WORLD_EVENT_TABLE = "k_mmo_world_event";
/** 快照 schema 版本窗口（框架加载期校验，不兼容 fail-closed）。 */
export const MMO_WORLD_CHECKPOINT_SCHEMA = { version: 1, minSupported: 1 } as const;

/** 角色快照（位置 / HP / MP / mapId；冷却随 MK2）。 */
export interface MmoPersonaSnapshot {
    readonly mapId: string;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
    readonly mp: number;
}

/** 分线快照（tick + 怪物存活 / 位置；掉落 / 脚本 vars / timers / regions 随 MK2–MK4）。 */
export interface MmoInstanceSnapshot {
    readonly tick: number;
    readonly mapId: string;
    readonly packId: string;
    readonly packVersion: number;
    readonly creatures: readonly { readonly id: string; readonly templateId: string; readonly x: number; readonly y: number; readonly hp: number }[];
}

interface EnvelopeRow extends RowDataPacket { envelope: unknown }
interface CharacterIdRow extends RowDataPacket { character_id: string }

async function characterIdOf(tx: { readonly sId: number; query<T>(sql: string, params?: unknown[]): Promise<T> }, personaId: string): Promise<string | null> {
    const rows = await tx.query<CharacterIdRow[]>("SELECT character_id FROM k_mmo_character WHERE server_id = ? AND persona_id = ? LIMIT 1", [tx.sId, personaId]);
    return rows.length === 0 ? null : String(rows[0]!.character_id);
}

const parseEnvelope = (raw: unknown): unknown => (typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw);

class MmoSqlCheckpointPort implements CheckpointPort {
    async saveInstance(tx: KitWorldTx, instanceId: string, envelope: CheckpointEnvelope): Promise<void> {
        const snapshot = envelope.snapshot as MmoInstanceSnapshot | null;
        if (snapshot) await upsertInstanceMeta(tx, { instanceId, mapId: snapshot.mapId, packId: snapshot.packId, packVersion: snapshot.packVersion });
        try {
            await tx.query<ResultSetHeader>(
                "INSERT INTO k_mmo_instance_checkpoint (server_id, instance_id, rev, tick, event_seq, state_hash, envelope) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))",
                [tx.sId, instanceId, envelope.rev, snapshot?.tick ?? 0, envelope.eventOffset, envelope.stateHash, JSON.stringify(envelope)]);
        } catch (error) {
            if ((error as { errno?: unknown }).errno === 1062) return;
            throw error;
        }
    }

    loadInstance(sId: number, instanceId: string): Promise<unknown | null> {
        return withKitTx(MMO_KIT_ID, sId, async (tx) => {
            const rows = await tx.query<EnvelopeRow[]>("SELECT envelope FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ? ORDER BY rev DESC LIMIT 1", [sId, instanceId]);
            return rows.length === 0 ? null : parseEnvelope(rows[0]!.envelope);
        });
    }

    async savePersona(tx: KitWorldTx, personaId: string, envelope: CheckpointEnvelope): Promise<void> {
        const characterId = await characterIdOf(tx, personaId);
        if (characterId === null) throw new Error(`[mmoWorld checkpoint] persona ${personaId} 没有角色行`);
        try {
            await tx.query<ResultSetHeader>(
                "INSERT INTO k_mmo_character_checkpoint (server_id, character_id, rev, instance_id, event_seq, state_hash, envelope) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))",
                [tx.sId, characterId, envelope.rev, tx.instanceId, envelope.eventOffset, envelope.stateHash, JSON.stringify(envelope)]);
        } catch (error) {
            if ((error as { errno?: unknown }).errno === 1062) return;
            throw error;
        }
        await tx.query<ResultSetHeader>("UPDATE k_mmo_character SET checkpoint_rev = ? WHERE server_id = ? AND character_id = ? AND checkpoint_rev < ?", [envelope.rev, tx.sId, characterId, envelope.rev]);
    }

    loadPersona(sId: number, personaId: string): Promise<unknown | null> {
        return withKitTx(MMO_KIT_ID, sId, async (tx) => {
            const characterId = await characterIdOf(tx, personaId);
            if (characterId === null) return null;
            const rows = await tx.query<EnvelopeRow[]>("SELECT envelope FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ? ORDER BY rev DESC LIMIT 1", [sId, characterId]);
            return rows.length === 0 ? null : parseEnvelope(rows[0]!.envelope);
        });
    }
}

/** 登记时装进 mode 的检查点能力：mmo 两张检查点表 + 事件表。 */
export function createMmoCheckpointCapability(): WorldModeCheckpointCapability {
    return { kitId: MMO_KIT_ID, port: new MmoSqlCheckpointPort(), schema: MMO_WORLD_CHECKPOINT_SCHEMA, eventTable: MMO_WORLD_EVENT_TABLE };
}
