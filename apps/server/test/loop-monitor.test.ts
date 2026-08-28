import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AdmissionClosedError,
  beginShutdown,
  defaultLifecycle,
  isAdmissionOpen,
  resetAdmission,
} from "../src/core/infra/lifecycle";
import { startInfraMonitors } from "../src/core/infra/loopMonitor";

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
