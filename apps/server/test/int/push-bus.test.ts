import "./env-setup"; // ⚠ 必须第一个 import（限流放宽）

/**
 * 投递总线集成（docs/MMO.md §6.3；MF6a-B2，真实 coord Redis 流）：
 *  1. pushToUsers 经流回读到达本节点在线 uid 的 s1 连接；同 uid 的 s2 连接与别人不收；
 *  2. pushToRealm(s1) 到达 s1 全部连接、s2 不收；
 *  3. 真双消费者：同进程第二个消费者挂假落地端，同一条目两边各恰一次（MMO-PLAN MF6a-B2 末项）；
 *  4. guild 事件经总线到达（guild.test.ts 既有用例即证据，此处不重复）。
 * 前置：npm --workspace @game/server run stack。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { ColyseusTestServer } from "@colyseus/testing";
import { bootTestServer, testServerHttpEndpoint } from "./helpers";
import { LOBBY_MSG_PUSH, LOBBY_PROTOCOL_VERSION, LobbyPush, RoomName } from "@game/shared";
import { server } from "../../src/app.config";

import { createUser } from "../../src/core/userRecord";
import { pushToRealm, pushToUsers, stopMailWakeLoop } from "../../src/websocket/push";
import { createPushConsumer, startPushConsumer, stopPushConsumer, type PushLocalHandlers } from "../../src/core/push/pushBus";
import { activeLruBucketOf, kActiveLru, kPresence, kSess, zoneCtx } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid, issueSession } from "./helpers";

let colyseus: ColyseusTestServer;
const uids: string[] = [];

async function makeUser(name: string, sId: number): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  if (!uids.includes(uid)) {
    uids.push(uid);
    await zoneCtx.run({ sId }, () => createUser(uid));
  }
  const { token } = await issueSession(uid, null, "", sId);
  return { uid, token };
}

async function joinLobby(token: string, sId: number) {
  colyseus.sdk.auth.token = token;
  return colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: LOBBY_PROTOCOL_VERSION, sId });
}

type Room = Awaited<ReturnType<typeof joinLobby>>;
function collect(room: Room, type: string): string[] {
  const got: string[] = [];
  room.onMessage(LOBBY_MSG_PUSH, (m: any) => { if (m.type === type) got.push(JSON.stringify(m.data)); });
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
  startPushConsumer(); // 本节点消费者由进程入口显式起（index.ts）；测试进程自行起
});

after(async () => {
  await stopPushConsumer();
  await stopMailWakeLoop();
  await colyseus?.shutdown();
  for (const u of uids) {
    for (const s of [1, 2]) { await zoneCtx.run({ sId: s }, () => cleanupUser(u)).catch(() => {}); }
    await clientFor(u).unlink(kSess(u, 1), kSess(u, 2), kPresence(u, 1), kPresence(u, 2));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await closeRedis();
  await closeMysql();
});

test("pushToUsers 经流回读：只到该 uid 的 s1 连接；同 uid 的 s2 连接与其他人不收", async () => {
  const a = await makeUser("pba", 1);
  const b = await makeUser("pbb", 1);
  const a2 = await makeUser("pba", 2); // 同账号在 s2 的在线角色
  const roomA = await joinLobby(a.token, 1);
  const roomB = await joinLobby(b.token, 1);
  const roomA2 = await joinLobby(a2.token, 2);
  try {
    const gotA = collect(roomA, LobbyPush.ServerNotice);
    const gotB = collect(roomB, LobbyPush.ServerNotice);
    const gotA2 = collect(roomA2, LobbyPush.ServerNotice);
    pushToUsers([a.uid], LobbyPush.ServerNotice, { text: "only-a" }, 1);
    await waitFor(() => gotA.length === 1, "A 收到定向投递");
    await sleep(300);
    assert.deepEqual(gotA, [JSON.stringify({ text: "only-a" })]);
    assert.deepEqual(gotB, [], "他人不收");
    assert.deepEqual(gotA2, [], "同 uid 的 s2 连接不收（串区）");

    pushToRealm(1, LobbyPush.ServerNotice, { text: "realm-1" });
    await waitFor(() => gotA.length === 2 && gotB.length === 1, "s1 全区到达");
    await sleep(300);
    assert.deepEqual(gotA2, [], "pushToRealm(s1) 不到 s2");
  } finally {
    await Promise.all([roomA, roomB, roomA2].map((r) => r.leave().catch(() => {})));
  }
});

test("真双消费者：同进程第二个消费者挂假落地端，同一条目两边各恰一次", async () => {
  const c = await makeUser("pbc", 1);
  const roomC = await joinLobby(c.token, 1);
  const seenByB: string[] = [];
  const fakeB: PushLocalHandlers = {
    pushToUsers: (uids, type) => { seenByB.push(`${type}:${uids.join(",")}`); return uids.length; },
    pushToRealm: () => 0,
    pushToGuild: () => 0,
  };
  const consumerB = createPushConsumer(() => fakeB, { name: "push-node-b" });
  try {
    await sleep(100); // 让消费者 B 的阻塞 XREAD 就位（$ 游标只看启动后的新条目）
    const gotC = collect(roomC, LobbyPush.ServerNotice);
    pushToUsers([c.uid], LobbyPush.ServerNotice, { text: "twice?" }, 1);
    await waitFor(() => gotC.length === 1 && seenByB.length === 1, "两个消费者各收到一次");
    await sleep(300);
    assert.equal(gotC.length, 1, "节点 a（真实落地）恰一次");
    assert.deepEqual(seenByB, [`server.notice:${c.uid}`], "节点 b（假落地）恰一次");
  } finally {
    await consumerB.stop();
    await roomC.leave().catch(() => {});
  }
});

test("POST /admin/notice（MF6a-B5）：正确密钥 ⇒ 同区两个在线连接都收到 server.notice；错密钥 401；s2 不收", async () => {
  const a = await makeUser("pna", 1);
  const b = await makeUser("pnb", 1);
  const c = await makeUser("pnc", 2);
  const roomA = await joinLobby(a.token, 1);
  const roomB = await joinLobby(b.token, 1);
  const roomC = await joinLobby(c.token, 2);
  const secret = `notice_${Date.now()}`;
  process.env.ADMIN_API_SECRET = secret;
  try {
    const gotA = collect(roomA, LobbyPush.ServerNotice);
    const gotB = collect(roomB, LobbyPush.ServerNotice);
    const gotC = collect(roomC, LobbyPush.ServerNotice);
    const post = (hdr: Record<string, string>, body: unknown) => fetch(`${testServerHttpEndpoint(server)}/admin/notice`, {
      method: "POST", headers: { "content-type": "application/json", ...hdr }, body: JSON.stringify(body),
    });
    assert.equal((await post({ "x-admin-secret": "wrong" }, { sId: 1, text: "x" })).status, 401, "错密钥拒绝");
    const res = await post({ "x-admin-secret": secret }, { sId: 1, text: "全区维护公告" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { published: true });
    await waitFor(() => gotA.length === 1 && gotB.length === 1, "同区两人收到公告");
    await sleep(300);
    assert.deepEqual(gotA, [JSON.stringify({ text: "全区维护公告" })]);
    assert.deepEqual(gotC, [], "s2 不收 s1 的公告");
  } finally {
    delete process.env.ADMIN_API_SECRET;
    await Promise.all([roomA, roomB, roomC].map((r) => r.leave().catch(() => {})));
  }
});

