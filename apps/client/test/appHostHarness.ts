/**
 * 非测试文件：app 宿主（AppRuntime/bootstrap/loginFlow）的无头装载 harness。
 *
 * loginFlow 静态 import `cc`（sys.localStorage 允许清单），因此消费方测试必须在
 * 首次装载前打上最小 cc 桩（与 mainGameplay.test.ts 同款 module._load 补丁）。
 * 全部宿主模块在补丁窗口内一次性装载并缓存；补丁随后卸除。
 */
import { createRequire } from "node:module";

export class FakeNode {
  readonly children: FakeNode[] = [];
  readonly isValid = true;
  constructor(readonly name = "node") {}
}

type LoaderModule = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

export interface AppHostModules {
  appRuntime: typeof import("../src/app/AppRuntime");
  bootstrap: typeof import("../src/app/bootstrap");
  loginFlow: typeof import("../src/app/loginFlow");
  coordinator: typeof import("../src/app/SessionCoordinator");
  session: typeof import("../src/net/session");
  wiring: typeof import("../src/app/wiring");
  appGeneration: typeof import("../src/app/appGeneration");
  webSocketClient: typeof import("../src/net/WebSocketClient");
  http: typeof import("../src/core/http");
  /** 返回 never 便于直接充当 cc Node 形参（最小 cc 桩，无引擎属性面）。 */
  makeNode(): never;
}

let cached: Promise<AppHostModules> | null = null;

export function loadAppHost(): Promise<AppHostModules> {
  if (cached) return cached;
  cached = (async () => {
    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;

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
      const [appRuntime, bootstrap, loginFlow, coordinator, session, wiring, appGeneration, webSocketClient, http] =
        await Promise.all([
          import("../src/app/AppRuntime"),
          import("../src/app/bootstrap"),
          import("../src/app/loginFlow"),
          import("../src/app/SessionCoordinator"),
          import("../src/net/session"),
          import("../src/app/wiring"),
          import("../src/app/appGeneration"),
          import("../src/net/WebSocketClient"),
          import("../src/core/http"),
        ]);
      return {
        appRuntime,
        bootstrap,
        loginFlow,
        coordinator,
        session,
        wiring,
        appGeneration,
        webSocketClient,
        http,
        makeNode: () => new FakeNode() as never,
      };
    } finally {
      moduleApi._load = originalLoad;
    }
  })();
  return cached;
}
