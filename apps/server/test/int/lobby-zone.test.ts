import "./env-setup"; // ⚠ 必须第一个 import（限流放宽）

/**
 * 大厅进服区路由（DUAL_MODE §3.5 键分类 / §4.3 进服硬闸）——**专测 join options.sId 透传后
 * 大厅整条链路落对区**：客户端带 sId → LobbyRoom.onAuth 存 auth.sId → 每消息 zoneCtx.run +
 * onJoin ensureCharacter 全落 `s{sId}_` 前缀，与战斗房 GameRoom 同区（修复：客户端不传 sId
 * 时大厅 RPC/建角误落基础前缀 s0，与所选战斗区串档）。
 *
 * ⚠ 为什么单形态（GROUP_ZONES 空）也能测出分区：`s{sId}_` 前缀由 `zoneCtx`（keys.P()）驱动，
 * 与 GROUP_ZONES 无关——LobbyRoom 从 auth.sId 建 zoneCtx，sId≥1 即带前缀。GROUP_ZONES 非空
 * 只额外开「未建 zoneCtx 即 throw」的 fail-fast（zone-failfast.test.ts 子进程测）与进服归属闸
 * （groupAdmitsZone，config-guard.test.ts 测配置面），两者都不改本文件要验的前缀路由。
 * 故本文件在 in-process 真实栈上直接验路由，不动 GROUP_ZONES（避开 fail-fast 对测试脚手架的连带约束）。
 *
 * ⚠ 读断言用 `hgetall` 取整档再看字段，⛔ 不用单字段 `hget`：本 in-process 测试栈里对刚写入的
 * per-zone 键连发 `hget` 偶发回包错配（返回 undefined，而同键 `hgetall` 恒返回完整正确档）——
 * 疑似 ioredis 单字段读在该并发形态下的 desync。整档读 + waitField 轮询，稳定可复现。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  ErrorCode, LOBBY_MSG_RPC, PROTOCOL_VERSION, RoomName, UserRpc,
  type IRoomJoinOptions,
} from "@game/shared";
import { server } from "../../src/app.config";

import { GROUP_ZONES } from "../../src/core/infra/config";
import { activeLruBucketOf, kActiveLru, kSess, kUser, zoneCtx } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql } from "../../src/core/infra/mysql";
import { LobbyRoom } from "../../src/websocket/LobbyRoom";
import { stopMailWakeLoop } from "../../src/websocket/push";
import { assertRedisUp, cleanupUser, sleep, testUid, issueSession } from "./helpers";

let colyseus: ColyseusTestServer;
const uids: string[] = [];

/** 造组缓存会话（⛔ 不建玩法档——建角交给 onJoin/测试自身，才验得出落对区）。 */
async function makeAcct(name: string, sId = 0): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  const { token } = await issueSession(uid, null, "", sId);
  return { uid, token };
}

/** 经 SDK 入大厅房；sId 给定则透传（区服形态），缺省不带（单形态/大混服，等价修复前老客户端）。 */
async function joinLobby(token: string, sId?: number) {
  colyseus.sdk.auth.token = token;
  const opts: Record<string, unknown> = { v: PROTOCOL_VERSION };
  if (sId !== undefined) { opts.sId = sId; }
  return colyseus.sdk.joinOrCreate(RoomName.Lobby, opts);
}

/** RPC 往返：按信封 id 配对回包。 */
let rpcSeq = 0;
function rpc(room: Awaited<ReturnType<typeof joinLobby>>, type: string, payload?: unknown):
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

/** 轮询等待条件成立（onJoin 的 ensureCharacter 是 fire-and-forget，需等其落地）。 */
async function waitFor(cond: () => Promise<boolean>, label: string, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) { return; }
    await sleep(30);
  }
  throw new Error(`waitFor 超时：${label}`);
}

/** 整档读某字段（⛔ 不用 hget，见文件头）。 */
async function hfield(c: ReturnType<typeof clientFor>, key: string, field: string): Promise<string | undefined> {
  return (await c.hgetall(key))[field];
}

/** 轮询等某 hash 字段达到期望值（吸收极端读时序抖动；值真错则超时 = 断言失败）。 */
async function waitField(
  c: ReturnType<typeof clientFor>, key: string, field: string, expected: string, label: string,
): Promise<void> {
  await waitFor(async () => (await hfield(c, key, field)) === expected, `${label}（${field}=${expected}）`);
}

/** per-zone user 键：sId≥1 带 s{sId}_ 前缀；sId=0 == 基础前缀（大混服）。先算成常量再读（见文件头）。 */
const zoneUserKey = (uid: string, sId: number): string => zoneCtx.run({ sId }, () => kUser(uid));

before(async () => {
  await assertRedisUp();
  colyseus = await boot(server);
});

after(async () => {
  await stopMailWakeLoop();
  await colyseus?.shutdown();
  for (const u of uids) {
    for (const s of [0, 1]) { await zoneCtx.run({ sId: s }, () => cleanupUser(u)).catch(() => {}); }
    await clientFor(u).unlink(kSess(u, 0), kSess(u, 1), kSess(u, 2));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await closeRedis();
  await closeMysql();
});

test("LobbyRoom sId 先做运行时规范化：承载全部区时畸形值仍拒绝，合法整数正常鉴权", async () => {
  assert.deepEqual(GROUP_ZONES, [], "本用例必须覆盖 GROUP_ZONES 空（承载全部区）的易漏校验形态");
  for (const raw of [-1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
    const options = { v: PROTOCOL_VERSION, sId: raw } as unknown as IRoomJoinOptions;
    await assert.rejects(
      LobbyRoom.onAuth("", options, undefined as never),
      (e: unknown) => e instanceof Error && e.message.includes(String(ErrorCode.WrongServer)),
      `畸形 sId=${String(raw)} 即使在承载全部区形态也必须按 WrongServer 拒绝`,
    );
  }

  const { uid, token } = await makeAcct("lobby-sid-valid", 1);
  const auth = await LobbyRoom.onAuth(
    token, { v: PROTOCOL_VERSION, sId: 1 }, undefined as never,
  );
  assert.deepEqual(auth, { userId: uid, token, sId: 1 }, "合法整数须按原值完成权威鉴权");
});

test("带 sId=1 join：onJoin 建角落 s1_user，⛔ 不落基础前缀 s0", async () => {
  const { uid, token } = await makeAcct("z1char", 1);
  const c = clientFor(uid);
  const s1u = zoneUserKey(uid, 1);
  const base = zoneUserKey(uid, 0);
  const room = await joinLobby(token, 1);
  // onJoin → ensureCharacter(uid, 1)：建立 s1_user（fire-and-forget，等其落地）
  await waitFor(async () => (await c.exists(s1u)) === 1, "s1_user 由 onJoin ensureCharacter 建立");

  const baseExists = await c.exists(base);
  assert.equal(baseExists, 0, "基础前缀 user 未建（建角落所选区 s1，非大混服 s0）");
  await room.leave();
});

test("带 sId=1 join：大厅写 RPC 落 s1_user；基础前缀全程不受影响（不串 s0）", async () => {
  const { uid, token } = await makeAcct("z1rpc", 1);
  const c = clientFor(uid);
  const s1u = zoneUserKey(uid, 1);
  const base = zoneUserKey(uid, 0);
  const room = await joinLobby(token, 1);
  await waitFor(async () => (await c.exists(s1u)) === 1, "等 onJoin 建角完成（lock 已释放）");

  const r = await rpc(room, UserRpc.UpdateProfile, { clientReqId: "z1w", nickname: "赵子龙", avatarId: 3 });
  assert.equal(r.ok, true, `updateProfile 应成功，实际 ${JSON.stringify(r.err)}`);

  await waitField(c, s1u, "nickname", "赵子龙", "写落 s1_user（大厅 RPC 在 auth.sId=1 区内跑）");
  assert.equal(await c.exists(base), 0, "基础前缀 user 全程未建（大厅未落 s0）");
  await room.leave();
});

test("首进空库：join 完成即满足 character ready，并发 join 共享同一 initializer", async () => {
  const { uid, token } = await makeAcct("ready-concurrent", 1);
  const [roomA, roomB] = await Promise.all([joinLobby(token, 1), joinLobby(token, 1)]);
  try {
    // 这里故意不轮询 Redis：若 onJoin 仍是 detached，任一立即 GetInfo 都会暴露 null/半状态。
    const [a, b] = await Promise.all([rpc(roomA, UserRpc.GetInfo, {}), rpc(roomB, UserRpc.GetInfo, {})]);
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(a.data.user.uid, uid);
    assert.equal(b.data.user.uid, uid);
  } finally {
    await Promise.all([roomA.leave(), roomB.leave()].map((p) => p.catch(() => {})));
  }
});

test("缺 sId join：auth.sId=0，大厅建角/写 RPC 落基础前缀（大混服向后兼容，修复前老客户端行为保持）", async () => {
  const { uid, token } = await makeAcct("z0");
  const c = clientFor(uid);
  const s1u = zoneUserKey(uid, 1);
  const base = zoneUserKey(uid, 0);
  const room = await joinLobby(token); // ⛔ 不带 sId（等价修复前客户端）
  await waitFor(async () => (await c.exists(base)) === 1, "onJoin 在基础前缀建角（sId=0=大混服）");
  assert.equal(await c.exists(s1u), 0, "未串到 s1_（缺 sId 不进区）");

  const r = await rpc(room, UserRpc.UpdateProfile, { clientReqId: "z0w", nickname: "关云长" });
  assert.equal(r.ok, true, `updateProfile 应成功，实际 ${JSON.stringify(r.err)}`);

  await waitField(c, base, "nickname", "关云长", "写落基础前缀 user（大混服=0 保持）");
  assert.equal(await c.exists(s1u), 0, "写路径未串到 s1_");
  await room.leave();
});

test("GameRoom 撮合按区隔离：不同 sId ⛔ 不共房；同 sId 才合流（filterBy(['sId'])）", async () => {
  // ⚠ 各自按要进的区签会话（M12e）：a/c 进 s1、b 进 s2
  const a = await makeAcct("gz-a", 1), b = await makeAcct("gz-b", 2), c = await makeAcct("gz-c", 1);
  const join = async (token: string, sId: number) => {
    colyseus.sdk.auth.token = token;
    return colyseus.sdk.joinOrCreate(RoomName.Game, { v: PROTOCOL_VERSION, sId });
  };
  const r1 = await join(a.token, 1);
  const r2 = await join(b.token, 2);
  const r3 = await join(c.token, 1);
  try {
    assert.notEqual(r1.roomId, r2.roomId, "1 区与 2 区**不得**撮合进同一场对局（⛔ 静默混区）");
    assert.equal(r3.roomId, r1.roomId, "同区正常合流（撮合未被过度收紧）");
  } finally {
    await Promise.all([r1.leave(), r2.leave(), r3.leave()].map((p) => p.catch(() => {})));
  }
});
