/**
 * P2-02 风险加权故障/变异测试。
 *
 * 这些用例刻意从已知高风险边界构造「一处变异」：extra key、null/NaN、越界
 * 数值、未知枚举和不可 structured-clone 的输入。每个变异都必须在进入领域
 * 状态或 transport 前失败；测试同时覆盖 worker 失败后的池恢复。用例保持无头，
 * 不依赖 Redis/MySQL，因而可作为每次提交的快速故障闸。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  C2S,
  S2C,
  UserRpc,
  LobbyPush,
  validateC2SPayload,
  validateEffect,
  validateLobbyPush,
  validateLobbyRpcRequest,
  validateRpcEnvelope,
  validateRpcReply,
  validateS2CPayload,
  WireValidationError,
} from "@game/shared";
import { destroyPool, runInPool } from "../src/core/compute/pool";
import type { IBattleSimInput, IBattleSimResult } from "../src/core/compute/tasks/battleSim";
import { LifecycleRegistry } from "../src/core/infra/lifecycle";
import { CharacterReadyCoordinator } from "../src/player/character";
import { exerciseFaultPoint } from "./faultMatrix";

type MutationCase = {
  readonly id: string;
  readonly validate: (value: unknown) => unknown;
  readonly value: unknown;
};

const validEffect = {
  schemaVersion: 1,
  grants: [{ kind: "item", itemId: 7, count: 1 }],
};

const mutationCases: readonly MutationCase[] = [
  {
    id: "rpc.extra-key",
    validate: validateRpcEnvelope,
    value: { id: "r1", type: "user.getInfo", payload: {}, extra: true },
  },
  {
    id: "rpc.null-payload",
    validate: (value) => validateLobbyRpcRequest(UserRpc.GetInfo, value),
    value: { id: "r1", type: "user.getInfo", payload: null },
  },
  {
    id: "rpc.reply-data-and-error",
    validate: validateRpcReply,
    value: { id: "r1", ok: true, data: {}, err: { code: "INTERNAL", msg: "x" } },
  },
  {
    id: "c2s.nan-move",
    validate: (value) => validateC2SPayload(C2S.Move, value),
    value: { dirX: Number.NaN, dirY: 0 },
  },
  {
    id: "c2s.extra-key",
    validate: (value) => validateC2SPayload(C2S.Chat, value),
    value: { text: "hello", admin: true },
  },
  {
    id: "s2c.infinity-pong",
    validate: (value) => validateS2CPayload(S2C.Pong, value),
    value: { clientTime: 1, serverTime: Number.POSITIVE_INFINITY },
  },
  {
    id: "push.unknown-type",
    validate: validateLobbyPush,
    value: { type: "future.admin", data: {} },
  },
  {
    id: "push.extra-key",
    validate: validateLobbyPush,
    value: { type: LobbyPush.MailNew, data: { mailId: 1, body: "unexpected" } },
  },
  {
    id: "effect.unknown-kind",
    validate: validateEffect,
    value: { ...validEffect, grants: [...validEffect.grants, { kind: "gold", count: 1 }] },
  },
  {
    id: "effect.reserved-field",
    validate: validateEffect,
    value: { ...validEffect, grants: [{ kind: "setField", field: "uid", value: "attacker" }] },
  },
  {
    id: "effect.zero-count",
    validate: validateEffect,
    value: { ...validEffect, grants: [{ kind: "item", itemId: 7, count: 0 }] },
  },
  {
    id: "effect.nan-delta",
    validate: validateEffect,
    value: { ...validEffect, grants: [{ kind: "star", delta: Number.NaN }] },
  },
];

test("fault-matrix 子进程收到显式组与故障点配置", () => {
  if (process.env.FAULT_MATRIX !== "1") return;
  assert.match(process.env.FAULT_MATRIX_GROUP ?? "", /^[a-z0-9][a-z0-9-]*$/);
  assert.match(process.env.FAULT_MATRIX_KIND ?? "", /^(unit|integration)$/);
  const points = (process.env.FAULT_MATRIX_FAULT_POINTS ?? "").split(",").filter(Boolean);
  assert.ok(points.length > 0, "fault-matrix 必须向测试传递至少一个 fault point");
  assert.equal(process.env.FAULT_MATRIX_INTEGRATION, "0", "unit 组不得误标成 integration");
});

test("风险加权 wire/effect 变异：每个单点变异均 fail-closed", async () => {
  await exerciseFaultPoint("wire-mutation", () => {
    for (const mutation of mutationCases) {
      assert.throws(
        () => mutation.validate(mutation.value),
        (error: unknown) => error instanceof WireValidationError || error instanceof Error,
        `${mutation.id} 必须拒绝变异输入`,
      );
    }
  });
});

test("故障注入：compute structured-clone 失败后健康 worker 仍可复用", async () => {
  // postMessage 的 DataCloneError 发生在 worker 之前；pool 必须归还健康 worker，
  // 不能把异常冒进为 uncaught exception，也不能让下一项任务永久排队。
  await assert.rejects(runInPool("battleSim", (() => "not-cloneable") as unknown as IBattleSimInput));
  const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
    iterations: 8,
    attackerLevel: 1,
  });
  assert.equal(result.iterations, 8);
});

test("故障注入：真实 worker error/exit 会 reap 并退避补位", async () => {
  await exerciseFaultPoint("worker-replacement", () => {
    const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const faultWorkerSource = `
      import { parentPort, workerData } from "node:worker_threads";
      parentPort.once("message", () => {
        if (workerData.mode === "error") {
          throw new Error("injected compute worker error");
        }
        process.exit(23);
      });
    `;
    const script = `
      import assert from "node:assert/strict";
      import { Worker } from "node:worker_threads";
      import { _computePoolTestHooks, destroyPool, runInPool } from "./src/core/compute/pool.ts";

      const source = ${JSON.stringify(faultWorkerSource)};
      // ⚠ 退避值必须从被验实现自己读，⛔ 不能写死 1000：COMPUTE_RESPAWN_DELAY_MS 现在是可配置的，
      // 外部环境里设了它（合法生产配置）就会让「delay === 1000」一条也钩不到，用例假红成
      // 「must schedule a replacement timer」——那是夹具坏了，不是产品坏了。
      const RESPAWN_MS = Number(process.env.COMPUTE_RESPAWN_DELAY_MS ?? 1000);
      const nativeSetTimeout = globalThis.setTimeout;
      const respawnTimers = [];
      globalThis.setTimeout = (callback, delay, ...args) => {
        const timer = nativeSetTimeout(callback, delay, ...args);
        if (delay === RESPAWN_MS) respawnTimers.push(timer);
        return timer;
      };

      async function exercise(mode) {
        await destroyPool();
        let spawnCount = 0;
        _computePoolTestHooks.setWorkerFactory((createDefaultWorker) => {
          spawnCount += 1;
          return spawnCount === 1
            ? new Worker(new URL("data:text/javascript," + encodeURIComponent(source)), {
                workerData: { mode },
                // ⚠ 注入的故障 worker 是**纯 JavaScript**，不需要 tsx loader。默认继承父进程
                // execArgv 会让每个这样的 worker 在自己线程里再跑一遍 tsx 引导——实测 8 核满载下
                // 冷启动 113–154ms vs 18–31ms（5–6×），极端并发下被放大到秒级，正是本文件
                // 三轮 flaky 的共同放大器。⛔ 不要删掉 execArgv：worker 只做 exit/throw，
                // 它不影响被验行为，只把无关的 loader 成本从计时窗口里拿掉。
                execArgv: [],
              })
            : createDefaultWorker();
        });

        // Pool size is one in this child.  Queue recovery before the first worker
        // dies, so only reap's delayed respawn can dispatch the second job.
        const startedAt = performance.now();
        const crashed = runInPool("battleSim", { iterations: 1, attackerLevel: 1 });
        const recovery = runInPool("battleSim", { iterations: 7, attackerLevel: 2 });
        if (mode === "error") {
          await assert.rejects(crashed, /injected compute worker error/);
        } else {
          await assert.rejects(crashed, /compute worker .*code=23/);
        }
        const respawnTimer = respawnTimers.at(-1);
        assert.ok(respawnTimer, mode + " must schedule a replacement timer");
        assert.equal(respawnTimer.hasRef(), true, "queued recovery must keep respawn alive");
        const result = await recovery;
        assert.equal(result.iterations, 7);
        assert.equal(spawnCount, 2, mode + " must create exactly one replacement worker");
        assert.ok(
          performance.now() - startedAt >= RESPAWN_MS * 0.9,
          mode + " replacement must preserve the respawn backoff (" + RESPAWN_MS + "ms)",
        );

        await destroyPool();
        _computePoolTestHooks.setWorkerFactory(null);
      }

      async function exerciseLateQueue() {
        await destroyPool();
        let spawnCount = 0;
        _computePoolTestHooks.setWorkerFactory((createDefaultWorker) => {
          spawnCount += 1;
          return spawnCount === 1
            ? new Worker(new URL("data:text/javascript," + encodeURIComponent(source)), {
                workerData: { mode: "error" },
                execArgv: [], // 同上：纯 JS 故障 worker 不需要 tsx loader
              })
            : createDefaultWorker();
        });

        const crashed = runInPool("battleSim", { iterations: 1, attackerLevel: 1 });
        await assert.rejects(crashed, /injected compute worker error/);
        const respawnTimer = respawnTimers.at(-1);
        assert.ok(respawnTimer, "idle failure must schedule a replacement timer");
        assert.equal(respawnTimer.hasRef(), false, "idle replacement must not keep the process alive");

        const queuedAt = performance.now();
        const recovery = runInPool("battleSim", { iterations: 9, attackerLevel: 2 });
        assert.equal(spawnCount, 1, "late queue must not bypass an already scheduled backoff");
        assert.equal(respawnTimer.hasRef(), true, "late queue must re-ref the existing respawn timer");
        const result = await recovery;
        assert.equal(result.iterations, 9);
        assert.equal(spawnCount, 2);
        assert.ok(
          performance.now() - queuedAt >= RESPAWN_MS * 0.9,
          "late queue must wait for the original backoff (" + RESPAWN_MS + "ms)",
        );

        await destroyPool();
        _computePoolTestHooks.setWorkerFactory(null);
      }

      await exercise("error");
      await exercise("exit");
      await exerciseLateQueue();
      console.log("compute-worker-lifecycle-ok");
    `;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          COMPUTE_POOL_SIZE: "1",
          COMPUTE_QUEUE_CAPACITY: "4",
          // ⚠ 本子进程**不测超时**，它测的是「崩溃 → 退避 → 替补 → 恢复任务完成」。
          // 而 recovery 的超时预算必须覆盖「1s 退避 + 替补 worker 冷启动（tsx 进程里编译启动）
          // + 执行」——原值 5000ms 在负载下不够，replacement 还没起来 recovery 就超时了，
          // 表现为「compute 任务超时（5000ms）」。⛔ 不要为了跑得快再把它调小：
          // 这里没有任何断言依赖超时发生，取生产默认量级即可。
          COMPUTE_TASK_TIMEOUT_MS: "30000",
          // ⛔ 必须显式钉住：不钉就会继承外部环境的值，而本段的退避断言依赖它
          COMPUTE_RESPAWN_DELAY_MS: "1000",
        },
        encoding: "utf8",
        timeout: 90_000,
      },
    );
    assert.equal(
      result.status,
      0,
      `worker 生命周期故障子进程失败：${result.error?.message ?? result.stderr.slice(0, 1000)}`,
    );
    assert.match(result.stdout, /compute-worker-lifecycle-ok/);

    // ⚠ 本子进程曾是 flaky 的根源：本段要在**崩溃-重生**场景里覆盖「排队超时」分支，就必须让
    // 任务超时 < respawn 退避（否则排队任务会等到替补 worker 而永不超时——生产默认正是这个反向
    // 排序，见 config 注释）。⛔ 这不等于该分支只在此排序下可达：worker 被长任务占满同样会走到它。
    // 而当初两者是 250ms / 1000ms——**同一个 250ms 预算**
    // 还得覆盖注入 worker 的冷启动（data: URL 模块在 tsx 进程里编译 + 启动）。机器一忙，冷启动
    // 就超过 250ms，第一段的 `code=23` 断言会拿到「任务超时」而红。实测：单跑 3/3 绿，
    // 全量套件里约 1/3 概率红。
    // 修法是把两者的间距拉开而不是各自微调。⚠ 当前取值与余量只写在下面 env 块那一处
    // （见 `COMPUTE_TASK_TIMEOUT_MS` / `COMPUTE_RESPAWN_DELAY_MS` 的赋值与其上方注释），
    // ⛔ 这里**不重复具体数字**：上一版在这里抄了一份「respawn 4s、任务超时 1.2s、×4.8、余量 2.8s」，
    // 89eebb4 改了 env 却没改这段，于是同一文件对同两个变量给出两套互斥数字，
    // 而承载病史与禁令的偏偏是过期的那份。数字只留一处，才不会再分叉。
    const timeoutScript = `
      import assert from "node:assert/strict";
      import { Worker } from "node:worker_threads";
      import { _computePoolTestHooks, runInPool } from "./src/core/compute/pool.ts";

      const source = ${JSON.stringify(faultWorkerSource)};
      const nativeSetTimeout = globalThis.setTimeout;
      const respawnTimers = [];
      globalThis.setTimeout = (callback, delay, ...args) => {
        const timer = nativeSetTimeout(callback, delay, ...args);
        if (delay === Number(process.env.COMPUTE_RESPAWN_DELAY_MS ?? 1000)) respawnTimers.push(timer);
        return timer;
      };

      let spawnCount = 0;
      _computePoolTestHooks.setWorkerFactory((createDefaultWorker) => {
        spawnCount += 1;
        return spawnCount === 1
          ? new Worker(new URL("data:text/javascript," + encodeURIComponent(source)), {
              workerData: { mode: "exit" },
              execArgv: [], // 同上：纯 JS 故障 worker 不需要 tsx loader
            })
          : createDefaultWorker();
      });

      await assert.rejects(
        runInPool("battleSim", { iterations: 1, attackerLevel: 1 }),
        /compute worker .*code=23/,
      );
      const respawnTimer = respawnTimers.at(-1);
      assert.ok(respawnTimer);
      assert.equal(respawnTimer.hasRef(), false);

      const queued = runInPool("battleSim", { iterations: 5, attackerLevel: 1 });
      assert.equal(spawnCount, 1, "queued task must reserve the delayed replacement");
      assert.equal(respawnTimer.hasRef(), true);
      await assert.rejects(queued, /compute 任务排队超时/);
      assert.equal(respawnTimer.hasRef(), false, "empty queue must unref the delayed replacement");
      console.log("compute-worker-timeout-unref-ok");
    `;
    const timeoutResult = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", timeoutScript],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          COMPUTE_POOL_SIZE: "1",
          COMPUTE_QUEUE_CAPACITY: "4",
          // 成对设置，⛔ 只改一个会让本场景走不到排队超时，或让冷启动重新变成竞态。
          //
          // ⚠ 预算取值不追求「刚好够」：注入 worker 冷启动的实测峰值两方测得差一个数量级
          // （本机 8 核满载 174ms；第二十一轮复核记录的是 1142ms），机器差异就能把「刚好够」
          // 变成「刚好不够」。所以按**较大的那个测量值再留倍数**取 2500ms——对 1142ms 是 2.2×、
          // 对 174ms 是 14×，谁的测量对都不影响结论。⛔ 不要因为「本机跑得过」再把它调回贴边值。
          // respawn 同步抬到 8000 以保持 任务超时 < 退避 这个本场景必需的次序（余量 5.5s）。
          COMPUTE_TASK_TIMEOUT_MS: "2500",
          COMPUTE_RESPAWN_DELAY_MS: "8000",
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    assert.equal(
      timeoutResult.status,
      0,
      `worker 排队超时子进程失败：${timeoutResult.error?.message ?? timeoutResult.stderr.slice(0, 1000)}`,
    );
    assert.match(timeoutResult.stdout, /compute-worker-timeout-unref-ok/);
  });
});

test("故障注入：任务异常是受控 reject，后续任务继续完成", async () => {
  await assert.rejects(runInPool("definitely-missing-task", {}));
  const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
    iterations: 3,
    attackerLevel: 2,
  });
  assert.equal(result.iterations, 3);
});

test("故障收尾：destroyPool 可等待并允许下一轮重建", async () => {
  await destroyPool();
  const result = await runInPool<IBattleSimInput, IBattleSimResult>("battleSim", {
    iterations: 1,
    attackerLevel: 1,
  });
  assert.equal(result.iterations, 1);
  await destroyPool();
});

test("故障注入：character ready deferred 超时不释放底层 flight", async () => {
  await exerciseFaultPoint("character-ready-deferred", async () => {
    let release!: () => void;
    const work = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = new CharacterReadyCoordinator(() => work);

    // A zero caller budget deterministically exercises the timeout branch while
    // the underlying initializer remains owned by the coordinator.
    await assert.rejects(
      coordinator.ensure("fault-ready", 7, 0),
      /角色初始化超时 uid=fault-ready sId=7/,
    );
    release();
    await coordinator.ensure("fault-ready", 7, 100);
    await coordinator.drain();
  });
});

test("故障注入：lifecycle 启动半失败仍释放其余资源", async () => {
  await exerciseFaultPoint("lifecycle-startup-half-failure", async () => {
    const registry = new LifecycleRegistry();
    const released: string[] = [];
    registry.register("healthy", () => { released.push("healthy"); });
    registry.register("broken", () => {
      released.push("broken");
      throw new Error("injected startup failure");
    });
    await assert.rejects(registry.disposeAll(), AggregateError);
    assert.deepEqual(released, ["broken", "healthy"]);
    assert.equal(registry.size, 0);
  });
});
