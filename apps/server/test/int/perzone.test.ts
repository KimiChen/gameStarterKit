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
import { deriveOpId, purchase } from "../../src/core/economy/outbox";
import { getShopSku } from "../../src/core/economy/catalog";
import { createUser } from "../../src/core/userRecord";
import { ensureCharacter, listCharacterZones } from "../../src/player/character";
import { ensureLive } from "../../src/core/archive/thaw";
import { UserDataLostError } from "../../src/core/errors";
import { CUR_GOLD } from "../../src/core/infra/config";
import { kApplied, kBag, kNegcacheUser, kSess, kUser, zoneCtx } from "../../src/core/infra/keys";
import { cacheClient, clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool, withRcTx } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

const uids: string[] = [];
const uid = (n: string): string => { const u = testUid(n).slice(0, 32); uids.push(u); return u; };

before(async () => { await assertRedisUp(); });
after(async () => {
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM currency_ledger WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM user_currency WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM gameplay_outbox WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM char_registry WHERE user_id = ?", [u]);
    for (const s of [0, 1, 2, 5, 7, 8]) {
      await invalidateBalanceCache(u, s).catch(() => {});
      await zoneCtx.run({ sId: s }, () => cleanupUser(u)).catch(() => {}); // 清各区 user/bag/applied 键
    }
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

test("per-zone: purchase 全链落对区（sId=5：钱扣 s5 + Redis apply 落 s5 前缀，不串 s0/基础）", async () => {
  const u = uid("pz-buy");
  const sku = getShopSku("shop.frag17x10")!;
  const res = await zoneCtx.run({ sId: 5 }, async () => {
    await createUser(u); // 建 s5_user:{u}（区上下文=5）
    await getPool().execute(
      "INSERT INTO user_currency (user_id, server_id, currency, balance) VALUES (?,?,?,?)", [u, 5, CUR_GOLD, 500]);
    return purchase(u, sku, "buy-req"); // 阶段1 扣钱(s5 谓词) + 阶段2 redisApply(落 s5_user/bag/applied)
  });
  assert.ok(res.status === "done" || res.status === "granting", `purchase 应成功，实际 ${res.status}`);

  const bal = async (s: number): Promise<number | null> => {
    const [r] = await getPool().query<RowDataPacket[]>(
      "SELECT balance FROM user_currency WHERE user_id=? AND server_id=? AND currency=?", [u, s, CUR_GOLD]);
    return r.length ? Number(r[0].balance) : null;
  };
  assert.equal(await bal(5), 500 - sku.price, "s5 钱包已扣 sku.price");
  assert.equal(await bal(0), null, "s0 无影子钱包（未串区）");

  // Redis apply 落 s5 前缀：s5_applied 有 op、基础 applied 无（证明 redisApply 用了 s5 区上下文）
  const c = clientFor(u);
  const s5applied = zoneCtx.run({ sId: 5 }, () => kApplied(u));
  const baseApplied = kApplied(u); // 未设置 zoneCtx = 基础前缀
  assert.notEqual(s5applied, baseApplied);
  assert.ok(Number(await c.zcard(s5applied)) >= 1, "op 落 s5_applied");
  assert.equal(Number(await c.zcard(baseApplied)), 0, "基础 applied 无（apply 未串区）");

  // 道具落 s5 前缀的 bag（取首个 item grant 验证）
  const item = sku.grants.find((g) => g.kind === "item");
  if (item && item.kind === "item") {
    const s5bag = zoneCtx.run({ sId: 5 }, () => kBag(u, item.itemId % 4));
    assert.ok(await c.hget(s5bag, String(item.itemId)), "道具落 s5_bag 前缀");
    assert.equal(await c.hget(kBag(u, item.itemId % 4), String(item.itemId)), null, "基础 bag 无货（未串区）");
  }
});

test("per-zone: 建角 ensureCharacter —— char_registry 行 + s{sId}_user 建立、幂等、多区（M12a §2.6）", async () => {
  const u = uid("pz-char");
  const c = clientFor(u);
  // 首进 7 区建角
  await ensureCharacter(u, 7);
  assert.deepEqual(await listCharacterZones(u), [7], "char_registry 有 (u,7)");
  assert.equal(await c.exists(zoneCtx.run({ sId: 7 }, () => kUser(u))), 1, "s7_user 已建");
  assert.equal(await c.exists(kUser(u)), 0, "基础 user 未建（建角只建本区，登录才建基础）");

  // 幂等：重复进区不重复行、不报错
  await ensureCharacter(u, 7);
  const [cnt] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) c FROM char_registry WHERE user_id = ?", [u]);
  assert.equal(Number(cnt[0].c), 1, "重复建角不重复 char_registry 行");

  // 另进 8 区 → 第二区角色，两区独立（各自 s{sId}_user）
  await ensureCharacter(u, 8);
  assert.deepEqual(await listCharacterZones(u), [7, 8], "两区角色（喂 ul『我的区』）");
  assert.equal(await c.exists(zoneCtx.run({ sId: 8 }, () => kUser(u))), 1, "s8_user 已建");
});

test("per-zone: thaw ABSENT 按区判(M12b §2.6) —— sId≥1 用 char_registry（没建角→放行，建过角+档全无→UserDataLost）", async () => {
  const u = uid("pz-thaw");
  const c = clientFor(u);
  // ① 未建角本区 + 热档冷档全无 → ABSENT + 无标记 → 放行（不抛，走建角/建号）
  await zoneCtx.run({ sId: 5 }, () => ensureLive(u));
  // ② 建角本区（char_registry(u,5) + s5_user），删 s5_user 模拟热档丢失、清负缓存
  await ensureCharacter(u, 5);
  await c.unlink(zoneCtx.run({ sId: 5 }, () => kUser(u)));
  await cacheClient().unlink(zoneCtx.run({ sId: 5 }, () => kNegcacheUser(u)));
  // char_registry(u,5) 有、热档冷档全无 → ABSENT + 建过角 → UserDataLost 告警 + 拒建空档（09·F4）
  await assert.rejects(zoneCtx.run({ sId: 5 }, () => ensureLive(u)), UserDataLostError);
});

test("建角崩溃窗**可自愈**：有档无 char 行（档先建、崩在写 char 行前）→ 下次进区补写，⛔ 不判数据丢失", async () => {
  const u = uid("pz-crashwin");
  // 模拟崩溃窗中间态：档已建、char 行未写（新序 createUser → char_registry 之间断电）
  await zoneCtx.run({ sId: 9 }, () => createUser(u, { registerTime: String(Date.now()) }));
  assert.deepEqual(await listCharacterZones(u), [], "崩溃窗：char 行还没写");

  // 下次进区：⛔ 旧序在此会判 ABSENT+has=true 抛 UserDataLost（永久毒态）；新序状态是 LIVE，直接补写
  await ensureCharacter(u, 9);
  assert.deepEqual(await listCharacterZones(u), [9], "自愈：char 行补上");
  assert.equal(await zoneCtx.run({ sId: 9 }, () => clientFor(u).exists(kUser(u))), 1, "真档未被覆盖");
});
