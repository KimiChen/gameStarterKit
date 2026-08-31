import assert from "node:assert/strict";
import { WebPlatformUnavailableError } from "../src/platform/webPlatformClient";
import { test } from "node:test";
import {
  CHARACTER_READY_TIMEOUT_MAX_MS,
  CHARACTER_READY_TIMEOUT_MS,
} from "../src/core/infra/config";
import { zoneCtx } from "../src/core/infra/keys";
import {
  CharacterReadyCoordinator,
  CharacterReadyClosedError,
  clearCharacterReadyFlights,
  ensureCharacterReady,
  ensureCharacterWithDependencies,
  isCharacterReadyAdmissionOpen,
  resetCharacterReadyFlights,
  validateCharacterReadyTimeoutMs,
} from "../src/player/character";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("character ready timeout validates the timer domain before starting a flight", () => {
  for (const value of [0, 1, CHARACTER_READY_TIMEOUT_MS, CHARACTER_READY_TIMEOUT_MAX_MS]) {
    assert.equal(validateCharacterReadyTimeoutMs(value), value);
  }
  for (const value of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    CHARACTER_READY_TIMEOUT_MAX_MS + 1,
    Number.MAX_SAFE_INTEGER,
    "1000",
    null,
    undefined,
  ]) {
    assert.throws(
      () => validateCharacterReadyTimeoutMs(value),
      (error: unknown) => error instanceof RangeError && /timeoutMs/.test(error.message),
      `非法 timeout=${String(value)} 必须在建 flight 前拒绝`,
    );
  }
});

test("character ready shutdown gate rejects late joins and can be explicitly reset", async () => {
  resetCharacterReadyFlights();
  assert.equal(isCharacterReadyAdmissionOpen(), true);

  clearCharacterReadyFlights();
  assert.equal(isCharacterReadyAdmissionOpen(), false);
  await assert.rejects(
    ensureCharacterReady("late-join", 1, 1),
    (error: unknown) => error instanceof CharacterReadyClosedError
      && error.code === "CHARACTER_READY_CLOSED",
  );

  // Embedded test runners may reuse this module after a graceful shutdown;
  // reset reopens admission and starts from a clean flight generation.
  resetCharacterReadyFlights();
  assert.equal(isCharacterReadyAdmissionOpen(), true);
});

test("character ready keeps the underlying flight after one caller times out", async () => {
  const calls: Array<[string, number]> = [];
  const firstWork = deferred<void>();
  const secondWork = deferred<void>();
  const pending = [firstWork, secondWork];
  const coordinator = new CharacterReadyCoordinator((uid, sId) => {
    calls.push([uid, sId]);
    const current = pending.shift();
    assert.ok(current, "每个新 flight 都应取得一个 deferred work");
    return current.promise;
  });

  // Use a zero timeout so the timeout branch is deterministic without waiting
  // on wall-clock time.  The initializer itself remains pending.
  const first = coordinator.ensure("u-race", 7, 0);
  await assert.rejects(first, /角色初始化超时 uid=u-race sId=7/);
  assert.deepEqual(calls, [["u-race", 7]]);

  // The first caller's timeout must not release map ownership.  A second
  // caller gets a fresh wait budget but still shares the original work.
  const second = coordinator.ensure("u-race", 7, 100);
  assert.deepEqual(calls, [["u-race", 7]]);
  firstWork.resolve();
  await second;

  // Once the underlying work has settled, a subsequent call is allowed to
  // start a new generation instead of reusing a completed promise.
  const third = coordinator.ensure("u-race", 7, 100);
  await Promise.resolve();
  assert.deepEqual(calls, [["u-race", 7], ["u-race", 7]]);
  secondWork.resolve();
  await third;
});

test("character initializer：MySQL/Redis/WebPlatform 任一慢阶段超时都拒绝 ready，且按顺序短路", async () => {
  // ensureLive covers the Redis existence check plus the MySQL archive/resolve
  // path; createUser is the Redis atomic write; registerCharacterWithRepair is
  // the WebPlatform PUT + durable repair boundary.  Injecting these explicit
  // ports keeps the test deterministic without replacing module caches or
  // requiring a live external service.
  const cases = [
    { stage: "ensureLive", expected: ["ensureLive"] },
    { stage: "createUser", expected: ["ensureLive", "createUser"] },
    { stage: "registerCharacterWithRepair", expected: ["ensureLive", "createUser", "registerCharacterWithRepair"] },
  ] as const;

  for (const current of cases) {
    const calls: string[] = [];
    const gate = deferred<void>();
    const waitAt = async (stage: string): Promise<void> => {
      calls.push(stage);
      if (stage === current.stage) await gate.promise;
    };
    const coordinator = new CharacterReadyCoordinator(
      (uid, sId) => ensureCharacterWithDependencies(uid, sId, {
        ensureLive: async () => waitAt("ensureLive"),
        createUser: async () => {
          await waitAt("createUser");
          return "ok";
        },
        registerCharacterWithRepair: async () => waitAt("registerCharacterWithRepair"),
        invalidateUserNegcache: async () => waitAt("invalidateUserNegcache"),
      }),
    );

    const ready = coordinator.ensure(`u-stage-${current.stage}`, 7, 0);
    await assert.rejects(ready, /角色初始化超时/);
    assert.deepEqual(calls, current.expected,
      `${current.stage} 超时前不得越过未完成阶段`);

    // A caller timeout does not abandon ownership: release the injected
    // dependency and wait for the same underlying flight to settle.
    gate.resolve();
    await coordinator.drain();
    assert.deepEqual(calls, [
      "ensureLive", "createUser", "registerCharacterWithRepair", "invalidateUserNegcache",
    ], `${current.stage} 放行后底层 flight 应完整收敛`);
  }
});

test("character initializer：已有热档按登记 marker/hasCharacter 短路 WebPlatform PUT，pending 才修复", async () => {
  const calls: string[] = [];
  const makeDeps = (
    created: "ok" | "exists",
    state: "pending" | "ready" | null,
    remote = false,
    remoteError?: Error,
  ) => ({
    ensureLive: async () => {},
    createUser: async () => created,
    readCharacterRegistration: async () => state === "ready"
      ? { state, checkedAtMs: 100 }
      : state,
    hasCharacter: async () => {
      calls.push("has");
      if (remoteError) { throw remoteError; }
      return remote;
    },
    enqueueCharacterRepairIntent: async () => { calls.push("enqueue"); },
    registerCharacterWithRepair: async () => { calls.push("register"); },
    markCharacterRegistrationReady: async () => { calls.push("mark-ready"); },
    nowMs: () => 100,
    registrationRecheckMs: 1_000,
    invalidateUserNegcache: async () => { calls.push("negcache"); },
  });

  await ensureCharacterWithDependencies("hot-ready", 1, makeDeps("exists", "ready"));
  assert.deepEqual(calls, ["negcache"], "ready 热档不得调用 WebPlatform PUT");

  calls.length = 0;
  await ensureCharacterWithDependencies("hot-legacy", 1, makeDeps("exists", null));
  assert.deepEqual(calls, ["has", "register", "mark-ready", "negcache"],
    "无 marker 且远端不存在时必须登记并补 marker");

  calls.length = 0;
  await ensureCharacterWithDependencies("hot-legacy-registered", 1, makeDeps("exists", null, true));
  assert.deepEqual(calls, ["has", "mark-ready", "negcache"],
    "无 marker 但远端已登记时只补 marker，不重复 PUT");

  calls.length = 0;
  const probeError = new Error("webplatform unavailable");
  await assert.rejects(
    ensureCharacterWithDependencies("hot-legacy-probe-error", 1, makeDeps("exists", null, false, probeError)),
    (error: unknown) => error === probeError,
  );
  assert.deepEqual(calls, ["has", "enqueue"], "hasCharacter 抖动必须留下 repair intent 并拒绝 ready");

  calls.length = 0;
  await ensureCharacterWithDependencies("crash-pending", 1, makeDeps("exists", "pending"));
  assert.deepEqual(calls, ["register", "mark-ready", "negcache"],
    "Redis 档已创建但外部登记未完成时，pending 必须走修复并落 ready marker");

  calls.length = 0;
  await ensureCharacterWithDependencies("first-character", 1, makeDeps("ok", "pending"));
  assert.deepEqual(calls, ["register", "mark-ready", "negcache"],
    "首次建档必须完成外部登记后才 ready");
});

test("character initializer：ready marker 按区隔离，s1 的 ready 不得短路 s2 首次登记", async () => {
  const calls: Array<{ stage: string; sId: number }> = [];
  const deps = {
    ensureLive: async (_uid: string, sId: number) => {
      calls.push({ stage: "ensureLive", sId });
    },
    createUser: async (_uid: string, _fields: Record<string, string>) => {
      calls.push({ stage: "createUser", sId: zoneCtx.getStore()?.sId ?? -1 });
      return "exists" as const;
    },
    readCharacterRegistration: async (_uid: string, sId: number) => {
      calls.push({ stage: "read-marker", sId });
      // Simulate a user with a ready marker in s1 only.  The marker lookup
      // must use the explicit zone argument rather than ambient/shared state.
      return sId === 1 ? { state: "ready" as const, checkedAtMs: 100 } : null;
    },
    hasCharacter: async (_uid: string, sId: number) => {
      calls.push({ stage: "has-character", sId });
      return false;
    },
    registerCharacterWithRepair: async (_uid: string, sId: number) => {
      calls.push({ stage: "register-character", sId });
    },
    markCharacterRegistrationReady: async (_uid: string, sId: number) => {
      calls.push({ stage: "mark-ready", sId });
    },
    invalidateUserNegcache: async (_uid: string) => {
      calls.push({ stage: "negcache", sId: zoneCtx.getStore()?.sId ?? -1 });
    },
    nowMs: () => 100,
    registrationRecheckMs: 1_000,
  };
  // createUser/invalidateUserNegcache intentionally have no sId parameter in
  // their production ports; read the actual ALS store to catch a missing
  // zoneCtx.run rather than manufacturing the expected zone in the test.
  const run = async (sId: number): Promise<void> => {
    await ensureCharacterWithDependencies("same-user", sId, deps);
  };

  await run(1);
  await run(2);

  assert.deepEqual(calls, [
    { stage: "ensureLive", sId: 1 },
    { stage: "createUser", sId: 1 },
    { stage: "read-marker", sId: 1 },
    { stage: "negcache", sId: 1 },
    { stage: "ensureLive", sId: 2 },
    { stage: "createUser", sId: 2 },
    { stage: "read-marker", sId: 2 },
    { stage: "has-character", sId: 2 },
    { stage: "register-character", sId: 2 },
    { stage: "mark-ready", sId: 2 },
    { stage: "negcache", sId: 2 },
  ]);
});

test("character initializer：过期 ready marker 重新探测外部登记并可自愈", async () => {
  const calls: string[] = [];
  await ensureCharacterWithDependencies("expired-ready", 3, {
    ensureLive: async () => {},
    createUser: async () => "exists",
    readCharacterRegistration: async () => ({ state: "ready", checkedAtMs: 100 }),
    hasCharacter: async () => {
      calls.push("has");
      return false;
    },
    registerCharacterWithRepair: async () => { calls.push("register"); },
    markCharacterRegistrationReady: async (_uid, _sId, checkedAtMs) => {
      calls.push(`mark:${checkedAtMs}`);
    },
    invalidateUserNegcache: async () => { calls.push("negcache"); },
    nowMs: () => 1_101,
    registrationRecheckMs: 1_000,
  });
  assert.deepEqual(calls, ["has", "register", "mark:1101", "negcache"]);
});

test("character initializer：未来/坏时间戳与恰好到期都不得走 ready 快路径", async () => {
  const cases = [
    { name: "future", checkedAtMs: 1_101, nowMs: 1_100 },
    { name: "negative", checkedAtMs: -1, nowMs: 1_100 },
    { name: "unsafe", checkedAtMs: Number.MAX_SAFE_INTEGER + 1, nowMs: 1_100 },
    { name: "boundary", checkedAtMs: 100, nowMs: 1_100 },
  ] as const;

  for (const current of cases) {
    const calls: string[] = [];
    await ensureCharacterWithDependencies(`marker-${current.name}`, 3, {
      ensureLive: async () => {},
      createUser: async () => "exists",
      readCharacterRegistration: async () => ({
        state: "ready" as const,
        checkedAtMs: current.checkedAtMs,
      }),
      hasCharacter: async () => {
        calls.push("has");
        return false;
      },
      registerCharacterWithRepair: async () => { calls.push("register"); },
      markCharacterRegistrationReady: async () => { calls.push("mark"); },
      invalidateUserNegcache: async () => { calls.push("negcache"); },
      nowMs: () => current.nowMs,
      registrationRecheckMs: 1_000,
    });

    assert.deepEqual(
      calls,
      ["has", "register", "mark", "negcache"],
      `${current.name} marker 必须视为过期并重新登记`,
    );
  }
});

test("character ready observes a late underlying rejection and reuses it across reset", async () => {
  const work = deferred<void>();
  const retryWork = deferred<void>();
  let calls = 0;
  const coordinator = new CharacterReadyCoordinator(() => {
    calls++;
    return calls === 1 ? work.promise : retryWork.promise;
  });

  const first = coordinator.ensure("u-reject", 3, 0);
  await assert.rejects(first, /角色初始化超时/);

  // Re-opening admission while the old work is pending must not launch a
  // duplicate initializer.
  coordinator.clear();
  coordinator.reset();
  const second = coordinator.ensure("u-reject", 3, 100);
  assert.equal(calls, 1);

  const rejection = new Error("initializer failed");
  work.reject(rejection);
  await assert.rejects(second, (error: unknown) => error === rejection);

  // The rejection observer removes the settled flight, allowing a later retry.
  const retry = coordinator.ensure("u-reject", 3, 100);
  await Promise.resolve();
  assert.equal(calls, 2);
  retryWork.resolve();
  await retry;
});

test("character ready drain waits for admitted work before dependencies close", async () => {
  const work = deferred<void>();
  let initializerFinished = false;
  const coordinator = new CharacterReadyCoordinator(async () => {
    await work.promise;
    initializerFinished = true;
  });

  const ready = coordinator.ensure("u-drain", 9, 1000);
  const draining = coordinator.drain();
  let drained = false;
  void draining.then(() => { drained = true; });

  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(drained, false, "依赖关闭前必须等待在途 initializer");
  assert.equal(coordinator.isAdmissionOpen(), false);
  await assert.rejects(coordinator.ensure("u-late", 9, 1), CharacterReadyClosedError);

  work.resolve();
  await ready;
  await draining;
  assert.equal(initializerFinished, true);
  assert.equal(drained, true);
});

test("character initializer：WebPlatform 不可用时的有界宽限", async () => {
  const calls: string[] = [];
  const makeDeps = (opts: {
    graceMs: number;
    checkedAtMs: number | null;
    state?: "pending" | "ready" | null;
    error: Error;
  }) => ({
    ensureLive: async () => {},
    createUser: async () => "exists" as const,
    readCharacterRegistration: async () => {
      const state = opts.state ?? "ready";
      return state === "ready" ? { state, checkedAtMs: opts.checkedAtMs } : state;
    },
    hasCharacter: async () => { calls.push("has"); throw opts.error; },
    enqueueCharacterRepairIntent: async () => { calls.push("enqueue"); },
    registerCharacterWithRepair: async () => { calls.push("register"); },
    markCharacterRegistrationReady: async () => { calls.push("mark-ready"); },
    nowMs: () => 10_000,
    // recheck 窗口刻意小于 stale，保证不会走 isFreshReadyMarker 的快路径、一定进探测分支。
    registrationRecheckMs: 1_000,
    registrationGraceMs: opts.graceMs,
    invalidateUserNegcache: async () => { calls.push("negcache"); },
  });
  const unavailable = new WebPlatformUnavailableError("down");

  // 1. 默认 grace=0：行为与历史一致，照旧拒绝。
  calls.length = 0;
  await assert.rejects(
    ensureCharacterWithDependencies("no-grace", 1, makeDeps({ graceMs: 0, checkedAtMs: 9_000, error: unavailable })),
    (error: unknown) => error === unavailable,
  );
  assert.deepEqual(calls, ["has", "enqueue"], "grace=0 必须保持既有拒绝行为");

  // 2. 陈旧在宽限内 + 不可用：放行，且**绝不刷新 checkedAt**。
  calls.length = 0;
  await ensureCharacterWithDependencies("in-grace", 1, makeDeps({ graceMs: 5_000, checkedAtMs: 9_000, error: unavailable }));
  assert.deepEqual(calls, ["has", "enqueue", "negcache"], "宽限放行必须先留 durable repair intent");
  assert.ok(!calls.includes("mark-ready"),
    "⛔ 宽限分支绝不能刷新 checkedAt——否则宽限自我续期成永久信任，等于永久关闭复核");

  // 3. 陈旧超出宽限：仍拒绝（宽限是有界的，不是无限信任）。
  calls.length = 0;
  await assert.rejects(
    ensureCharacterWithDependencies("past-grace", 1, makeDeps({ graceMs: 500, checkedAtMs: 9_000, error: unavailable })),
    (error: unknown) => error === unavailable,
  );
  assert.deepEqual(calls, ["has", "enqueue"], "超出宽限上限必须拒绝");

  // 4. 非 Unavailable（契约/服务身份错误）一律不宽限：它们是配置事故，fail-open 会掩盖部署问题。
  calls.length = 0;
  const contractError = new Error("contract drift");
  await assert.rejects(
    ensureCharacterWithDependencies("wrong-error", 1, makeDeps({ graceMs: 5_000, checkedAtMs: 9_000, error: contractError })),
    (error: unknown) => error === contractError,
  );
  assert.deepEqual(calls, ["has", "enqueue"], "非 Unavailable 错误不得宽限");

  // 5. 没有 marker 的 legacy 档（checkedAtMs 为 null）不得宽限——它从未通过权威复核。
  calls.length = 0;
  await assert.rejects(
    ensureCharacterWithDependencies("no-marker", 1, makeDeps({ graceMs: 5_000, checkedAtMs: null, error: unavailable })),
    (error: unknown) => error === unavailable,
  );
  assert.deepEqual(calls, ["has", "enqueue"], "无 marker 的档不得宽限");
});
