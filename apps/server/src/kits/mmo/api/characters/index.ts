/**
 * mmo kit · `characters` api 面（服务端，docs/MMO.md §7.2 / docs/KIT.md §4）：角色列表与建角两个用例。
 * 插件只能 import 本门面（`../../kits/mmo/api/characters/index`），⛔ 不 import kit 内部模块（persistence / host）。
 * 本面任何导出变化都要 bump `apps/kits/mmo/kit.json` 的 `api.characters.version`。
 *
 * 框架触点只有 kit-api：`withKitTx`（限 k_mmo_* 表）、persona 门面 `tx.createPersona`（MF2，M03：同一事务先得 personaId 再插角色行；
 * 槽位上限 MAX_CHARACTER_SLOTS 由本面判，框架只保证 (user, kit, slot) 唯一与硬上限）、事务外只读 `listPersonas`（对账：只有 persona 行
 * 没有角色行的标 orphan）。建角是幂等写：op_id（mmoOpId）回执落 k_mmo_receipt，重放（越过 dispatcher 60 s idem 缓存）原样回读、零写入。
 */
import { PersonaSlotTakenError, listPersonas } from "../../../../core/infra/kitApi";
import {
    MAX_CHARACTER_SLOTS, type ICharacterSummary, type IOrphanPersona, type MmoClassId, type MmoFactionId, isValidCharacterName, isValidCharacterSlot,
    validateCharacterSummary,
} from "@game/shared/kits/mmo/api/characters/index";
import { MMO_KIT_ID, defaultMmoTxRunner, newMmoId, type MmoTxRunner } from "../../host";
import {
    MmoNameTakenError, countCharactersByUser, insertCharacter, insertReceipt, selectCharacterByPersona, selectCharactersByUser, selectReceipt, type MmoCharacterRow,
} from "../../persistence/characters";

export { MmoNameTakenError };
export type { MmoCharacterRow };

export class MmoSlotTakenError extends Error {
    constructor(readonly slot: number) {
        super(`槽位 ${slot} 已有角色`);
        this.name = "MmoSlotTakenError";
    }
}

export class MmoSlotsFullError extends Error {
    constructor(readonly max: number) {
        super(`角色数已达上限 ${max}`);
        this.name = "MmoSlotsFullError";
    }
}

export class MmoCharacterInputError extends Error {
    constructor(readonly field: string) {
        super(`建角输入非法：${field}`);
        this.name = "MmoCharacterInputError";
    }
}

export interface CreateCharacterInput {
    readonly slot: number;
    readonly name: string;
    readonly classId: MmoClassId;
    readonly factionId: MmoFactionId;
}

export interface CreateCharacterOutcome {
    readonly character: ICharacterSummary;
    /** 同 opId 重放（回执回读），⛔ 再建 */
    readonly replayed: boolean;
}

export interface CharacterListing {
    readonly characters: readonly ICharacterSummary[];
    readonly orphans: readonly IOrphanPersona[];
}

export interface CharactersDeps {
    readonly run: MmoTxRunner;
    /** 事务外只读 persona（生产 = kit-api listPersonas；单测注入）。 */
    readonly personas: (uid: string, sId: number) => Promise<readonly { readonly personaId: string; readonly slot: number; readonly status: 0 | 1 }[]>;
    readonly newId: () => string;
}

export const defaultCharactersDeps: CharactersDeps = {
    run: defaultMmoTxRunner,
    personas: (uid, sId) => listPersonas(MMO_KIT_ID, uid, sId),
    newId: newMmoId,
};

export function summaryOf(row: MmoCharacterRow, status: "active" | "inactive" = "active"): ICharacterSummary {
    return {
        characterId: row.characterId, personaId: row.personaId, slot: row.slot, name: row.name, classId: row.classId, factionId: row.factionId,
        level: row.level, exp: row.exp, mapId: row.mapId, status,
    };
}

/** 本账号本区的角色 + 孤儿 persona（persona 有行、角色无行：建角事务中途失败的残留，可 deletePersona 清理）。 */
export async function listCharacters(uid: string, sId: number, deps: CharactersDeps = defaultCharactersDeps): Promise<CharacterListing> {
    const [rows, personas] = await Promise.all([deps.run(sId, (tx) => selectCharactersByUser(tx, uid)), deps.personas(uid, sId)]);
    // 框架 persona.status：0 = active、1 = inactive（deactivatePersona 置 1）
    const statusOf = new Map(personas.map((persona) => [persona.personaId, persona.status === 0 ? "active" as const : "inactive" as const]));
    const characters = rows.map((row) => summaryOf(row, statusOf.get(row.personaId) ?? "inactive"));
    const known = new Set(rows.map((row) => row.personaId));
    const orphans = personas.filter((persona) => !known.has(persona.personaId)).map((persona) => ({ personaId: persona.personaId, slot: persona.slot }));
    return { characters, orphans };
}

/** 按 persona 读角色（世界房准入预热用；无角色 = null）。 */
export function characterOfPersona(sId: number, personaId: string, run: MmoTxRunner = defaultMmoTxRunner): Promise<MmoCharacterRow | null> {
    return run(sId, (tx) => selectCharacterByPersona(tx, personaId));
}

/**
 * 建角（幂等写，opId = mmoOpId(uid, sId, "createCharacter", clientReqId)）：回执回读 → 槽位上限 → createPersona（(user, kit, slot) 唯一 ⇒
 * MmoSlotTakenError）→ 插角色行（名字唯一 ⇒ MmoNameTakenError）→ 回执；全部同一 withKitTx，任一步失败整体回滚（⛔ 留下孤儿 persona）。
 */
export async function createCharacter(uid: string, sId: number, input: CreateCharacterInput, opId: string, deps: CharactersDeps = defaultCharactersDeps): Promise<CreateCharacterOutcome> {
    if (!isValidCharacterSlot(input.slot)) throw new MmoCharacterInputError("slot");
    if (!isValidCharacterName(input.name)) throw new MmoCharacterInputError("name");
    return deps.run(sId, async (tx) => {
        const receipt = await selectReceipt(tx, opId);
        if (receipt !== null) return { character: validateCharacterSummary(receipt, "receipt"), replayed: true };
        if ((await countCharactersByUser(tx, uid)) >= MAX_CHARACTER_SLOTS) throw new MmoSlotsFullError(MAX_CHARACTER_SLOTS);
        let personaId: string;
        try {
            personaId = await tx.createPersona(uid, input.slot, { characterName: input.name });
        } catch (error) {
            if (error instanceof PersonaSlotTakenError) throw new MmoSlotTakenError(input.slot);
            throw error;
        }
        const characterId = deps.newId();
        await insertCharacter(tx, { characterId, personaId, userId: uid, slot: input.slot, name: input.name, classId: input.classId, factionId: input.factionId });
        const character: ICharacterSummary = {
            characterId, personaId, slot: input.slot, name: input.name, classId: input.classId, factionId: input.factionId, level: 1, exp: 0, mapId: null, status: "active",
        };
        await insertReceipt(tx, opId, characterId, "createCharacter", character);
        return { character, replayed: false };
    });
}
