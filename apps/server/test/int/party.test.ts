import "./env-setup"; // ⚠ 必须第一个 import（限流放宽）

/**
 * party 集成测试（docs/MMO.md §6.4 / §6.6；MF6a-B3，真实 Redis Lua + 大厅 RPC + 投递总线）：
 *  - 建队 / 邀请（在线校验 + 被邀请者收 party.invited）/ 接受（成员收 party.event 唤醒）；第 6 人 PARTY_FULL；
 *  - 过期邀请 PARTY_INVITE_INVALID；非队长 kick PARTY_NOT_LEADER；队长 leave 后最早成员成队长；
 *  - 最后一人 leave 后五键全无；同 clientReqId 重放 create 不建第二队；蒸发队伍 party.get 返回 null 并清字段；
 *  - getEvents 增量 / 水位（跳号刷新是客户端 PartyLogic 的行为，见 apps/client/test/partyLogic.test.ts）。
 * 前置：npm --workspace @game/server run stack。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { LOBBY_MSG_PUSH, LOBBY_MSG_RPC, LOBBY_PROTOCOL_VERSION, LobbyPush, RoomName } from "@game/shared";
import { PartyRpc } from "@game/shared/protocol/lobbyRpc/domains/party";
import { server } from "../../src/app.config";

import { createUser } from "../../src/core/userRecord";
import { stopMailWakeLoop } from "../../src/websocket/push";
import { startPushConsumer, stopPushConsumer } from "../../src/core/push/pushBus";
import {
  activeLruBucketOf, kActiveLru, kParty, kPartyEvtLog, kPartyEvtSeq, kPartyIdSeq, kPartyInvites, kPartyMembers,
  kPresence, kSess, kUser, zoneCtx,
} from "../../src/core/infra/keys";
import { clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid, issueSession } from "./helpers";

const SID = 1;
let colyseus: ColyseusTestServer;
const uids: string[] = [];
const partyIds = new Set<number>();
let reqSeq = 0;
const reqId = (): string => `pr_${Date.now().toString(36)}_${reqSeq++}`;

async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await zoneCtx.run({ sId: SID }, () => createUser(uid));
  const { token } = await issueSession(uid, null, "", SID);
  return { uid, token };
}
async function joinLobby(token: string) {
  colyseus.sdk.auth.token = token;
  return colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: LOBBY_PROTOCOL_VERSION, sId: SID });
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
function collect(room: Room, type: string): unknown[] {
  const got: unknown[] = [];
  room.onMessage(LOBBY_MSG_PUSH, (m: any) => { if (m.type === type) got.push(m.data); });
  return got;
}
async function waitFor(cond: () => boolean, label: string, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (cond()) return; await sleep(25); }
  throw new Error(`waitFor 超时：${label}`);
}
const partyKeysOf = (pid: number): string[] => zoneCtx.run({ sId: SID }, () =>
  [kParty(pid), kPartyMembers(pid), kPartyInvites(pid), kPartyEvtSeq(pid), kPartyEvtLog(pid)]);
async function partyKeyCount(pid: number): Promise<number> {
  const keys = partyKeysOf(pid);
  return clientForKey(keys[0]).exists(...keys);
}
async function partyField(uid: string): Promise<string | undefined> {
  const key = zoneCtx.run({ sId: SID }, () => kUser(uid));
  return (await clientFor(uid).hgetall(key)).partyId;
}

before(async () => {
  await assertRedisUp();
  colyseus = await boot(server);
  startPushConsumer();
});

after(async () => {
  await stopPushConsumer();
  await stopMailWakeLoop();
  await colyseus?.shutdown();
  for (const u of uids) {
    await zoneCtx.run({ sId: SID }, () => cleanupUser(u)).catch(() => {});
    await clientFor(u).unlink(kSess(u, SID), kPresence(u, SID));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  for (const pid of partyIds) {
    const keys = partyKeysOf(pid);
    await clientForKey(keys[0]).unlink(...keys);
  }
  await closeRedis();
  await closeMysql();
});

test("建队 → 邀请（在线校验 + party.invited）→ 接受（party.event 唤醒）→ 第 6 人 PARTY_FULL；同 clientReqId 重放 create 不建第二队", async () => {
  const users = await Promise.all(["pa", "pb", "pc", "pd", "pe", "pf"].map((n) => makeUser(n)));
  const rooms = await Promise.all(users.map((u) => joinLobby(u.token)));
  const [leader, ...others] = users;
  const [roomL, ...roomsO] = rooms;
  try {
    const createId = reqId();
    const c1 = await rpc(roomL, PartyRpc.Create, { clientReqId: createId });
    assert.equal(c1.ok, true, JSON.stringify(c1.err));
    const pid: number = c1.data.partyId;
    partyIds.add(pid);
    assert.equal(c1.data.seq, 1);
    const c2 = await rpc(roomL, PartyRpc.Create, { clientReqId: createId });
    assert.equal(c2.ok, true);
    assert.equal(c2.data.partyId, pid, "同 clientReqId 重放返回首次结果，⛔ 不建第二队");
    const c3 = await rpc(roomL, PartyRpc.Create, { clientReqId: reqId() });
    assert.equal(c3.err?.code, "PARTY_ALREADY_IN_PARTY", "新 clientReqId 再建队被拒");

    // 离线目标：pf 先离开大厅再被邀请
    await roomsO[4].leave();
    await waitFor(() => true, "leave");
    await sleep(150);
    const offline = await rpc(roomL, PartyRpc.Invite, { clientReqId: reqId(), uid: others[4].uid });
    assert.equal(offline.err?.code, "PARTY_TARGET_OFFLINE");

    const invitedB = collect(roomsO[0], LobbyPush.PartyInvited);
    const eventsL = collect(roomL, LobbyPush.PartyEvent);
    const inv = await rpc(roomL, PartyRpc.Invite, { clientReqId: reqId(), uid: others[0].uid });
    assert.equal(inv.ok, true, JSON.stringify(inv.err));
    await waitFor(() => invitedB.length === 1, "B 收到 party.invited");
    assert.deepEqual(invitedB[0], { partyId: pid, by: leader.uid, expAt: inv.data.expAt }, "邀请推送带内容");
    await waitFor(() => eventsL.length >= 1, "队长收到 invited 事件唤醒");

    const acc = await rpc(roomsO[0], PartyRpc.Accept, { clientReqId: reqId(), partyId: pid });
    assert.equal(acc.ok, true, JSON.stringify(acc.err));
    await waitFor(() => eventsL.some((e: any) => e.seq === acc.data.seq), "队长收到 memberJoin 唤醒");
    assert.equal(await partyField(others[0].uid), String(pid), "档字段 partyId 已写");

    // 拉满到 5 人：c、d、e 入队；第 6 人（f 重新上线）accept 得 PARTY_FULL
    for (const i of [1, 2, 3]) {
      const r = await rpc(roomL, PartyRpc.Invite, { clientReqId: reqId(), uid: others[i].uid });
      assert.equal(r.ok, true, JSON.stringify(r.err));
      const a = await rpc(roomsO[i], PartyRpc.Accept, { clientReqId: reqId(), partyId: pid });
      assert.equal(a.ok, true, JSON.stringify(a.err));
    }
    const view = await rpc(roomL, PartyRpc.Get, {});
    assert.equal(view.data.party.members.length, 5);
    assert.equal(view.data.party.leader, leader.uid);
    assert.ok(view.data.party.members.every((m: any) => m.online === true), "presence 标记在线");
    const roomF = await joinLobby(others[4].token);
    rooms[5] = roomF;
    const full = await rpc(roomL, PartyRpc.Invite, { clientReqId: reqId(), uid: others[4].uid });
    assert.equal(full.err?.code, "PARTY_FULL", "满员后邀请即拒");

    // 非队长 kick → PARTY_NOT_LEADER；队长 kick 成功后被踢者 get 自愈为 null 且字段清零
    const notLeader = await rpc(roomsO[0], PartyRpc.Kick, { clientReqId: reqId(), uid: others[1].uid });
    assert.equal(notLeader.err?.code, "PARTY_NOT_LEADER");
    const eventsC = collect(roomsO[1], LobbyPush.PartyEvent);
    const kick = await rpc(roomL, PartyRpc.Kick, { clientReqId: reqId(), uid: others[1].uid });
    assert.equal(kick.ok, true, JSON.stringify(kick.err));
    await waitFor(() => eventsC.length >= 1, "被踢者收到唤醒");
    const kickedView = await rpc(roomsO[1], PartyRpc.Get, {});
    assert.equal(kickedView.data.party, null, "被踢者视图为 null（读侧自愈）");
    assert.equal(await partyField(others[1].uid), "0", "被踢者档字段自愈清零");

    // getEvents 增量：队长从 0 拉全量、从 latestSeq 拉空
    const ev = await rpc(roomL, PartyRpc.GetEvents, { sinceSeq: 0 });
    assert.equal(ev.data.partyId, pid);
    assert.ok(ev.data.events.length >= 6, `事件条数 ${ev.data.events.length}`);
    assert.deepEqual(ev.data.events.map((e: any) => e.kind).slice(0, 3), ["created", "invited", "memberJoin"]);
    const ev2 = await rpc(roomL, PartyRpc.GetEvents, { sinceSeq: ev.data.latestSeq });
    assert.deepEqual(ev2.data.events, []);

    // 队长 leave → 最早入队成员（B）接任；最后一人依次离开 → 五键全无、字段清零
    const leave = await rpc(roomL, PartyRpc.Leave, { clientReqId: reqId() });
    assert.deepEqual(leave.data, { ok: true, disbanded: false });
    const afterLeave = await rpc(roomsO[0], PartyRpc.Get, {});
    assert.equal(afterLeave.data.party.leader, others[0].uid, "最早成员接任队长");
    for (const i of [0, 2, 3]) {
      const r = await rpc(roomsO[i], PartyRpc.Leave, { clientReqId: reqId() });
      assert.equal(r.ok, true, JSON.stringify(r.err));
      if (i === 3) assert.equal(r.data.disbanded, true, "最后一人离开解散");
    }
    assert.equal(await partyKeyCount(pid), 0, "解散后五键全无");
    assert.equal(await partyField(others[3].uid), "0");
  } finally {
    await Promise.all(rooms.map((r) => r.leave().catch(() => {})));
  }
});

test("过期邀请 PARTY_INVITE_INVALID；蒸发队伍 party.get 返回 null 并清字段；转让队长", async () => {
  const a = await makeUser("qa");
  const b = await makeUser("qb");
  const roomA = await joinLobby(a.token);
  const roomB = await joinLobby(b.token);
  try {
    const c = await rpc(roomA, PartyRpc.Create, { clientReqId: reqId() });
    const pid: number = c.data.partyId;
    partyIds.add(pid);
    const inv = await rpc(roomA, PartyRpc.Invite, { clientReqId: reqId(), uid: b.uid });
    assert.equal(inv.ok, true, JSON.stringify(inv.err));
    // 把邀请的 expAt 改到过去（真实 Lua 判定过期）
    const invitesKey = partyKeysOf(pid)[2];
    const raw = await clientForKey(invitesKey).hget(invitesKey, b.uid);
    assert.ok(raw);
    await clientForKey(invitesKey).hset(invitesKey, b.uid, JSON.stringify({ ...JSON.parse(raw!), expAt: Date.now() - 1 }));
    const expired = await rpc(roomB, PartyRpc.Accept, { clientReqId: reqId(), partyId: pid });
    assert.equal(expired.err?.code, "PARTY_INVITE_INVALID");
    const declineNoInvite = await rpc(roomB, PartyRpc.Decline, { clientReqId: reqId(), partyId: pid });
    assert.equal(declineNoInvite.ok, true, "无邀请时 decline 幂等 ok");

    // 重新邀请并接受，然后转让队长
    const inv2 = await rpc(roomA, PartyRpc.Invite, { clientReqId: reqId(), uid: b.uid });
    assert.equal(inv2.ok, true);
    const acc = await rpc(roomB, PartyRpc.Accept, { clientReqId: reqId(), partyId: pid });
    assert.equal(acc.ok, true, JSON.stringify(acc.err));
    const notLeader = await rpc(roomB, PartyRpc.TransferLeader, { clientReqId: reqId(), uid: a.uid });
    assert.equal(notLeader.err?.code, "PARTY_NOT_LEADER");
    const transfer = await rpc(roomA, PartyRpc.TransferLeader, { clientReqId: reqId(), uid: b.uid });
    assert.equal(transfer.ok, true, JSON.stringify(transfer.err));
    const view = await rpc(roomA, PartyRpc.Get, {});
    assert.equal(view.data.party.leader, b.uid);

    // 蒸发：直接删掉键族 → get 返回 null 且字段清零；leave 报 PARTY_NOT_FOUND 且字段已清
    const keys = partyKeysOf(pid);
    await clientForKey(keys[0]).unlink(...keys);
    const gone = await rpc(roomA, PartyRpc.Get, {});
    assert.equal(gone.data.party, null);
    assert.equal(await partyField(a.uid), "0", "蒸发队伍清字段");
    const leaveGone = await rpc(roomB, PartyRpc.Leave, { clientReqId: reqId() });
    assert.equal(leaveGone.err?.code, "PARTY_NOT_FOUND");
    assert.equal(await partyField(b.uid), "0");
  } finally {
    await Promise.all([roomA, roomB].map((r) => r.leave().catch(() => {})));
    const idKey = zoneCtx.run({ sId: SID }, () => kPartyIdSeq());
    void idKey;
  }
});
