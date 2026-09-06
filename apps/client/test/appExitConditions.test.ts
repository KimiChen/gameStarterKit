/**
 * 阶段 5 退出条件汇总（Non-intrusive §9 阶段 5）：
 *  - fixture plugin 在 route 关闭/加载取消/drop/reconnect/强踢/最终 leave/回前台/
 *    session generation 变化下旧响应一律不回写；
 *  - late subscriber 能立即读取连接状态（订阅即回放）；
 *  - app destroy 后 connection/session/route/ticker 订阅计数归零；
 *  - 静态门禁雏形：plugin fixture ⛔ 不得值导入 WebSocketClient/RoomClient/cc/
 *    fairygui/colyseus（覆盖 test/fixtures 与 src/plugins，形态参考 serverImportBan）；
 *    src/plugins/<id>/view/** 是引擎绑定层，只豁免 cc/fairygui，transport 仍禁。
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadAppHost } from "./appHostHarness";
import { createCounterPlugin } from "./fixtures/counterPlugin";
import { PluginHost } from "../src/app/PluginHost";

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

const USER = {
  uid: "exit-user",
  star: 0,
  maxRound: 0,
  wins: 0,
  losses: 0,
  stamina: 77,
  lastStaminaRecoverAt: 0,
  musicOn: true,
  sfxOn: true,
  guildId: 0,
  ver: 1,
};

test("fixture plugin：全部失效场景下旧响应不回写，健康路径可提交", async () => {
  const { appRuntime, session, wiring, webSocketClient, makeNode } = await loadAppHost();
  const socketAny = webSocketClient.WebSocketClient.inst as unknown as Record<string, any>;
  const originalRpc = socketAny.rpc;
  const runtime = new appRuntime.AppRuntime({ node: makeNode() });
  const runtimeAny = runtime as unknown as Record<string, any>;
  runtime.wireSessionLifecycle();
  const counter = createCounterPlugin();
  const host = new PluginHost([
    { id: "counter", load: () => counter.module },
  ], { ports: runtime.ports, appGeneration: runtime.generation });

  let connSeq = 20_000;
  const publishConnection = (event: Record<string, unknown>): void => {
    socketAny.publishConnectionEvent({ connGeneration: 1, seq: ++connSeq, ...event });
  };

  try {
    assert.equal(await host.launch("counter"), "active");
    let gate = deferred<{ user: typeof USER }>();
    socketAny.rpc = () => gate.promise;

    const runScenario = async (
      label: string,
      invalidate: (routeAbort: AbortController) => void,
    ): Promise<void> => {
      gate = deferred<{ user: typeof USER }>();
      const routeAbort = new AbortController();
      const staleBefore = counter.staleDrops();
      const writesBefore = counter.writes();
      const valueBefore = counter.value();
      const inFlight = counter.refresh(routeAbort.signal);
      invalidate(routeAbort);
      gate.resolve({ user: USER });
      const committed = await inFlight;
      assert.equal(committed, false, `${label}: 失效后的旧响应不得提交`);
      assert.equal(counter.writes(), writesBefore, `${label}: 旧响应不得回写`);
      assert.equal(counter.value(), valueBefore, `${label}: 已提交值不得被旧响应覆盖`);
      assert.equal(counter.staleDrops(), staleBefore + 1, `${label}: 必须按 stale 丢弃`);
    };

    session.setSession({ userId: "exit-user", accessToken: "exit-token", isNewAccount: false });

    await runScenario("route close", (routeAbort) => { routeAbort.abort(); });
    await runScenario("加载中取消", (routeAbort) => { routeAbort.abort(); });
    await runScenario("drop", () => { publishConnection({ kind: "dropped" }); });
    await runScenario("reconnect", () => { publishConnection({ kind: "reconnected" }); });
    await runScenario("强踢（auth-invalid）", () => { session.notifyAuthInvalid("FORCE_REPLACED"); });
    session.setSession({ userId: "exit-user", accessToken: "exit-token-2", isNewAccount: false });
    await runScenario("最终 leave（final-loss）", () => {
      publishConnection({ kind: "closed", reason: "final-loss" });
    });
    await runScenario("回前台（hide→show 跨越在途快照）", () => {
      wiring.lifecycleBus.publish("host", { kind: "hide", seq: ++connSeq });
      wiring.lifecycleBus.publish("host", { kind: "show", seq: ++connSeq });
    });
    await runScenario("session generation 变化", () => {
      session.setSession({ userId: "exit-user", accessToken: "exit-token-3", isNewAccount: false });
    });

    // 健康路径：无失效时必须能提交（防「永不回写」式假绿）。
    gate = deferred<{ user: typeof USER }>();
    const healthy = counter.refresh(new AbortController().signal);
    gate.resolve({ user: USER });
    assert.equal(await healthy, true, "健康路径必须提交快照");
    assert.equal(counter.value(), 77);
    assert.equal(counter.writes(), 1);
  } finally {
    socketAny.rpc = originalRpc;
    runtimeAny.roomController = null;
    runtime.dispose();
    session.clearSession();
  }
});

test("late subscriber：订阅即回放当前连接状态（Lobby 已 ready 后加载的 plugin 不错过 ready）", async () => {
  const { appRuntime, webSocketClient, session, makeNode } = await loadAppHost();
  const socketAny = webSocketClient.WebSocketClient.inst as unknown as Record<string, any>;
  const runtime = new appRuntime.AppRuntime({ node: makeNode() });
  const runtimeAny = runtime as unknown as Record<string, any>;
  try {
    socketAny.publishConnectionEvent({ kind: "ready", connGeneration: 7, seq: 91_001 });
    const replayed: Array<{ kind: string; connGeneration: number }> = [];
    const unsubscribe = runtime.ports.lifecycle.subscribeConnection((event) => {
      replayed.push({ kind: event.kind, connGeneration: event.connGeneration });
    });
    assert.deepEqual(replayed, [{ kind: "ready", connGeneration: 7 }],
      "晚到订阅者必须立即收到当前状态回放");
    assert.equal(runtime.ports.lifecycle.getConnectionState().state, "ready");
    unsubscribe();
    // 复位共享快照，避免污染同进程其它用例。
    socketAny.publishConnectionEvent({ kind: "closed", reason: "voluntary", connGeneration: 7, seq: 91_002 });
  } finally {
    runtimeAny.roomController = null;
    runtime.dispose();
    session.clearSession();
  }
});

test("app destroy：connection/session/route/ticker 订阅计数归零", async () => {
  const { appRuntime, session, wiring, webSocketClient, loginFlow, makeNode } = await loadAppHost();
  const socketAny = webSocketClient.WebSocketClient.inst as unknown as Record<string, any>;
  const connBaseline = (socketAny.connectionListeners as Set<unknown>).size;
  const hostBaseline = wiring.lifecycleBus.listenerCount("host");
  const busConnBaseline = wiring.lifecycleBus.listenerCount("connection");

  const runtime = new appRuntime.AppRuntime({ node: makeNode() });
  const runtimeAny = runtime as unknown as Record<string, any>;
  runtime.wireSessionLifecycle();
  runtime.ports.lifecycle.subscribeConnection(() => {});
  runtime.ports.lifecycle.subscribeHost(() => {});
  runtime.ports.ticker.add(() => {});
  assert.ok((socketAny.connectionListeners as Set<unknown>).size > connBaseline);
  assert.ok(wiring.lifecycleBus.listenerCount("host") > hostBaseline);
  assert.equal(runtime.scheduler.size, 1);

  const stopCalls: unknown[] = [];
  runtimeAny.roomController = {
    stop: (reason: unknown) => { stopCalls.push(reason); return Promise.resolve(); },
    dispose: () => Promise.resolve(),
  };
  runtime.dispose();

  assert.equal((socketAny.connectionListeners as Set<unknown>).size, connBaseline,
    "connection 订阅计数必须归零（回到基线）");
  assert.equal(wiring.lifecycleBus.listenerCount("host"), hostBaseline,
    "host 通道订阅计数必须归零");
  assert.equal(wiring.lifecycleBus.listenerCount("connection"), busConnBaseline,
    "bus connection 通道订阅计数必须归零");
  assert.equal(runtime.scheduler.size, 0, "ticker 订阅计数必须归零");
  assert.deepEqual(loginFlow.appNavigation.openRoutes(), [], "route stack 必须为空");

  session.setSession({ userId: "exit-user-2", accessToken: "t", isNewAccount: false });
  session.notifyBattleLost();
  assert.deepEqual(stopCalls, [], "dispose 后 session 订阅不得再驱动旧宿主");
  session.clearSession();
});

// ── 静态门禁雏形（形态参考 serverImportBan）：plugin fixture 的值导入禁令。────────
const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES_DIR = join(HERE, "fixtures");
const FUTURE_PLUGINS_DIR = join(HERE, "../src/plugins");

/** 值导入禁令：允许 `import type`，禁止其余形态引入 transport/引擎模块。 */
const BANNED_VALUE_IMPORT =
  /(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s*["'](?:cc|cc\/[^"']*|db:\/\/fairygui[^"']*|[^"']*fairygui[^"']*|[^"']*\/net\/WebSocketClient|[^"']*\/net\/RoomClient|colyseus|@colyseus\/[^"']*)["']|require\s*\(\s*["'](?:cc|colyseus|@colyseus\/[^"']*)["']\s*\)|import\s*\(\s*["']db:\/\/fairygui[^"']*["']\s*\)/;

function collectTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTs(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

/**
 * plugin 目录下的 View（`src/plugins/<id>/view/**`，经 .view.json sidecar 登记进 ViewMgr catalog）
 * 是引擎绑定层（铁律 9），cc/fairygui 值导入是其职责本身；对它们只禁 transport（net 客户端 /
 * colyseus）——能力仍只经 ports（logic 层由 logic-purity 另闸 cc/fairygui）。
 */
const BANNED_VALUE_IMPORT_VIEW =
  /(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s*["'](?:[^"']*\/net\/WebSocketClient|[^"']*\/net\/RoomClient|colyseus|@colyseus\/[^"']*)["']|require\s*\(\s*["'](?:colyseus|@colyseus\/[^"']*)["']\s*\)/;

const isPluginViewFile = (file: string): boolean =>
  /[\\/]src[\\/]plugins[\\/][^\\/]+[\\/]view[\\/]/.test(file);

test("静态门禁：plugin fixture（与 src/plugins）不得值导入 WebSocketClient/RoomClient/cc/fairygui；plugin View 只豁免引擎模块", () => {
  const files = [...collectTs(FIXTURES_DIR), ...collectTs(FUTURE_PLUGINS_DIR)];
  assert.ok(files.length >= 1, "扫描目标为空：fixtures 目录丢失（门禁空转）");
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (isPluginViewFile(file)) {
      assert.doesNotMatch(source, BANNED_VALUE_IMPORT_VIEW,
        `${file} 含被禁的 transport 值导入（plugin View 只豁免 cc/fairygui，能力仍只经 ports）`);
      continue;
    }
    assert.doesNotMatch(source, BANNED_VALUE_IMPORT,
      `${file} 含被禁的值导入（plugin 只能经 ports 取得能力）`);
  }
  assert.ok(isPluginViewFile("/x/src/plugins/redeem/view/RedeemView.ts"));
  assert.ok(!isPluginViewFile("/x/src/plugins/redeem/logic/RedeemLogic.ts"));
  assert.ok(!isPluginViewFile("/x/src/plugins/redeem/index.ts"));
  assert.match('\nimport { RoomClient } from "../../../net/RoomClient";\n', BANNED_VALUE_IMPORT_VIEW);
  assert.doesNotMatch('\nimport { Node } from "cc";\n', BANNED_VALUE_IMPORT_VIEW);
});

test("静态门禁正则自测：值导入判违规、type-only 放行", () => {
  for (const bad of [
    'import { sys } from "cc";',
    'import { WebSocketClient } from "../../src/net/WebSocketClient";',
    'import { RoomClient } from "../net/RoomClient";',
    'import * as fgui from "db://fairygui-cc/fairygui.mjs";',
    'import { Client } from "colyseus";',
    'const m = require("colyseus");',
    'void import("db://fairygui-cc/fairygui.mjs");',
  ]) {
    assert.match(`\n${bad}\n`, BANNED_VALUE_IMPORT, `应判违规: ${bad}`);
  }
  for (const good of [
    'import type { Node } from "cc";',
    'import type { AppPorts } from "../../src/app/ports";',
    'import { createAppPorts } from "../../src/app/ports";',
    'import type { PluginModule } from "../../src/app/PluginHost";',
  ]) {
    assert.doesNotMatch(`\n${good}\n`, BANNED_VALUE_IMPORT, `不应误伤: ${good}`);
  }
});
