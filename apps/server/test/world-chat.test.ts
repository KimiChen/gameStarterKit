/**
 * MMO MF6b 附近聊天（docs/MMO.md §6.5.1 / §6.6 nearby 行）：core 世界 token `c2s.world.chat`（rateCost 2）/ `s2c.world.chat`（perSession），
 * 世界房固定序 = 在座 → chatPolicy.canSend → transform → runtime.sayNearby（兴趣集含 primaryEntityOf(sender) 的会话 ∪ 发送者，进视野流）。
 *  - 视距外不收；视距内含发送者各收一次；载荷 {fromEntityId, text, at}，⛔ 无 uid / 昵称；
 *  - `broadcastS2C(s2c.world.chat)` 被拒（perSession 闸）；非 Active 拒；未在座拒；策略 canSend / transform 生效；
 *  - 生成表：GAME_WIRE_RATE_COST["c2s.world.chat"] = 2、GAME_WIRE_PER_SESSION["s2c.world.chat"] = null、CORE_S2C_TOKENS.WorldChat.perSession。
 * 变异验证：WorldRuntime.sayNearby 删兴趣集过滤（所有在座会话都收）→「视距外不收」转红；S2CPorts.isPerSessionToken 恒 false →「广播被拒」转红；
 * WorldRoom.corePhaseAllows 对 WorldChat 放行非 Active →「Draining 拒」转红；codegen 忽略 CORE_S2C_OPTIONS → 生成表用例 + 「广播被拒」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S, CORE_S2C_TOKENS, ErrorCode, GAME_WIRE_PER_SESSION, GAME_WIRE_RATE_COST, S2C, type IErrorRes, type IWorldChatRes } from "@game/shared";
import { setChatPolicy } from "../src/core/chat/policy";
import type { WorldRoom } from "../src/rooms/WorldRoom";
import { dispatch, fakeClient, harness, join, joinOptions, type FakeClient, type Harness } from "./world-room.test";

const P_A = "p_alice_0000000001";
const P_B = "p_bob_00000000001";
const P_C = "p_carol_0000000001";
const USER_OF: Record<string, string> = { [P_A]: "u-alice", [P_B]: "u-bob", [P_C]: "u-carol" };
const moverOf = (persona: string): string => `mover-${persona}`;

async function worldRoom(): Promise<Harness> {
    const h = harness({ capacity: 3, modeOptions: { staticCount: 0, range: 100 } });
    h.control.seedPersona(P_A, "u-alice");
    h.control.seedPersona(P_B, "u-bob");
    h.control.seedPersona(P_C, "u-carol");
    await h.room.onCreate(joinOptions());
    return h;
}
async function seat(h: Harness, session: string, persona: string, x: number, y: number): Promise<FakeClient> {
    const client = fakeClient(session, persona, USER_OF[persona]);
    await join(h.room, client);
    h.mode.__probe.place(moverOf(persona), x, y);
    return client;
}
const step = (room: WorldRoom, count = 1): void => { for (let index = 0; index < count; index += 1) room.advance(50); };
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const bubbles = (who: FakeClient): IWorldChatRes[] => who.sent.filter(([type]) => type === S2C.WorldChat).map(([, payload]) => payload as IWorldChatRes);
const errorsOf = (who: FakeClient): number[] => who.sent.filter(([type]) => type === S2C.Error).map(([, payload]) => (payload as IErrorRes).code);
/** 发言：dispatcher → 壳固定序（策略是 async）→ 下一 tick 排空视野流。 */
async function say(h: Harness, who: FakeClient, text: string): Promise<void> {
    dispatch(h.room, C2S.WorldChat, who, { text });
    await settle();
    step(h.room);
}

test("生成表：core 世界 token 的 rateCost 2 / perSession（CORE_*_OPTIONS ⇒ GAME_WIRE_* + CORE_S2C_TOKENS）", () => {
    assert.equal(GAME_WIRE_RATE_COST["c2s.world.chat"], 2, "限流用房内 rateCost 预算");
    assert.equal(GAME_WIRE_PER_SESSION["s2c.world.chat"], null, "perSession、不合并");
    assert.equal(CORE_S2C_TOKENS.WorldChat.perSession, true);
    assert.equal(CORE_S2C_TOKENS.WorldChat.coalesceKey, null);
    assert.equal(C2S.WorldChat, "c2s.world.chat");
    assert.equal(S2C.WorldChat, "s2c.world.chat");
});

test("视距外不收；视距内含发送者各收一次；载荷 {fromEntityId, text, at} 无 uid / 昵称", async () => {
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A, 500, 500);
    const b = await seat(h, "sb", P_B, 550, 500); // 视距内
    const c = await seat(h, "sc", P_C, 900, 900); // 视距外
    step(h.room, 2); // baseline ⇒ 兴趣集就位
    await say(h, a, " hello nearby ");
    assert.deepEqual(bubbles(a).map((m) => [m.fromEntityId, m.text]), [[moverOf(P_A), " hello nearby "]], "发送者自己恰收一次（文本原样，不 trim）");
    assert.deepEqual(bubbles(b).map((m) => [m.fromEntityId, m.text]), [[moverOf(P_A), " hello nearby "]], "视距内恰收一次");
    assert.equal(bubbles(c).length, 0, "视距外不收");
    assert.ok(Number.isSafeInteger(bubbles(a)[0]!.at) && bubbles(a)[0]!.at >= 0, "at = 服务端时间戳");
    assert.deepEqual(Object.keys(bubbles(b)[0]!).sort(), ["at", "fromEntityId", "text"], "⛔ 无 uid / 昵称");
    assert.deepEqual(errorsOf(a), []);
    // 反向：c 发言只有自己收（a / b 视距外）
    await say(h, c, "far");
    assert.equal(bubbles(c).length, 1);
    assert.equal(bubbles(a).length + bubbles(b).length, 2, "a / b 没多收");
    // 走近后收到：b 移到 c 旁边，兴趣集更新后 c 再发
    h.mode.__probe.place(moverOf(P_B), 890, 900);
    step(h.room, 2);
    await say(h, c, "near now");
    assert.deepEqual(bubbles(b).slice(-1).map((m) => m.text), ["near now"]);
    assert.equal(bubbles(a).length, 1, "a 仍在视距外");
    await h.room.onDispose();
});

test("perSession 闸：mode 对 s2c.world.chat 全房广播被拒，无人收到", async () => {
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A, 500, 500);
    const b = await seat(h, "sb", P_B, 550, 500);
    step(h.room, 2);
    h.room.signal("chat-broadcast-leak", {});
    step(h.room);
    assert.equal(bubbles(a).length + bubbles(b).length, 0, "广播被拒");
    assert.ok(!JSON.stringify([a.sent, b.sent]).includes('"leak"'));
    await h.room.onDispose();
});

test("策略注入点：canSend 拒 ⇒ 发送者 BadRequest 无人收；transform 变换文本；transform 越界 ⇒ 拒；ctx 频道 = nearby:<worldAddress>", async () => {
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A, 500, 500);
    const b = await seat(h, "sb", P_B, 550, 500);
    step(h.room, 2);
    const seen: Array<{ uid: string; sId: number; channel: string }> = [];
    setChatPolicy({
        canSend: async (ctx, text) => { seen.push({ ...ctx }); return text !== "bad"; },
        transform: async (text) => (text === "blank" ? "   " : text.toUpperCase()),
    });
    try {
        await say(h, a, "bad");
        assert.deepEqual(errorsOf(a), [ErrorCode.BadRequest], "canSend 拒 ⇒ BadRequest");
        assert.equal(bubbles(a).length + bubbles(b).length, 0);
        await say(h, a, "hello");
        assert.deepEqual(bubbles(b).map((m) => m.text), ["HELLO"], "transform 生效");
        await say(h, a, "blank");
        assert.deepEqual(errorsOf(a), [ErrorCode.BadRequest, ErrorCode.BadRequest], "transform 结果再过 wire validator（空 ⇒ 拒）");
        assert.deepEqual(bubbles(b).map((m) => m.text), ["HELLO"]);
        assert.deepEqual(seen.map((ctx) => [ctx.uid, ctx.sId, ctx.channel]), [["u-alice", 0, "nearby:s0/m1/0"], ["u-alice", 0, "nearby:s0/m1/0"], ["u-alice", 0, "nearby:s0/m1/0"]]);
    } finally {
        setChatPolicy(null);
    }
    await h.room.onDispose();
});

test("非 Active（Draining）拒；离座后拒；心跳不受影响", async () => {
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A, 500, 500);
    const b = await seat(h, "sb", P_B, 550, 500);
    step(h.room, 2);
    await h.room.onLeave(b as never, CloseCode.CONSENTED);
    await say(h, b, "ghost");
    assert.deepEqual(errorsOf(b), [ErrorCode.BadRequest], "离座后拒");
    assert.equal(bubbles(a).length, 0);
    h.room.signal("drain", {});
    step(h.room);
    await say(h, a, "draining");
    assert.deepEqual(errorsOf(a), [ErrorCode.BadRequest], "Draining ⇒ core phase 闸拒");
    assert.equal(bubbles(a).length, 0);
    dispatch(h.room, C2S.Ping, a, { clientTime: 1 });
    assert.ok(a.sent.some(([type]) => type === S2C.Pong), "心跳照常");
    await h.room.onDispose();
});
