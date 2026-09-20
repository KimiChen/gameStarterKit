/**
 * mmo 域 ws-RPC 契约——mmo kit（apps/kits/mmo，docs/MMO.md §7.2 characters 面）自带的域文件。
 * 只使用框架已有的 defineDomain / primitives / http 助手与本 kit 的 shared `characters` api 面。
 *
 * 执行模式：Characters=query（本账号本区的角色 + 孤儿 persona）；CreateCharacter=idempotent-write（同一 clientReqId 重放返回首次结果）。
 * 进世界不在本域：客户端拿角色的 personaId 走框架 `world.enter`（MF8）。文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import {
    type ICharacterSummary, type IOrphanPersona, type MmoClassId, type MmoFactionId, MAX_CHARACTER_SLOTS,
    validateCharacterName, validateCharacterSlot, validateCharacterSummary, validateClassId, validateFactionId, validateOrphanPersona,
} from "../../../kits/mmo/api/characters/index";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { emptyPayload, requiredId, rpcRecord } from "../primitives";

/** mmo 域路由名 */
export const MmoRpc = {
    /** 本账号本区的角色列表（含只有 persona 行没有角色行的孤儿槽） */
    Characters: "mmo.characters",
    /** 建角：同一 withKitTx 内 createPersona + 插角色行 */
    CreateCharacter: "mmo.createCharacter",
} as const;

export interface IMmoCharactersReq {
    readonly [key: string]: never;
}
export interface IMmoCharactersRes {
    characters: ICharacterSummary[];
    orphans: IOrphanPersona[];
    /** 产品槽位上限（客户端画空槽用） */
    maxSlots: number;
}

export interface IMmoCreateCharacterReq {
    /** 幂等 id（09·I2） */
    clientReqId: string;
    slot: number;
    name: string;
    classId: MmoClassId;
    factionId: MmoFactionId;
}
export interface IMmoCreateCharacterRes {
    character: ICharacterSummary;
}

/** 路由名 → { req, res } */
export interface MmoRpcMap {
    [MmoRpc.Characters]: { req: IMmoCharactersReq; res: IMmoCharactersRes };
    [MmoRpc.CreateCharacter]: { req: IMmoCreateCharacterReq; res: IMmoCreateCharacterRes };
}

export const validateMmoCharactersReq: RuntimeValidator<IMmoCharactersReq> = (input) => emptyPayload(input);

export const validateMmoCharactersRes: RuntimeValidator<IMmoCharactersRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["characters", "orphans", "maxSlots"], [], "response");
    if (!Array.isArray(value.characters) || value.characters.length > MAX_CHARACTER_SLOTS) throw new WireValidationError("MMO_CHARACTERS_SIZE", "response.characters");
    if (!Array.isArray(value.orphans) || value.orphans.length > 64) throw new WireValidationError("MMO_ORPHANS_SIZE", "response.orphans");
    const characters = value.characters.map((item, index) => validateCharacterSummary(item, `response.characters[${index}]`));
    const slots = new Set<number>();
    for (const character of characters) {
        if (slots.has(character.slot)) throw new WireValidationError("MMO_CHARACTERS_SLOT_DUP", "response.characters");
        slots.add(character.slot);
    }
    return {
        characters,
        orphans: value.orphans.map((item, index) => validateOrphanPersona(item, `response.orphans[${index}]`)),
        maxSlots: finiteInteger(value.maxSlots, "response.maxSlots", 1, 64),
    };
};

export const validateMmoCreateCharacterReq: RuntimeValidator<IMmoCreateCharacterReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "slot", "name", "classId", "factionId"], [], "payload");
    return {
        clientReqId: requiredId(value, "clientReqId"),
        slot: validateCharacterSlot(value.slot, "payload.slot"),
        name: validateCharacterName(value.name, "payload.name"),
        classId: validateClassId(value.classId, "payload.classId"),
        factionId: validateFactionId(value.factionId, "payload.factionId"),
    };
};

export const validateMmoCreateCharacterRes: RuntimeValidator<IMmoCreateCharacterRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["character"], [], "response");
    return { character: validateCharacterSummary(value.character, "response.character") };
};

export default defineLobbyRpcDomain({
    domain: "mmo",
    contractVersion: 1,
    errorCodes: ["MMO_NAME_TAKEN", "MMO_SLOT_TAKEN", "MMO_SLOTS_FULL"],
    pushes: [],
    routes: [
        defineRpcQuery(MmoRpc.Characters, { request: validateMmoCharactersReq, response: validateMmoCharactersRes }),
        defineRpcIdempotentWrite(MmoRpc.CreateCharacter, { request: validateMmoCreateCharacterReq, response: validateMmoCreateCharacterRes }),
    ],
});
