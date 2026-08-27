/**
 * FairyGUI 包加载边界的无头故障测试。
 * 使用 deferred/fake runtime 和可控时钟，验证 required 包不会降级为空占位，
 * deadline/关闭/场景世代变化都能让当前 View 打开尽快结束；底层迟到回调仍被安全观察。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FguiPackageCancelledError,
  FguiPackageLoader,
  FguiPackageMissingError,
  FguiPackageTimeoutError,
  type FguiPackageScheduler,
} from "../src/view/packageLoader";

function packageName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

class FakeClock implements FguiPackageScheduler {
  private nextId = 1;
  private current = 0;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.current + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(Number(handle));
  }

  advance(ms: number): void {
    assert.ok(ms >= 0);
    this.current += ms;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= this.current)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      if (due.length === 0) return;
      for (const [id, timer] of due) {
        if (!this.timers.delete(id)) continue;
        timer.callback();
      }
    }
  }
}

interface PendingLoad {
  readonly path: string;
  readonly callback: (error: unknown, pkg?: unknown) => void;
}

class FakePackageRuntime {
  readonly loaded = new Map<string, object>();
  readonly requests: PendingLoad[] = [];

  getByName(name: string): unknown {
    return this.loaded.get(name);
  }

  loadPackage(path: string, callback: (error: unknown, pkg?: unknown) => void): void {
    this.requests.push({ path, callback });
  }

  complete(index: number, error: unknown = null, register = error === null): void {
    const request = this.requests[index];
    assert.ok(request, `missing fake request ${index}`);
    if (register) this.loaded.set(packageName(request.path), {});
    request.callback(error, register ? this.loaded.get(packageName(request.path)) : undefined);
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("required 共享包缺失抛可判别、可重试错误，不打开空占位", async () => {
  const runtime = new FakePackageRuntime();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 100, scheduler: new FakeClock() });

  const first = loader.load("ui/Required");
  runtime.complete(0, new Error("resources/ui/Required.bin not found"), false);
  await assert.rejects(first, (error: unknown) => {
    assert.ok(error instanceof FguiPackageMissingError);
    assert.equal(error.code, "FGUI_PACKAGE_MISSING");
    assert.equal(error.packageName, "Required");
    assert.equal(error.retryable, true);
    return true;
  });

  // 失败请求已从 in-flight 索引移除，修复资源后下一次 open 可以重试。
  const retry = loader.load("ui/Required");
  assert.equal(runtime.requests.length, 2);
  runtime.complete(1);
  await retry;
  assert.ok(runtime.getByName("Required"));
});

test("统一 deadline 超时释放重试槽，迟到回调不会让旧打开复活", async () => {
  const runtime = new FakePackageRuntime();
  const clock = new FakeClock();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 25, scheduler: clock });

  const first = loader.load("ui/Slow");
  clock.advance(25);
  // The timeout releases the retry slot synchronously; a UI retry need not wait
  // for the rejected promise's continuation to run first.
  const retry = loader.load("ui/Slow");
  assert.equal(runtime.requests.length, 2, "超时后应允许新的一次底层加载");
  await assert.rejects(first, (error: unknown) => {
    assert.ok(error instanceof FguiPackageTimeoutError);
    assert.equal(error.code, "FGUI_PACKAGE_TIMEOUT");
    assert.equal(error.deadlineMs, 25);
    assert.equal(error.retryable, true);
    return true;
  });

  runtime.complete(1);
  await retry;

  // 第一次 loadPackage 的回调晚到时只完成其自身请求，不影响已成功的新世代。
  runtime.complete(0, new Error("late old request"), false);
  await flushMicrotasks();
  assert.ok(runtime.getByName("Slow"));
});

test("关闭页面时取消当前 waiter，底层成功迟到也不触发旧打开", async () => {
  const runtime = new FakePackageRuntime();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 100, scheduler: new FakeClock() });
  const controller = new AbortController();
  const opening = loader.load("ui/Closing", { signal: controller.signal });

  controller.abort();
  await assert.rejects(opening, (error: unknown) => {
    assert.ok(error instanceof FguiPackageCancelledError);
    assert.equal(error.code, "FGUI_PACKAGE_CANCELLED");
    assert.equal(error.retryable, false);
    return true;
  });

  // FairyGUI 没有取消 API；迟到成功可留在共享缓存，但不能改变已取消的 Promise。
  runtime.complete(0);
  await flushMicrotasks();
  assert.ok(runtime.getByName("Closing"));
});

test("场景世代切换后旧 signal 迟到，新的打开独立合流并成功", async () => {
  const runtime = new FakePackageRuntime();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 100, scheduler: new FakeClock() });
  const oldGeneration = new AbortController();
  const newGeneration = new AbortController();

  const oldOpen = loader.load("ui/SceneBound", { signal: oldGeneration.signal });
  oldGeneration.abort();
  await assert.rejects(oldOpen, (error: unknown) => error instanceof FguiPackageCancelledError);

  const newOpen = loader.load("ui/SceneBound", { signal: newGeneration.signal });
  assert.equal(runtime.requests.length, 2, "root generation 变化后不得复用已取消 waiter");
  runtime.complete(1);
  await newOpen;

  // 旧世代的错误回调最后到达，不能覆盖新世代已加载包或制造未观察 rejection。
  runtime.complete(0, new Error("stale scene request"), false);
  await flushMicrotasks();
  assert.ok(runtime.getByName("SceneBound"));
});

test("并发 waiter 合流：关闭一个页面不取消另一个，成功共享包保持常驻", async () => {
  const runtime = new FakePackageRuntime();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 100, scheduler: new FakeClock() });
  const firstController = new AbortController();
  const secondController = new AbortController();

  const first = loader.load("ui/Shared", { signal: firstController.signal });
  const second = loader.load("ui/Shared", { signal: secondController.signal });
  assert.equal(runtime.requests.length, 1, "同路径并发加载必须只发一个 FairyGUI 请求");

  firstController.abort();
  await assert.rejects(first, (error: unknown) => error instanceof FguiPackageCancelledError);
  runtime.complete(0);
  await second;

  // 共享包按进程常驻；后续页面直接命中缓存，不会触发第二次 loadPackage。
  await loader.load("ui/Shared", { signal: secondController.signal });
  assert.equal(runtime.requests.length, 1);
  assert.ok(runtime.getByName("Shared"));
});

test("底层错误即使残留半成品包也必须失败；仅更新世代的成功可屏蔽旧迟到错误", async () => {
  const runtime = new FakePackageRuntime();
  const clock = new FakeClock();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 10, scheduler: clock });

  const partial = loader.load("ui/Partial");
  runtime.complete(0, new Error("atlas failed"), true);
  await assert.rejects(partial, (error: unknown) => error instanceof FguiPackageMissingError);

  // Force a new generation after the failed request and let it succeed.
  runtime.loaded.delete("Partial");
  const old = loader.load("ui/Retryable");
  clock.advance(10);
  const oldOutcome = assert.rejects(old, (error: unknown) => error instanceof FguiPackageTimeoutError);
  const current = loader.load("ui/Retryable");
  runtime.complete(2);
  await current;
  runtime.complete(1, new Error("stale failure"), false);
  await oldOutcome;
});

test("package deadline 只接受非负安全整数，非法配置不会启动底层请求", async () => {
  const runtime = new FakePackageRuntime();
  assert.throws(() => new FguiPackageLoader(runtime, { deadlineMs: 1.5 }), /安全整数/);
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 10 });
  await assert.rejects(loader.load("ui/Fraction", { deadlineMs: 0.5 }), /安全整数/);
  assert.equal(runtime.requests.length, 0, "非法 waiter deadline 不应触发 FairyGUI 请求");
});

test("成功回调返回的包对象必须与运行时注册对象一致", async () => {
  const runtime = new FakePackageRuntime();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 100, scheduler: new FakeClock() });
  const opening = loader.load("ui/Mismatched");
  const request = runtime.requests[0];
  const registered = {};
  runtime.loaded.set("Mismatched", registered);
  request.callback(null, {});
  await assert.rejects(opening, (error: unknown) => {
    assert.ok(error instanceof FguiPackageMissingError);
    assert.match(String((error as Error).message), /注册对象不一致/);
    return true;
  });
  // A duplicate late callback must be ignored and cannot turn the failed
  // waiter into a second settlement.
  request.callback(null, registered);
  await flushMicrotasks();
});

test("ensure 的重复路径合流为一个 waiter 请求", async () => {
  const runtime = new FakePackageRuntime();
  const loader = new FguiPackageLoader(runtime, { deadlineMs: 100, scheduler: new FakeClock() });
  const opening = loader.ensure(["ui/Duplicate", "ui/Duplicate"]);
  assert.equal(runtime.requests.length, 1);
  runtime.complete(0);
  await opening;
});
