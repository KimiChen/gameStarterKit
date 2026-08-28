/**
 * Execution-level coverage for the Main gameplay continuation.
 *
 * The continuation is intentionally kept private on the Cocos component, so
 * this probe imports the real class with a tiny engine stub and invokes the
 * method through its runtime shape.  A deferred controller result lets each
 * invalidation happen at the actual await boundary.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

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
