import "./env-setup"; // ⚠ 必须第一个 import

/**
 * 控制总线撤销传播（DUAL_MODE §2.3 / M12d）——真实 MySQL + Redis（coord 缺省复用 durable）。
 *  1. banUser → revocation_log **同事务** + 即时扇出 → 本节点 maxEpoch → 快路径 EpochStaleError（⛔ 不靠删 sess）
 *  2. 控制总线消费：XADD stream:revoke → 消费者把远端撤销 epoch 落到本节点 maxEpoch（跨节点范式）
 *  3. drainRevocations 幂等：relayed 标记不重发 + 本地 applyRevoke max-wins
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { banUser, issueSession, verifySession } from "../../src/core/auth/session";
import { EpochStaleError } from "../../src/core/errors";
import {
  _resetMaxEpoch, applyRevoke, drainRevocations, revokedEpoch, startRevokeConsumer, stopRevokeConsumer,
} from "../../src/core/auth/revoke";
import { K_STREAM_REVOKE, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, sleep, testUid } from "./helpers";

const uids: string[] = [];

async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  const { token } = await issueSession(uid, 0, null);
  return { uid, token };
}

const waitFor = async (cond: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) { throw new Error("waitFor 超时"); }
    await sleep(50);
  }
};

before(async () => { await assertRedisUp(); _resetMaxEpoch(); });

after(async () => {
  _resetMaxEpoch();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM revocation_log WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await clientFor(u).unlink(kSess(u));
  }
  await closeRedis();
  await closeMysql();
});

test("banUser → revocation_log 同事务 + 即时扇出 + 本节点 maxEpoch → 快路径 EpochStaleError", async () => {
  const { uid, token } = await makeUser("rv-ban");
  await verifySession(uid, token); // 封号前快路径通

  await banUser(uid, "test");

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT epoch, relayed FROM revocation_log WHERE user_id = ?", [uid]);
  assert.equal(rows.length, 1, "撤销的持久真相：revocation_log 一行");
  assert.equal(Number(rows[0].epoch), 1, "epoch 递增后值");
  assert.equal(Number(rows[0].relayed), 1, "即时 drain → relayed=1");
  assert.equal(revokedEpoch(uid), 1, "本节点 maxEpoch 即时更新");

  // 快路径比对 sess.tokenEpoch(0) < maxEpoch(1) → 拒（sess 未删，靠 maxEpoch 快检）
  await assert.rejects(verifySession(uid, token), EpochStaleError);
  assert.equal(await clientFor(uid).exists(kSess(uid)), 1, "⛔ 不再删 sess（改由 maxEpoch 快检）");
});

test("控制总线消费：XADD stream:revoke → 消费者更新本节点 maxEpoch（跨节点范式）", async () => {
  const { uid } = await makeUser("rv-consume");
  assert.equal(revokedEpoch(uid), 0);
  startRevokeConsumer();
  try {
    await sleep(300); // 让消费者建立阻塞 XREAD（"$" 捕获当前末位）后再 XADD，避开 "$" 竞态
    await coordClient().xadd(K_STREAM_REVOKE, "*", "uid", uid, "epoch", "3"); // 模拟别组/节点撤销
    await waitFor(() => revokedEpoch(uid) === 3, 3000);
    assert.equal(revokedEpoch(uid), 3, "消费者把远端撤销 epoch 落到本节点 maxEpoch");
  } finally {
    stopRevokeConsumer();
  }
});

test("drainRevocations 幂等：relayed 标记不重发 + 本地 applyRevoke max-wins", async () => {
  const { uid } = await makeUser("rv-idem");
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO revocation_log (user_id, epoch) VALUES (?, 3), (?, 2)", [uid, uid]);
  assert.ok(await drainRevocations() >= 2, "扫出未发行行并 XADD");
  assert.equal(await drainRevocations(), 0, "已 relayed=1 不重复发行");

  applyRevoke(uid, 2); applyRevoke(uid, 3); applyRevoke(uid, 2);
  assert.equal(revokedEpoch(uid), 3, "max-wins：乱序应用后取最大");
});
