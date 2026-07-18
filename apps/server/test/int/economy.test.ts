/**
 * M6 DoD（进程内部分；kill 测试见 relayer.test.ts）——真实 MySQL + Redis：
 *  1. 并发双发同 clientReqId → 只扣一次钱、只发一次货
 *  2. 余额不足 → 干净失败：Redis 未动、无 outbox 行、无 ledger 行（整体回滚）
 *  3. granting 中间态：阶段 1 后 queryOp = granting；补 apply 后 = done
 *  4. 充值回调重放：同 wx_txn_id 两次 → 只发一次币
 *  5. 领附件并发双击 → 只发一次货；重复领幂等回读
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { InsufficientBalanceError } from "../../src/core/errors";
import { acquireLease } from "../../src/core/locks";
import { getShopSku } from "../../src/core/economy/catalog";
import { getBalance, invalidateBalanceCache } from "../../src/core/economy/currency";
import { claimMailAttach, sendMail } from "../../src/core/economy/mailer";
import {
  deriveOpId, drainPendingFor, markOutboxDone, purchase, purchaseTx, readBack, redisApply,
} from "../../src/core/economy/outbox";
import { createOrder, handleWxPayNotify } from "../../src/core/economy/purchases";
import { createUser } from "../../src/core/userRecord";
import { CUR_GOLD, OUTBOX_PENDING } from "../../src/core/infra/config";
import { kBag, kCacheCurrency, kUser } from "../../src/core/infra/keys";
import { cacheClient, clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

const uids: string[] = [];
const uid = (n: string): string => { const u = testUid(n).slice(0, 32); uids.push(u); return u; };

/** 造经济号：user_currency 余额 + Redis 档。 */
async function seedUser(name: string, balance: number): Promise<string> {
  const u = uid(name);
  await getPool().execute(
    "INSERT INTO user_currency (user_id, currency, balance) VALUES (?,?,?)", [u, CUR_GOLD, balance]);
  await createUser(u);
  return u;
}

const mysqlBalance = async (u: string): Promise<number> => {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT balance FROM user_currency WHERE user_id = ? AND currency = ?", [u, CUR_GOLD]);
  return rows.length > 0 ? Number(rows[0].balance) : 0;
};

before(async () => { await assertRedisUp(); });
after(async () => {
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM currency_ledger WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM gameplay_outbox WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM user_currency WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM purchases WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM mail WHERE user_id = ?", [u]);
    await cleanupUser(u);
    await cacheClient().unlink(kCacheCurrency(u));
  }
  await closeRedis();
  await closeMysql();
});

test("并发双发同 clientReqId → 只扣一次钱、只发一次货（09·I1/I2/I3）", async () => {
  const u = await seedUser("dup", 1000);
  const sku = getShopSku("shop.frag29x10")!;
  const [a, b] = await Promise.all([
    purchase(u, sku, "req-1"),
    purchase(u, sku, "req-1"), // 同 clientReqId 双发
  ]);
  assert.equal(a.opId, b.opId);
  assert.equal(await mysqlBalance(u), 900, "只扣一次 100");
  assert.equal(await clientFor(u).hget(kBag(u, 29 % 4), "29"), "10", "只发一次 10 个碎片");
  const [ledger] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM currency_ledger WHERE user_id = ?", [u]);
  assert.equal(Number(ledger[0].n), 1, "ledger 恰一行");
  // 换 clientReqId = 新交易（09·I2）
  const c = await purchase(u, sku, "req-2");
  assert.notEqual(c.opId, a.opId);
  assert.equal(await mysqlBalance(u), 800);
  assert.equal(await clientFor(u).hget(kBag(u, 29 % 4), "29"), "20");
});

test("余额不足 → 干净失败：Redis 未动、无 outbox 行、无 ledger 行", async () => {
  const u = await seedUser("poor", 50); // 价 100
  const sku = getShopSku("shop.frag29x10")!;
  await assert.rejects(purchase(u, sku, "req-p"), InsufficientBalanceError);
  assert.equal(await mysqlBalance(u), 50, "钱一分未动");
  assert.equal(await clientFor(u).exists(kBag(u, 29 % 4)), 0, "Redis 未动");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM gameplay_outbox WHERE user_id = ?) AS ob, (SELECT COUNT(*) FROM currency_ledger WHERE user_id = ?) AS led",
    [u, u]);
  assert.equal(Number(rows[0].ob), 0, "无 outbox 行");
  assert.equal(Number(rows[0].led), 0, "ledger 已随事务回滚");
});

test("granting 中间态：阶段 1 后 queryOp=granting，补 apply 后=done（04）", async () => {
  const u = await seedUser("grant", 500);
  const sku = getShopSku("shop.frag17x10")!;
  const opId = deriveOpId(u, "shop.purchase", "req-g");
  const lease = await acquireLease(u);
  assert.equal(await purchaseTx(u, lease.fence, sku, opId), "OK"); // 只做阶段 1
  await lease.release();

  const mid = await readBack(u, opId);
  assert.equal(mid.status, "granting", "钱已扣、道具未发 → 发放中");
  assert.equal(mid.balance, 400);

  assert.equal(await redisApply(u, opId, sku.grants), "ok");
  await markOutboxDone(opId);
  const done = await readBack(u, opId);
  assert.equal(done.status, "done");
  assert.deepEqual(done.granted, sku.grants);
});

test("充值回调重放：同 wx_txn_id 两次 → 只发一次币（purchases 状态机）", async () => {
  const u = await seedUser("rc", 0);
  const { orderId, amountFen } = await createOrder(u, "rc.gold600");
  const notify = { orderId, wxTxnId: `wx_${orderId}`, amountFen };

  assert.equal(await handleWxPayNotify(notify), "ok");
  assert.equal(await mysqlBalance(u), 600, "到账 600");
  assert.equal(await handleWxPayNotify(notify), "already", "重放直接 ack");
  assert.equal(await handleWxPayNotify({ ...notify, amountFen: 1 }), "already", "状态机已推进，不再看金额");
  assert.equal(await mysqlBalance(u), 600, "只发一次币");
  const [p] = await getPool().query<RowDataPacket[]>(
    "SELECT status FROM purchases WHERE order_id = ?", [orderId]);
  assert.equal(Number(p[0].status), 2, "delivered");
  // 金额不符的新订单 → mismatch 不发币
  const o2 = await createOrder(u, "rc.gold600");
  assert.equal(await handleWxPayNotify({ orderId: o2.orderId, wxTxnId: `wx_${o2.orderId}`, amountFen: 1 }), "mismatch");
  assert.equal(await mysqlBalance(u), 600);
  // 缓存失效后回源一致
  await invalidateBalanceCache(u);
  assert.equal(await getBalance(u), 600);
});

test("领附件并发双击 → 只发一次货；重复领幂等回读（09·A6）", async () => {
  const u = await seedUser("mailatt", 0);
  const mailId = await sendMail(u, "补偿", "见附件", [{ kind: "item", itemId: 5, count: 3 }]);

  const [a, b] = await Promise.all([claimMailAttach(u, mailId), claimMailAttach(u, mailId)]);
  assert.equal(a.opId, b.opId);
  assert.equal(await clientFor(u).hget(kBag(u, 5 % 4), "5"), "3", "并发双击只发一次");

  const again = await claimMailAttach(u, mailId); // 已领：幂等回读
  assert.equal(again.status, "done");
  assert.equal(await clientFor(u).hget(kBag(u, 5 % 4), "5"), "3");
  const [m] = await getPool().query<RowDataPacket[]>(
    "SELECT claimed_at, read_at FROM mail WHERE mail_id = ?", [mailId]);
  assert.ok(m[0].claimed_at, "claimed_at 权威已落");
});

test("setField 序反转防御：写前 drainPendingFor 吸干旧 intent，迟到重放只判 dup（04）", async () => {
  const u = await seedUser("drain", 0);
  // 模拟「阶段 2 前崩溃」残留的 pending intent（绝对值 setField）
  const oldOp = deriveOpId(u, "test.drain", "req-old");
  await getPool().execute(
    `INSERT INTO gameplay_outbox (op_id, user_id, effect, status) VALUES (?,?,CAST(? AS JSON),?)`,
    [oldOp, u, JSON.stringify([{ kind: "setField", field: "drainProbe", value: "old" }]), OUTBOX_PENDING]);

  // 新写之前先吸干：旧 intent 按创建序 apply + 标 done
  assert.equal(await drainPendingFor(u), 1);
  assert.equal(await clientFor(u).hget(kUser(u), "drainProbe"), "old");

  // 用户后续写同字段（新值）
  const newOp = deriveOpId(u, "test.drain", "req-new");
  assert.equal(await redisApply(u, newOp, [{ kind: "setField", field: "drainProbe", value: "new" }]), "ok");

  // relayer 迟到重放旧 op → applied 判 dup，新值不被盖回（序保证成立）
  assert.equal(await redisApply(u, oldOp, [{ kind: "setField", field: "drainProbe", value: "old" }]), "dup");
  assert.equal(await clientFor(u).hget(kUser(u), "drainProbe"), "new");
});
