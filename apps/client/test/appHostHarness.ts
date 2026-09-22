/**
 * 非测试文件：app 宿主（AppRuntime/bootstrap/loginFlow）的无头装载 harness。
 *
 * loginFlow 静态 import `cc`（sys.localStorage 允许清单），因此消费方测试必须在
 * 首次装载前打上最小 cc 桩（与 mainGameplay.test.ts 同款 module._load 补丁）。
 * 全部宿主模块在补丁窗口内一次性装载并缓存；补丁随后卸除。
 */
import { createRequire } from "node:module";
import type { Camera, DirectionalLight, Node } from "cc";
import { Stage3D, type Stage3DScene } from "../src/view/scene3d/Stage3D";
import { cloneGlobals, type Stage3DGlobalsState } from "../src/view/scene3d/stage3dGlobals";

export class FakeNode {
  readonly children: FakeNode[] = [];
  isValid = true;
  active = true;
  constructor(readonly name = "node") {}
}

/** 真实租约协调器 + 内存引擎；依赖由每个测试显式注入，生产路径不回落到此处。 */
export function createFakeStage3D(): Stage3D {
  let globals: Stage3DGlobalsState = {
    toneMapping: "default",
    fog: { enabled: false, type: "linear", density: 0, start: 0, end: 100 },
    ambient: { skyIllum: 1 },
    shadows: { enabled: false, kind: "planar" },
  };
  const scene: Stage3DScene = {
    isValid: () => true,
    isNodeValid: (node) => node.isValid,
    createNode: (name) => new FakeNode(name) as unknown as Node,
    addCamera: (node) => ({ node }) as Camera,
    addLight: (node) => ({ node }) as DirectionalLight,
    destroyNode: (node) => { (node as unknown as FakeNode).isValid = false; },
    setCameraPose: () => {},
    setCameraViewport: () => {},
    setCameraClear: () => {},
    screenPointToRay: () => ({ origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } }),
    setLightDirection: () => {},
    setLightColor: () => {},
    readViewportMetrics: () => ({
      design: { x: 0, y: 0, width: 750, height: 1624 },
      screen: { width: 750, height: 1624 },
      content: { x: 0, y: 0, width: 750, height: 1624 },
    }),
    globals: {
      read: () => cloneGlobals(globals),
      apply: (value) => { globals = cloneGlobals(value); },
    },
    subscribe: () => () => {},
  };
  return new Stage3D({ captureScene: () => scene });
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
  cocosHost: {
    listenerCount(): number;
    failNextShowRegistration(): void;
  };
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
    const hostListeners = new Map<string, Set<() => void>>();
    let failShow = false;
    const cocosHost = {
      listenerCount: () => [...hostListeners.values()].reduce((sum, set) => sum + set.size, 0),
      failNextShowRegistration: () => { failShow = true; },
    };
    const cc = {
      Component: FakeComponent,
      Node: FakeNode,
      _decorator: {
        ccclass: () => () => {},
        property: () => () => {},
      },
      view: { setDesignResolutionSize: () => {} },
      ResolutionPolicy: { FIXED_WIDTH: {} },
      director: { getScene: () => null, root: { device: {
        gfxAPI: 7, renderer: "Apple M4", capabilities: { maxVertexTextureUnits: 0 },
        hasFeature: () => false, getFormatFeatures: () => 0,
      } } },
      gfx: {
        API: { UNKNOWN: 0, GLES2: 1, GLES3: 2, METAL: 3, VULKAN: 4, WEBGL: 6, WEBGL2: 7 },
        Feature: { INSTANCED_ARRAYS: 1 }, Format: { RGBA8: 35, RGBA32F: 44, ASTC_RGBA_6X6: 93, ASTC_RGBA_8X8: 96 },
        FormatFeatureBit: { SAMPLED_TEXTURE: 2, RENDER_TARGET: 1 },
      },
      sys: {
        platform: "DESKTOP_BROWSER", Platform: { WECHAT_GAME: "WECHAT_GAME" },
        isMobile: false, isBrowser: true, isNative: false,
        getSafeAreaRect: () => ({ x: 0, y: 0, width: 1, height: 1 }),
        localStorage: {},
      },
      Canvas: class {},
      Layers: { Enum: {} },
      game: {
        on: (type: string, callback: () => void) => {
          if (type === "game_on_show" && failShow) {
            failShow = false;
            throw new Error("fake lifecycle registration failed");
          }
          const listeners = hostListeners.get(type) ?? new Set<() => void>();
          listeners.add(callback);
          hostListeners.set(type, listeners);
        },
        off: (type: string, callback: () => void) => hostListeners.get(type)?.delete(callback),
      },
      input: { on: () => {}, off: () => {} },
      Input: { EventType: { TOUCH_START: "touch-start", TOUCH_MOVE: "touch-move", TOUCH_END: "touch-end", TOUCH_CANCEL: "touch-cancel", MOUSE_WHEEL: "mouse-wheel" } },
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
        cocosHost,
        makeNode: () => new FakeNode() as never,
      };
    } finally {
      moduleApi._load = originalLoad;
    }
  })();
  return cached;
}
