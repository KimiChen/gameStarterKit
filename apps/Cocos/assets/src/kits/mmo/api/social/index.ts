/**
 * mmo kit · `social` api 面（客户端，docs/MMO.md §7.2；MK1-B5）：`sayWorld` 直接用框架 chat 门面（ChatLogic.send / chat.send）投 `realm:<sId>`；
 * `partyLocate` 读 `mmoSocial.partyLocate`（队伍面板消费框架 `PartyLogic` 的名册 / 事件，再用本面拿「队友在哪」）；附近聊天行映射再导出。
 * ⛔ 不 import cc（铁律 9）。本面任何导出变化都要 bump `api.social.version`。
 */
import type { LobbyRpcPort } from "../../../../app/ports";
import { MmoSocialRpc } from "../../../../shared/protocol/lobbyRpc/domains/mmoSocial";
import {
    NEARBY_CHAT_LOG_MAX, appendChatLine, nearbyChatLineOf, worldChannelId, type IMmoPartyLocate, type IMmoPartyMember, type INearbyChatLine,
} from "../../../../shared/kits/mmo/api/social/index";

export { NEARBY_CHAT_LOG_MAX, appendChatLine, nearbyChatLineOf, worldChannelId };
export type { IMmoPartyLocate, IMmoPartyMember, INearbyChatLine };

/** 框架 chat 门面的最小面（ChatLogic.send 同形）。 */
export interface WorldChatPort {
    send(channel: string, text: string): Promise<unknown>;
}

/** 世界聊天：投到本区的 realm 频道（框架 channel 原语 + Lobby push；回显经 chat.message）。 */
export function sayWorld(chat: WorldChatPort, sId: number, text: string): Promise<unknown> {
    return chat.send(worldChannelId(sId), text);
}

/** 队友定位（query）。 */
export async function partyLocate(lobbyRpc: Pick<LobbyRpcPort, "query">, characterId: string): Promise<IMmoPartyLocate | null> {
    const result = await lobbyRpc.query(MmoSocialRpc.PartyLocate, { characterId });
    return result.party;
}

export interface IPartyPanelRow {
    readonly uid: string;
    readonly characterId: string | null;
    readonly name: string;
    /** 「在哪」：mapId / 未进世界 / 无角色 */
    readonly location: string;
    readonly leader: boolean;
    readonly online: boolean;
    readonly isSelf: boolean;
}

/** 队伍面板行：队长首位，其余按名字；位置文案由 mapId 推。 */
export function partyPanelRows(view: IMmoPartyLocate | null, selfCharacterId: string | null): readonly IPartyPanelRow[] {
    if (!view) return [];
    return [...view.members]
        .map((member) => ({
            uid: member.uid,
            characterId: member.characterId,
            name: member.name ?? "（无角色）",
            location: member.characterId === null ? "无角色" : member.mapId ?? "未进世界",
            leader: member.leader,
            online: member.online,
            isSelf: selfCharacterId !== null && member.characterId === selfCharacterId,
        }))
        .sort((left, right) => (left.leader === right.leader ? (left.name < right.name ? -1 : left.name > right.name ? 1 : 0) : left.leader ? -1 : 1));
}
