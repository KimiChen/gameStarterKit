import "./env-setup"; // ⚠ 必须第一个 import（限流放宽）

/**
 * chat 集成（docs/MMO.md §6.5 / §6.6；MF6a-B4，真实 Redis 令牌桶 + 投递总线）：
 *  realm 频道：本区两人都收到（含发送者回显，from.uid = 发送者），s2 的连接不收；
 *  跨区 realm / 非成员 party → CHAT_CHANNEL_FORBIDDEN；请求含 from → INVALID_PAYLOAD；party 频道只到名册成员；
 *  真实 TOKEN_BUCKET：cap 3 ⇒ 第 4 条连发 RATE_LIMITED。前置：npm --workspace @game/server run stack。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { ColyseusTestServer } from "@colyseus/testing";
import { bootTestServer } from "./helpers";
import { LOBBY_MSG_PUSH, LOBBY_MSG_RPC, LOBBY_PROTOCOL_VERSION, LobbyPush, RoomName } from "@game/shared";
import { ChatRpc } from "@game/shared/protocol/lobbyRpc/domains/chat";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { server } from "../../src/app.config";

import { createUser } from "../../src/core/userRecord";
import { stopMailWakeLoop } from "../../src/websocket/push";
import { startPushConsumer, stopPushConsumer } from "../../src/core/push/pushBus";
import {
  activeLruBucketOf, kActiveLru, kParty, kPartyEvtLog, kPartyEvtSeq, kPartyInvites, kPartyMembers, kPresence, kRl, kSess, zoneCtx,
} from "../../src/core/infra/keys";
import { clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid, issueSession } from "./helpers";

let colyseus: ColyseusTestServer;
const uids: string[] = [];
const partyIds = new Set<number>();

async function makeUser(name: string, sId: number): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  if (!uids.includes(uid)) { uids.push(uid); await zoneCtx.run({ sId }, () => createUser(uid)); }
  const { token } = await issueSession(uid, null, "", sId);
  return { uid, token };
}
async function joinLobby(token: string, sId: number) {
  colyseus.sdk.auth.token = token;
  return colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: LOBBY_PROTOCOL_VERSION, sId });
}
type Room = Awaited<ReturnType<typeof joinLobby>>;
let rpcSeq = 0;
function rpc(room: Room, type: string, payload?: unknown):
  Promise<{ id: string; ok: boolean; data?: any; err?: { code: string; msg: string } }> {
  const id = `r${rpcSeq++}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error(`rpc 超时: ${type}`)); }, 15_000);
    const stop = room.onMessage(LOBBY_MSG_RPC, (reply: any) => {
      if (reply.id !== id) { return; }
      clearTimeout(timer);
      stop();
      resolve(reply);
    });
    room.send(LOBBY_MSG_RPC, { id, type, payload });
  });
}
function collect(room: Room): any[] {
  const got: any[] = [];
  room.onMessage(LOBBY_MSG_PUSH, (m: any) => { if (m.type === LobbyPush.ChatMessage) got.push(m.data); });
  return got;
}
async function waitFor(cond: () => boolean, label: string, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (cond()) return; await sleep(25); }
  throw new Error(`waitFor 超时：${label}`);
}

before(async () => {
  await assertRedisUp();
  colyseus = await bootTestServer(server);
  startPushConsumer();
});

after(async () => {
  await stopPushConsumer();
  await stopMailWakeLoop();
  await colyseus?.shutdown();
  for (const u of uids) {
    for (const s of [1, 2]) { await zoneCtx.run({ sId: s }, () => cleanupUser(u)).catch(() => {}); }
    await clientFor(u).unlink(kSess(u, 1), kSess(u, 2), kPresence(u, 1), kPresence(u, 2));
    const rl = kRl(`chat:send:${u}`);
    await clientForKey(rl).unlink(rl);
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  for (const pid of partyIds) {
    const keys = zoneCtx.run({ sId: 1 }, () => [kParty(pid), kPartyMembers(pid), kPartyInvites(pid), kPartyEvtSeq(pid), kPartyEvtLog(pid)]);
    await clientForKey(keys[0]).unlink(...keys);
  }
  await closeRedis();
  await closeMysql();
});

test("realm 频道：本区两人都收（含回显，from 服务端盖章），s2 不收；跨区 / 非成员 party / 含 from 拒绝；party 只到名册；第 4 条 RATE_LIMITED", async () => {
  const a = await makeUser("ca", 1);
  const b = await makeUser("cb", 1);
  const c = await makeUser("cc", 2);
  const roomA = await joinLobby(a.token, 1);
  const roomB = await joinLobby(b.token, 1);
  const roomC = await joinLobby(c.token, 2);
  try {
    const gotA = collect(roomA); const gotB = collect(roomB); const gotC = collect(roomC);
    const r1 = await rpc(roomA, ChatRpc.Send, { channel: "realm:1", text: "  大家好  " });
    assert.equal(r1.ok, true, JSON.stringify(r1.err));
    await waitFor(() => gotA.length === 1 && gotB.length === 1, "本区两人收到");
    await sleep(200);
    assert.deepEqual(gotC, [], "s2 不收 s1 的 realm 消息");
    assert.equal(gotA[0].from.uid, a.uid, "发送者收到回显且 from.uid = 自己");
    assert.equal(gotB[0].msgId, r1.data.msgId);
    assert.equal(gotB[0].text, "大家好", "文本已 trim");

    const cross = await rpc(roomA, ChatRpc.Send, { channel: "realm:2", text: "x" });
    assert.equal(cross.err?.code, "CHAT_CHANNEL_FORBIDDEN", "跨区 realm 拒绝");
    const notMember = await rpc(roomA, ChatRpc.Send, { channel: "party:999999", text: "x" });
    assert.equal(notMember.err?.code, "CHAT_CHANNEL_FORBIDDEN", "非成员 party 拒绝");
    const withFrom = await rpc(roomA, ChatRpc.Send, { channel: "realm:1", text: "x", from: { uid: b.uid, name: "冒充" } });
    assert.equal(withFrom.err?.code, "INVALID_PAYLOAD", "请求含 from 即拒");

    // party 频道：A 建队并邀 B 入队；C（s2）与 party 无关；B 收到、C 不收；A 回显
    const created = await rpc(roomA, PartyRpc.Create, { clientReqId: "chat_pc" });
    const pid: number = created.data.partyId;
    partyIds.add(pid);
    await rpc(roomA, PartyRpc.Invite, { clientReqId: "chat_pi", uid: b.uid });
    const acc = await rpc(roomB, PartyRpc.Accept, { clientReqId: "chat_pa", partyId: pid });
    assert.equal(acc.ok, true, JSON.stringify(acc.err));
    const r2 = await rpc(roomA, ChatRpc.Send, { channel: `party:${pid}`, text: "队内" });
    assert.equal(r2.ok, true, JSON.stringify(r2.err));
    await waitFor(() => gotA.length === 2 && gotB.length === 2, "队内两人收到");
    assert.equal(gotB[1].channel, `party:${pid}`);
    assert.deepEqual(gotC, []);

    // 真实令牌桶：A 已用 2 个令牌（两次成功发言；被拒的不扣）；第 3 条成功、第 4 条 RATE_LIMITED
    const r3 = await rpc(roomA, ChatRpc.Send, { channel: `party:${pid}`, text: "三" });
    assert.equal(r3.ok, true, JSON.stringify(r3.err));
    const r4 = await rpc(roomA, ChatRpc.Send, { channel: `party:${pid}`, text: "四" });
    assert.equal(r4.err?.code, "RATE_LIMITED", "第 4 条连发被限流");
  } finally {
    await Promise.all([roomA, roomB, roomC].map((r) => r.leave().catch(() => {})));
  }
});
