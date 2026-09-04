/**
 * FeatureHost 状态机（Non-intrusive §7.2 阶段 5b）：生产 feature 只有 built-in
 * （常驻），全状态机由 fixture feature 驱动——并发加载合流、install 失败回滚、
 * failed 两条出路（显式 launch 重回 loading / 自动重试上限后 disabled 且随
 * app generation 复位）、dispose 幂等按安装逆序、route refcount 停用与常驻豁免。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FeatureHost,
  type FeatureInstallContext,
  type FeatureModule,
} from "../src/app/FeatureHost";
import type { AppPorts } from "../src/app/ports";

const ports = {} as AppPorts;

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

test("launch：并发加载同一 feature 合流为同一个 Promise，install 完成后 active", async () => {
  const gate = deferred<void>();
  let loads = 0;
  let installs = 0;
  const host = new FeatureHost([
    {
      id: "fx",
      load: async (): Promise<FeatureModule> => {
        loads++;
        await gate.promise;
        return { install: () => { installs++; } };
      },
    },
  ], { ports, appGeneration: 1 });

  const first = host.launch("fx");
  const second = host.launch("fx");
  assert.equal(host.statusOf("fx"), "loading");
  gate.resolve(undefined);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, "active");
  assert.equal(b, "active");
  assert.equal(loads, 1, "并发 launch 必须合流：只加载一次");
  assert.equal(installs, 1);
  assert.equal(host.statusOf("fx"), "active");
  assert.equal(await host.launch("fx"), "active", "active 后 launch 幂等");
  assert.equal(loads, 1);
});

test("install 失败：只回滚 scope/disposer（逆序），进入 failed 并保留错误", async () => {
  const rollback: string[] = [];
  let scopeSignal: AbortSignal | null = null;
  const boom = new Error("install exploded");
  const host = new FeatureHost([
    {
      id: "fx",
      load: (): FeatureModule => ({
        install: (context: FeatureInstallContext) => {
          scopeSignal = context.signal;
          context.own(() => rollback.push("first"));
          context.own(() => rollback.push("second"));
          throw boom;
        },
      }),
    },
  ], { ports, appGeneration: 1 });

  assert.equal(await host.launch("fx"), "failed");
  assert.equal(host.statusOf("fx"), "failed");
  assert.equal(host.lastErrorOf("fx"), boom, "failed 必须保留原始错误供入口叠加层展示");
  assert.deepEqual(rollback, ["second", "first"], "install 回滚必须按登记逆序");
  assert.equal(scopeSignal!.aborted, true, "install 失败必须 abort feature scope");
});

test("failed 两条出路：显式 launch 重回 loading；自动重试上限后 disabled(app-generation) 复位", async () => {
  let attempts = 0;
  let shouldFail = true;
  const host = new FeatureHost([
    {
      id: "fx",
      load: (): FeatureModule => ({
        install: () => {
          attempts++;
          if (shouldFail) throw new Error(`attempt ${attempts}`);
        },
      }),
    },
  ], { ports, appGeneration: 1, maxAutoRetries: 2 });

  assert.equal(await host.launch("fx"), "failed");
  // 自动重试（非用户意图）计数：上限 2 → 第三次自动 launch 直接 disabled。
  assert.equal(await host.launch("fx"), "failed");
  assert.equal(await host.launch("fx"), "failed");
  assert.equal(await host.launch("fx"), "disabled",
    "自动重试超限必须置 disabled，⛔ 不允许静默无限重试");
  assert.equal(host.statusOf("fx"), "disabled");
  assert.equal(await host.launch("fx", { userIntent: true }), "disabled",
    "disabled(app-generation) 在同一 app generation 内不可复活");

  // 下一个 app generation 复位 disabled 与重试计数。
  host.noteAppGeneration(2);
  assert.equal(host.statusOf("fx"), "unloaded");
  shouldFail = false;
  assert.equal(await host.launch("fx"), "active", "换代后 launch 恢复可用");

  // 显式用户意图从 failed 直接回 loading（不计入自动重试）。
  host.noteAppGeneration(3);
  const explicitHost = new FeatureHost([
    {
      id: "fy",
      load: (): FeatureModule => ({
        install: () => {
          if (shouldFailExplicit) throw new Error("fy failed");
        },
      }),
    },
  ], { ports, appGeneration: 1, maxAutoRetries: 0 });
  let shouldFailExplicit = true;
  assert.equal(await explicitHost.launch("fy"), "failed");
  shouldFailExplicit = false;
  assert.equal(await explicitHost.launch("fy", { userIntent: true }), "active",
    "显式用户意图必须允许 failed → loading，即使自动重试上限为 0");
});

test("dependencies：launch 先装依赖（顺序 = 声明序），依赖失败则本 feature failed 且不装；dispose 依赖方先拆", async () => {
  const installed: string[] = [];
  const disposed: string[] = [];
  let baseFails = false;
  const makeFeature = (id: string, dependencies: readonly string[] = []) => ({
    id,
    dependencies,
    load: (): FeatureModule => ({
      install: () => {
        if (id === "base" && baseFails) throw new Error("base install failed");
        installed.push(id);
      },
      dispose: () => { disposed.push(id); },
    }),
  });
  const host = new FeatureHost([
    makeFeature("top", ["mid", "base"]),
    makeFeature("mid", ["base"]),
    makeFeature("base"),
    { id: "orphan", dependencies: ["nowhere"], load: (): FeatureModule => ({ install: () => { installed.push("orphan"); } }) },
  ], { ports, appGeneration: 1 });

  assert.equal(await host.launch("top"), "active");
  assert.deepEqual(installed, ["base", "mid", "top"], "依赖先装：base → mid → top（重复依赖只装一次）");
  for (const id of ["base", "mid", "top"]) assert.equal(host.statusOf(id), "active");
  await host.disposeAll();
  assert.deepEqual(disposed, ["top", "mid", "base"], "拆除按安装完成逆序：依赖方先拆");

  // 依赖失败：本 feature failed 且自己的 install ⛔ 不执行；错误点名依赖。
  baseFails = true;
  installed.splice(0);
  assert.equal(await host.launch("mid", { userIntent: true }), "failed");
  assert.equal(host.statusOf("base"), "failed");
  assert.equal(host.statusOf("mid"), "failed");
  assert.deepEqual(installed, [], "依赖失败时依赖方的 install 不得执行");
  assert.match(String(host.lastErrorOf("mid")), /依赖 base 不可用/u);

  // 未托管的依赖：failed 并点名（⛔ 不静默跳过）。
  assert.equal(await host.launch("orphan"), "failed");
  assert.match(String(host.lastErrorOf("orphan")), /依赖 nowhere 未托管/u);
  assert.deepEqual(installed, []);
});

test("dispose：按安装完成逆序执行且幂等；releaseIfIdle 常驻豁免、refcount 归零停用", async () => {
  const disposed: string[] = [];
  const makeFeature = (id: string) => ({
    id,
    load: (): FeatureModule => ({
      install: () => {},
      dispose: () => { disposed.push(id); },
    }),
  });
  const host = new FeatureHost([
    makeFeature("first"),
    makeFeature("second"),
    { id: "resident", resident: true },
  ], { ports, appGeneration: 1 });

  assert.equal(await host.launch("first"), "active");
  assert.equal(await host.launch("second"), "active");
  assert.equal(host.statusOf("resident"), "active", "无 loader 的常驻 feature 静态 active");

  // route refcount：常驻豁免；计数未归零不停用；归零停用。
  await host.releaseIfIdle("resident", 0);
  assert.equal(host.statusOf("resident"), "active", "resident 不随 refcount 归零释放");
  await host.releaseIfIdle("first", 1);
  assert.equal(host.statusOf("first"), "active", "仍有 route 打开时不得停用");
  await host.releaseIfIdle("first", 0);
  assert.equal(host.statusOf("first"), "unloaded", "最后一个 route 关闭后停用");
  assert.deepEqual(disposed, ["first"]);

  // 强制释放点：安装逆序 + 幂等。
  assert.equal(await host.launch("first"), "active");
  disposed.splice(0);
  await host.disposeAll();
  assert.deepEqual(disposed, ["first", "second"],
    "disposeAll 必须按安装完成逆序（后装先拆）");
  await host.disposeAll();
  assert.deepEqual(disposed, ["first", "second"], "disposeAll 幂等");
  assert.equal(host.statusOf("first"), "unloaded");
  assert.equal(host.statusOf("second"), "unloaded");
});
