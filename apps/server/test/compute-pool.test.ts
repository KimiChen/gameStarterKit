/**
 * compute 池单测：worker_threads + tsx 加载 .ts 任务文件的全链路（不需要 Redis/MySQL）。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { destroyPool, runInPool } from "../src/core/compute/pool";
import {
  BATTLE_SIM_MAX_ATTACKER_LEVEL,
  BATTLE_SIM_MAX_ITERATIONS,
  validateBattleSimInput,
  type IBattleSimInput,
  type IBattleSimResult,
} from "../src/core/compute/tasks/battleSim";

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

test("battleSim 输入校验：拒绝非对象、未知字段和非有限/越界数字", () => {
  const invalid: readonly unknown[] = [
    null,
    [],
    { iterations: 1, attackerLevel: 1, extra: true },
    { iterations: Number.NaN, attackerLevel: 1 },
    { iterations: Number.POSITIVE_INFINITY, attackerLevel: 1 },
    { iterations: 1.5, attackerLevel: 1 },
    { iterations: -1, attackerLevel: 1 },
    { iterations: BATTLE_SIM_MAX_ITERATIONS + 1, attackerLevel: 1 },
    { iterations: 1, attackerLevel: 0 },
    { iterations: 1, attackerLevel: 1.5 },
    { iterations: 1, attackerLevel: BATTLE_SIM_MAX_ATTACKER_LEVEL + 1 },
    { iterations: 1, attackerLevel: Number.NaN },
  ];
  for (const value of invalid) {
    assert.throws(() => validateBattleSimInput(value), /battleSim|finite|range/i);
  }
});

test("battleSim 输入校验：保留边界合法值并复制成干净输入", () => {
  const input = { iterations: BATTLE_SIM_MAX_ITERATIONS, attackerLevel: BATTLE_SIM_MAX_ATTACKER_LEVEL };
  const valid = validateBattleSimInput(input);
  assert.deepEqual(valid, input);
  assert.notEqual(valid, input, "校验器应返回副本，避免任务依赖调用方可变对象");
  assert.deepEqual(validateBattleSimInput({ iterations: 0, attackerLevel: 1 }), {
    iterations: 0,
    attackerLevel: 1,
  });
});

test("battleSim worker：非法输入受控 reject，后续合法任务仍完成", async () => {
  await assert.rejects(
    runInPool("battleSim", { iterations: Number.NaN, attackerLevel: 1 }),
    /battleSim\.iterations|finite safe integer/i,
  );
  const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
    iterations: 0,
    attackerLevel: 1,
  });
  assert.deepEqual(result, { iterations: 0, totalDamage: 0 });
});

test("compute admission：运行中 + 排队任务达到总容量时稳定返回 overload", () => {
  // Use a fresh process with a tiny configured capacity.  The first task is
  // synchronously moved to `running` and the second remains queued before the
  // third submission, so this exercises the real admission boundary without
  // depending on worker speed or a long-running fixture task.
  //
  // ⚠ COMPUTE_TASK_TIMEOUT_MS 对本用例是**无关变量**，取多少都不影响结论：三次 runInPool
  // 是同步连续调用，第三次在入口处 `queue.length + running.size >= COMPUTE_QUEUE_CAPACITY`
  // 就同步抛 ComputeOverloadedError，任何定时器都插不进这段同步块。实测把它压到 **1ms**
  // 本用例照样绿。上一版注释在这里写了「它若小于冷启动，first/second 会先超时、third 转为
  // running」——那条因果链不可能发生，而且与上面三行既有注释（"without depending on
  // worker speed"）直接矛盾。⛔ 不要再据此调整该值；真要改容量语义，改的是
  // COMPUTE_QUEUE_CAPACITY。
  const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const script = `
    import { ComputeOverloadedError, destroyPool, runInPool } from "./src/core/compute/pool.ts";
    const first = runInPool("battleSim", { iterations: 0, attackerLevel: 1 });
    const second = runInPool("battleSim", { iterations: 0, attackerLevel: 1 });
    let overloaded = false;
    try { await runInPool("battleSim", { iterations: 0, attackerLevel: 1 }); }
    catch (error) { overloaded = error instanceof ComputeOverloadedError; }
    await Promise.allSettled([first, second]);
    await destroyPool();
    if (!overloaded) { throw new Error("expected ComputeOverloadedError"); }
    console.log("compute-overload-ok");
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        COMPUTE_POOL_SIZE: "1",
        COMPUTE_QUEUE_CAPACITY: "2",
        COMPUTE_TASK_TIMEOUT_MS: "5000",
      },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, `饱和子进程失败：${result.stderr.slice(0, 500)}`);
  assert.match(result.stdout, /compute-overload-ok/);
});
