/**
 * mmo kit 内部模块：角色表 SQL（k_mmo_character / k_mmo_receipt；docs/MMO.md §7.3）。全部经 KitTx.query（表闸只放行 k_mmo_*），
 * ⛔ 触碰 persona 表（persona 经 kit-api 门面 createPersona / listPersonas）。⛔ 插件不得 import 本文件。
 */
import type { KitTx, ResultSetHeader, RowDataPacket } from "../../../core/infra/kitApi";
import { MMO_CHARACTER_LEVEL_MAX, type MmoClassId, type MmoFactionId, isMmoClassId, isMmoFactionId } from "@game/shared/kits/mmo/api/characters/index";

export interface MmoCharacterRow {
    readonly characterId: string;
    readonly personaId: string;
    readonly userId: string;
    readonly slot: number;
    readonly name: string;
    readonly classId: MmoClassId;
    readonly factionId: MmoFactionId;
    readonly level: number;
    readonly exp: number;
    readonly checkpointRev: number;
    /** 最新已落库角色检查点的 snapshot.mapId；无检查点 = null */
    readonly mapId: string | null;
}

interface CharacterPacket extends RowDataPacket {
    character_id: string; persona_id: string; user_id: string; slot: number; name: string; class_id: string; faction_id: string;
    level: number; exp: number | string; checkpoint_rev: number | string; map_id: string | null;
}

/** 名字撞唯一键（uk_mmo_character_name）。 */
export class MmoNameTakenError extends Error {
    constructor(readonly characterName: string) {
        super(`角色名 "${characterName}" 已被占用`);
        this.name = "MmoNameTakenError";
    }
}

const SELECT_COLUMNS = `c.character_id, c.persona_id, c.user_id, c.slot, c.name, c.class_id, c.faction_id, c.level, c.exp, c.checkpoint_rev,
  (SELECT JSON_UNQUOTE(JSON_EXTRACT(cp.envelope, '$.snapshot.mapId')) FROM k_mmo_character_checkpoint cp
     WHERE cp.server_id = c.server_id AND cp.character_id = c.character_id AND cp.rev = c.checkpoint_rev) AS map_id`;

function rowOf(packet: CharacterPacket): MmoCharacterRow {
    if (!isMmoClassId(packet.class_id) || !isMmoFactionId(packet.faction_id)) throw new Error(`[mmo] 角色 ${packet.character_id} 的职业 / 阵营不在闭合枚举内（${packet.class_id} / ${packet.faction_id}）`);
    const level = Number(packet.level);
    return {
        characterId: String(packet.character_id),
        personaId: String(packet.persona_id),
        userId: String(packet.user_id),
        slot: Number(packet.slot),
        name: String(packet.name),
        classId: packet.class_id,
        factionId: packet.faction_id,
        level: Math.min(MMO_CHARACTER_LEVEL_MAX, Math.max(1, level)),
        exp: Number(packet.exp),
        checkpointRev: Number(packet.checkpoint_rev),
        mapId: packet.map_id === null || packet.map_id === undefined ? null : String(packet.map_id),
    };
}

export async function selectCharactersByUser(tx: KitTx, uid: string): Promise<MmoCharacterRow[]> {
    const rows = await tx.query<CharacterPacket[]>(`SELECT ${SELECT_COLUMNS} FROM k_mmo_character c WHERE c.server_id = ? AND c.user_id = ? ORDER BY c.slot`, [tx.sId, uid]);
    return rows.map(rowOf);
}

export async function selectCharacterByPersona(tx: KitTx, personaId: string): Promise<MmoCharacterRow | null> {
    const rows = await tx.query<CharacterPacket[]>(`SELECT ${SELECT_COLUMNS} FROM k_mmo_character c WHERE c.server_id = ? AND c.persona_id = ? LIMIT 1`, [tx.sId, personaId]);
    return rows.length === 0 ? null : rowOf(rows[0]!);
}

export async function countCharactersByUser(tx: KitTx, uid: string): Promise<number> {
    const rows = await tx.query<(RowDataPacket & { n: number | string })[]>("SELECT COUNT(*) AS n FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [tx.sId, uid]);
    return Number(rows[0]?.n ?? 0);
}

export interface NewCharacterRow {
    readonly characterId: string;
    readonly personaId: string;
    readonly userId: string;
    readonly slot: number;
    readonly name: string;
    readonly classId: MmoClassId;
    readonly factionId: MmoFactionId;
}

/** 插角色行：名字撞唯一键 ⇒ MmoNameTakenError（persona 唯一键由门面的 (user, kit, slot) 唯一先挡）。 */
export async function insertCharacter(tx: KitTx, row: NewCharacterRow): Promise<void> {
    try {
        await tx.query<ResultSetHeader>(
            "INSERT INTO k_mmo_character (server_id, character_id, persona_id, user_id, slot, name, class_id, faction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [tx.sId, row.characterId, row.personaId, row.userId, row.slot, row.name, row.classId, row.factionId]);
    } catch (error) {
        const errno = (error as { errno?: unknown }).errno;
        const message = error instanceof Error ? error.message : "";
        if (errno === 1062 && message.includes("uk_mmo_character_name")) throw new MmoNameTakenError(row.name);
        throw error;
    }
}

interface ReceiptPacket extends RowDataPacket { result: unknown }

/** 回执（op_id = mmoOpId；重放只回读）。 */
export async function selectReceipt(tx: KitTx, opId: string): Promise<unknown | null> {
    const rows = await tx.query<ReceiptPacket[]>("SELECT result FROM k_mmo_receipt WHERE server_id = ? AND op_id = ? LIMIT 1", [tx.sId, opId]);
    if (rows.length === 0) return null;
    const raw = rows[0]!.result;
    return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
}

export async function insertReceipt(tx: KitTx, opId: string, characterId: string, kind: string, result: unknown): Promise<void> {
    await tx.query<ResultSetHeader>(
        "INSERT INTO k_mmo_receipt (server_id, op_id, character_id, kind, result) VALUES (?, ?, ?, ?, CAST(? AS JSON))",
        [tx.sId, opId, characterId, kind, JSON.stringify(result)]);
}
