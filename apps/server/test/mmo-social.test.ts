/**
 * mmo kit social 面（MK1-B5，假依赖，⛔ 连库 / Redis）：partyOf（角色不属本账号 ⇒ MmoSocialForbiddenError；不在队 ⇒ null；成员映射：在世界里的 persona 优先、
 * 没进世界取首个角色、没角色全 null；队长 / 在线透传）；shared validatePartyLocate（exact keys / worldAddress 与 mapId 一致 / 恰一个队长）；worldChannelId；附近聊天行映射。
 * 变异验证：locateMember 不优先在世界里的 persona → 「在世界里优先」红；validatePartyLocate 不查 mapId 一致 → 「坏视图」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ICharacterSummary } from "@game/shared/kits/mmo/api/characters/index";
import { appendChatLine, nearbyChatLineOf, validatePartyLocate, worldChannelId } from "@game/shared/kits/mmo/api/social/index";
import { WireValidationError } from "@game/shared/protocol/http";
import type { PersonaRow } from "../src/core/infra/kitApi";
import { MmoSocialForbiddenError, partyOf, type SocialDeps } from "../src/kits/mmo/api/social/index";

const character = (characterId: string, personaId: string, name: string, slot: number): ICharacterSummary => ({ characterId, personaId, slot, name, classId: "fighter", factionId: "dawn", level: 1, exp: 0, mapId: null, status: "active" });
const persona = (personaId: string, slot: number, worldAddress: string | null): PersonaRow => ({ personaId, slot, status: 0, controlEpoch: 1, worldAddress, meta: null });

function deps(): SocialDeps {
    const characters: Record<string, ICharacterSummary[]> = {
        "u-a": [character("c-a1", "p-a1", "Ant", 0), character("c-a2", "p-a2", "Anty", 1)],
        "u-b": [character("c-b", "p-b", "Bee", 2)],
        "u-c": [],
    };
    const personas: Record<string, PersonaRow[]> = {
        "u-a": [persona("p-a1", 0, null), persona("p-a2", 1, "s0/greybox-east/0")], // 槽 1 在世界里 ⇒ 优先
        "u-b": [persona("p-b", 2, null)],
        "u-c": [persona("p-orphan", 0, "s0/greybox/0")], // 有 persona 无角色 ⇒ 不算在世界里的角色
    };
    return {
        readParty: async (uid) => (uid === "u-a" || uid === "u-b" ? { partyId: 7, leader: "u-b", maxSize: 5, ver: 4, members: [{ uid: "u-a", joinedAt: 2, online: true }, { uid: "u-b", joinedAt: 1, online: false }, { uid: "u-c", joinedAt: 3, online: true }] } : null),
        personas: async (uid) => personas[uid] ?? [],
        characters: async (uid) => characters[uid] ?? [],
    };
}

test("partyOf：角色不属本账号 ⇒ MmoSocialForbiddenError；不在队 ⇒ null；成员映射（在世界里的 persona 优先 / 首个角色 / 无角色）+ 队长 / 在线透传；结果过 shared validator", async () => {
    await assert.rejects(partyOf("u-a", 0, "c-b", deps()), MmoSocialForbiddenError, "别人的角色");
    await assert.rejects(partyOf("u-a", 0, "c-nope", deps()), MmoSocialForbiddenError);
    assert.equal(await partyOf("u-c", 0, "c-x", deps()).catch((error: unknown) => (error instanceof MmoSocialForbiddenError ? "forbidden" : "other")), "forbidden", "无角色账号任何 characterId 都拒");
    const view = (await partyOf("u-a", 0, "c-a1", deps()))!;
    assert.deepEqual([view.partyId, view.ver], [7, 4]);
    assert.deepEqual(view.members.map((m) => [m.uid, m.characterId, m.name, m.worldAddress, m.mapId, m.leader, m.online]), [
        ["u-a", "c-a2", "Anty", "s0/greybox-east/0", "greybox-east", false, true],
        ["u-b", "c-b", "Bee", null, null, true, false],
        ["u-c", null, null, null, null, false, true],
    ], "在世界里的 persona 优先（槽 1）；没进世界取首个角色；孤儿 persona 不算角色");
    assert.deepEqual(validatePartyLocate(JSON.parse(JSON.stringify(view))), view, "结果过 shared validator");
    const solo: SocialDeps = { ...deps(), readParty: async () => null };
    assert.equal(await partyOf("u-a", 0, "c-a1", solo), null);
});

test("validatePartyLocate：exact keys / worldAddress 形态 / mapId 必须与 worldAddress 一致 / 恰一个队长 / 成员上限；worldChannelId；附近聊天行", () => {
    const member = { uid: "u", characterId: "c", name: "N", personaId: "p", worldAddress: "s0/greybox/0", mapId: "greybox", online: true, leader: true };
    const ok = { partyId: 1, ver: 1, members: [member] };
    assert.deepEqual(validatePartyLocate(ok), ok);
    const bad = (patch: Record<string, unknown>, memberPatch: Record<string, unknown> = {}): unknown => ({ ...ok, ...patch, members: [{ ...member, ...memberPatch }] });
    assert.throws(() => validatePartyLocate(bad({}, { mapId: "elsewhere" })), (error: unknown) => error instanceof WireValidationError && error.code === "MMO_PARTY_MAP_MISMATCH", "坏视图：mapId 与 worldAddress 不一致");
    assert.throws(() => validatePartyLocate(bad({}, { worldAddress: null })), WireValidationError, "worldAddress null 时 mapId 必须 null");
    assert.throws(() => validatePartyLocate(bad({}, { worldAddress: "bad" })), WireValidationError);
    assert.throws(() => validatePartyLocate(bad({}, { leader: false })), WireValidationError, "恰一个队长");
    assert.throws(() => validatePartyLocate(bad({}, { extra: 1 })), WireValidationError);
    assert.throws(() => validatePartyLocate({ ...ok, members: [] }), WireValidationError, "空队伍无队长");
    assert.equal(worldChannelId(3), "realm:3");
    assert.throws(() => worldChannelId(-1), RangeError);
    const line = nearbyChatLineOf({ fromEntityId: "char:1", text: "yo", at: 9 }, (id) => (id === "char:1" ? "Ant" : null));
    assert.deepEqual([line.from, appendChatLine([line, line], line, 2).length], ["Ant", 2]);
});
