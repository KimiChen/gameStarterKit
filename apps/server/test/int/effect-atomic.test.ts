/**
 * P0-03 effect contract and zone isolation checks.
 *
 * These tests deliberately exercise the Redis script directly for malformed JSON:
 * durable relayers can encounter historical rows without going through TypeScript's
 * validator, so the Lua validate pass must provide the same fail-closed guarantee.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { EffectConflictError, InvalidEffectError } from "../../src/core/errors";
import { acquireLease } from "../../src/core/locks";
import { getShopSku } from "../../src/core/economy/catalog";
import type { ShopSku } from "../../src/core/economy/catalog";
import {
  deriveOpId, purchaseTx, readBack, redisApply,
} from "../../src/core/economy/outbox";
import { claimMailAttach, sendMail } from "../../src/core/economy/mailer";
import { createUser } from "../../src/core/userRecord";
import { CUR_GOLD, OUTBOX_DONE } from "../../src/core/infra/config";
import {
  kApplied, kAppliedPayload, kBagAll, kUser, zoneCtx,
} from "../../src/core/infra/keys";
import { APPLY_EFFECT, defineScript, evalshaWithReload } from "../../src/core/infra/redisScripts";
import { clientFor, clientForKey, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool, withTx } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { validateGrant } from "@game/shared";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";
import { exerciseFaultPoint } from "../faultMatrix";

const users: string[] = [];
const uid = (name: string): string => {
  // Keep the database VARCHAR(32) limit without truncating the distinguishing
  // case name (which previously made `purchase-invalid` and
  // `purchase-conflict` collide).  The run id and case name are both hashed so
  // parallel test processes still get isolated, stable-length identities.
  const value = `e${createHash("sha256")
    .update(`${testUid("effect")}:${name}`)
    .digest("hex")
    .slice(0, 31)}`;
  users.push(value);
  return value;
};

async function seed(name: string, balance = 1_000, zones: readonly number[] = [0]): Promise<string> {
  const user = uid(name);
  for (const sId of zones) {
    await zoneCtx.run({ sId }, () => createUser(user));
    await getPool().execute(
      "INSERT INTO user_currency (user_id, server_id, currency, balance) VALUES (?,?,?,?)",
      [user, sId, CUR_GOLD, balance],
    );
  }
  return user;
}

interface RedisState {
  user: Record<string, string>;
  bags: Record<string, string>[];
  applied: string[];
  payload: Record<string, string>;
}

async function dump(user: string, sId = 0): Promise<RedisState> {
  return zoneCtx.run({ sId }, async () => {
    const redis = clientFor(user);
    return {
      user: await redis.hgetall(kUser(user)),
      bags: await Promise.all(kBagAll(user).map((key) => redis.hgetall(key))),
      applied: await redis.zrange(kApplied(user), 0, -1, "WITHSCORES"),
      payload: await redis.hgetall(kAppliedPayload(user)),
    };
  });
}

async function luaApplyRaw(
  user: string, opId: string, effectJson: string, sId = 0,
): Promise<string> {
  return zoneCtx.run({ sId }, async () => evalshaWithReload(
    clientFor(user),
    APPLY_EFFECT,
    [kUser(user), kApplied(user), kAppliedPayload(user), ...kBagAll(user)],
    [opId, String(Date.now()), effectJson],
  ) as Promise<string>);
}

before(async () => { await assertRedisUp(); });

after(async () => {
  const pool = getPool();
  for (const user of users) {
    await pool.execute("DELETE FROM currency_ledger WHERE user_id = ?", [user]);
    await pool.execute("DELETE FROM gameplay_outbox WHERE user_id = ?", [user]);
    await pool.execute("DELETE FROM user_currency WHERE user_id = ?", [user]);
    for (const sId of [0, 1, 2]) {
      await zoneCtx.run({ sId }, () => cleanupUser(user)).catch(() => {});
    }
  }
  await closeRedis();
  await closeMysql();
});

test("Lua validate-then-apply：首条合法、后续非法时 Redis/applied/payload 均不变", async () => {
  const user = await seed("atomic");
  const before = await dump(user);
  const legal = { kind: "item", itemId: 7, count: 3 };
  const malformed: Array<{ code: string; grants: unknown[] }> = [
    {
      code: "EFFECT_UNKNOWN_KIND",
      grants: [legal, { kind: "mystery", value: 1 }],
    },
    {
      code: "EFFECT_GRANT_KEYS",
      grants: [legal, { kind: "item", itemId: 8, count: 1, extra: true }],
    },
    {
      code: "EFFECT_SCHEMA_VERSION",
      grants: [legal],
    },
    {
      code: "EFFECT_RESERVED_FIELD",
      grants: [legal, { kind: "setField", field: "ver", value: "bad" }],
    },
    {
      code: "EFFECT_RESERVED_FIELD",
      grants: [legal, { kind: "setField", field: "characterRegistration", value: "ready" }],
    },
    {
      code: "EFFECT_RESERVED_FIELD",
      grants: [legal, { kind: "setField", field: "characterRegistrationCheckedAt", value: "9999999999999" }],
    },
    {
      code: "EFFECT_COUNT",
      grants: [legal, { kind: "item", itemId: 8, count: 0 }],
    },
    {
      code: "EFFECT_VALUE",
      grants: [legal, { kind: "setField", field: "star", value: "1e3" }],
    },
  ];

  for (let i = 0; i < malformed.length; i++) {
    const item = malformed[i];
    const envelope = {
      schemaVersion: item.code === "EFFECT_SCHEMA_VERSION" ? 2 : 1,
      grants: item.grants,
    };
    const result = await luaApplyRaw(
      user,
      deriveOpId(user, 0, "effect.invalid", `${i}`),
      JSON.stringify(envelope),
    );
    assert.equal(result, `err:${item.code}`);
    assert.deepEqual(await dump(user), before, `非法 effect ${item.code} 不得产生部分写入`);
  }

  // The public wrapper validates before EVAL, including non-JSON numeric values such as NaN.
  await assert.rejects(
    redisApply(user, deriveOpId(user, 0, "effect.invalid", "nan"), [
      { kind: "item", itemId: 9, count: Number.NaN },
    ]),
    (error: unknown) => error instanceof InvalidEffectError && error.effectCode === "EFFECT_COUNT",
  );
  assert.deepEqual(await dump(user), before, "wrapper 拒绝 NaN 时也不得写 Redis");
});

test("shared/Lua setField：非 ASCII 文本边界按同一 UTF-8 字节单位判定", async () => {
  const cases: readonly { field: string; value: string; accepted: boolean }[] = [
    { field: "nickname", value: "中".repeat(42), accepted: true },
    { field: "nickname", value: "中".repeat(43), accepted: false },
    { field: "province", value: "中".repeat(21), accepted: true },
    { field: "province", value: "中".repeat(22), accepted: false },
    { field: "nickname", value: "🙂".repeat(32), accepted: true },
    { field: "nickname", value: "🙂".repeat(33), accepted: false },
    { field: "drainProbe", value: "中".repeat(341), accepted: true },
    { field: "drainProbe", value: "中".repeat(342), accepted: false },
  ];

  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const user = await seed(`utf8-${i}`);
    const grant = { kind: "setField" as const, field: item.field, value: item.value };
    let sharedAccepted = true;
    try { validateGrant(grant); }
    catch { sharedAccepted = false; }
    assert.equal(sharedAccepted, item.accepted, `shared 预期 ${item.field} case=${i}`);

    const before = await dump(user);
    const result = await luaApplyRaw(
      user,
      deriveOpId(user, 0, "effect.utf8-boundary", String(i)),
      JSON.stringify({ schemaVersion: 1, grants: [grant] }),
    );
    if (item.accepted) {
      assert.equal(result, "ok", `Lua 应接受 ${item.field} case=${i}`);
      const after = await dump(user);
      assert.equal(after.user[item.field], item.value, `${item.field} 应按原字节序列落盘`);
    } else {
      assert.equal(result, "err:EFFECT_VALUE", `Lua 应拒绝 ${item.field} case=${i}`);
      assert.deepEqual(await dump(user), before, `${item.field} 越界不得产生部分写入`);
    }
  }
});

test("Lua apply 预检 Redis key 类型与键集合：污染时不发生部分写入", async () => {
  await exerciseFaultPoint("redis-wrongtype", async () => {
    const bagUser = await seed("wrong-bag-type");
    await zoneCtx.run({ sId: 0 }, async () => {
      const redis = clientFor(bagUser);
      const userBefore = await redis.hgetall(kUser(bagUser));
      const bagKey = kBagAll(bagUser)[0];
      await redis.set(bagKey, "not-a-hash");

      const result = await luaApplyRaw(
        bagUser,
        deriveOpId(bagUser, 0, "effect.corrupt", "bag"),
        JSON.stringify({ schemaVersion: 1, grants: [{ kind: "item", itemId: 8, count: 1 }] }),
      );
      assert.equal(result, "err:EFFECT_DATA_CORRUPT");
      assert.deepEqual(await redis.hgetall(kUser(bagUser)), userBefore, "key 类型错误不得改 user/ver");
      assert.equal(await redis.get(bagKey), "not-a-hash", "污染 key 不得被覆盖");
      assert.equal(await redis.exists(kApplied(bagUser)), 0, "失败不得写 applied marker");
      assert.equal(await redis.exists(kAppliedPayload(bagUser)), 0, "失败不得写 payload marker");
    });

    const appliedUser = await seed("wrong-applied-type");
    await zoneCtx.run({ sId: 0 }, async () => {
      const redis = clientFor(appliedUser);
      const userBefore = await redis.hgetall(kUser(appliedUser));
      const appliedKey = kApplied(appliedUser);
      await redis.set(appliedKey, "not-a-zset");
      const result = await luaApplyRaw(
        appliedUser,
        deriveOpId(appliedUser, 0, "effect.corrupt", "applied"),
        JSON.stringify({ schemaVersion: 1, grants: [{ kind: "star", delta: 1 }] }),
      );
      assert.equal(result, "err:EFFECT_DATA_CORRUPT");
      assert.deepEqual(await redis.hgetall(kUser(appliedUser)), userBefore);
      assert.equal(await redis.get(appliedKey), "not-a-zset");
    });
  });
});

test("Lua apply 严格守卫热档 schema/ver：缺失或 future 元数据不被静默补默认值", async () => {
  const cases = [
    { name: "missing-ver", field: "ver", value: null },
    { name: "future-schema", field: "schemaVersion", value: "2" },
  ] as const;
  for (const item of cases) {
    const user = await seed(`metadata-${item.name}`);
    const redis = clientFor(user);
    if (item.value === null) { await redis.hdel(kUser(user), item.field); }
    else { await redis.hset(kUser(user), item.field, item.value); }
    const before = await dump(user);
    const result = await luaApplyRaw(
      user,
      deriveOpId(user, 0, "effect.metadata", item.name),
      JSON.stringify({ schemaVersion: 1, grants: [{ kind: "item", itemId: 7, count: 1 }] }),
    );
    assert.equal(result, "err:EFFECT_DATA_CORRUPT");
    assert.deepEqual(await dump(user), before, `${item.name} 不得补 ver/schema 或写 marker`);
  }
});

test("Lua apply 拒绝 ver/余额安全整数上界溢出，且不写 marker", async () => {
  const user = await seed("overflow");
  await zoneCtx.run({ sId: 0 }, async () => {
    const redis = clientFor(user);
    const before = await dump(user);
    await redis.hset(kUser(user), "ver", String(Number.MAX_SAFE_INTEGER));
    const result = await luaApplyRaw(
      user,
      deriveOpId(user, 0, "effect.overflow", "ver"),
      JSON.stringify({ schemaVersion: 1, grants: [{ kind: "star", delta: 1 }] }),
    );
    assert.equal(result, "err:EFFECT_DATA_CORRUPT");
    const afterVer = await dump(user);
    assert.equal(afterVer.user.ver, String(Number.MAX_SAFE_INTEGER));
    assert.deepEqual(afterVer.bags, before.bags);
    assert.deepEqual(afterVer.applied, before.applied);
    assert.deepEqual(afterVer.payload, before.payload);

    await redis.hset(kUser(user), "ver", "0");
    const bagKey = kBagAll(user)[7 % 4];
    await redis.hset(bagKey, "7", String(Number.MAX_SAFE_INTEGER));
    const beforeBag = await dump(user);
    const itemResult = await luaApplyRaw(
      user,
      deriveOpId(user, 0, "effect.overflow", "item"),
      JSON.stringify({ schemaVersion: 1, grants: [{ kind: "item", itemId: 7, count: 1 }] }),
    );
    assert.equal(itemResult, "err:EFFECT_DATA_CORRUPT");
    assert.deepEqual(await dump(user), beforeBag, "item 计数器溢出不得产生部分写");
  });
});

test("同 op-id 并发只应用一次；不同 canonical payload 返回冲突且状态不变", async () => {
  const user = await seed("idem");
  const opId = deriveOpId(user, 0, "effect.idem", "same");
  const effect = [
    { kind: "item" as const, itemId: 31, count: 7 },
    { kind: "star" as const, delta: 2 },
  ];
  const results = await Promise.all(Array.from({ length: 32 }, () => redisApply(user, opId, effect)));
  assert.equal(results.filter((result) => result === "ok").length, 1);
  assert.equal(results.filter((result) => result === "dup").length, 31);

  const afterApply = await dump(user);
  assert.equal(afterApply.user.ver, "1", "并发 apply 只 bump 一次 ver");
  assert.equal(afterApply.bags[31 % 4]["31"], "7");
  assert.equal(afterApply.user.star, "2");
  assert.equal(afterApply.applied.length, 2);
  assert.equal(Object.keys(afterApply.payload).length, 1);

  await assert.rejects(
    redisApply(user, opId, [{ kind: "item", itemId: 31, count: 8 }]),
    EffectConflictError,
  );
  assert.deepEqual(await dump(user), afterApply, "payload 冲突不得改变任何业务状态");

  // A legacy marker without a binding fails closed too; it cannot prove payload equality.
  const legacyOp = deriveOpId(user, 0, "effect.idem", "legacy");
  await clientFor(user).zadd(kApplied(user), Date.now(), legacyOp);
  const beforeLegacyRetry = await dump(user);
  await assert.rejects(
    redisApply(user, legacyOp, [{ kind: "item", itemId: 31, count: 1 }]),
    EffectConflictError,
  );
  assert.deepEqual(await dump(user), beforeLegacyRetry, "无 payload 绑定的旧 marker 也不得 fail-open");
});

test("非法 purchaseTx 在事务前拒绝：余额、ledger、outbox 均不变", async () => {
  const user = await seed("purchase-invalid", 500);
  const beforeRedis = await dump(user);
  const badSku = {
    sku: "test.invalid",
    currency: CUR_GOLD,
    price: 100,
    grants: [
      { kind: "item", itemId: 5, count: 1 },
      { kind: "unknown", value: "drop" },
    ],
  } as unknown as ShopSku;
  const lease = await acquireLease(user);
  const opId = deriveOpId(user, 0, "shop.purchase", "invalid");
  try {
    await assert.rejects(
      purchaseTx(user, 0, lease.fence, badSku, opId),
      (error: unknown) => error instanceof InvalidEffectError && error.effectCode === "EFFECT_UNKNOWN_KIND",
    );
  } finally {
    await lease.release();
  }

  const [balance] = await getPool().query<RowDataPacket[]>(
    "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?",
    [user, 0, CUR_GOLD],
  );
  assert.equal(Number(balance[0].balance), 500);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM currency_ledger WHERE user_id = ? AND server_id = ? AND idem_key = ?) AS ledger_count,
       (SELECT COUNT(*) FROM gameplay_outbox WHERE user_id = ? AND server_id = ? AND op_id = ?) AS outbox_count`,
    [user, 0, opId, user, 0, opId],
  );
  assert.equal(Number(rows[0].ledger_count), 0);
  assert.equal(Number(rows[0].outbox_count), 0);
  assert.deepEqual(await dump(user), beforeRedis, "非法 purchase 不得产生 Redis effect marker");
});

test("purchaseTx：同 op-id 的不同 effect payload 判冲突且不重复写 ledger", async () => {
  const user = await seed("purchase-conflict", 500);
  const original = getShopSku("shop.frag17x10")!;
  const changed: ShopSku = {
    ...original,
    grants: [{ kind: "item", itemId: 18, count: 10 }],
  };
  const lease = await acquireLease(user);
  const opId = deriveOpId(user, 0, "shop.purchase", "same-payload");
  try {
    assert.equal(await purchaseTx(user, 0, lease.fence, original, opId), "OK");
    await assert.rejects(
      purchaseTx(user, 0, lease.fence, changed, opId),
      EffectConflictError,
    );
  } finally {
    await lease.release();
  }
  const [ledger] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM currency_ledger WHERE user_id = ? AND server_id = ? AND idem_key = ?",
    [user, 0, opId],
  );
  assert.equal(Number(ledger[0].n), 1, "冲突重放不得新增 ledger");
  const [outbox] = await getPool().query<RowDataPacket[]>(
    "SELECT effect FROM gameplay_outbox WHERE user_id = ? AND server_id = ? AND op_id = ?",
    [user, 0, opId],
  );
  assert.equal(outbox.length, 1);
  assert.deepEqual(outbox[0].effect, { schemaVersion: 1, grants: original.grants });
});

test("邮件附件：非法 effect 在 send/claim 两条 durable 路径均不落业务状态", async () => {
  const user = await seed("mail-invalid", 0);
  const [before] = await getPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM mail WHERE user_id = ? AND server_id = ?) AS mail_count,
       (SELECT COUNT(*) FROM gameplay_outbox WHERE user_id = ? AND server_id = ?) AS outbox_count`,
    [user, 0, user, 0],
  );
  await assert.rejects(
    sendMail(user, "坏附件", "不应入库", [{ kind: "star", delta: "bad" } as never]),
    InvalidEffectError,
  );
  const [afterSend] = await getPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM mail WHERE user_id = ? AND server_id = ?) AS mail_count,
       (SELECT COUNT(*) FROM gameplay_outbox WHERE user_id = ? AND server_id = ?) AS outbox_count`,
    [user, 0, user, 0],
  );
  assert.deepEqual(afterSend[0], before[0], "sendMail 非法附件不得写 mail 或 outbox intent");

  const opId = deriveOpId(user, 0, "mail.attach", "corrupt-row");
  const badEffect = { schemaVersion: 1, grants: [{ kind: "setField", field: "star", value: "oops" }] };
  const [inserted] = await getPool().execute(
    `INSERT INTO mail (user_id, server_id, title, body, attach_op_id, attach_effect)
     VALUES (?,?,?,?,?,CAST(? AS JSON))`,
    [user, 0, "历史坏附件", "应拒绝领取", opId, JSON.stringify(badEffect)],
  ) as [{ insertId: number }, unknown];
  const mailId = inserted.insertId;
  const beforeClaimRedis = await dump(user);
  await assert.rejects(claimMailAttach(user, mailId), InvalidEffectError);
  const [mailRows] = await getPool().query<RowDataPacket[]>(
    "SELECT claimed_at, read_at FROM mail WHERE mail_id = ? AND user_id = ? AND server_id = ?",
    [mailId, user, 0],
  );
  assert.equal(mailRows[0].claimed_at, null, "非法附件不得先标 claimed");
  assert.equal(mailRows[0].read_at, null, "非法附件不得先标 read");
  const [outboxRows] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM gameplay_outbox WHERE user_id = ? AND server_id = ?",
    [user, 0],
  );
  assert.equal(Number(outboxRows[0].n), Number(before[0].outbox_count), "非法附件不得写 outbox intent");
  assert.deepEqual(await dump(user), beforeClaimRedis, "非法附件不得触碰 Redis effect/applied 状态");
});

test("readBack 严格按 server_id：s1 查询不到 s2 operation，正确区返回本区余额", async () => {
  const user = await seed("readback", 100, [1, 2]);
  const opId = deriveOpId(user, 2, "shop.purchase", "cross-zone");
  const effect = { schemaVersion: 1 as const, grants: [{ kind: "item" as const, itemId: 17, count: 2 }] };
  await getPool().execute(
    `INSERT INTO gameplay_outbox (op_id, user_id, server_id, effect, status)
     VALUES (?,?,?,CAST(? AS JSON),?)`,
    [opId, user, 2, JSON.stringify(effect), OUTBOX_DONE],
  );

  const wrongZone = await readBack(user, 1, opId);
  assert.equal(wrongZone.status, "dead");
  assert.equal(wrongZone.balance, 100);
  assert.equal(wrongZone.granted, undefined);

  const rightZone = await readBack(user, 2, opId);
  assert.equal(rightZone.status, "done");
  assert.equal(rightZone.balance, 100);
  assert.deepEqual(rightZone.granted, effect.grants);
});

test("fault matrix：Redis script cache miss 自动 reload", async () => {
  await exerciseFaultPoint("redis-script", async () => {
    // Use a per-run source that cannot already be cached.  This reproduces the
    // NOSCRIPT path seen after a Redis restart/failover without flushing scripts
    // used by neighboring tests.
    const expected = `reloaded-${process.pid}-${Date.now()}-${Math.random()}`;
    const probe = defineScript("fault-matrix-reload", `return ${JSON.stringify(expected)}`);
    const redis = clientForKey("fault-matrix-script");
    const result = await evalshaWithReload(
      redis,
      probe,
      [],
      [],
    );
    assert.equal(result, expected);
  });
});

test("fault matrix：事务回调失败时 MySQL 原子回滚", async () => {
  await exerciseFaultPoint("mysql-transaction", async () => {
    const user = await seed("tx-rollback", 321);
    const before = await getPool().query<RowDataPacket[]>(
      "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?",
      [user, 0, CUR_GOLD],
    );
    const injected = new Error("fault-matrix mysql transaction");
    await assert.rejects(
      withTx(async (conn) => {
        await conn.execute(
          "UPDATE user_currency SET balance = balance + ? WHERE user_id = ? AND server_id = ? AND currency = ?",
          [999, user, 0, CUR_GOLD],
        );
        throw injected;
      }),
      (error: unknown) => error === injected,
    );
    const after = await getPool().query<RowDataPacket[]>(
      "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?",
      [user, 0, CUR_GOLD],
    );
    assert.equal(Number(after[0][0].balance), Number(before[0][0].balance));
  });
});
