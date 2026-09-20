/**
 * mmo kit · `social` api 面（shared，docs/MMO.md §7.2；MK1-B5）：世界聊天频道 id（框架 channel 原语 `realm:<sId>`，Lobby push）、队伍定位视图
 * `IMmoPartyLocate`（框架 party 的成员 → 本 kit 角色 + WorldAddress / mapId；`mmoSocial.partyLocate` 契约属本面）、附近聊天行映射
 * （框架 core 世界 token `s2c.world.chat { fromEntityId, text, at }`，kit 只把 fromEntityId 映射成角色名——受众由框架按兴趣集算，⛔ kit 另算一份，M13）。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.social.version`。
 */
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, WireValidationError, type PlainRecord } from "../../../../protocol/http";
import { parseWorldAddress } from "../world/index";

/** 世界聊天 = 框架 channel 原语在 `realm:<sId>` 上的 Lobby push（§6.5）。 */
export function worldChannelId(sId: number): string {
    if (!Number.isSafeInteger(sId) || sId < 0 || sId > 0xffff) throw new RangeError(`sId ${sId} 非法`);
    return `realm:${sId}`;
}

export const MMO_PARTY_LOCATE_MAX_MEMBERS = 64;

/** 队伍成员定位：框架 party 成员（uid）→ 本 kit 的角色（在世界里的那个 persona 优先；没进世界取首个角色；没角色全 null）。 */
export interface IMmoPartyMember {
    readonly uid: string;
    readonly characterId: string | null;
    readonly name: string | null;
    readonly personaId: string | null;
    /** 在世界里 = 分线地址；否则 null */
    readonly worldAddress: string | null;
    /** worldAddress 的 mapId（客户端画「在哪张图」） */
    readonly mapId: string | null;
    /** presence 在线提示（⛔ 非投递权威） */
    readonly online: boolean;
    readonly leader: boolean;
}

export interface IMmoPartyLocate {
    readonly partyId: number;
    readonly ver: number;
    readonly members: readonly IMmoPartyMember[];
}

function nullableId(value: unknown, path: string): string | null {
    if (value === null) return null;
    return boundedString(value, path, 1, 64);
}

export function validatePartyMember(input: unknown, path: string): IMmoPartyMember {
    if (!isPlainRecord(input)) throw new WireValidationError("WIRE_RECORD", path);
    const value: PlainRecord = input;
    assertExactKeys(value, ["uid", "characterId", "name", "personaId", "worldAddress", "mapId", "online", "leader"], [], path);
    const worldAddress = value.worldAddress === null ? null : boundedString(value.worldAddress, `${path}.worldAddress`, 1, 96);
    const parts = worldAddress === null ? null : parseWorldAddress(worldAddress);
    if (worldAddress !== null && parts === null) throw new WireValidationError("MMO_PARTY_WORLD_ADDRESS", `${path}.worldAddress`);
    const mapId = value.mapId === null ? null : boundedString(value.mapId, `${path}.mapId`, 1, 64);
    if ((parts?.mapId ?? null) !== mapId) throw new WireValidationError("MMO_PARTY_MAP_MISMATCH", `${path}.mapId`);
    if (typeof value.online !== "boolean") throw new WireValidationError("WIRE_BOOL", `${path}.online`);
    if (typeof value.leader !== "boolean") throw new WireValidationError("WIRE_BOOL", `${path}.leader`);
    return {
        uid: boundedString(value.uid, `${path}.uid`, 1, 32),
        characterId: nullableId(value.characterId, `${path}.characterId`),
        name: value.name === null ? null : boundedString(value.name, `${path}.name`, 1, 32),
        personaId: nullableId(value.personaId, `${path}.personaId`),
        worldAddress, mapId, online: value.online, leader: value.leader,
    };
}

export function validatePartyLocate(input: unknown, path = "party"): IMmoPartyLocate {
    if (!isPlainRecord(input)) throw new WireValidationError("WIRE_RECORD", path);
    const value: PlainRecord = input;
    assertExactKeys(value, ["partyId", "ver", "members"], [], path);
    if (!Array.isArray(value.members) || value.members.length > MMO_PARTY_LOCATE_MAX_MEMBERS) throw new WireValidationError("MMO_PARTY_MEMBERS_SIZE", `${path}.members`);
    const members = value.members.map((member, index) => validatePartyMember(member, `${path}.members[${index}]`));
    const leaders = members.filter((member) => member.leader).length;
    if (leaders !== 1) throw new WireValidationError("MMO_PARTY_LEADER", `${path}.members`);
    return {
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, Number.MAX_SAFE_INTEGER),
        ver: finiteInteger(value.ver, `${path}.ver`, 1, Number.MAX_SAFE_INTEGER),
        members,
    };
}

/** 附近聊天一行（客户端本地日志）。 */
export interface INearbyChatLine {
    readonly fromEntityId: string;
    /** 角色名（fromEntityId 不在视野实体表 ⇒ "?"） */
    readonly from: string;
    readonly text: string;
    readonly at: number;
}

export const NEARBY_CHAT_LOG_MAX = 50;

/** `s2c.world.chat` 载荷 → 本地一行：kit 只做 fromEntityId → 名字的映射。 */
export function nearbyChatLineOf(payload: { readonly fromEntityId: string; readonly text: string; readonly at: number }, nameOf: (entityId: string) => string | null): INearbyChatLine {
    return { fromEntityId: payload.fromEntityId, from: nameOf(payload.fromEntityId) ?? "?", text: payload.text, at: payload.at };
}

/** 追加并裁到上限（保留最新）。 */
export function appendChatLine(log: readonly INearbyChatLine[], line: INearbyChatLine, max = NEARBY_CHAT_LOG_MAX): readonly INearbyChatLine[] {
    const next = [...log, line];
    return next.length > max ? next.slice(next.length - max) : next;
}
