import assert from "node:assert/strict";
import { test } from "node:test";
import { LifecycleRegistry } from "../src/core/infra/lifecycle";

test("LifecycleRegistry：按逆序释放、重复 dispose 只执行一次，并继续处理失败资源", async () => {
  const registry = new LifecycleRegistry();
  const calls: string[] = [];
  registry.register("first", () => { calls.push("first"); });
  registry.register("second", async () => {
    calls.push("second");
    throw new Error("expected cleanup failure");
  });
  registry.register("third", () => { calls.push("third"); });

  await assert.rejects(registry.disposeAll(), AggregateError);
  assert.deepEqual(calls, ["third", "second", "first"]);
  assert.equal(registry.size, 0);
  await registry.disposeAll();
  assert.deepEqual(calls, ["third", "second", "first"]);
});

test("LifecycleRegistry：并发 dispose 共享同一个可等待结果，重复名称不产生双重释放", async () => {
  const registry = new LifecycleRegistry();
  let releases = 0;
  registry.register("resource", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    releases++;
  });
  registry.register("resource", () => { releases += 100; });

  const a = registry.disposeAll();
  const b = registry.disposeAll();
  assert.strictEqual(a, b);
  await Promise.all([a, b]);
  assert.equal(releases, 1);
});
