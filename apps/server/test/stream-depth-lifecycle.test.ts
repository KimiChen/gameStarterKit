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
  K_STREAM_MATCH,
  K_STREAM_MATCH_V2,
  K_STREAM_MATCH_V3,
} from "../src/core/infra/keys";
import {
  runMatchStreamDepthCheck,
  startStreamDepthAlert,
  stopStreamDepthAlert,
  type MatchStreamDepthProbe,
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

test("stream depth alert：各来源与 quarantine 故障独立告警，不能被统一 catch 吞掉", async () => {
  const reports: string[] = [];
  const sourceCalls: string[] = [];
  const probe: MatchStreamDepthProbe = {
    sourceBacklog: async (streamKey) => {
      sourceCalls.push(streamKey);
      if (streamKey === K_STREAM_MATCH) throw new Error("WRONGTYPE legacy");
      if (streamKey === K_STREAM_MATCH_V3) throw new Error("NOPERM v3");
      assert.equal(streamKey, K_STREAM_MATCH_V2);
      return { backlog: 1001, xlen: 1002 };
    },
    quarantineDepth: async () => { throw new Error("NOPERM quarantine"); },
    report: (message) => { reports.push(message); },
  };

  await runMatchStreamDepthCheck(probe);
  assert.deepEqual(
    sourceCalls,
    [K_STREAM_MATCH, K_STREAM_MATCH_V2, K_STREAM_MATCH_V3],
    "必须逐一探测三个精确来源 key",
  );
  assert.equal(reports.length, 4);
  assert.ok(reports.some((message) => message.includes("WRONGTYPE legacy")));
  assert.ok(reports.some((message) => message.includes("未处理深度 1001")));
  assert.ok(reports.some((message) => message.includes("NOPERM v3")));
  assert.ok(reports.some((message) => message.includes("NOPERM quarantine")));

  reports.length = 0;
  await runMatchStreamDepthCheck({
    sourceBacklog: async () => ({ backlog: 0, xlen: 0 }),
    quarantineDepth: async () => 2,
    report: (message) => { reports.push(message); },
  });
  assert.equal(reports.length, 1);
  assert.match(reports[0], /quarantine 有 2 条待人工修复/);
});
