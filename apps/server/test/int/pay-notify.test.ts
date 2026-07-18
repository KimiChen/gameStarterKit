import "./env-setup"; // ⚠ 必须第一个 import

/**
 * /pay/wx-notify HTTP 级集成测试（此前 handleWxPayNotify 只有函数层用例，401 闸零覆盖）：
 *  1. 共享密钥闸：无头/错头/未配置 secret 三种形态一律 401，订单不被触动
 *  2. 金额不符 → 400 ORDER_MISMATCH 且订单保持 created；修正金额后正常发放
 *  3. 成功发放：created→delivered + ledger 发币到账；同 wxTxnId 重放幂等 ack 不双发
 * 前置：npm --workspace @game/server run stack（且 dev server 未占 2568）。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { server } from "../../src/app.config";
import { createUser } from "../../src/core/userRecord";
import { createOrder } from "../../src/core/economy/purchases";
import { PURCHASE_CREATED, PURCHASE_DELIVERED } from "../../src/core/infra/config";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

// 端点每请求现读 WXPAY_NOTIFY_SECRET（无 import 期缓存），模块级赋值即可
const SECRET = "test-notify-secret";
process.env.WXPAY_NOTIFY_SECRET = SECRET;

// boot(server) 恒监听 2568（@colyseus/testing DEFAULT_TEST_PORT）
const BASE = "http://127.0.0.1:2568";

let colyseus: ColyseusTestServer;
const uids: string[] = [];

/** 造号：accounts 行 + Redis 档（发币链路不依赖档字段，无需会话）。 */
async function makeUser(name: string): Promise<string> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  await createUser(uid);
  return uid;
}

const post = async (body: unknown, secret?: string): Promise<{ status: number; json: any }> => {
  const res = await fetch(`${BASE}/pay/wx-notify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret !== undefined ? { "x-notify-secret": secret } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const orderStatus = async (orderId: string): Promise<number> => {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status FROM purchases WHERE order_id = ?", [orderId]);
  return Number(rows[0].status);
};

const balanceOf = async (uid: string): Promise<number> => {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT balance FROM user_currency WHERE user_id = ?", [uid]);
  return rows.length > 0 ? Number(rows[0].balance) : 0;
};

before(async () => {
  await assertRedisUp();
  colyseus = await boot(server);
});

after(async () => {
  await colyseus?.shutdown();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM purchases WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM currency_ledger WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM user_currency WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u);
  }
  await closeRedis();
  await closeMysql();
});

test("密钥闸：无头/错头/未配置 secret 一律 401，订单不被触动", async () => {
  const uid = await makeUser("pay_auth");
  const { orderId, amountFen } = await createOrder(uid, "rc.gold600");

  assert.equal((await post({ orderId, wxTxnId: "wx_t1", amountFen })).status, 401, "无 x-notify-secret 头");
  assert.equal((await post({ orderId, wxTxnId: "wx_t1", amountFen }, "wrong")).status, 401, "错密钥");

  // secret 未配置时 ⛔ 不能成为开门（!secret → 401）：即使请求带了任意头也不放行
  const saved = process.env.WXPAY_NOTIFY_SECRET;
  delete process.env.WXPAY_NOTIFY_SECRET;
  try {
    assert.equal((await post({ orderId, wxTxnId: "wx_t1", amountFen }, "anything")).status, 401);
  } finally {
    process.env.WXPAY_NOTIFY_SECRET = saved;
  }

  assert.equal(await orderStatus(orderId), PURCHASE_CREATED, "三次 401 后订单保持 created");
});

test("金额不符 → 400 ORDER_MISMATCH 且订单不动；未知订单同码", async () => {
  const uid = await makeUser("pay_mismatch");
  const { orderId, amountFen } = await createOrder(uid, "rc.gold600");

  const bad = await post({ orderId, wxTxnId: "wx_bad", amountFen: amountFen + 1 }, SECRET);
  assert.equal(bad.status, 400);
  assert.equal(bad.json?.error, "ORDER_MISMATCH");
  assert.equal(await orderStatus(orderId), PURCHASE_CREATED, "金额不符后订单保持 created（待人工/重试）");

  const ghost = await post({ orderId: "o_nonexistent", wxTxnId: "wx_x", amountFen: 1 }, SECRET);
  assert.equal(ghost.status, 400);
  assert.equal(ghost.json?.error, "ORDER_MISMATCH");
});

test("成功发放：created→delivered + 发币到账；同 wxTxnId 重放幂等 ack 不双发", async () => {
  const uid = await makeUser("pay_ok");
  const { orderId, amountFen } = await createOrder(uid, "rc.gold600"); // 600 分 → 600 gold

  const ok = await post({ orderId, wxTxnId: "wx_txn_1", amountFen }, SECRET);
  assert.equal(ok.status, 200);
  assert.equal(ok.json?.code, "SUCCESS", "微信要求幂等应答");
  assert.equal(await orderStatus(orderId), PURCHASE_DELIVERED);
  assert.equal(await balanceOf(uid), 600, "ledger 发币到账");

  const again = await post({ orderId, wxTxnId: "wx_txn_1", amountFen }, SECRET);
  assert.equal(again.status, 200, "重放仍 ack（already 也回 SUCCESS）");
  assert.equal(await balanceOf(uid), 600, "余额不变，未双发");
});
