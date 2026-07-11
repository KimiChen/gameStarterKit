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
import { withUser } from "../../src/core/uow";
import { idemAcquire, idemComplete, idemRelease } from "../../src/core/idem";
import { deriveOpId, redisApply } from "../../src/economy/outbox";
import { createUser } from "../../src/gameplay/userStore";
import { LOCK_TTL_MS } from "../../src/infra/config";
import { kApplied, kBag, kBagAll, kFence, kIdemUser, kLock, kUser } from "../../src/infra/keys";
import { clientFor, closeRedis } from "../../src/infra/redisRoute";
import { CAS_HSET, evalshaWithReload } from "../../src/infra/redisScripts";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const usedUids: string[] = [];
const uid = (name: string): string => { const u = testUid(name); usedUids.push(u); return u; };

before(async () => { await assertRedisUp(); });
after(async () => {
  for (const u of usedUids) { await cleanupUser(u); }
  await closeRedis();
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
  const r2 = await redisApply(u, deriveOpId(u, "test", "req1"), [{ kind: "item", itemId: 7, count: 1 }]);
  assert.equal(r2, "cold");

  for (const k of [kUser(u), kApplied(u), ...kBagAll(u)]) {
    assert.equal(await c.exists(k), 0, `${k} 不该被创建（09·R2）`);
  }
});

// ── 5. op_id 重放 → dup，数量不变 ───────────────────────────────

test("同一 op_id 重放 applyEffect → 第二次 dup，背包数量不变", async () => {
  const u = uid("dup");
  await createUser(u);
  const c = clientFor(u);
  const opId = deriveOpId(u, "shop.purchase", "req-abc");
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
  assert.equal(deriveOpId(u, "shop.purchase", "req-abc"), opId);
  assert.notEqual(deriveOpId(u, "shop.purchase", "req-xyz"), opId);
});

test("clawback 负数下溢：回补到 0 且仍 ok（09·X8）", async () => {
  const u = uid("under");
  await createUser(u);
  const c = clientFor(u);
  await redisApply(u, deriveOpId(u, "t", "r1"), [{ kind: "item", itemId: 9, count: 2 }]);
  const r = await redisApply(u, deriveOpId(u, "t", "r2"), [{ kind: "item", itemId: 9, count: -5 }]);
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
