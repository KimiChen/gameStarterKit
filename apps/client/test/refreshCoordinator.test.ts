/**
 * RefreshCoordinator（Non-intrusive §7.2/§7.3 阶段 5b）：四维 flight key 合流、
 * dirty 位三条硬语义（逐条含变异反例）、trailing 按 flight 递归、失败重置 dirty、
 * 背压（最小间隔 + 指数退避 + 上限 stale 手动重试，⛔ 不静默空转）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { RefreshCoordinator, type RefreshFlightKey } from "../src/app/RefreshCoordinator";

const KEY: RefreshFlightKey = {
  appGeneration: 1,
  routeGeneration: 2,
  sessionGeneration: 3,
  connectionEpoch: 4,
};

const OTHER_KEY: RefreshFlightKey = { ...KEY, connectionEpoch: 5 };

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

/** 手动时钟 + 手动 trailing scheduler（测试完全掌控推进，无真实定时器）。 */
function makeHarness(options: {
  minIntervalMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  maxFailureStreak?: number;
} = {}) {
  let now = 0;
  const scheduled: Array<{ callback: () => void; at: number; cancelled: boolean }> = [];
  const coordinator = new RefreshCoordinator({
    now: () => now,
    minIntervalMs: options.minIntervalMs ?? 100,
    backoffBaseMs: options.backoffBaseMs ?? 100,
    backoffMaxMs: options.backoffMaxMs ?? 1_000,
    maxFailureStreak: options.maxFailureStreak ?? 3,
    schedule: (callback, delayMs) => {
      const entry = { callback, at: now + delayMs, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    },
  });
  return {
    coordinator,
    scheduled,
    advance(ms: number) {
      now += ms;
      for (const entry of scheduled.splice(0)) {
        if (!entry.cancelled && entry.at <= now) entry.callback();
        else if (!entry.cancelled) scheduled.push(entry);
      }
    },
    get now() { return now; },
  };
}

test("request：同 key 并发只合流当前 flight；settle 后允许下一次；异 key 互不合流", async () => {
  const { coordinator } = makeHarness();
  const gate = deferred<string>();
  let runs = 0;
  const task = () => { runs++; return gate.promise; };
  const first = coordinator.request(KEY, task);
  const second = coordinator.request(KEY, task);
  assert.strictEqual(second, first, "同 key 在途 flight 必须合流为同一个 Promise");
  const other = coordinator.request(OTHER_KEY, task);
  assert.notStrictEqual(other, first, "connection epoch 不同即不同 flight key");
  await flushMicrotasks();
  assert.equal(runs, 2, "合流的两次 request 只发出一次请求；异 key 各自发出");
  gate.resolve("ok");
  assert.equal(await first, "ok");
  const next = coordinator.request(KEY, async () => { runs++; return "next"; });
  assert.notStrictEqual(next, first, "flight settle 后必须允许下一次正常刷新");
  assert.equal(await next, "next");
  assert.equal(runs, 3);
});

test("dirty 语义 1：只在实际发出请求那一刻清除（启动前置位归本次，启动后置位归 trailing）", async () => {
  const { coordinator, advance } = makeHarness();
  let runs = 0;
  const task = async () => { runs++; return runs; };
  // 启动前变脏：本次 flight 冒领它（发出请求时清除），settle 后不再 trailing。
  coordinator.markDirty(KEY, task);
  await coordinator.request(KEY, task);
  advance(1_000);
  assert.equal(runs, 1, "启动前的变脏由本次 flight 冒领，不得额外 trailing");
  assert.equal(coordinator.trigger(KEY), null, "dirty 已在发出请求那一刻清除");

  // 启动后变脏：不得被已在途 flight 冒领（延后清会抹掉窗口内的变更）。
  const gate = deferred<number>();
  const flight = coordinator.request(KEY, () => { runs++; return gate.promise; });
  coordinator.markDirty(KEY, task);
  gate.resolve(0);
  await flight;
  advance(1_000);
  await flushMicrotasks();
  assert.equal(runs, 3, "flight 期间的变脏必须触发 trailing（不可视为已被本次覆盖）");
});

test("dirty 语义 2：trailing 按 flight 计且递归——trailing 自身 settle 时若又变脏必须再排", async () => {
  const { coordinator, advance } = makeHarness({ minIntervalMs: 10 });
  let runs = 0;
  let redirty = true;
  const task = async () => {
    runs++;
    if (redirty && runs <= 2) {
      // 每个 flight 执行期间再次变脏：递归 trailing，⛔ 不允许「每个 dirty 周期至多一次」。
      coordinator.markDirty(KEY, task);
    }
    return runs;
  };
  await coordinator.request(KEY, task);
  advance(50);
  await flushMicrotasks();
  advance(50);
  await flushMicrotasks();
  advance(50);
  await flushMicrotasks();
  assert.equal(runs, 3, "flight1 变脏→trailing2；trailing2 变脏→trailing3（递归）");
  redirty = false;
  advance(1_000);
  await flushMicrotasks();
  assert.equal(runs, 3, "dirty 清空后不得空转");
});

test("dirty 语义 3 + 背压：失败重置 dirty、退避窗口内 trigger 不开新 flight、上限后 stale 手动重试", async () => {
  const { coordinator, advance } = makeHarness({
    minIntervalMs: 0,
    backoffBaseMs: 100,
    backoffMaxMs: 400,
    maxFailureStreak: 2,
  });
  let attempts = 0;
  let failing = true;
  const task = async () => {
    attempts++;
    if (failing) throw new Error(`attempt ${attempts}`);
    return attempts;
  };

  await assert.rejects(coordinator.request(KEY, task));
  await flushMicrotasks();
  assert.equal(attempts, 1);
  // 失败必须重新置 dirty（由下一次 ready/foreground 触发重试，⛔ 不静默丢弃）；
  // 但退避窗口内：变脏只置 dirty，不开新 flight。
  assert.equal(coordinator.trigger(KEY), null, "退避期内 trigger 不得开新 flight");
  assert.equal(attempts, 1);
  advance(150);
  const retry = coordinator.trigger(KEY);
  assert.ok(retry, "退避期满 + dirty → trigger 必须重试");
  await retry!.catch(() => {});
  assert.equal(attempts, 2);
  // 连续失败达到上限 → stale：不再自动空转，只接受手动重试。
  assert.equal(coordinator.isStale(KEY), true, "退避上限内仍失败必须标 stale");
  advance(10_000);
  assert.equal(coordinator.trigger(KEY), null, "stale 后普通 trigger ⛔ 不得重试（等待手动）");
  assert.equal(attempts, 2);

  failing = false;
  const manual = await coordinator.retryStale(KEY, task);
  assert.equal(manual, 3, "手动重试必须立即恢复");
  assert.equal(coordinator.isStale(KEY), false);
});

test("app/route/session 任一维不同即不同 key（世代/route/会话互不冒领）", async () => {
  const { coordinator } = makeHarness();
  const seen: string[] = [];
  const mk = (label: string) => async () => { seen.push(label); return label; };
  await Promise.all([
    coordinator.request(KEY, mk("base")),
    coordinator.request({ ...KEY, appGeneration: 9 }, mk("app")),
    coordinator.request({ ...KEY, routeGeneration: 9 }, mk("route")),
    coordinator.request({ ...KEY, sessionGeneration: 9 }, mk("session")),
  ]);
  assert.deepEqual([...seen].sort(), ["app", "base", "route", "session"],
    "四维 key 的每一维都必须参与合流判定");
});
