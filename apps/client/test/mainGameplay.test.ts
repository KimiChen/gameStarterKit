/**
 * Execution-level coverage for the Main gameplay continuation.
 *
 * The continuation is intentionally kept private on the Cocos component, so
 * this probe imports the real class with a tiny engine stub and invokes the
 * method through its runtime shape.  A deferred controller result lets each
 * invalidation happen at the actual await boundary.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// ── Bootstrap 顺序源文本断言（Non-intrusive §7.3：迁移前必须先补；5b 掏空 Main 时
//    升级为对 bootstrap 的行为断言，⛔ 不允许先删后补）。──────────────────────────
const MAIN_SOURCE = readFileSync(new URL("../src/Main.ts", import.meta.url), "utf8");

test("Main bootstrap：installWeChatCompat 是模块求值期顶层调用，早于任何 Colyseus/网络初始化", () => {
  // 顶层调用形态：行首列 0、独立语句（不在任何函数/方法体内——类内代码必有缩进）。
  const topLevelCall = /^installWeChatCompat\(\);$/m;
  assert.match(MAIN_SOURCE, topLevelCall,
    "installWeChatCompat() 必须保持模块求值期顶层调用（掏空 Main.ts 时最易被静默丢掉）");
  const callAt = MAIN_SOURCE.search(topLevelCall);
  const classAt = MAIN_SOURCE.indexOf("export class Main");
  assert.ok(classAt > callAt,
    "installWeChatCompat() 必须位于 Main 类声明之前——一切网络初始化都在类方法体内");
  // 网络初始化面：HTTP 底座、portal、以及 transport 事件接线都必须晚于 compat 安装。
  for (const netInit of ["initHttp(", "initPortal(", "wireConnectionEvents("]) {
    const initAt = MAIN_SOURCE.indexOf(netInit);
    assert.ok(initAt === -1 || initAt > callAt,
      `${netInit}... 不得出现在 installWeChatCompat() 之前（WeChat compat 必须早于首次 Colyseus/网络操作）`);
  }
  // Colyseus 网络客户端不得在模块求值期建立连接：Main.ts 顶层只允许 compat 副作用。
  assert.ok(!/^\s*Colyseus\./m.test(MAIN_SOURCE.slice(0, callAt)),
    "installWeChatCompat() 之前不得出现任何 Colyseus 调用");
});

test("Main.start 接线序：wireConnectionEvents/lifecycle bridge 先于 openLogin（5a 接线 pin）", () => {
  const wireAt = MAIN_SOURCE.indexOf("wireConnectionEvents();");
  const bridgeAt = MAIN_SOURCE.indexOf("installCocosLifecycleBridge(lifecycleBus)");
  const openLoginAt = MAIN_SOURCE.indexOf("pages.openLogin(");
  assert.ok(wireAt >= 0, "Main.start 必须调用 wireConnectionEvents()（transport→bus→SessionCoordinator 接线）");
  assert.ok(bridgeAt >= 0, "Main.start 必须安装 CocosLifecycleBridge（宿主 hide/show 入 bus）");
  assert.ok(openLoginAt >= 0, "Main.start 必须打开 Login");
  assert.ok(wireAt < openLoginAt,
    "wireConnectionEvents 必须先于 openLogin：页面挂载前 transport 事件即可被派生");
  assert.ok(bridgeAt < openLoginAt, "lifecycle bridge 必须先于 openLogin 安装");
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

interface MainRuntime {
  Main: new () => object;
  clearSession(): void;
}

let closeLobbyCalls = 0;
let runtimePromise: Promise<MainRuntime> | null = null;
let restorePagesCache: { path: string; value: NodeModule | undefined } | null = null;

/** Import Main without requiring a running Cocos/FairyGUI process. */
async function loadMainRuntime(): Promise<MainRuntime> {
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

    // Dynamic import is part of the continuation.  Cache a tiny module with
    // the same named export so the test does not need FairyGUI resources.
    const pagesPath = resolve(fileURLToPath(new URL("../src/view/pages.ts", import.meta.url)));
    restorePagesCache = { path: pagesPath, value: require.cache[pagesPath] };
    require.cache[pagesPath] = {
      id: pagesPath,
      filename: pagesPath,
      loaded: true,
      exports: {
        closeLobby: () => { closeLobbyCalls++; },
      },
    } as NodeModule;

    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
      if (request === "cc") return cc;
      if (request === "cc/env") {
        return { MINIGAME: false, DEV: true, EDITOR: false, PREVIEW: false };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const [{ Main }, session] = await Promise.all([
        import("../src/Main"),
        import("../src/net/session"),
      ]);
      return { Main: Main as new () => object, clearSession: session.clearSession };
    } finally {
      moduleApi._load = originalLoad;
    }
  })();
  return runtimePromise;
}

after(() => {
  if (!restorePagesCache) return;
  if (restorePagesCache.value) require.cache[restorePagesCache.path] = restorePagesCache.value;
  else delete require.cache[restorePagesCache.path];
  restorePagesCache = null;
});

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
  assert.fail("Main.startGameplay 未进入 controller.startRegistered await 边界");
}

async function assertLateStartIsolated(
  label: string,
  invalidate: (main: Record<string, any>, signal: AbortController, clearSession: () => void) => void,
): Promise<void> {
  const { Main, clearSession } = await loadMainRuntime();
  clearSession();
  closeLobbyCalls = 0;

  const main = new Main() as Record<string, any>;
  const oldController = new DeferredController();
  const freshController = new DeferredController();
  main.roomController = oldController;
  main.gameplayRegistry = {};
  const signalController = new AbortController();
  const transition = main.startGameplay(signalController.signal) as Promise<void>;

  await waitForStart(oldController);
  invalidate(main, signalController, clearSession);
  // Simulate a replacement composition root/controller while the old join is
  // still in flight.  Cleanup must use the owner captured by this transition.
  main.roomController = freshController;
  oldController.result.resolve({ status: "started", generation: 1, pluginId: "ballMove" });

  await transition;
  assert.equal(closeLobbyCalls, 1, `${label}: dynamic pages continuation 应先关闭大厅`);
  assert.deepEqual(oldController.startSignals, [signalController.signal], `${label}: 应传入调用方 signal`);
  assert.deepEqual(oldController.stopReasons, [{ kind: "cancelled" }],
    `${label}: 迟到结果必须只停止旧 controller`);
  assert.deepEqual(freshController.stopReasons, [], `${label}: 新 controller 不得被旧结果清理`);
}

test("Main.startGameplay：Main destroyed 后迟到成功只清理旧 generation", async () => {
  await assertLateStartIsolated("destroyed", (main) => {
    main.destroyed = true;
  });
});

test("Main.startGameplay：AbortSignal 取消后迟到成功只清理旧 generation", async () => {
  await assertLateStartIsolated("abort", (_main, signal) => {
    signal.abort();
  });
});

test("Main.startGameplay：session generation 变化后迟到成功只清理旧 generation", async () => {
  await assertLateStartIsolated("session-generation", (_main, _signal, clearSession) => {
    clearSession();
  });
});
