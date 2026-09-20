/**
 * mmo kit 客户端 social 面（MK1-B5，无头）：sayWorld 投 realm 频道（框架 chat 门面）；partyLocate 走 mmoSocial.partyLocate；partyPanelRows 队长首位 / 位置文案 / 本人标记；
 * 附近聊天行映射与日志上限。变异验证：partyPanelRows 不把队长排首位 → 「面板行」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { appendChatLine, nearbyChatLineOf, partyLocate, partyPanelRows, sayWorld, worldChannelId, type IMmoPartyLocate } from "../src/kits/mmo/api/social/index";

const view: IMmoPartyLocate = {
    partyId: 7, ver: 2,
    members: [
        { uid: "u-b", characterId: "c-b", name: "Bee", personaId: "p-b", worldAddress: null, mapId: null, online: false, leader: false },
        { uid: "u-a", characterId: "c-a", name: "Zed", personaId: "p-a", worldAddress: "s0/greybox/0", mapId: "greybox", online: true, leader: true }, // 队长名字排最后：只有「队长首位」规则才能把它排到前面
        { uid: "u-c", characterId: null, name: null, personaId: null, worldAddress: null, mapId: null, online: true, leader: false },
    ],
};

test("sayWorld：投 realm:<sId>；partyLocate：query mmoSocial.partyLocate 并取 party", async () => {
    const sent: [string, string][] = [];
    await sayWorld({ send: async (channel, text) => { sent.push([channel, text]); return { msgId: "m1", at: 1 }; } }, 7, "gg");
    assert.deepEqual(sent, [["realm:7", "gg"]]);
    assert.equal(worldChannelId(0), "realm:0");
    assert.throws(() => worldChannelId(70000), RangeError);
    const queries: [string, unknown][] = [];
    const lobbyRpc = { query: async (route: string, payload: unknown) => { queries.push([route, payload]); return { party: view }; } };
    assert.deepEqual(await partyLocate(lobbyRpc as never, "c-a"), view);
    assert.deepEqual(queries, [["mmoSocial.partyLocate", { characterId: "c-a" }]]);
});

test("partyPanelRows：队长首位、其余按名字；位置 = mapId / 未进世界 / 无角色；本人标记；null 视图 ⇒ 空", () => {
    const rows = partyPanelRows(view, "c-b");
    assert.deepEqual(rows.map((row) => [row.name, row.location, row.leader, row.isSelf, row.online]), [["Zed", "greybox", true, false, true], ["Bee", "未进世界", false, true, false], ["（无角色）", "无角色", false, false, true]], "队长首位（名字本会排最后）");
    assert.deepEqual(partyPanelRows(null, "c-b"), []);
});

test("附近聊天行：fromEntityId → 名字（缺 ⇒ ?）；日志裁到上限保留最新", () => {
    const line = nearbyChatLineOf({ fromEntityId: "char:1", text: "yo", at: 3 }, (id) => (id === "char:1" ? "Ant" : null));
    assert.deepEqual(line, { fromEntityId: "char:1", from: "Ant", text: "yo", at: 3 });
    assert.equal(nearbyChatLineOf({ fromEntityId: "x", text: "yo", at: 3 }, () => null).from, "?");
    let log = appendChatLine([], line, 2);
    log = appendChatLine(log, { ...line, text: "2" }, 2);
    log = appendChatLine(log, { ...line, text: "3" }, 2);
    assert.deepEqual(log.map((entry) => entry.text), ["2", "3"]);
});
