/**
 * mmo kit MK1-B5 social 面真栈（真 MySQL / Redis；框架 party 原语 + persona 控制权，⛔ 起 Colyseus）：
 *  ① 两账号各建一个角色；A 建队 → 邀请 B（presence touchLobby 标在线）→ B 接受；
 *  ② A 的 persona 取得世界控制权（acquireControl ⇒ persona.world_address = s0/greybox/0，与真房准入同一存储真源）；
 *  ③ B 的 `partyOf(uidB, charB)`：两成员，A 是队长且 worldAddress / mapId = greybox，B 未进世界 ⇒ null；结果过 shared validator；
 *  ④ 别人的角色 ⇒ MmoSocialForbiddenError；A 离队后 B 的队伍只剩自己（框架 party 语义透传）。
 * 前置：本地栈已启动且 db:bootstrap 到 MK0-B1。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { validatePartyLocate } from "@game/shared/kits/mmo/api/social/index";
import { zoneCtx } from "../../src/core/infra/keys";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { acceptInvite, createParty, inviteToParty, leaveParty } from "../../src/core/party/party";
import { touchLobby } from "../../src/core/presence/presence";
import { createUser } from "../../src/core/userRecord";
import { createCharacter } from "../../src/kits/mmo/api/characters/index";
import { MmoSocialForbiddenError, partyOf } from "../../src/kits/mmo/api/social/index";
import { mmoOpId } from "../../src/kits/mmo/host";
import { acquireControl, releaseControl } from "../../src/rooms/core/control";
import { worldAddressOf } from "../../src/rooms/core/WorldDirectory";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

const SID = 0;
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };
const inZone = <T>(fn: () => Promise<T>): Promise<T> => zoneCtx.run({ sId: SID }, fn);

after(async () => {
    const pool = getPool();
    for (const value of uids) {
        await inZone(() => leaveParty(value).catch(() => undefined));
        const [rows] = await pool.query("SELECT character_id FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        for (const row of rows as { character_id: string }[]) {
            await pool.execute("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ?", [SID, row.character_id]);
            await pool.execute("DELETE FROM k_mmo_receipt WHERE server_id = ? AND character_id = ?", [SID, row.character_id]);
        }
        await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
        await cleanupUser(value).catch(() => undefined);
    }
    await closeRedis();
    await closeMysql();
});

test("MK1-B5：建队 → 邀请 → 接受；A 取得世界控制权 ⇒ B 的 partyLocate 看到 A 在 greybox；别人的角色 ⇒ 拒；A 离队 ⇒ B 的队只剩自己", { timeout: 30_000 }, async () => {
    await assertRedisUp();
    const userA = uid("soA");
    const userB = uid("soB");
    await inZone(() => createUser(userA));
    await inZone(() => createUser(userB));
    const a = await createCharacter(userA, SID, { slot: 0, name: `Sa${userA.slice(-8)}`, classId: "fighter", factionId: "dawn" }, mmoOpId(userA, SID, "createCharacter", "c1"));
    const b = await createCharacter(userB, SID, { slot: 1, name: `Sb${userB.slice(-8)}`, classId: "caster", factionId: "dusk" }, mmoOpId(userB, SID, "createCharacter", "c1"));
    // ① 框架 party：A 建队、B 在线、邀请 / 接受
    await touchLobby(userB, SID);
    const created = await inZone(() => createParty(userA));
    await inZone(() => inviteToParty(userA, userB));
    await inZone(() => acceptInvite(userB, created.partyId));
    // ② A 的 persona 取得世界控制权（与真房准入同一存储真源）
    const address = worldAddressOf(SID, "greybox", 0);
    const epoch = await acquireControl(SID, a.character.personaId, address, 0);
    try {
        // ③ B 定位队友
        const view = (await inZone(() => partyOf(userB, SID, b.character.characterId)))!;
        assert.ok(view, "在队");
        assert.deepEqual(validatePartyLocate(JSON.parse(JSON.stringify(view))), view, "过 shared validator");
        const byUid = new Map(view.members.map((member) => [member.uid, member]));
        assert.deepEqual(
            [byUid.get(userA)?.characterId, byUid.get(userA)?.worldAddress, byUid.get(userA)?.mapId, byUid.get(userA)?.leader, byUid.get(userA)?.name],
            [a.character.characterId, address, "greybox", true, a.character.name], "A：队长、在 greybox");
        assert.deepEqual(
            [byUid.get(userB)?.characterId, byUid.get(userB)?.worldAddress, byUid.get(userB)?.mapId, byUid.get(userB)?.leader, byUid.get(userB)?.online],
            [b.character.characterId, null, null, false, true], "B：未进世界、presence 在线");
        assert.equal(view.partyId, created.partyId);
        // ④ 别人的角色 ⇒ 拒；A 离队 ⇒ B 的队只剩自己
        await assert.rejects(inZone(() => partyOf(userB, SID, a.character.characterId)), MmoSocialForbiddenError);
        await inZone(() => leaveParty(userA));
        const after = await inZone(() => partyOf(userB, SID, b.character.characterId));
        assert.deepEqual(after?.members.map((member) => [member.uid, member.leader]), [[userB, true]], "A 离队 ⇒ B 成唯一成员且为队长");
    } finally {
        await releaseControl(SID, a.character.personaId, epoch).catch(() => undefined);
    }
});
