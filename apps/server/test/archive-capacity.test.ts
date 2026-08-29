import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolConnection } from "../src/core/infra/mysql";
import {
  memoryPressureAllowsFreeze,
  parseRedisMemoryInfo,
  projectArchiveUsage,
  utf8SnapshotBytes,
} from "../src/core/archive/capacity";
import { planArchiveAdmission, writeArchiveUsage } from "../src/core/archive/usageLedger";

test("Redis INFO MEMORY 严格解析并按阈值判定", () => {
  const info = "# Memory\r\nused_memory:600\r\nmaxmemory:1000\r\nused_memory_human:600B\r\n";
  assert.deepEqual(parseRedisMemoryInfo(info), { usedBytes: 600, maxBytes: 1000 });
  assert.equal(memoryPressureAllowsFreeze(info, 0.6), true, "等于阈值允许冻结");
  assert.equal(memoryPressureAllowsFreeze(info, 0.6001), false);
  assert.equal(memoryPressureAllowsFreeze("used_memory:1\r\nmaxmemory:0\r\n", 0.6), false);
});

test("Redis INFO MEMORY 缺失、重复或畸形时 fail-closed", () => {
  for (const bad of [
    "",
    "used_memory:1\r\n",
    "maxmemory:2\r\n",
    "used_memory:1x\r\nmaxmemory:2\r\n",
    "used_memory:-1\r\nmaxmemory:2\r\n",
    "used_memory:1\r\nused_memory:2\r\nmaxmemory:3\r\n",
  ]) {
    assert.throws(() => parseRedisMemoryInfo(bad), /Redis INFO MEMORY/);
  }
  for (const threshold of [0, -1, 1.01, Number.NaN]) {
    assert.throws(
      () => memoryPressureAllowsFreeze("used_memory:1\r\nmaxmemory:2\r\n", threshold),
      /high watermark/,
    );
  }
});

test("snapshot 使用 UTF-8 字节数，容量投影正确处理新增与替换", () => {
  assert.equal(utf8SnapshotBytes("abc"), 3);
  assert.equal(utf8SnapshotBytes("中"), 3);
  assert.deepEqual(projectArchiveUsage({ rows: 2, bytes: 100 }, 40, null, 3, 140), {
    rows: 3, bytes: 140, allowed: true,
  });
  assert.deepEqual(projectArchiveUsage({ rows: 2, bytes: 100 }, 60, 30, 2, 129), {
    rows: 2, bytes: 130, allowed: false,
  });
  assert.throws(() => projectArchiveUsage({ rows: 0, bytes: 0 }, 1, 0, 1, 1), /usage 不一致/);
});

test("ledger 连续 admission 与 replacement 都走 O(1) 增量，不触发全区聚合", async () => {
  let usage = { rows: 0, bytes: 0 };
  let refreshes = 0;
  const refresh = async () => { refreshes++; return usage; };
  for (const incomingBytes of [10, 20, 30]) {
    const admission = await planArchiveAdmission(usage, incomingBytes, null, 10, 1000, refresh);
    assert.equal(admission.projection.allowed, true);
    usage = admission.projection;
  }
  const replacement = await planArchiveAdmission(usage, 50, 20, 10, 1000, refresh);
  assert.deepEqual(replacement.projection, { rows: 3, bytes: 90, allowed: true });
  assert.equal(refreshes, 0, "成功插入/替换不得重复 COUNT+SUM 全区聚合");
});

test("ledger 拒绝时精确刷新，可识别外部删除释放的容量", async () => {
  let refreshes = 0;
  const admission = await planArchiveAdmission(
    { rows: 2, bytes: 200 },
    50,
    null,
    2,
    250,
    async () => { refreshes++; return { rows: 1, bytes: 100 }; },
  );
  assert.equal(refreshes, 1);
  assert.equal(admission.refreshed, true);
  assert.deepEqual(admission.projection, { rows: 2, bytes: 150, allowed: true });
});

test("writeArchiveUsage affectedRows=0 仅在锁内回读值完全匹配时视为成功", async () => {
  const matching = {
    execute: async () => [{ affectedRows: 0 }],
    query: async () => [[{ row_count: "2", byte_count: "30" }]],
  } as unknown as PoolConnection;
  await writeArchiveUsage(matching, 7, { rows: 2, bytes: 30 });

  for (const rows of [[], [{ row_count: "2", byte_count: "31" }]]) {
    const mismatch = {
      execute: async () => [{ affectedRows: 0 }],
      query: async () => [rows],
    } as unknown as PoolConnection;
    await assert.rejects(
      writeArchiveUsage(mismatch, 7, { rows: 2, bytes: 30 }),
      /archive_zone_usage 更新行数异常/,
    );
  }
});
