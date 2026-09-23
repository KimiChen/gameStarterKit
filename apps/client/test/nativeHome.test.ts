import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNativeHomeRoute } from "../src/native/host";
import type { NavRouteHandle } from "../src/app/NavigationService";
import { loadAppHost } from "./appHostHarness";

test("原生首页仅在显式原生传输且 kit 路由存在时启用", () => {
  assert.equal(resolveNativeHomeRoute("colyseus", () => true), null);
  assert.equal(resolveNativeHomeRoute("native-websocket", () => false), null);
  assert.equal(resolveNativeHomeRoute("native-websocket", id => id === "gameDemo"), "gameDemo");
});

test("原生登录与断线恢复都通过宿主装载同一首页，失败不当作导航成功", async () => {
  const { loginFlow, lobbyTransportHub } = await loadAppHost();
  const calls: string[] = [];
  const handle = { routeId: "gameDemo" } as NavRouteHandle;
  lobbyTransportHub.configure({ kind: "native-websocket", endpoint: "ws://127.0.0.1:18091" });
  let fail = false;
  const dispose = loginFlow.setHomeMenuRuntime({
    launch: async () => { throw new Error("must not use a fire-and-forget menu launch"); },
    availabilityOf: () => "available",
    openRoute: async (routeId) => { calls.push(routeId); return fail ? null : handle; },
  });
  try {
    assert.equal(await loginFlow.openAuthenticatedHome(), handle);
    assert.equal(loginFlow.appNavigation.authenticatedBaseRouteId(), "gameDemo");
    assert.equal(await loginFlow.appNavigation.restoreAuthenticatedBase(), handle);
    assert.deepEqual(calls, ["gameDemo", "gameDemo"]);
    fail = true;
    await assert.rejects(loginFlow.openAuthenticatedHome(), /原生首页打开失败/);
  } finally {
    dispose();
    loginFlow.appNavigation.clearAuthenticatedBase();
    lobbyTransportHub.configure({ kind: "colyseus" });
  }
});
