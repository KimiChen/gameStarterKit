/**
 * 每区独立经济（DUAL_MODE M13）—— **专测 sId≥1 的 per-zone 行为**。
 *
 * ⚠ 为什么单独一份：单形态（sId=0）下区前缀 == 基础前缀，其余 int 测试**测不到**分区正确性
 * （op_id 编码 sId / MySQL 谓词带 server_id / keys 前缀 / sess 全局）。本测试用 zoneCtx.run
 * 显式进 sId=1/2 上下文，跑真正的跨区隔离。对照 §3.3(B1)/§3.4(红线)/§3.5(键分类)/§5.4。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { creditInTx, debitInTx, getBalance, invalidateBalanceCache } from "../../src/core/economy/currency";
import { deriveOpId } from "../../src/core/economy/outbox";
import { CUR_GOLD } from "../../src/core/infra/config";
import { kSess, kUser, zoneCtx } from "../../src/core/infra/keys";
import { cacheClient, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool, withRcTx } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, testUid } from "./helpers";

const uids: string[] = [];
const uid = (n: string): string => { const u = testUid(n).slice(0, 32); uids.push(u); return u; };

before(async () => { await assertRedisUp(); });
after(async () => {
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM currency_ledger WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM user_currency WHERE user_id = ?", [u]);
    for (const s of [0, 1, 2]) { await invalidateBalanceCache(u, s).catch(() => {}); }
  }
  await closeRedis();
  await closeMysql();
});

test("per-zone: deriveOpId 编码 sId —— 跨区不撞、同区稳定（§3.4 红线）", () => {
  const u = uid("pz-op");
  assert.equal(
    deriveOpId(u, 1, "shop.purchase", "req"), deriveOpId(u, 1, "shop.purchase", "req"),
    "同区同 (type,req) 稳定");
  assert.notEqual(
    deriveOpId(u, 1, "shop.purchase", "req"), deriveOpId(u, 2, "shop.purchase", "req"),
    "跨区同 (type,req) 不撞 —— 否则跨区撞全局 op_id 主键、静默吞 intent");
  assert.notEqual(
    deriveOpId(u, 0, "shop.purchase", "req"), deriveOpId(u, 1, "shop.purchase", "req"),
    "大混服(0) 与 区服(1) 不同");
});

test("per-zone: keys 前缀随 zoneCtx；sess 全局不随区（§3.5 分类硬约束）", () => {
  const u = uid("pz-key");
  const base = zoneCtx.run({ sId: 0 }, () => kUser(u));
  const z1 = zoneCtx.run({ sId: 1 }, () => kUser(u));
  const z2 = zoneCtx.run({ sId: 2 }, () => kUser(u));
  assert.equal(base, kUser(u), "sId=0 与未设置一致（回退基础前缀，单形态行为不变）");
  assert.match(z1, /s1_user:/, "区服键带 s1_");
  assert.match(z2, /s2_user:/, "区服键带 s2_");
  assert.notEqual(z1, z2, "跨区 user 键物理隔离");
  assert.notEqual(z1, base, "区服键 ≠ 基础键");
  // sess 是全局键：登录（无区）写、每 RPC（有区）读，必须跨区一致，否则鉴权崩
  assert.equal(
    zoneCtx.run({ sId: 1 }, () => kSess(u)), zoneCtx.run({ sId: 2 }, () => kSess(u)),
    "sess 全局键跨区一致");
  assert.equal(zoneCtx.run({ sId: 1 }, () => kSess(u)), kSess(u), "sess 不带区前缀");
});

test("per-zone: 每区独立钱包 + 谓词隔离(B1) + 跨区同 idem_key 并存(I4)", async () => {
  const u = uid("pz-eco");
  // 同一账号在 sId=1 / sId=2 各充 100（op_id 因编码 sId 天然不同）
  await withRcTx((c) => creditInTx(c, u, 1, CUR_GOLD, 100, deriveOpId(u, 1, "t.credit", "r"), "t"));
  await withRcTx((c) => creditInTx(c, u, 2, CUR_GOLD, 100, deriveOpId(u, 2, "t.credit", "r"), "t"));
  assert.equal(await getBalance(u, 1), 100, "区1=100");
  assert.equal(await getBalance(u, 2), 100, "区2=100");

  // 区1 扣 30（谓词带 server_id）→ 只动区1；区2 不受影响
  await withRcTx((c) => debitInTx(c, u, 1, CUR_GOLD, 30, 1, deriveOpId(u, 1, "t.debit", "d"), "t"));
  await invalidateBalanceCache(u, 1); // 扣后失效区1缓存（模拟真实 purchaseTx）
  assert.equal(await getBalance(u, 1), 70, "区1 扣后=70");
  assert.equal(await getBalance(u, 2), 100, "区2 不受影响 —— 谓词带 server_id 才隔离（B1）");

  // user_currency 两区两行独立
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id, balance FROM user_currency WHERE user_id = ? AND currency = ? ORDER BY server_id",
    [u, CUR_GOLD]);
  assert.equal(rows.length, 2, "两区两行");
  assert.deepEqual(rows.map((r) => [Number(r.server_id), Number(r.balance)]), [[1, 70], [2, 100]]);

  // ledger：同一 idem_key 在两区并存（UNIQUE(user_id, server_id, idem_key) 含 server_id）
  for (const s of [1, 2]) {
    await getPool().execute(
      `INSERT INTO currency_ledger (user_id, server_id, currency, delta, balance_after, idem_key, reason)
       VALUES (?,?,?,?,?,?,?)`, [u, s, CUR_GOLD, 1, 1, "same-idem", "t"]);
  }
  const [led] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) c FROM currency_ledger WHERE user_id = ? AND idem_key = 'same-idem'", [u]);
  assert.equal(Number(led[0].c), 2, "跨区同 idem_key 并存（I4 唯一键含 server_id）");
});
