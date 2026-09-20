/**
 * mmo kit · `characters` api 面（客户端，docs/KIT.md §4）：角色读取 / 建角入口 + 选角页的展示模型，给本 kit 的页面与建在本面上的插件共用。
 * ⛔ 不 import cc（铁律 9）；插件只能相对导入本门面，⛔ 不直接点名本 kit 的 RPC 路由（`mmo.*` 的 wire 契约随本面 versioning）。
 * 本面任何导出变化都要 bump `apps/kits/mmo/kit.json` 的 `api.characters.version`。
 */
import type { LobbyRpcPort } from "../../../../app/ports";
import {
    MAX_CHARACTER_SLOTS, MMO_CLASS_IDS, MMO_FACTION_IDS, characterSlots, isValidCharacterName, type CharacterSlotView, type ICharacterSummary, type MmoClassId, type MmoFactionId,
} from "../../../../shared/kits/mmo/api/characters/index";
import { MmoRpc, type IMmoCharactersRes, type IMmoCreateCharacterRes } from "../../../../shared/protocol/lobbyRpc/domains/mmo";

export { MAX_CHARACTER_SLOTS, MMO_CLASS_IDS, MMO_FACTION_IDS, characterSlots, isValidCharacterName };
export type { CharacterSlotView, ICharacterSummary, IMmoCharactersRes, IMmoCreateCharacterRes, MmoClassId, MmoFactionId };

/** 只读角色列表（mmo.characters）：插件经本入口读，⛔ 不自己 import MmoRpc。 */
export function fetchCharacters(lobbyRpc: Pick<LobbyRpcPort, "query">): Promise<IMmoCharactersRes> {
    return lobbyRpc.query(MmoRpc.Characters, {});
}

export interface CreateCharacterInput {
    readonly slot: number;
    readonly name: string;
    readonly classId: MmoClassId;
    readonly factionId: MmoFactionId;
}

/** 建角（mmo.createCharacter，幂等写：clientReqId 由宿主 sendIdempotent 生成）。 */
export function createCharacter(lobbyRpc: Pick<LobbyRpcPort, "sendIdempotent">, input: CreateCharacterInput): Promise<IMmoCreateCharacterRes> {
    return lobbyRpc.sendIdempotent(MmoRpc.CreateCharacter, { slot: input.slot, name: input.name, classId: input.classId, factionId: input.factionId });
}

/** 一行摘要（选角页 / 队伍面板共用）。 */
export function describeCharacter(character: ICharacterSummary): string {
    const where = character.mapId === null ? "未进图" : character.mapId;
    return `${character.name} · Lv${character.level} ${character.classId} / ${character.factionId} · ${where}`;
}

/** 默认建角名：槽位派生、通过名字闸（作者态灰盒；正式命名 UI 归内容插件）。 */
export function defaultCharacterName(slot: number, seed: string): string {
    const stem = seed.replace(/[^A-Za-z0-9]/gu, "").slice(-6) || "hero";
    const name = `hero${stem}${slot}`.slice(0, 16);
    return isValidCharacterName(name) ? name : `hero${slot}`;
}
