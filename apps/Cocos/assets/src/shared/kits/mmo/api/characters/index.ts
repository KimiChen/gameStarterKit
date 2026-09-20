/**
 * mmo kit · `characters` api 面（shared，docs/MMO.md §7.2 / docs/KIT.md §4）：角色的零依赖类型、常量与校验器。
 * 插件只能 import 本门面（`@game/shared/kits/mmo/api/characters/index` / 客户端相对路径），⛔ 不 import kit 内部模块。
 * 本面任何导出变化都要 bump `apps/kits/mmo/kit.json` 的 `api.characters.version`。
 *
 * 规则（与服务端 api 同一真源，README「角色」）：
 *  - 一个账号在本 kit / 本区最多 MAX_CHARACTER_SLOTS 个角色（产品上限；框架只保证 (user, kit, slot) 唯一与 PERSONA_MAX_SLOTS_HARD，§11.2）；
 *  - 名字 2–16 个字（字母 / 数字 / 汉字 / 下划线 / 连字符），同区唯一（大小写 / 音调不敏感由 SQL 排序规则决定）；
 *  - 职业 / 阵营是闭合枚举（v1：两职业两阵营，纯灰盒数值，⛔ 不承诺内容）；
 *  - `mapId` 是最新已落库的角色检查点里的 snapshot.mapId（M08：位置真源在检查点表），从未进图为 null。
 */
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type PlainRecord, WireValidationError } from "../../../../protocol/http";

export const MMO_CLASS_IDS = ["fighter", "caster"] as const;
export type MmoClassId = (typeof MMO_CLASS_IDS)[number];
export const MMO_FACTION_IDS = ["dawn", "dusk"] as const;
export type MmoFactionId = (typeof MMO_FACTION_IDS)[number];

/** 产品上限（≤ 框架 PERSONA_MAX_SLOTS_HARD = 16，§11.2）。 */
export const MAX_CHARACTER_SLOTS = 4;
export const MMO_CHARACTER_NAME_MIN = 2;
export const MMO_CHARACTER_NAME_MAX = 16;
export const MMO_CHARACTER_LEVEL_MAX = 60;

export type MmoCharacterStatus = "active" | "inactive";

export interface ICharacterSummary {
    readonly characterId: string;
    /** 框架 persona id（world.enter 用它进世界） */
    readonly personaId: string;
    readonly slot: number;
    readonly name: string;
    readonly classId: MmoClassId;
    readonly factionId: MmoFactionId;
    readonly level: number;
    readonly exp: number;
    /** 最新角色检查点的 snapshot.mapId；null = 从未进图 */
    readonly mapId: string | null;
    readonly status: MmoCharacterStatus;
}

/** 只有 persona 行没有角色行（建角事务中途失败的残留）：客户端展示为可清理槽位。 */
export interface IOrphanPersona {
    readonly personaId: string;
    readonly slot: number;
}

export function isMmoClassId(value: unknown): value is MmoClassId {
    return typeof value === "string" && (MMO_CLASS_IDS as readonly string[]).includes(value);
}

export function isMmoFactionId(value: unknown): value is MmoFactionId {
    return typeof value === "string" && (MMO_FACTION_IDS as readonly string[]).includes(value);
}

/** 名字形态：2–16 个字母 / 数字 / 汉字 / 下划线 / 连字符（⛔ 空白 / 控制字符 / 标点）。 */
export function isValidCharacterName(value: unknown): value is string {
    return typeof value === "string" && value.length >= MMO_CHARACTER_NAME_MIN && value.length <= MMO_CHARACTER_NAME_MAX && /^[\p{L}\p{N}_-]+$/u.test(value);
}

export function isValidCharacterSlot(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < MAX_CHARACTER_SLOTS;
}

export function validateCharacterName(value: unknown, path = "payload.name"): string {
    if (!isValidCharacterName(value)) throw new WireValidationError("MMO_CHARACTER_NAME", path);
    return value;
}

export function validateClassId(value: unknown, path = "payload.classId"): MmoClassId {
    if (!isMmoClassId(value)) throw new WireValidationError("MMO_CLASS_ID", path);
    return value;
}

export function validateFactionId(value: unknown, path = "payload.factionId"): MmoFactionId {
    if (!isMmoFactionId(value)) throw new WireValidationError("MMO_FACTION_ID", path);
    return value;
}

export function validateCharacterSlot(value: unknown, path = "payload.slot"): number {
    if (!isValidCharacterSlot(value)) throw new WireValidationError("MMO_CHARACTER_SLOT", path);
    return value;
}

function recordOf(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

/** 角色摘要（响应 validator / 客户端读取共用；exact keys）。 */
export function validateCharacterSummary(input: unknown, path = "response.character"): ICharacterSummary {
    const value = recordOf(input, path);
    assertExactKeys(value, ["characterId", "personaId", "slot", "name", "classId", "factionId", "level", "exp", "mapId", "status"], [], path);
    if (value.status !== "active" && value.status !== "inactive") throw new WireValidationError("MMO_CHARACTER_STATUS", `${path}.status`);
    return {
        characterId: boundedString(value.characterId, `${path}.characterId`, 1, 64),
        personaId: boundedString(value.personaId, `${path}.personaId`, 1, 64),
        slot: validateCharacterSlot(value.slot, `${path}.slot`),
        name: validateCharacterName(value.name, `${path}.name`),
        classId: validateClassId(value.classId, `${path}.classId`),
        factionId: validateFactionId(value.factionId, `${path}.factionId`),
        level: finiteInteger(value.level, `${path}.level`, 1, MMO_CHARACTER_LEVEL_MAX),
        exp: finiteInteger(value.exp, `${path}.exp`, 0, Number.MAX_SAFE_INTEGER),
        mapId: value.mapId === null ? null : boundedString(value.mapId, `${path}.mapId`, 1, 64),
        status: value.status,
    };
}

export function validateOrphanPersona(input: unknown, path = "response.orphan"): IOrphanPersona {
    const value = recordOf(input, path);
    assertExactKeys(value, ["personaId", "slot"], [], path);
    return { personaId: boundedString(value.personaId, `${path}.personaId`, 1, 64), slot: finiteInteger(value.slot, `${path}.slot`, 0, 65535) };
}

/** 客户端选角页的槽位视图：按 slot 升序补空槽。 */
export type CharacterSlotView =
    | { readonly slot: number; readonly kind: "character"; readonly character: ICharacterSummary }
    | { readonly slot: number; readonly kind: "orphan"; readonly personaId: string }
    | { readonly slot: number; readonly kind: "empty" };

export function characterSlots(characters: readonly ICharacterSummary[], orphans: readonly IOrphanPersona[] = [], maxSlots = MAX_CHARACTER_SLOTS): CharacterSlotView[] {
    const views: CharacterSlotView[] = [];
    for (let slot = 0; slot < maxSlots; slot += 1) {
        const character = characters.find((entry) => entry.slot === slot);
        if (character) { views.push({ slot, kind: "character", character }); continue; }
        const orphan = orphans.find((entry) => entry.slot === slot);
        views.push(orphan ? { slot, kind: "orphan", personaId: orphan.personaId } : { slot, kind: "empty" });
    }
    return views;
}
