import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  AdmissionClosedError,
  beginShutdown,
  defaultLifecycle,
  isAdmissionOpen,
  resetAdmission,
} from "../src/core/infra/lifecycle";
import { startInfraMonitors } from "../src/core/infra/loopMonitor";
import { closeMysql, getPool } from "../src/core/infra/mysql";

/**
 * The monitor owns a process-global lifecycle slot.  Leave every test at an
 * explicit open/empty boundary so this file remains deterministic when it is
 * run after another lifecycle probe in the same worker.
 */
async function cleanLifecycle(): Promise<void> {
  await defaultLifecycle.disposeAll().catch(() => {});
  if (!isAdmissionOpen()) { resetAdmission(); }
  if (defaultLifecycle.isClosed) { defaultLifecycle.reset(); }
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) { assert.fail(message); }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

test("loop monitor：重复 start 共享句柄，stop 幂等并注销生命周期登记", async () => {
  await cleanLifecycle();

  const first = startInfraMonitors(60_000);
  const second = startInfraMonitors(60_000);
  assert.strictEqual(second, first, "重复启动不得创建第二个 timer/histogram");
  assert.equal(defaultLifecycle.size, 1);

  await first();
  await first();
  assert.equal(defaultLifecycle.size, 0);
  assert.equal(defaultLifecycle.isClosed, false);
  await cleanLifecycle();
});

test("loop monitor：registry dispose 后显式重开 admission 可启动新一代监控", async () => {
  await cleanLifecycle();

  const first = startInfraMonitors(60_000);
  beginShutdown();
  await defaultLifecycle.disposeAll();
  assert.equal(defaultLifecycle.isClosed, true);
  assert.equal(defaultLifecycle.size, 0);

  // A completed production shutdown is terminal.  Embedded/test restarts must
  // explicitly reopen the process gate before a new monitor generation starts.
  resetAdmission();
  const second = startInfraMonitors(60_000);
  assert.notStrictEqual(second, first);
  assert.equal(defaultLifecycle.size, 1, "重启必须重新登记 stop，而非被旧 registry 静默释放");

  await second();
  await cleanLifecycle();
});

test("loop monitor：停服 admission 关闭时拒绝启动且不留下资源", async () => {
  await cleanLifecycle();
  beginShutdown();

  assert.throws(
    () => startInfraMonitors(1),
    (error: unknown) => error instanceof AdmissionClosedError,
  );
  assert.equal(defaultLifecycle.size, 0);

  // Restore the embedded test process boundary for later server tests.
  resetAdmission();
  await cleanLifecycle();
});

test("loop monitor：stop 移除 MySQL enqueue listener，重启只挂当前一代", async () => {
  await cleanLifecycle();
  await closeMysql();
  const emitter = getPool().pool as unknown as EventEmitter;
  const baseline = emitter.listenerCount("enqueue");
  let stop: (() => Promise<void>) | null = null;

  try {
    stop = startInfraMonitors(5);
    await waitUntil(
      () => emitter.listenerCount("enqueue") === baseline + 1,
      "监控首个 interval 后应挂上 MySQL enqueue listener",
    );

    await stop();
    stop = null;
    assert.equal(emitter.listenerCount("enqueue"), baseline, "stop 必须移除本代 enqueue listener");

    stop = startInfraMonitors(5);
    await waitUntil(
      () => emitter.listenerCount("enqueue") === baseline + 1,
      "重启后应挂上且只挂一个新 listener",
    );
    assert.equal(emitter.listenerCount("enqueue"), baseline + 1);

    await stop();
    stop = null;
    assert.equal(emitter.listenerCount("enqueue"), baseline, "第二代 stop 也不得残留 listener");
  } finally {
    await stop?.();
    await closeMysql();
    await cleanLifecycle();
  }
});
