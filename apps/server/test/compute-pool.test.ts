/**
 * compute 池单测：worker_threads + tsx 加载 .ts 任务文件的全链路（不需要 Redis/MySQL）。
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { destroyPool, runInPool } from "../src/core/compute/pool";
import type { IBattleSimInput, IBattleSimResult } from "../src/core/compute/tasks/battleSim";

after(async () => { await destroyPool(); });

test("battleSim 任务 roundtrip（shared 公式在 worker 线程内可用）", async () => {
  const r = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", { iterations: 1000, attackerLevel: 5 });
  assert.equal(r.iterations, 1000);
  assert.ok(r.totalDamage > 0, "共享公式应算出正伤害");
});

test("并发任务分派（多于池大小的任务全部完成且互不串结果）", async () => {
  const jobs = [100, 200, 300, 400, 500].map((n) =>
    runInPool<IBattleSimInput, IBattleSimResult>("battleSim", { iterations: n, attackerLevel: 1 })
      .then((r) => { assert.equal(r.iterations, n); return r; }));
  const rs = await Promise.all(jobs);
  assert.equal(rs.length, 5);
});

test("未知任务名：错误传播为 reject（不炸 worker 池）", async () => {
  await assert.rejects(runInPool("noSuchTask", {}), /noSuchTask|找不到|Cannot find|缺少/i);
  // 池仍可用
  const r = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", { iterations: 10, attackerLevel: 1 });
  assert.equal(r.iterations, 10);
});
