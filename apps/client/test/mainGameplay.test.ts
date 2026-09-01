/**
 * Execution-level coverage for the host gameplay continuation.
 *
 * 阶段 5b：编排逻辑从 Main.ts 迁入 app/AppRuntime.ts，本探针改为直接构造真实
 * AppRuntime（注入最小 cc 桩）并在实际 await 边界上驱动失效；Main.ts 的
 * bootstrap 顺序不变量（WeChat compat / init→导航次序）保留为源文本断言
 * （与掏空 Main 同批改写，⛔ 未先删后补）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

// ── Bootstrap 顺序源文本断言（Non-intrusive §7.3）。──────────────────────────
const MAIN_SOURCE = readFileSync(new URL("../src/Main.ts", import.meta.url), "utf8");
const BOOTSTRAP_SOURCE = readFileSync(new URL("../src/app/bootstrap.ts", import.meta.url), "utf8");

test("Main bootstrap：installWeChatCompat 是模块求值期顶层调用，早于任何 Colyseus/网络初始化", () => {
  // 顶层调用形态：行首列 0、独立语句（不在任何函数/方法体内——类内代码必有缩进）。
  const topLevelCall = /^installWeChatCompat\(\);$/m;
  assert.match(MAIN_SOURCE, topLevelCall,
    "installWeChatCompat() 必须保持模块求值期顶层调用（掏空 Main.ts 时最易被静默丢掉）");
  const callAt = MAIN_SOURCE.search(topLevelCall);
  const classAt = MAIN_SOURCE.indexOf("export class Main");
  assert.ok(classAt > callAt,
    "installWeChatCompat() 必须位于 Main 类声明之前——一切网络初始化都在类方法体内");
  // 网络初始化面已整体迁入 bootstrap；Main 源内不得再出现（防止编排逻辑回流）。
  for (const netInit of ["initHttp(", "initPortal(", "wireConnectionEvents("]) {
    assert.equal(MAIN_SOURCE.indexOf(netInit), -1,
      `${netInit}... 不得回流 Main.ts（编排属 app/bootstrap；WeChat compat 必须早于首次网络操作）`);
  }
  assert.ok(!/^\s*Colyseus\./m.test(MAIN_SOURCE),
    "Main.ts 不得出现任何 Colyseus 调用");
  assert.match(MAIN_SOURCE, /createAppRuntime\(\{/,
    "Main.onLoad 必须经 createAppRuntime 装配宿主（模块求值期 compat 先于它执行）");
});

test("bootstrap 接线序：initHttp/initPortal → 会话订阅 → wireConnectionEvents → bridge → 导航启动", () => {
  const initHttpAt = BOOTSTRAP_SOURCE.indexOf("initHttp(");
  const initPortalAt = BOOTSTRAP_SOURCE.indexOf("initPortal(");
  const sessionWiringAt = BOOTSTRAP_SOURCE.indexOf("runtime.wireSessionLifecycle()");
  const wireAt = BOOTSTRAP_SOURCE.indexOf("wireConnectionEvents()");
  const bridgeAt = BOOTSTRAP_SOURCE.indexOf("installCocosLifecycleBridge(lifecycleBus)");
  const navigationAt = BOOTSTRAP_SOURCE.indexOf("runtime.startNavigation()");
  for (const [label, at] of [
    ["initHttp", initHttpAt],
    ["initPortal", initPortalAt],
    ["runtime.wireSessionLifecycle", sessionWiringAt],
    ["wireConnectionEvents", wireAt],
    ["installCocosLifecycleBridge", bridgeAt],
    ["runtime.startNavigation", navigationAt],
  ] as const) {
    assert.ok(at >= 0, `bootstrap 必须调用 ${label}`);
  }
  assert.ok(initHttpAt < navigationAt && initPortalAt < navigationAt,
    "先初始化 http/portal，后打开页面（§7.3 表格：先初始化后开页面）");
  assert.ok(sessionWiringAt < wireAt,
    "会话订阅（transport 丢失先拆玩法 generation）必须先于 transport 事件接通");
  assert.ok(wireAt < navigationAt && bridgeAt < navigationAt,
    "wireConnectionEvents/lifecycle bridge 必须先于导航启动：页面挂载前事件即可被派生");
});

type LoaderModule = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

interface HostRuntime {
  Main: new () => object;
  AppRuntime: new (options: { node: object; gameplayId?: string }) => object;
  clearSession(): void;
  makeNode(): object;
}

let runtimePromise: Promise<HostRuntime> | null = null;

/** Import the host modules without requiring a running Cocos/FairyGUI process. */
async function loadHostRuntime(): Promise<HostRuntime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;

    class FakeNode {
      readonly children: FakeNode[] = [];
      readonly isValid = true;
      constructor(readonly name = "node") {}
    }
    class FakeComponent {
      readonly node = new FakeNode();
    }
    const cc = {
      Component: FakeComponent,
      Node: FakeNode,
      _decorator: {
        ccclass: () => () => {},
        property: () => () => {},
      },
      view: { setDesignResolutionSize: () => {} },
      ResolutionPolicy: { FIXED_WIDTH: {} },
      director: { getScene: () => null },
      sys: {
        getSafeAreaRect: () => ({ x: 0, y: 0, width: 1, height: 1 }),
        localStorage: {},
      },
      Canvas: class {},
      Layers: { Enum: {} },
      game: { on: () => {}, off: () => {} },
      Game: { EVENT_HIDE: "game_on_hide", EVENT_SHOW: "game_on_show" },
    };

    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
      if (request === "cc") return cc;
      if (request === "cc/env") {
        return { MINIGAME: false, DEV: true, EDITOR: false, PREVIEW: false };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const [{ Main }, { AppRuntime }, session] = await Promise.all([
        import("../src/Main"),
        import("../src/app/AppRuntime"),
        import("../src/net/session"),
      ]);
      return {
        Main: Main as new () => object,
        AppRuntime: AppRuntime as unknown as HostRuntime["AppRuntime"],
        clearSession: session.clearSession,
        makeNode: () => new FakeNode(),
      };
    } finally {
      moduleApi._load = originalLoad;
    }
  })();
  return runtimePromise;
}

class DeferredController {
  status = "idle";
  readonly startSignals: AbortSignal[] = [];
  readonly stopReasons: unknown[] = [];
  readonly result = deferred<{
    status: "started";
    generation: number;
    pluginId: string;
  }>();

  startRegistered(_registry: unknown, _id: string, signal: AbortSignal): Promise<typeof this.result extends Deferred<infer T> ? T : never> {
    this.startSignals.push(signal);
    return this.result.promise;
  }

  stop(reason: unknown): Promise<void> {
    this.stopReasons.push(reason);
    return Promise.resolve();
  }
}

async function waitForStart(controller: DeferredController): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (controller.startSignals.length > 0) return;
    await Promise.resolve();
  }
  assert.fail("AppRuntime.startGameplay 未进入 controller.startRegistered await 边界");
}

async function assertLateStartIsolated(
  label: string,
  invalidate: (runtime: Record<string, any>, signal: AbortController, clearSession: () => void) => void,
): Promise<void> {
  const { AppRuntime, clearSession, makeNode } = await loadHostRuntime();
  clearSession();

  const runtime = new AppRuntime({ node: makeNode() }) as Record<string, any>;
  let closeLobbyCalls = 0;
  try {
    // 只替换导航面：closeGroup("authenticated") 是原 closeLobby 的等价入口。
    runtime.navigation = {
      closeGroup: (group: string) => {
        assert.equal(group, "authenticated");
        closeLobbyCalls++;
      },
      setRouteObserver: () => {},
    };
    const oldController = new DeferredController();
    const freshController = new DeferredController();
    runtime.roomController = oldController;
    runtime.gameplayRegistry = {};
    const signalController = new AbortController();
    const transition = runtime.startGameplay(signalController.signal) as Promise<void>;

    await waitForStart(oldController);
    invalidate(runtime, signalController, clearSession);
    // Simulate a replacement composition root/controller while the old join is
    // still in flight.  Cleanup must use the owner captured by this transition.
    runtime.roomController = freshController;
    oldController.result.resolve({ status: "started", generation: 1, pluginId: "ballMove" });

    await transition;
    assert.equal(closeLobbyCalls, 1, `${label}: 导航 continuation 应先关闭大厅页面组`);
    assert.deepEqual(oldController.startSignals, [signalController.signal], `${label}: 应传入调用方 signal`);
    assert.deepEqual(oldController.stopReasons, [{ kind: "cancelled" }],
      `${label}: 迟到结果必须只停止旧 controller`);
    assert.deepEqual(freshController.stopReasons, [], `${label}: 新 controller 不得被旧结果清理`);
  } finally {
    runtime.roomController = null;
    runtime.dispose();
    clearSession();
  }
}

test("AppRuntime.startGameplay：宿主 dispose 后迟到成功只清理旧 generation", async () => {
  await assertLateStartIsolated("disposed", (runtime) => {
    runtime.disposed = true;
  });
});

test("AppRuntime.startGameplay：AbortSignal 取消后迟到成功只清理旧 generation", async () => {
  await assertLateStartIsolated("abort", (_runtime, signal) => {
    signal.abort();
  });
});

test("AppRuntime.startGameplay：session generation 变化后迟到成功只清理旧 generation", async () => {
  await assertLateStartIsolated("session-generation", (_runtime, _signal, clearSession) => {
    clearSession();
  });
});
