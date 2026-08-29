/**
 * M2 DoD 集成测试（10·M2）——全部真实 Redis，⛔ 不 mock：
 *  1. 并发 100 同 uid 写 → 串行执行；双 uid 交错 → 脏字段不串号（09·R8）
 *  2. 双进程并发同 uid → 跨实例串行
 *  3. 锁过期 + 竞争写：B 抢更高 fence 写成功后，A 用旧 fence casHset → stale（09·L6）
 *  4. casHset / applyEffect 对不存在的 uid → cold，未创建任何 key（09·R2）
 *  5. 同一 op_id 重放 applyEffect → dup，数量不变（09·I3）
 *  6. kill -9 持锁进程 → 锁 PX 自然过期，下一个请求正常
 * 前置：npm --workspace @game/server run stack
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLease } from "../../src/core/locks";
import { _uowTestHooks, withUser } from "../../src/core/uow";
import { idemAcquire, idemComplete, idemRelease } from "../../src/core/idem";
import { deriveOpId, redisApply } from "../../src/core/economy/outbox";
import { createUser, loadFields } from "../../src/core/userRecord";
import { writeGroupSess } from "../../src/core/auth/session";
import { LOCK_TTL_MS, SCHEMA_VERSION } from "../../src/core/infra/config";
import { kApplied, kBag, kBagAll, kIdemUser, kLock, kSess, kUser } from "../../src/core/infra/keys";
import { clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { CAS_HSET, CREATE_USER, evalshaWithReload } from "../../src/core/infra/redisScripts";
import { USER_GENERIC_WRITE_RESERVED_FIELDS } from "../../src/core/userSchema";
import {
  _liveSchemaTestHooks, migrateLiveUserSchemaLocked,
} from "../../src/core/liveSchema";
import { closeMysql } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const usedUids: string[] = [];
const uid = (name: string): string => { const u = testUid(name); usedUids.push(u); return u; };

before(async () => { await assertRedisUp(); });
after(async () => {
  for (const u of usedUids) { await cleanupUser(u); }
  await closeRedis();
  await closeMysql();
});

// ── 1. 并发 100 同 uid 串行 + 双 uid 不串号 ──────────────────────

test("并发 100 个同 uid 写串行执行，双 uid 脏字段不串号", async () => {
  const a = uid("serial_a");
  const b = uid("serial_b");
  await createUser(a);
  await createUser(b);

  const incr = (u: string) => withUser(u, async (uow) => {
    const { n } = await uow.loadFields(["n"]);
    uow.set("n", String(Number(n ?? "0") + 1));
    uow.set(`mark_${u}`, "1"); // 带 uid 的标记字段，用于验证不串号
  });
  // A 100 个 + B 50 个交错并发
  await Promise.all([
    ...Array.from({ length: 100 }, () => incr(a)),
    ...Array.from({ length: 50 }, () => incr(b)),
  ]);

  const ca = clientFor(a); const cb = clientFor(b);
  assert.equal(await ca.hget(kUser(a), "n"), "100");        // 丢更新=串行被破坏
  assert.equal(await cb.hget(kUser(b), "n"), "50");
  assert.equal(await ca.hget(kUser(a), `mark_${b}`), null); // B 的脏字段绝不能出现在 A（09·R8）
  assert.equal(await cb.hget(kUser(b), `mark_${a}`), null);
});

// ── 2. 双进程跨实例串行 ─────────────────────────────────────────

test("两个真实进程并发同 uid → 跨实例串行不丢更新", async () => {
  const u = uid("xproc");
  await createUser(u);
  const worker = join(here, "workers", "incrWorker.ts");
  const run = (): Promise<void> => new Promise((res, rej) => {
    execFile("node", ["--import", "tsx", worker, u, "50"], { timeout: 60_000 },
      (err, _out, stderr) => err ? rej(new Error(`worker: ${stderr}`)) : res());
  });
  await Promise.all([run(), run()]);
  assert.equal(await clientFor(u).hget(kUser(u), "n"), "100");
});

// ── 3. 锁过期 + 竞争写：旧 fence 被拒 ───────────────────────────

test("锁过期后 B 抢更高 fence 写入，A 用旧 fence casHset → stale", async () => {
  const u = uid("stale");
  await createUser(u);
  const c = clientFor(u);

  const a = await acquireLease(u);          // A 持锁
  await sleep(LOCK_TTL_MS + 400);           // A「睡死」超 TTL，锁自然过期
  const b = await acquireLease(u);          // B 抢到更高 fence
  assert.ok(b.fence > a.fence);
  const rb = await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(b.fence), "field", "fromB"]);
  assert.equal(rb, "ok");
  await b.release();

  // A 醒来带旧 fence 写 → 必须被拒（09·L6：若无 B 的写，A 返回 ok 是正确行为）
  const ra = await evalshaWithReload(c, CAS_HSET, [kUser(u)], [String(a.fence), "field", "fromA"]);
  assert.equal(ra, "stale");
  assert.equal(await c.hget(kUser(u), "field"), "fromB"); // 僵尸写零破坏
});

// ── 4. cold：不存在的 uid 不创建任何 key ────────────────────────

test("casHset / applyEffect 对不存在的 uid → cold，未创建任何 key", async () => {
  const u = uid("cold");
  const c = clientFor(u);

  const r1 = await evalshaWithReload(c, CAS_HSET, [kUser(u)], ["1", "f", "v"]);
  assert.equal(r1, "cold");
  const r2 = await redisApply(u, deriveOpId(u, 0, "test", "req1"), [{ kind: "item", itemId: 7, count: 1 }]);
  assert.equal(r2, "cold");

  for (const k of [kUser(u), kApplied(u), ...kBagAll(u)]) {
    assert.equal(await c.exists(k), 0, `${k} 不该被创建（09·R2）`);
  }
});

test("casHset 严格守卫 schema/ver/fence：缺失或损坏元数据时零部分写", async () => {
  const cases: ReadonlyArray<{
    name: string;
    corrupt: (user: string) => Promise<void>;
    message: RegExp;
  }> = [
    {
      name: "missing-ver",
      corrupt: async (user) => { await clientFor(user).hdel(kUser(user), "ver"); },
      message: /casHset metadata invalid/,
    },
    {
      name: "future-schema",
      corrupt: async (user) => {
        await clientFor(user).hset(kUser(user), "schemaVersion", String(SCHEMA_VERSION + 1));
      },
      message: /casHset schema invalid/,
    },
    {
      name: "bad-fence",
      corrupt: async (user) => { await clientFor(user).hset(kUser(user), "fence", "bad"); },
      message: /casHset metadata invalid/,
    },
  ];
  for (const item of cases) {
    const u = uid(`cas_guard_${item.name}`);
    await createUser(u);
    const c = clientFor(u);
    await item.corrupt(u);
    const before = await c.hgetall(kUser(u));
    await assert.rejects(
      evalshaWithReload(c, CAS_HSET, [kUser(u)], ["1", "probe", "written"]),
      item.message,
    );
    assert.deepEqual(await c.hgetall(kUser(u)), before, `${item.name} 不得产生任何字段写入`);
  }
});

test("createUser writes v2/checkedAt=0 and rejects every caller-supplied reserved field before creating a key", async () => {
  const created = uid("create_v2");
  assert.equal(await createUser(created, { nickname: "new" }), "ok");
  assert.deepEqual(
    await clientFor(created).hmget(kUser(created), "schemaVersion", "ver", "fence", "characterRegistrationCheckedAt"),
    [String(SCHEMA_VERSION), "0", "0", "0"],
  );

  for (const field of USER_GENERIC_WRITE_RESERVED_FIELDS) {
    const rejected = uid(`create_reserved_${field}`);
    await assert.rejects(createUser(rejected, { [field]: "x" }), /不得覆盖保留字段/);
    assert.equal(await clientFor(rejected).exists(kUser(rejected)), 0, `${field} 失败不得留下半档`);
  }

  const direct = uid("create_lua_reserved");
  await assert.rejects(
    evalshaWithReload(clientFor(direct), CREATE_USER, [kUser(direct)], [
      String(SCHEMA_VERSION), String(Date.now()), "", "schemaVersion", "1",
    ]),
    /createUser reserved field/,
  );
  assert.equal(await clientFor(direct).exists(kUser(direct)), 0, "Lua preflight 必须发生在首个 HSET 前");
});

test("loadFields atomically accepts N/N-1 without writing; withUser migrates v1 under lock exactly once", async () => {
  const u = uid("hot_v1_migrate");
  await createUser(u, { nickname: "legacy" });
  const c = clientFor(u);
  await c.hset(kUser(u), "schemaVersion", "1", "ver", "4");
  await c.hdel(kUser(u), "characterRegistrationCheckedAt");
  const beforeRead = await c.hgetall(kUser(u));

  assert.deepEqual(await loadFields(u, ["nickname", "ver"]), { nickname: "legacy", ver: "4" });
  assert.deepEqual(await c.hgetall(kUser(u)), beforeRead, "纯读不得顺手迁移 N-1");

  let runs = 0;
  await withUser(u, async (uow) => {
    runs++;
    uow.set("probe", "written");
  });
  assert.equal(runs, 1);
  assert.deepEqual(
    await c.hmget(kUser(u), "schemaVersion", "characterRegistrationCheckedAt", "ver", "probe"),
    [String(SCHEMA_VERSION), "0", "6", "written"],
    "migration bumps 4->5 and the generic commit bumps 5->6",
  );

  const afterFirst = await c.hgetall(kUser(u));
  await loadFields(u, ["nickname"]);
  assert.deepEqual(await c.hgetall(kUser(u)), afterFirst, "v2 reread remains a no-op");
});

test("hot v1 preserves legal checkedAt; malformed/future/wrongtype reads and writes are zero-change", async () => {
  const legal = uid("hot_v1_preserve");
  await createUser(legal);
  const legalClient = clientFor(legal);
  await legalClient.hset(
    kUser(legal), "schemaVersion", "1", "ver", "7", "characterRegistrationCheckedAt", "123",
  );
  await withUser(legal, async (uow) => { uow.set("probe", "ok"); });
  assert.equal(await legalClient.hget(kUser(legal), "characterRegistrationCheckedAt"), "123");

  for (const item of [
    { name: "malformed", prepare: async (c: ReturnType<typeof clientFor>, key: string) => {
      await c.hset(key, "schemaVersion", "1", "characterRegistrationCheckedAt", "-1");
    } },
    { name: "future", prepare: async (c: ReturnType<typeof clientFor>, key: string) => {
      await c.hset(key, "schemaVersion", String(SCHEMA_VERSION + 1));
    } },
  ]) {
    const target = uid(`hot_${item.name}`);
    await createUser(target, { untouched: "yes" });
    const client = clientFor(target);
    await item.prepare(client, kUser(target));
    const before = await client.hgetall(kUser(target));
    await assert.rejects(
      loadFields(target, ["untouched"]),
      /(?:characterRegistrationCheckedAt|schemaVersion)/,
    );
    let callbackRan = false;
    await assert.rejects(
      withUser(target, async () => { callbackRan = true; }),
      /(?:characterRegistrationCheckedAt|schemaVersion)/,
    );
    assert.equal(callbackRan, false, "schema preflight 必须早于业务 callback");
    assert.deepEqual(await client.hgetall(kUser(target)), before);
  }

  const wrong = uid("hot_wrongtype");
  const wrongClient = clientFor(wrong);
  await wrongClient.set(kUser(wrong), "wrong-type");
  await assert.rejects(loadFields(wrong, ["probe"]), /user key type string expected hash/);
  assert.equal(await wrongClient.get(kUser(wrong)), "wrong-type");
});

test("CAS_HSET rejects the exact generic reserved set before the first field write", async () => {
  for (const field of USER_GENERIC_WRITE_RESERVED_FIELDS) {
    const u = uid(`cas_reserved_${field}`);
    await createUser(u, { untouched: "yes" });
    const c = clientFor(u);
    const before = await c.hgetall(kUser(u));
    await assert.rejects(
      evalshaWithReload(c, CAS_HSET, [kUser(u)], ["1", "ordinary", "would-write", field, "x"]),
      /casHset reserved field/,
    );
    assert.deepEqual(await c.hgetall(kUser(u)), before, `${field} 不得留下前序 ordinary 半写`);
  }
});

test("current v2 is revalidated atomically inside the lock when metadata changes after the TS read", async () => {
  const u = uid("current_atomic_recheck");
  await createUser(u, { untouched: "yes" });
  const c = clientFor(u);
  const lease = await acquireLease(u);
  let injected = false;
  _liveSchemaTestHooks.beforeAtomicMigration = async (hookUid) => {
    if (hookUid !== u || injected) { return; }
    injected = true;
    await c.hset(kUser(u), "characterRegistrationCheckedAt", "-1");
  };
  try {
    await assert.rejects(
      migrateLiveUserSchemaLocked(u, lease.fence),
      /user schema migrate checkedAt invalid/,
    );
  } finally {
    delete _liveSchemaTestHooks.beforeAtomicMigration;
    await lease.release();
  }
  assert.equal(injected, true);
  assert.deepEqual(
    await c.hmget(kUser(u), "schemaVersion", "ver", "characterRegistrationCheckedAt", "untouched"),
    [String(SCHEMA_VERSION), "0", "-1", "yes"],
    "Lua current 分支只能暴露注入损坏，不得自行写入任何字段",
  );
});

test("withUser repeats schema preflight under its business lock before callback", async () => {
  const u = uid("uow_schema_window");
  await createUser(u, { untouched: "yes" });
  const c = clientFor(u);
  let callbackRan = false;
  _uowTestHooks.afterEnsureLive = async (hookUid) => {
    if (hookUid === u) {
      await c.hset(kUser(u), "schemaVersion", String(SCHEMA_VERSION + 1));
    }
  };
  try {
    await assert.rejects(
      withUser(u, async (uow) => {
        callbackRan = true;
        uow.set("probe", "bad");
      }),
      /schemaVersion/,
    );
  } finally {
    delete _uowTestHooks.afterEnsureLive;
  }
  assert.equal(callbackRan, false, "future schema 必须在业务 callback/外部副作用前被锁内拒绝");
  assert.deepEqual(
    await c.hmget(kUser(u), "schemaVersion", "ver", "probe", "untouched"),
    [String(SCHEMA_VERSION + 1), "0", null, "yes"],
  );
});

// ── 5. op_id 重放 → dup，数量不变 ───────────────────────────────

test("同一 op_id 重放 applyEffect → 第二次 dup，背包数量不变", async () => {
  const u = uid("dup");
  await createUser(u);
  const c = clientFor(u);
  const opId = deriveOpId(u, 0, "shop.purchase", "req-abc");
  const effect = [{ kind: "item" as const, itemId: 5, count: 3 }, { kind: "star" as const, delta: 2 }];

  assert.equal(await redisApply(u, opId, effect), "ok");
  assert.equal(await c.hget(kBag(u, 5 % 4), "5"), "3");
  assert.equal(await c.hget(kUser(u), "star"), "2");
  assert.equal(await c.hget(kUser(u), "ver"), "1");

  assert.equal(await redisApply(u, opId, effect), "dup"); // 重放
  assert.equal(await c.hget(kBag(u, 5 % 4), "5"), "3");   // 数量不变
  assert.equal(await c.hget(kUser(u), "star"), "2");
  assert.equal(await c.hget(kUser(u), "ver"), "1");       // ver 也只 bump 一次

  // 同 (uid,type,clientReqId) 派生恒等；换 clientReqId = 新交易（09·I2）
  assert.equal(deriveOpId(u, 0, "shop.purchase", "req-abc"), opId);
  assert.notEqual(deriveOpId(u, 0, "shop.purchase", "req-xyz"), opId);
});

test("clawback 负数下溢：回补到 0 且仍 ok（09·X8）", async () => {
  const u = uid("under");
  await createUser(u);
  const c = clientFor(u);
  await redisApply(u, deriveOpId(u, 0, "t", "r1"), [{ kind: "item", itemId: 9, count: 2 }]);
  const r = await redisApply(u, deriveOpId(u, 0, "t", "r2"), [{ kind: "item", itemId: 9, count: -5 }]);
  assert.equal(r, "ok");
  assert.equal(await c.hget(kBag(u, 9 % 4), "9"), "0"); // 不出现负数背包
});

// ── 6. kill -9 持锁进程 → PX 自然过期 ───────────────────────────

test("kill -9 持锁进程 → 锁 5s 后自然过期，下一个请求正常", async () => {
  const u = uid("kill9");
  await createUser(u);
  const c = clientFor(u);
  const worker = join(here, "workers", "holdLock.ts");

  const child = spawn("node", ["--import", "tsx", worker, u], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((res, rej) => {
    child.stdout.on("data", (d: Buffer) => { if (d.toString().includes("HELD")) { res(); } });
    child.on("exit", (code) => rej(new Error(`worker 提前退出 code=${code}`)));
    setTimeout(() => rej(new Error("等 HELD 超时")), 15_000);
  });
  child.kill("SIGKILL");

  assert.ok(await c.get(kLock(u)), "kill 后锁应仍在（PX 未到）");
  const t0 = Date.now();
  while (await c.get(kLock(u)) !== null) {
    assert.ok(Date.now() - t0 < LOCK_TTL_MS + 2000, "锁未在 TTL 内自然过期");
    await sleep(100);
  }
  const lease = await acquireLease(u); // 下一个请求正常
  await lease.release();
});

// ── 幂等占位原语（09·I1：执行前占位 + 干净失败立即可重试） ────────

test("idem：pending 互斥、done 回缓存、release 后立即可重占", async () => {
  const u = uid("idem");
  const c = clientFor(u);
  const key = kIdemUser("rpc", u, "req1");

  assert.deepEqual(await idemAcquire(c, key, "h1"), { kind: "acquired" });
  assert.deepEqual(await idemAcquire(c, key, "h2"), { kind: "pending" }); // 并发双发第二个必须挡住

  await idemComplete(c, key, '{"ok":true}');
  assert.deepEqual(await idemAcquire(c, key, "h3"), { kind: "done", result: '{"ok":true}' });

  const key2 = kIdemUser("rpc", u, "req2");
  assert.deepEqual(await idemAcquire(c, key2, "h1"), { kind: "acquired" });
  await idemRelease(c, key2, "h1"); // 干净失败释放
  assert.deepEqual(await idemAcquire(c, key2, "h4"), { kind: "acquired" }); // 不用等 10s
  await c.unlink(key, key2);
});

test("session fence：脚本缓存丢失时自动 NOSCRIPT reload，状态语义保持不变", async () => {
  const u = uid("session-script-reload");
  const c = clientFor(u);
  // Inject one NOSCRIPT response on this client only. This models a Redis
  // restart/failover without flushing the shared script cache used by other
  // tests; evalshaWithReload must SCRIPT LOAD and retry transparently.
  const redisWithEvalsha = c as unknown as {
    evalsha: (...args: unknown[]) => Promise<unknown>;
  };
  const originalEvalsha = redisWithEvalsha.evalsha;
  let injected = true;
  redisWithEvalsha.evalsha = async (...args: unknown[]) => {
    if (injected) {
      injected = false;
      throw new Error("NOSCRIPT injected for session fence test");
    }
    return originalEvalsha.apply(c, args);
  };
  try {
    assert.equal(await writeGroupSess(u, "session-token", 1, "", 100), "written");
    assert.equal(await writeGroupSess(u, "session-token", 1, "", 100), "unchanged");
    assert.equal(await writeGroupSess(u, "older-token", 1, "", 99), "stale");
  } finally {
    redisWithEvalsha.evalsha = originalEvalsha;
  }
});

test("session 已 written 但首次 touchActive 失败：同 token unchanged 重试补齐 LRU", async () => {
  const u = uid("session-touch-retry");
  let touches = 0;
  await assert.rejects(
    writeGroupSess(u, "touch-retry-token", 1, "", 301, {
      touchActive: async () => {
        touches++;
        throw new Error("injected LRU failure");
      },
    }),
    /injected LRU failure/,
  );
  assert.equal(await writeGroupSess(u, "touch-retry-token", 1, "", 301, {
    touchActive: async () => { touches++; },
  }), "unchanged");
  assert.equal(touches, 2, "unchanged 路径必须重试 touchActive，而非提前返回");
  await clientFor(u).unlink(kSess(u, 1));
});

test("replacement session 不因 touchActive 失败漏踢旧登录", async () => {
  const u = uid("session_replacement_touch_failure");
  const localKicks: string[] = [];
  const broadcasts: string[] = [];
  const dependencies = {
    touchActive: async (): Promise<void> => {},
    kickLocal: (_uid: string): void => { localKicks.push(_uid); },
    broadcastKick: async (_uid: string): Promise<void> => { broadcasts.push(_uid); },
  };
  assert.equal(await writeGroupSess(u, "old-token", 1, "", 401, dependencies), "written");

  await assert.rejects(writeGroupSess(u, "new-token", 1, "", 402, {
    ...dependencies,
    touchActive: async (): Promise<void> => { throw new Error("injected lru failure"); },
  }), /injected lru failure/);
  assert.deepEqual(localKicks, [u], "本节点旧连接必须在 LRU 错误上抛前被踢");
  assert.deepEqual(broadcasts, [u], "跨节点 replacement 事件必须在 LRU 错误上抛前发布");

  assert.equal(await writeGroupSess(u, "new-token", 1, "", 402, dependencies), "unchanged");
  assert.deepEqual(localKicks, [u], "相同登录态重试不得重复顶号");
  assert.deepEqual(broadcasts, [u], "相同登录态重试不得重复广播");
});
