import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AdmissionClosedError,
  beginShutdown,
  defaultLifecycle,
  isAdmissionOpen,
  resetAdmission,
} from "../src/core/infra/lifecycle";
import {
  startStreamDepthAlert,
  stopStreamDepthAlert,
} from "../src/core/match/matchConsumer";

async function cleanLifecycle(): Promise<void> {
  await stopStreamDepthAlert();
  await defaultLifecycle.disposeAll().catch(() => {});
  if (!isAdmissionOpen()) { resetAdmission(); }
  if (defaultLifecycle.isClosed) { defaultLifecycle.reset(); }
}

test("stream depth alert：start/stop 幂等，显式 stop 后可登记新一代", async () => {
  await cleanLifecycle();
  try {
    startStreamDepthAlert();
    startStreamDepthAlert();
    assert.equal(defaultLifecycle.size, 1, "重复 start 只能登记一个 timer");

    await stopStreamDepthAlert();
    await stopStreamDepthAlert();
    assert.equal(defaultLifecycle.size, 0, "重复 stop 后不得残留 lifecycle 登记");

    startStreamDepthAlert();
    assert.equal(defaultLifecycle.size, 1, "重启必须登记新一代 timer");
    await stopStreamDepthAlert();
    assert.equal(defaultLifecycle.size, 0);
  } finally {
    await cleanLifecycle();
  }
});

test("stream depth alert：停服关闸后拒绝重启且不留下资源", async () => {
  await cleanLifecycle();
  beginShutdown();
  try {
    assert.throws(
      () => startStreamDepthAlert(),
      (error: unknown) => error instanceof AdmissionClosedError,
    );
    assert.equal(defaultLifecycle.size, 0);
  } finally {
    resetAdmission();
    await cleanLifecycle();
  }
});
