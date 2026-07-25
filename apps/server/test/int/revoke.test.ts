import "./env-setup"; // ⚠ 必须第一个 import

/**
 * 封号 = 账号级「下次登不上」+ 踢在线（DUAL_MODE §2.3 / M12d 简化模型）——真实 MySQL + Redis（coord 缺省复用 durable）。
 *  1. banUser 写权威（status=1 + token_hash=NULL）→ 新建连接 strict 即拒 + 重新登录被拒；本节点在线即时踢
 *  2. 控制总线：XADD stream:kick → 消费者踢**本节点**在线连接（跨节点范式；不在本节点则跳过）
 *  3. revokeSessions（换端/踢下线）：token_hash=NULL 但 status 不变 → 可重新登录换发新 token
 *  4. ⚠ 缺踢无自动收敛：只写权威不踢 → 在场连接快路径仍放行（GM SOP 必须踢的反证）
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { verifySession, writeGroupSess } from "../../src/core/auth/session";
import { banUser, revokeSessions } from "../../src/core/auth/ban";
import { verifySessionStrict } from "../../src/platform/inProcessAccount";

import { AuthRequiredError } from "../../src/core/errors";
import { broadcastKick, kickLocal, setKickHandler, startKickConsumer, stopKickConsumer } from "../../src/core/auth/kickBus";
import { ForceLogoutReason, KICK_CLOSE_CODE, LobbyPush } from "@game/shared";
import { kickUser, registerOnline, unregisterOnline, type PushSink } from "../../src/websocket/push";
import { K_STREAM_KICK, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, sleep, testUid, issueSession } from "./helpers";

const uids: string[] = [];

async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  const { token } = await issueSession(uid, null);
  return { uid, token };
}

const waitFor = async (cond: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) { throw new Error("waitFor 超时"); }
    await sleep(50);
  }
};

before(async () => { await assertRedisUp(); setKickHandler(kickUser); });

after(async () => {
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await clientFor(u).unlink(kSess(u));
  }
  await closeRedis();
  await closeMysql();
});

test("banUser 写权威：status=1 + token_hash=NULL → 新建连接/重登被拒 + 本节点在线即时踢", async () => {
  const { uid, token } = await makeUser("rv-ban");
  await verifySessionStrict(uid, token); // 封号前权威校验通

  const events: string[] = [];
  const sink: PushSink = (type, data) => {
    if (type === LobbyPush.ForceLogout) { events.push(`push:${(data as { reason: string }).reason}`); }
  };
  registerOnline(uid, sink, (code) => { events.push(`close:${code}`); }); // 模拟本节点在线连接
  await banUser(uid, "test");
  unregisterOnline(uid, sink);

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status, token_hash FROM accounts WHERE user_id = ?", [uid]);
  assert.equal(Number(rows[0].status), 1, "权威 status=1（下次登不上）");
  assert.equal(rows[0].token_hash, null, "权威 token_hash=NULL（存量 token 作废）");
  // ⚠ 顺序固定：先推 reason 再关连接（客户端据此弹「账号已被封禁」，而非只看到掉线）
  assert.deepEqual(events, [`push:${ForceLogoutReason.Banned}`, `close:${KICK_CLOSE_CODE.banned}`],
    "先推 forceLogout{banned} 再用语义化关闭码 4001 关连接");

  await assert.rejects(verifySessionStrict(uid, token), AuthRequiredError); // hash=NULL 先命中 → mismatch
  assert.equal(await clientFor(uid).exists(kSess(uid)), 1, "⛔ 不删 sess（TTL 自然过期；在线失效靠踢，§2.3）");
});

test("控制总线：XADD stream:kick → 消费者踢本节点在线连接（跨节点范式）", async () => {
  const uid = testUid("rv-kick-bus").slice(0, 32);
  let kicked = 0;
  let gotReason = "";
  const sink: PushSink = (type, data) => {
    if (type === LobbyPush.ForceLogout) { gotReason = (data as { reason: string }).reason; }
  };
  registerOnline(uid, sink, () => { kicked++; });
  startKickConsumer();
  try {
    // "$" 竞态确定化：重试 XADD 直到消费者踢到（首个阻塞 XREAD 建立前的 XADD 会被漏；踢幂等，重发无害）
    const deadline = Date.now() + 5000;
    while (kicked === 0) {
      if (Date.now() > deadline) { throw new Error("kick 消费超时"); }
      // 模拟别组/节点的顶号广播（reason 随流透传，消费侧据此推正确文案）
      await coordClient().xadd(K_STREAM_KICK, "*", "uid", uid, "reason", ForceLogoutReason.Replaced);
      await sleep(100);
    }
    assert.ok(kicked >= 1, "消费者把远端踢人事件落到本节点在线连接");
    assert.equal(gotReason, ForceLogoutReason.Replaced, "reason 经控制总线透传，文案不丢");
  } finally {
    stopKickConsumer();
    unregisterOnline(uid, sink);
  }
});

test("自筛：不在本节点的 uid 踢人事件直接跳过（不抛）", async () => {
  const absent = testUid("rv-absent").slice(0, 32);
  kickLocal(absent, ForceLogoutReason.Banned);           // 本节点无该 uid 在线 → 跳过
  await broadcastKick(absent, ForceLogoutReason.Banned);  // 广播也不抛
  assert.ok(true, "不命中本节点不抛错（§2.3 每节点自筛，⛔ 不查 presence）");
});

test("revokeSessions（换端/踢下线）：token_hash=NULL 但 status 不变 → 可重新登录换发", async () => {
  const { uid, token } = await makeUser("rv-revoke");
  await revokeSessions(uid, "test");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status, token_hash FROM accounts WHERE user_id = ?", [uid]);
  assert.equal(Number(rows[0].status), 0, "status 不变（非封号）");
  assert.equal(rows[0].token_hash, null, "旧 token 作废");
  await assert.rejects(verifySessionStrict(uid, token), AuthRequiredError);
  // 重新登录换发新 token（status=0 允许）→ 权威校验通
  const re = await issueSession(uid, null);
  await verifySessionStrict(uid, re.token);
});

test("⚠ 缺踢无自动收敛：只写权威而不踢 → 在场连接的快路径**依然放行**（封号 SOP 必须踢，§2.3）", async () => {
  const { uid, token } = await makeUser("rv-nokick");
  await verifySession(uid, token);
  // 模拟「写了权威但踢丢了/没踢」：⛔ 不 kick、不广播、不删 sess
  await getPool().execute("UPDATE accounts SET status = 1, token_hash = NULL WHERE user_id = ?", [uid]);
  // 快路径是纯缓存 hash 比对、⛔ 零权威回源 → 该连接可一直用到 sess TTL（3d）——
  // 这是删掉 verifiedAt 兜底后的**已知代价**，由 GM 工具「确认踢到」来承担（本用例即其反证）。
  await verifySession(uid, token);
  // 但权威路径（建连 onAuth / 重新登录）不受影响，始终即时拒
  await assert.rejects(verifySessionStrict(uid, token), AuthRequiredError);
});

test("顶号（单端语义）：再次登录换发 token → 覆写组 sess + 主动踢旧连接（reason=replaced）", async () => {
  const { uid, token: tokenA } = await makeUser("rv-replace");
  const events: string[] = [];
  const sink: PushSink = (type, data) => {
    if (type === LobbyPush.ForceLogout) { events.push(`push:${(data as { reason: string }).reason}`); }
  };
  registerOnline(uid, sink, (code) => { events.push(`close:${code}`); }); // 设备 A 在线

  // 设备 B 登录（换发 token → writeGroupSess 覆写；判据 = 组 sess 原有不同的 tokenHash）
  const { token: tokenB } = await issueSession(uid, null);
  unregisterOnline(uid, sink);

  assert.deepEqual(events, [`push:${ForceLogoutReason.Replaced}`, `close:${KICK_CLOSE_CODE.replaced}`],
    "顶号：先推 forceLogout{replaced} 再关（4002），客户端弹「账号在其他设备登录」");
  await assert.rejects(verifySession(uid, tokenA), AuthRequiredError, "A 的旧 token 快路径即失效");
  await verifySession(uid, tokenB); // B 正常
});

test("⛔ 断线重连不误判顶号：同 token 重复 writeGroupSess（hash 未变）→ 不踢", async () => {
  const { uid, token } = await makeUser("rv-reconn");
  let kicked = 0;
  const sink: PushSink = () => {};
  registerOnline(uid, sink, () => { kicked++; });
  await writeGroupSess(uid, token); // 模拟 split onAuth 懒填/重连复用同一 token
  unregisterOnline(uid, sink);
  assert.equal(kicked, 0, "hash 相同 = 同一登录态 → ⛔ 不踢（顶号判据精确到「换了登录态」）");
});
