/**
 * feature module 装载链（docs/PLUGIN.md §6 / plan-v5 E5 的客户端一半）：
 *
 *   features.generated 的静态字面量 `load` → 动态 import features/<id>/index →
 *   createFeatureModule() → FeatureHost.launch 调 install(context) → route 形态入口经
 *   AppRuntime.launch({kind:"route"}) 先过 FeatureHost 闸再 navigation.open(routeId)。
 *
 * 用例只读 generated 表，⛔ 不点名任何具体插件：装了几个带 module 的 feature 就验几个，
 * 一个都没有时 skip（不做假绿）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FeatureHost } from "../src/app/FeatureHost";
import type { AppPorts } from "../src/app/ports";
import { GENERATED_FEATURES, GENERATED_MENU_CONTRIBUTIONS } from "../src/generated/features.generated";
import { loadAppHost } from "./appHostHarness";

const loadable = GENERATED_FEATURES.filter((feature) => typeof feature.load === "function");
const routeEntries = GENERATED_MENU_CONTRIBUTIONS.filter((entry) => entry.launch.kind === "route");

test("generated load：每个带 module 的 feature 都能动态装载出 { install }", { skip: loadable.length === 0 && "当前没有带 module 的 feature" }, async () => {
  for (const feature of loadable) {
    const module = await feature.load!();
    assert.equal(typeof module.install, "function", `${feature.id} 的 createFeatureModule 必须返回带 install 的 module`);
  }
});

test("FeatureHost：按 AppRuntime 同一口径托管 generated features，launch 走真实 loader 到 active，disposeAll 干净", { skip: loadable.length === 0 && "当前没有带 module 的 feature" }, async () => {
  const ports = {
    lobbyRpc: { query: async () => { throw new Error("not in test"); }, sendIdempotent: async () => { throw new Error("not in test"); } },
    navigation: { open: async () => { throw new Error("not in test"); }, replace: async () => { throw new Error("not in test"); }, back() {}, close() {}, closeGroup() {} },
  } as unknown as AppPorts;
  const host = new FeatureHost(
    GENERATED_FEATURES.map((feature) => ({
      id: feature.id,
      resident: feature.resident,
      dependencies: feature.dependencies,
      ...(feature.load ? { load: feature.load } : {}),
    })),
    { ports, appGeneration: 1 },
  );
  for (const feature of loadable) {
    assert.equal(await host.launch(feature.id, { userIntent: true }), "active", `${feature.id} 必须经真实 loader 装到 active`);
  }
  await host.disposeAll();
  for (const feature of loadable) {
    assert.notEqual(host.statusOf(feature.id), "active", `${feature.id} disposeAll 后不得仍是 active`);
  }
});

test("route 形态入口：AppRuntime.launch 先经 FeatureHost 装载归属 feature，再 navigation.open(routeId)", { skip: routeEntries.length === 0 && "当前没有 route 形态入口" }, async () => {
  const { appRuntime, loginFlow, makeNode } = await loadAppHost();
  for (const entry of routeEntries) {
    assert.equal(entry.launch.kind, "route");
    const routeId = entry.launch.kind === "route" ? entry.launch.routeId : "";
    const route = loginFlow.appFeatureRegistry.routeOf(routeId);
    assert.equal(route.featureId, entry.featureId, `入口 ${entry.entryId} 引用的 route 必须归属同一 feature`);

    const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
    const opened: string[] = [];
    // 以原 NavigationService 为原型只覆盖 open：其余方法（setRouteObserver 等）仍走原型，⛔ 不用展开（会丢掉原型方法）。
    runtime.navigation = Object.assign(Object.create(runtime.navigation), {
      open: async (id: string) => { opened.push(id); return null; },
    });
    try {
      await runtime.launch({ kind: "route", routeId });
      assert.deepEqual(opened, [routeId], `入口 ${entry.entryId} 必须打开 route ${routeId}`);
      if (runtime.features.hosts(entry.featureId)) {
        assert.equal(runtime.features.statusOf(entry.featureId), "active", `route 打开前 feature ${entry.featureId} 必须已装到 active`);
      }
    } finally {
      runtime.dispose();
    }
  }
});
