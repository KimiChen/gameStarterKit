/**
 * plugin module 装载链（docs/PLUGIN.md §6 / plan-v5 E5 的客户端一半）：
 *
 *   plugins.generated 的静态字面量 `load` → 动态 import apps/plugins/<id>/index →
 *   createPluginModule() → PluginHost.launch 调 install(context) → route 形态入口经
 *   AppRuntime.launch({kind:"route"}) 先过 PluginHost 闸再 navigation.open(routeId)。
 *
 * 用例只读 generated 表，⛔ 不点名任何具体插件：装了几个带 module 的 plugin 就验几个，
 * 一个都没有时 skip（不做假绿）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PluginHost } from "../src/app/PluginHost";
import type { AppPorts } from "../src/app/ports";
import { GENERATED_PLUGINS, GENERATED_MENU_CONTRIBUTIONS } from "../src/generated/plugins.generated";
import { loadAppHost } from "./appHostHarness";

const loadable = GENERATED_PLUGINS.filter((plugin) => typeof plugin.load === "function");
const routeEntries = GENERATED_MENU_CONTRIBUTIONS.filter((entry) => entry.launch.kind === "route");

test("generated load：每个带 module 的 plugin 都能动态装载出 { install }", { skip: loadable.length === 0 && "当前没有带 module 的 plugin" }, async () => {
  for (const plugin of loadable) {
    const module = await plugin.load!();
    assert.equal(typeof module.install, "function", `${plugin.id} 的 createPluginModule 必须返回带 install 的 module`);
  }
});

test("PluginHost：按 AppRuntime 同一口径托管 generated plugins，launch 走真实 loader 到 active，disposeAll 干净", { skip: loadable.length === 0 && "当前没有带 module 的 plugin" }, async () => {
  const ports = {
    lobbyRpc: { query: async () => { throw new Error("not in test"); }, sendIdempotent: async () => { throw new Error("not in test"); } },
    navigation: { open: async () => { throw new Error("not in test"); }, replace: async () => { throw new Error("not in test"); }, back() {}, close() {}, closeGroup() {} },
  } as unknown as AppPorts;
  const host = new PluginHost(
    GENERATED_PLUGINS.map((plugin) => ({
      id: plugin.id,
      resident: plugin.resident,
      dependencies: plugin.dependencies,
      ...(plugin.load ? { load: plugin.load } : {}),
    })),
    { ports, appGeneration: 1 },
  );
  for (const plugin of loadable) {
    assert.equal(await host.launch(plugin.id, { userIntent: true }), "active", `${plugin.id} 必须经真实 loader 装到 active`);
  }
  await host.disposeAll();
  for (const plugin of loadable) {
    assert.notEqual(host.statusOf(plugin.id), "active", `${plugin.id} disposeAll 后不得仍是 active`);
  }
});

test("route 形态入口：AppRuntime.launch 先经 PluginHost 装载归属 plugin，再 navigation.open(routeId)", { skip: routeEntries.length === 0 && "当前没有 route 形态入口" }, async () => {
  const { appRuntime, loginFlow, makeNode } = await loadAppHost();
  for (const entry of routeEntries) {
    assert.equal(entry.launch.kind, "route");
    const routeId = entry.launch.kind === "route" ? entry.launch.routeId : "";
    const route = loginFlow.appPluginRegistry.routeOf(routeId);
    assert.equal(route.pluginId, entry.pluginId, `入口 ${entry.entryId} 引用的 route 必须归属同一 plugin`);

    const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
    const opened: string[] = [];
    // 以原 NavigationService 为原型只覆盖 open：其余方法（setRouteObserver 等）仍走原型，⛔ 不用展开（会丢掉原型方法）。
    runtime.navigation = Object.assign(Object.create(runtime.navigation), {
      open: async (id: string) => { opened.push(id); return null; },
    });
    try {
      await runtime.launch({ kind: "route", routeId });
      assert.deepEqual(opened, [routeId], `入口 ${entry.entryId} 必须打开 route ${routeId}`);
      if (runtime.plugins.hosts(entry.pluginId)) {
        assert.equal(runtime.plugins.statusOf(entry.pluginId), "active", `route 打开前 plugin ${entry.pluginId} 必须已装到 active`);
      }
    } finally {
      runtime.dispose();
    }
  }
});
