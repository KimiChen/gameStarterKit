import "./env-setup"; // ⚠ 必须第一个 import（限流放宽）

/**
 * M5 DoD 集成测试（10·M5）——真实 Colyseus 服务器 + SDK 客户端 + 真实 Redis/MySQL：
 * 错误码联调子集：AUTH_REQUIRED / AUTH_EPOCH_STALE / ACCOUNT_BANNED / RATE_LIMITED /
 * INVALID_PAYLOAD / UNKNOWN_TYPE / BUSY / STALE_FENCE / IN_PROGRESS；
 * user.getInfo 压测不产生任何 lock:{uid}；邮件列表/已读 + 唤醒推送。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { LOBBY_MSG_PUSH, LOBBY_MSG_RPC, PROTOCOL_VERSION, RoomName } from "@game/shared";
import { server } from "../../src/app.config";
import { banUser, issueSession } from "../../src/core/auth/session";
import { acquireLease } from "../../src/core/locks";
import { createUser } from "../../src/core/userRecord";
import { emitMailWake } from "../../src/core/economy/mailer";
import { stopMailWakeLoop } from "../../src/websocket/push";
import { activeLruBucketOf, kActiveLru, kFence, kLock, kSess, kUser } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

let colyseus: ColyseusTestServer;
const uids: string[] = [];

/** 造号：accounts 行 + Redis 档 + 会话。绕过 wxLogin（微信侧 M3 已单独测过）。 */
async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  await createUser(uid);
  const { token } = await issueSession(uid, 0, null);
  return { uid, token };
}

/** 经 SDK 入大厅房（v = 协议版本，onAuth 硬闸）。 */
async function joinLobby(token: string) {
  colyseus.sdk.auth.token = token;
  return colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION });
}

/** RPC 往返：按信封 id 配对回包。 */
let rpcSeq = 0;
function rpc(room: Awaited<ReturnType<typeof joinLobby>>, type: string, payload?: unknown):
  Promise<{ id: string; ok: boolean; data?: any; err?: { code: string; msg: string } }> {
  const id = `r${rpcSeq++}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop(); // 超时也要摘监听——房间存活期内 onMessage 会持续累积（并发用例会放大）
      reject(new Error(`rpc 超时: ${type}`));
    }, 15_000);
    const stop = room.onMessage(LOBBY_MSG_RPC, (reply: any) => {
      if (reply.id !== id) { return; }
      clearTimeout(timer);
      stop();
      resolve(reply);
    });
    room.send(LOBBY_MSG_RPC, { id, type, payload });
  });
}

before(async () => {
  await assertRedisUp();
  colyseus = await boot(server);
});

after(async () => {
  stopMailWakeLoop();
  await colyseus?.shutdown();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM mail WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u);
    await clientFor(u).unlink(kSess(u));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await closeRedis();
  await closeMysql();
});

test("无效 token join 被拒（AUTH_REQUIRED，09·G1 从 token 反查）", async () => {
  await assert.rejects(joinLobby("garbage-token"), /AUTH_REQUIRED/);
});

test("getInfo 压测：只读路径不产生任何 lock:{uid}（09·G2）", async () => {
  const { uid, token } = await makeUser("ro");
  const room = await joinLobby(token);
  const c = clientFor(uid);
  const fenceBefore = await c.get(kFence(uid)); // 只读路径连 fence 计数器都不该动

  const replies = await Promise.all(Array.from({ length: 100 }, () => rpc(room, "user.getInfo")));
  assert.ok(replies.every((r) => r.ok), "100 个 getInfo 全部成功");
  assert.equal(replies[0].data.user.uid, uid);

  assert.equal(await c.get(kFence(uid)), fenceBefore, "fence 计数器未被只读路径消耗");
  assert.equal(await c.exists(kLock(uid)), 0, "无 lock:{uid} 残留");
  await room.leave();
});

test("写样板 updateProfile：casHset 落字段 + lastActiveAt + active:lru（10·M5 接线）", async () => {
  const { uid, token } = await makeUser("wr");
  const room = await joinLobby(token);
  const r = await rpc(room, "user.updateProfile", { clientReqId: "c1", nickname: "赵子龙", avatarId: 3 });
  assert.equal(r.ok, true);
  const c = clientFor(uid);
  const [nick, avatar, lastActive, ver] = await c.hmget(kUser(uid), "nickname", "avatarId", "lastActiveAt", "ver");
  assert.equal(nick, "赵子龙");
  assert.equal(avatar, "3");
  assert.ok(Number(lastActive) > 0, "lastActiveAt 已写");
  assert.equal(ver, "1");
  const b = activeLruBucketOf(uid);
  assert.ok(await indexClientFor(b).zscore(kActiveLru(b), uid), "active:lru 已收录");
  // 幂等结果缓存：同 clientReqId 重放直接回缓存，ver 不再 bump
  const r2 = await rpc(room, "user.updateProfile", { clientReqId: "c1", nickname: "赵子龙" });
  assert.equal(r2.ok, true);
  assert.equal(await c.hget(kUser(uid), "ver"), "1", "重放未二次写入");
  await room.leave();
});

test("偏好字段级上云：缺失即默认开（零迁移）→ 覆写落档 → getInfo 回读", async () => {
  const { uid, token } = await makeUser("pref");
  const room = await joinLobby(token);

  // 建号不写偏好字段：读侧兜底默认开（07 字段表「缺失即默认」）
  const before = await rpc(room, "user.getInfo", {});
  assert.equal(before.data.user.musicOn, true, "缺失 → 默认开");
  assert.equal(before.data.user.sfxOn, true);
  assert.equal(await clientFor(uid).hget(kUser(uid), "musicOn"), null, "读不回填");

  const w = await rpc(room, "user.updateProfile", { clientReqId: "pf1", musicOn: false });
  assert.equal(w.ok, true);
  const after = await rpc(room, "user.getInfo", {});
  assert.equal(after.data.user.musicOn, false, "覆写生效");
  assert.equal(after.data.user.sfxOn, true, "未写字段仍默认开");
  assert.equal(after.data.user.lastStaminaRecoverAt, 0, "lastStaminaRecoverAt 缺省读 0（wx-login 建号显式写 0）");
  await room.leave();
});

test("错误码：INVALID_PAYLOAD / UNKNOWN_TYPE（不断连，09·G6）", async () => {
  const { token } = await makeUser("err");
  const room = await joinLobby(token);
  const bad = await rpc(room, "user.getProfile", { uid: "" }); // min(1) 不过
  assert.equal(bad.err?.code, "INVALID_PAYLOAD");
  const unknown = await rpc(room, "no.such.type");
  assert.equal(unknown.err?.code, "UNKNOWN_TYPE");
  const ok = await rpc(room, "user.getInfo"); // 未知 type 不封禁：后续请求照常
  assert.equal(ok.ok, true);
  await room.leave();
});

test("错误码：BUSY（外部持锁）与 STALE_FENCE（fence 被抬高）", async () => {
  const { uid, token } = await makeUser("lock");
  const room = await joinLobby(token);
  const c = clientFor(uid);

  // BUSY：测试进程直接持有 lock:{uid}，网关侧有界重试后放弃
  const lease = await acquireLease(uid);
  const busy = await rpc(room, "user.updateProfile", { clientReqId: "b1", nickname: "x" });
  assert.equal(busy.err?.code, "BUSY");
  await lease.release();

  // STALE_FENCE：把档内 fence 抬到极大，下一次写的新 fence 必然小于它 → casHset stale
  await c.hset(kUser(uid), "fence", "9007199254740000");
  const stale = await rpc(room, "user.updateProfile", { clientReqId: "s1", nickname: "y" });
  assert.equal(stale.err?.code, "STALE_FENCE");
  await c.hset(kUser(uid), "fence", "0"); // 复原
  await room.leave();
});

test("错误码：IN_PROGRESS（幂等 pending 命中，09·I1）", async () => {
  const { uid, token } = await makeUser("idm");
  const room = await joinLobby(token);
  // 外部持锁让第一发卡满有界重试窗口（~500ms），第二发同 clientReqId 撞 pending
  const lease = await acquireLease(uid);
  const first = rpc(room, "user.updateProfile", { clientReqId: "dup1", nickname: "a" });
  await sleep(80); // 让第一发先占到 idem pending
  const second = await rpc(room, "user.updateProfile", { clientReqId: "dup1", nickname: "a" });
  assert.equal(second.err?.code, "IN_PROGRESS");
  const r1 = await first; // 锁一直被占着 → 第一发耗尽重试，干净失败并已释放 pending
  assert.equal(r1.err?.code, "BUSY");
  await lease.release();
  // 干净失败后立即可重试（09·I1：pending 不留毒丸）
  const retry = await rpc(room, "user.updateProfile", { clientReqId: "dup1", nickname: "a" });
  assert.equal(retry.ok, true);
  await room.leave();
});

test("错误码：RATE_LIMITED（per-user 桶）", async () => {
  const { token } = await makeUser("rate");
  const room = await joinLobby(token);
  const replies = await Promise.all(Array.from({ length: 260 }, () => rpc(room, "user.getInfo")));
  const limited = replies.filter((r) => r.err?.code === "RATE_LIMITED");
  assert.ok(limited.length > 0, `260 连发应有超出容量 200 的被限流（实际 ${limited.length}）`);
  await room.leave();
});

test("错误码：AUTH_EPOCH_STALE / ACCOUNT_BANNED（复活会话被权威拦，09·G7）", async () => {
  // epoch stale：MySQL epoch+1 而 sess 还在（failover 复活形态）
  const a = await makeUser("ep");
  await getPool().execute("UPDATE accounts SET token_epoch = token_epoch + 1 WHERE user_id = ?", [a.uid]);
  await assert.rejects(joinLobby(a.token), /AUTH_EPOCH_STALE/);

  // banned：封号后 sess 被删；模拟复活 sess 再 join → 严格校验查 status 拦下
  const b = await makeUser("ban");
  await banUser(b.uid, "test");
  const revived = await issueSession(b.uid, 99, null); // 复活的会话（epoch 假装很新）
  await assert.rejects(joinLobby(revived.token), /ACCOUNT_BANNED/);
});

test("邮件：list / markRead（MySQL 权威，09·A6）+ 唤醒推送（09·K6）", async () => {
  const { uid, token } = await makeUser("mail");
  const room = await joinLobby(token);
  const [ins] = await getPool().execute<ResultSetHeader>(
    "INSERT INTO mail (user_id, title, body) VALUES (?, '欢迎', '首测奖励见附件')", [uid]);
  const mailId = ins.insertId;

  const list1 = await rpc(room, "mail.list", {});
  assert.equal(list1.data.mails.length, 1);
  assert.equal(list1.data.mails[0].read, false);

  const mark = await rpc(room, "mail.markRead", { mailId });
  assert.equal(mark.ok, true);
  const list2 = await rpc(room, "mail.list", {});
  assert.equal(list2.data.mails[0].read, true, "read_at 权威已更新");

  // 唤醒流：XADD → 本节点消费 → 在线推送 mail.new
  const pushed = new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("等 push 超时")), 8000);
    room.onMessage(LOBBY_MSG_PUSH, (m: any) => {
      if (m.type === "mail.new") { clearTimeout(t); resolve(m.data); }
    });
  });
  await emitMailWake(uid, mailId);
  assert.equal((await pushed).mailId, mailId);
  await room.leave();
});

test("断线重连竞态：旧连接晚 leave 不误删新连接的推送注册（sink 条件注销）", async () => {
  const { uid, token } = await makeUser("resink");
  const oldConn = await joinLobby(token);
  const newConn = await joinLobby(token); // 重连后的新连接：uid 槽位被新 sink 覆盖

  const pushed = new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("等 push 超时")), 8000);
    newConn.onMessage(LOBBY_MSG_PUSH, (m: any) => {
      if (m.type === "mail.new") { clearTimeout(t); resolve(m.data); }
    });
  });

  await oldConn.leave(); // 竞态时序：旧连接的 onLeave 晚于新连接的 onJoin 到达
  await sleep(100);      // 等服务端 onLeave 处理完

  const [ins] = await getPool().execute<ResultSetHeader>(
    "INSERT INTO mail (user_id, title, body) VALUES (?, '竞态', 'sink 条件注销')", [uid]);
  await emitMailWake(uid, ins.insertId);
  assert.equal((await pushed).mailId, ins.insertId, "新连接仍应收到 mail.new 推送");
  await newConn.leave();
});

test("协议版本闸门：v 不匹配在 onAuth 即拒（ProtocolMismatch）；缺省 v 按 1 兼容", async () => {
  const { token } = await makeUser("proto");
  colyseus.sdk.auth.token = token;
  await assert.rejects(colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: 999 }), "旧协议客户端应被拒");
  const ok = await colyseus.sdk.joinOrCreate(RoomName.Lobby, {}); // 未带 v = 首版客户端
  assert.ok(ok.sessionId, "缺省 v 视为 1，当前版本放行");
  await ok.leave();
});
