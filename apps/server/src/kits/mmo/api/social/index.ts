/**
 * mmo kit · `social` api 面（服务端，docs/MMO.md §7.2；MK1-B5）：`worldChannelId(sId)`（框架 channel 原语 realm 频道）+ `partyOf(uid, sId, characterId)`
 * （读框架 party（kit-api `readPartyView`）→ 每个成员 uid 映射到本 kit 的角色：在世界里的 persona（`listPersonas` 的 worldAddress）优先，
 * 否则首个角色，没角色全 null）。附近聊天受众只由框架按 `WorldMode.primaryEntityOf` + 兴趣集计算（§6.5.1），本面 ⛔ 另算一份受众（M13）。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.social.version`。
 */
import { listPersonas, readPartyView, type PersonaRow } from "../../../../core/infra/kitApi";
import type { ICharacterSummary } from "@game/shared/kits/mmo/api/characters/index";
import { worldChannelId, type IMmoPartyLocate, type IMmoPartyMember } from "@game/shared/kits/mmo/api/social/index";
import { parseWorldAddress } from "@game/shared/kits/mmo/api/world/index";
import type { IPartyView } from "@game/shared/protocol/lobbyRpc/domains/party";
import { MMO_KIT_ID } from "../../host";
import { listCharacters } from "../characters/index";

export { worldChannelId };

/** characterId 不属于本账号（⛔ 不区分「不存在 / 别人的」）。 */
export class MmoSocialForbiddenError extends Error {
    constructor(readonly characterId: string) {
        super(`character ${characterId} 不属于本账号`);
        this.name = "MmoSocialForbiddenError";
    }
}

export interface SocialDeps {
    readonly readParty: (uid: string) => Promise<IPartyView | null>;
    readonly personas: (uid: string, sId: number) => Promise<readonly PersonaRow[]>;
    readonly characters: (uid: string, sId: number) => Promise<readonly ICharacterSummary[]>;
}

export const defaultSocialDeps: SocialDeps = {
    readParty: (uid) => readPartyView(uid),
    personas: (uid, sId) => listPersonas(MMO_KIT_ID, uid, sId),
    characters: async (uid, sId) => (await listCharacters(uid, sId)).characters,
};

/** 一个队员的定位：在世界里的 persona 优先（worldAddress 非空且有角色），否则首个角色（slot 升序），没角色全 null。 */
async function locateMember(uid: string, sId: number, leader: boolean, online: boolean, deps: SocialDeps): Promise<IMmoPartyMember> {
    const [personas, characters] = await Promise.all([deps.personas(uid, sId), deps.characters(uid, sId)]);
    const byPersona = new Map(characters.map((character) => [character.personaId, character]));
    const inWorld = personas.find((persona) => persona.worldAddress !== null && byPersona.has(persona.personaId));
    const character = inWorld ? byPersona.get(inWorld.personaId)! : [...characters].sort((left, right) => left.slot - right.slot)[0] ?? null;
    const worldAddress = inWorld?.worldAddress ?? null;
    return {
        uid,
        characterId: character?.characterId ?? null,
        name: character?.name ?? null,
        personaId: character?.personaId ?? null,
        worldAddress,
        mapId: worldAddress === null ? null : parseWorldAddress(worldAddress)?.mapId ?? null,
        online,
        leader,
    };
}

/** 本账号某角色所在队伍的成员定位；角色不属本账号 ⇒ MmoSocialForbiddenError；不在队 ⇒ null。 */
export async function partyOf(uid: string, sId: number, characterId: string, deps: SocialDeps = defaultSocialDeps): Promise<IMmoPartyLocate | null> {
    const own = await deps.characters(uid, sId);
    if (!own.some((character) => character.characterId === characterId)) throw new MmoSocialForbiddenError(characterId);
    const party = await deps.readParty(uid);
    if (!party) return null;
    const members = await Promise.all(party.members.map((member) => locateMember(member.uid, sId, member.uid === party.leader, member.online, deps)));
    return { partyId: party.partyId, ver: party.ver, members };
}
