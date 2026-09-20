/**
 * mmo kit · 检查点端口（kit 实现的 CheckpointPort；MMO MF7b 形态，docs/MMO.md §7.3 M08；MK1-B4 自 rooms/modes/mmoWorld/ 迁回 kit 目录——
 * kit-api 已再导出 CheckpointPort / CheckpointEnvelope / CheckpointSchema 类型，MF11 偏差 ⑤ / MK0 偏差 ④ 收口）：
 *  - persona 信封 → k_mmo_character_checkpoint：角色检查点 rev **按角色单调分配**（同一世界事务里 k_mmo_character.checkpoint_rev + 1 即新 rev），
 *    信封里的分线 rev 落独立列 instance_rev（004 迁移）；⛔ 直接用分线 rev——角色会跨分线（两图交接），各分线 rev 从 1 起会撞；
 *    同一分线同一信封的重放（提交丢响应）按 (instance_id, instance_rev, state_hash) 去重视为幂等；persona 级强制点（离座 / 交接，MK1-B4）走同一条路；
 *  - 分线信封 → k_mmo_instance_checkpoint + k_mmo_instance（pack_id / pack_version 语义行同事务 upsert）；
 *  - load* 走 kit-api withKitTx（kit 自己的读事务）取最大 rev；保留策略归 kit（MF11 R2-05）：MK3 长跑前不删旧行。
 * 快照形态（schema v2，minSupported 1：v1 快照缺省字段照常回灌）：
 *  - 角色：mapId / x / y / hp / mp + cooldowns（spellId → 剩余 ms；分线 tick 不续，落盘时按 tick 差折算）+ arrival（交接落点，MK1-B3）；
 *  - 分线：tick / mapId / pack + creatures（id / templateId / x / y / hp / alive / respawnDueTick）+ loot（MK2-B3：未认领掉落 id / itemId / count / x / y / expiresTick，恢复后按 tick 差重排；
 *    lootSeq 保证恢复后新掉落 id 不撞）/ scriptVars / timers（dueTick，恢复后按 tick 差重排）/ regions（regionId → 开关）。
 *  - **角色保存定稿（MK3-B2）**：k_mmo_character 只留身份与成长（slot / name / class / faction / level / exp）+ checkpoint_rev；位置 / HP / MP / 冷却 / 交接落点
 *    只在角色检查点（本文件 v2 快照，`validatePersonaSnapshot` fail-closed 校验内容，坏快照 ⇒ 当无检查点从出生点进图）；物品在 k_mmo_item_instance（MK3-B1）；
 *    选角页的 mapId 取最新已落库角色检查点的 snapshot.mapId（persistence/characters.ts 子查询）。保留策略（MF11 R2-05 归 kit）：分线 / 角色检查点各只留最近
 *    `MMO_INSTANCE_CHECKPOINT_KEEP` / `MMO_CHARACTER_CHECKPOINT_KEEP` 个 rev（同事务删更旧的行；恢复只读最大 rev、重放去重只看近期行）。
 * 只 import kit-api 门面与本 kit 模块（K1），⛔ 不 import rooms/core 内核 / WorldMode 类型。
 */
import { withKitTx, type CheckpointEnvelope, type CheckpointPort, type CheckpointSchema, type KitWorldTx, type ResultSetHeader, type RowDataPacket } from "../../../core/infra/kitApi";
import { MMO_KIT_ID } from "../host";
import { upsertInstanceMeta } from "./instances";

export const MMO_WORLD_EVENT_TABLE = "k_mmo_world_event";
/** 检查点保留（MK3-B2 / B3 长跑前定）：每分线 / 每角色只留最近 N 个 rev，更旧的随本次落盘同事务删除。 */
export const MMO_INSTANCE_CHECKPOINT_KEEP = 32;
export const MMO_CHARACTER_CHECKPOINT_KEEP = 16;
/** 快照 schema 版本窗口（框架加载期校验，不兼容 fail-closed）：v2 = MK1-B4 定稿（cooldowns / timers / regions / loot / scriptVars），v1 快照仍可回灌。 */
export const MMO_WORLD_CHECKPOINT_SCHEMA: CheckpointSchema = { version: 2, minSupported: 1 };

/** 角色快照（位置 / HP / MP / mapId / 冷却 / 交接落点）。 */
export interface MmoPersonaSnapshot {
    readonly mapId: string;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
    readonly mp: number;
    /** 冷却：spellId → 剩余 ms（v2；MK2 combat 写入）；缺省无 */
    readonly cooldowns?: Readonly<Record<string, number>>;
    /** 交接落点（MK1-B3）：发起交接时写进实体，框架 prepare 后的强制点随之落库；目标图 onEnter 按它落位（图不同 ⇒ 忽略）；交接失败即清 */
    readonly arrival?: { readonly mapId: string; readonly spawnPointId: string };
}

export interface MmoCreatureSnapshot {
    readonly id: string;
    readonly templateId: string;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
    /** v2：存活；死亡时 respawnDueTick = 复活到期 tick（MK2 写入） */
    readonly alive?: boolean;
    readonly respawnDueTick?: number;
}

/** 未认领掉落（MK2-B3）：expiresTick 为落盘时的分线 tick；恢复后按 tick 差重排。 */
export interface MmoLootSnapshot {
    readonly id: string;
    readonly itemId: string;
    readonly count: number;
    readonly x: number;
    readonly y: number;
    readonly expiresTick: number;
    /** 归属（MK3-B1）：击杀者角色 + 独占到期 tick（落盘时的分线 tick；恢复后按 tick 差重排）；无 = 任何人可拾 */
    readonly ownerCharacterId?: string;
    readonly ownerUntilTick?: number;
}

/** 分线快照（tick + 怪物 + 掉落 / 脚本 vars / timers / 区域开关；脚本内容随 MK4 填充，槽位 MK1-B4 定稿）。 */
export interface MmoInstanceSnapshot {
    readonly tick: number;
    readonly mapId: string;
    readonly packId: string;
    readonly packVersion: number;
    readonly creatures: readonly MmoCreatureSnapshot[];
    /** v2：未认领掉落（MK2-B3 写入；v2 早期快照为空数组） */
    readonly loot?: readonly MmoLootSnapshot[];
    /** v2：掉落 id 计数（恢复后续用，⛔ 与已有掉落撞 id） */
    readonly lootSeq?: number;
    /** v2：编排脚本 vars（MK4 写入） */
    readonly scriptVars?: Readonly<Record<string, unknown>>;
    /** v2：timers（dueTick 为落盘时的分线 tick；恢复后按 tick 差重排） */
    readonly timers?: readonly { readonly id: string; readonly dueTick: number }[];
    /** v2：区域开关（regionId → enabled；缺省取内容包 enabledByDefault） */
    readonly regions?: Readonly<Record<string, boolean>>;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const PERSONA_KEYS = new Set(["mapId", "x", "y", "hp", "mp", "cooldowns", "arrival"]);

/**
 * 角色快照内容校验（MK3-B2 定稿；框架只校验信封与 schema 版本窗口，内容归 kit）：exact keys（v1 五键 + v2 可选 cooldowns / arrival）、数值有限、
 * cooldowns 为 spellId → 正整数 ms、arrival exact { mapId, spawnPointId }；不合 ⇒ null（调用方当无检查点，⛔ 半信半疑地回灌）。
 */
export function validatePersonaSnapshot(input: unknown): MmoPersonaSnapshot | null {
    if (!isPlainObject(input)) return null;
    for (const key of Object.keys(input)) if (!PERSONA_KEYS.has(key)) return null;
    if (typeof input.mapId !== "string" || input.mapId.length === 0 || input.mapId.length > 64) return null;
    if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y) || !isFiniteNumber(input.hp) || !isFiniteNumber(input.mp)) return null;
    if (input.hp < 0 || input.mp < 0) return null;
    const out: { mapId: string; x: number; y: number; hp: number; mp: number; cooldowns?: Record<string, number>; arrival?: { mapId: string; spawnPointId: string } } = {
        mapId: input.mapId, x: input.x, y: input.y, hp: input.hp, mp: input.mp,
    };
    if (input.cooldowns !== undefined) {
        if (!isPlainObject(input.cooldowns)) return null;
        const cooldowns: Record<string, number> = {};
        for (const [spellId, remaining] of Object.entries(input.cooldowns)) {
            if (spellId.length === 0 || spellId.length > 64 || !Number.isSafeInteger(remaining) || (remaining as number) <= 0) return null;
            cooldowns[spellId] = remaining as number;
        }
        out.cooldowns = cooldowns;
    }
    if (input.arrival !== undefined) {
        if (!isPlainObject(input.arrival)) return null;
        const keys = Object.keys(input.arrival);
        if (keys.length !== 2 || typeof input.arrival.mapId !== "string" || typeof input.arrival.spawnPointId !== "string") return null;
        out.arrival = { mapId: input.arrival.mapId, spawnPointId: input.arrival.spawnPointId };
    }
    return out;
}

/** 检查点能力（与框架 WorldModeCheckpointCapability 同形；mode 直接挂到 WorldMode.checkpoint）。 */
export interface MmoCheckpointCapability {
    readonly kitId: string;
    readonly port: CheckpointPort;
    readonly schema: CheckpointSchema;
    readonly eventTable: string;
}

interface EnvelopeRow extends RowDataPacket { envelope: unknown }
interface CharacterIdRow extends RowDataPacket { character_id: string }
interface RevRow extends RowDataPacket { checkpoint_rev: number | string }

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
            if ((error as { errno?: unknown }).errno === 1062) return; // 同 rev 重放（提交丢响应）幂等
            throw error;
        }
        // 保留策略：只留最近 MMO_INSTANCE_CHECKPOINT_KEEP 个 rev（同事务；⛔ 无界增长，MK3-B3 长跑）
        await tx.query<ResultSetHeader>("DELETE FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ? AND rev <= ?", [tx.sId, instanceId, envelope.rev - MMO_INSTANCE_CHECKPOINT_KEEP]);
    }

    loadInstance(sId: number, instanceId: string): Promise<unknown | null> {
        return withKitTx(MMO_KIT_ID, sId, async (tx) => {
            const rows = await tx.query<EnvelopeRow[]>("SELECT envelope FROM k_mmo_instance_checkpoint WHERE server_id = ? AND instance_id = ? ORDER BY rev DESC LIMIT 1", [sId, instanceId]);
            return rows.length === 0 ? null : parseEnvelope(rows[0]!.envelope);
        });
    }

    async savePersona(tx: KitWorldTx, personaId: string, envelope: CheckpointEnvelope): Promise<void> {
        const characterId = await characterIdOf(tx, personaId);
        if (characterId === null) throw new Error(`[mmo checkpoint] persona ${personaId} 没有角色行`);
        // 重放幂等：同一分线同一信封（instance_rev + state_hash）已有行即返回
        const replayed = await tx.query<RowDataPacket[]>(
            "SELECT rev FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ? AND instance_id = ? AND instance_rev = ? AND state_hash = ? LIMIT 1",
            [tx.sId, characterId, tx.instanceId, envelope.rev, envelope.stateHash]);
        if (replayed.length > 0) return;
        // 角色检查点 rev 按角色单调：同一事务里 checkpoint_rev + 1 即新 rev（跨分线不撞；选角页 / 回灌永远读到最新）
        const bumped = await tx.query<ResultSetHeader>("UPDATE k_mmo_character SET checkpoint_rev = checkpoint_rev + 1 WHERE server_id = ? AND character_id = ?", [tx.sId, characterId]);
        if (bumped.affectedRows !== 1) throw new Error(`[mmo checkpoint] 角色 ${characterId} 的 checkpoint_rev 推进失败`);
        const revRows = await tx.query<RevRow[]>("SELECT checkpoint_rev FROM k_mmo_character WHERE server_id = ? AND character_id = ?", [tx.sId, characterId]);
        const rev = Number(revRows[0]?.checkpoint_rev ?? 0);
        await tx.query<ResultSetHeader>(
            "INSERT INTO k_mmo_character_checkpoint (server_id, character_id, rev, instance_id, instance_rev, event_seq, state_hash, envelope) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))",
            [tx.sId, characterId, rev, tx.instanceId, envelope.rev, envelope.eventOffset, envelope.stateHash, JSON.stringify(envelope)]);
        // 保留策略：每角色只留最近 MMO_CHARACTER_CHECKPOINT_KEEP 个 rev（同事务）
        await tx.query<ResultSetHeader>("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ? AND rev <= ?", [tx.sId, characterId, rev - MMO_CHARACTER_CHECKPOINT_KEEP]);
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
export function createMmoCheckpointCapability(): MmoCheckpointCapability {
    return { kitId: MMO_KIT_ID, port: new MmoSqlCheckpointPort(), schema: MMO_WORLD_CHECKPOINT_SCHEMA, eventTable: MMO_WORLD_EVENT_TABLE };
}
