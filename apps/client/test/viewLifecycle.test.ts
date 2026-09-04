/**
 * Runtime lifecycle probes for the FairyGUI shell.  The production view files
 * are Creator modules, so these tests install a deliberately small in-memory
 * cc/FGUI adapter before importing them.  This keeps the assertions focused
 * on cancellation and lease cleanup rather than on editor/runtime boot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { AreaListLogic } from "../src/logic/page/AreaListLogic";
import { LoginNoticeLogic } from "../src/logic/page/LoginNoticeLogic";
import type { INoticeListRes, WebPlatformAreaListResponse } from "../src/shared/index";
import { markFaultPoint } from "./faultMatrix";

type LoaderModule = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

type FakeListener = { callback: (...args: any[]) => unknown; target?: unknown };

interface ViewRuntime {
  FguiView: any;
  CocosView: any;
  UITransform: any;
  ViewMgr: any;
  setViewCatalog: (catalog: Record<string, any> | null) => void;
  VIEW_REGISTRY: Record<string, any>;
  LoginView: any;
  HomeView: any;
  AreaListView: any;
  LoginNoticeView: any;
  observePageAction: (action: () => unknown, label: string) => void;
  makeComponent(name?: string): any;
  makeObject(name?: string): any;
  makeList(name?: string): any;
  makeButton(name?: string): any;
  makeLoader(name?: string): any;
  makeText(name?: string): any;
  makeProgress(name?: string): any;
  getInputEnabled(): boolean;
  /** ViewMgr 层容器的 Cocos 节点（cocos 页面的挂载父节点）。 */
  getLayerNode(layer: string): any;
  /** UIPackage.createObject 调用次数：cocos 分支必须一次都不碰 FGUI 组件工厂。 */
  fguiObjectsCreated(): number;
}

let installedRuntime: ViewRuntime | null = null;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function addChild(root: any, child: any): any {
  root.addChild(child);
  return child;
}

function makeLoginRoot(runtime: ViewRuntime): any {
  const root = runtime.makeComponent("Login");
  for (const name of [
    "btn_copy", "btn_ageTip", "btn_musicon", "btn_musicoff", "btn_notice", "btn_account",
    "btn_login", "btn_server", "btn_test", "btn_clearDataCache",
  ]) addChild(root, runtime.makeButton(name));
  for (const name of ["go_topBtns", "go_top", "go_bottom"]) addChild(root, runtime.makeObject(name));
  addChild(root, runtime.makeLoader("ld_logo"));
  addChild(root, runtime.makeText("txt_progress"));
  addChild(root, runtime.makeProgress("pg_loading"));
  addChild(root, runtime.makeComponent("go_container"));
  addChild(root, runtime.makeText("txt_privacy"));
  addChild(root, runtime.makeButton("btn_select"));
  addChild(root, runtime.makeLoader("ld3_testAnim"));
  return root;
}

function makeHomeRoot(runtime: ViewRuntime): any {
  const root = runtime.makeComponent("Home");
  addChild(root, runtime.makeText("txt_userId"));
  addChild(root, runtime.makeButton("btn_enter"));
  return root;
}

function makeAreaListRoot(runtime: ViewRuntime): any {
  const root = runtime.makeComponent("AreaList");
  addChild(root, runtime.makeButton("btn_mask"));
  addChild(root, runtime.makeList("lst_server"));
  addChild(root, runtime.makeList("lst_my"));
  addChild(root, runtime.makeList("jb_tabbar"));
  addChild(root, runtime.makeLoader("ld_status2"));
  addChild(root, runtime.makeLoader("ld_status1"));
  addChild(root, runtime.makeLoader("ld_status9"));
  addChild(root, runtime.makeText("txt_title"));
  addChild(root, runtime.makeButton("btn_close"));
  return root;
}

function makeLoginNoticeRoot(runtime: ViewRuntime): any {
  const root = runtime.makeComponent("LoginNotice");
  addChild(root, runtime.makeButton("btn_mask"));
  addChild(root, runtime.makeText("txt_title"));
  const tabBar = addChild(root, runtime.makeComponent("jb_tabbar"));
  addChild(tabBar, runtime.makeList("lst_jb"));
  addChild(root, runtime.makeText("txt_content"));
  addChild(root, runtime.makeButton("tge_tip"));
  addChild(root, runtime.makeButton("btn_close"));
  return root;
}

/** Install enough of the Cocos/FairyGUI surface for FguiView + ViewMgr. */
async function loadViewRuntime(): Promise<ViewRuntime> {
  if (installedRuntime) return installedRuntime;
  class FakeNode {
    name = "node";
    layer = 0;
    active = true;
    isValid = true;
    parent: FakeNode | null = null;
    children: FakeNode[] = [];

    constructor(name = "node") { this.name = name; }

    addChild(child: FakeNode): void {
      child.parent?.removeChild(child);
      this.children.push(child);
      child.parent = this;
    }

    removeChild(child: FakeNode): void {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      if (child.parent === this) child.parent = null;
    }

    setSiblingIndex(index: number): void {
      if (!this.parent) return;
      const siblings = this.parent.children;
      const old = siblings.indexOf(this);
      if (old < 0) return;
      siblings.splice(old, 1);
      siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, this);
    }

    // ── CocosView 用到的最小 cc.Node 面 ──────────────────────────────────
    private readonly components = new Map<unknown, unknown>();

    removeFromParent(): void {
      this.parent?.removeChild(this);
    }

    setPosition(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }

    x = 0;
    y = 0;

    getComponent(type: unknown): unknown {
      return this.components.get(type) ?? null;
    }

    addComponent(type: any): unknown {
      const component = new type();
      this.components.set(type, component);
      return component;
    }

    destroy(): boolean {
      this.removeFromParent();
      this.isValid = false;
      return true;
    }
  }

  class FakeUITransform {
    width = 0;
    height = 0;
  }

  class FakeGObject {
    readonly node = new FakeNode();
    parent: FakeGComponent | null = null;
    name = "";
    width = 0;
    height = 0;
    visible = true;
    touchable = true;
    grayed = false;
    enabled = true;
    title = "";
    icon = "";
    disposed = false;
    url = "";
    text = "";
    selected = false;
    min = 0;
    max = 100;
    value = 0;
    private readonly clickListeners: FakeListener[] = [];
    private readonly listeners = new Map<string, FakeListener[]>();

    onClick(callback: (...args: any[]) => unknown, target?: unknown): void {
      this.clickListeners.push({ callback, target });
    }

    on(type: string, callback: (...args: any[]) => unknown, target?: unknown): void {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ callback, target });
      this.listeners.set(type, listeners);
    }

    off(type: string, callback?: (...args: any[]) => unknown, target?: unknown): void {
      if (!callback) {
        this.listeners.delete(type);
        return;
      }
      const listeners = this.listeners.get(type) ?? [];
      this.listeners.set(type, listeners.filter((entry) => entry.callback !== callback || entry.target !== target));
    }

    emitClick(...args: any[]): void {
      for (const entry of [...this.clickListeners]) entry.callback.apply(entry.target, args);
    }

    emit(type: string, ...args: any[]): void {
      for (const entry of [...(this.listeners.get(type) ?? [])]) entry.callback.apply(entry.target, args);
    }

    listenerCount(type?: string): number {
      return type === undefined
        ? this.clickListeners.length + [...this.listeners.values()].reduce((n, xs) => n + xs.length, 0)
        : (this.listeners.get(type)?.length ?? 0);
    }

    removeFromParent(): void {
      this.parent?.removeChild(this);
    }

    dispose(): void {
      this.removeFromParent();
      this.disposed = true;
      this.node.isValid = false;
    }

    get asCom(): FakeGComponent { return this as unknown as FakeGComponent; }
  }

  class FakeGComponent extends FakeGObject {
    private readonly childrenList: FakeGObject[] = [];
    private readonly controllers = new Map<string, { selectedIndex: number }>();
    private _numItems = 0;
    itemRenderer: ((index: number, object: FakeGObject) => void) | null = null;

    get numChildren(): number { return this.childrenList.length; }

    addChild(child: FakeGObject): FakeGObject {
      child.parent?.removeChild(child);
      this.childrenList.push(child);
      child.parent = this;
      this.node.addChild(child.node);
      return child;
    }

    removeChild(child: FakeGObject): void {
      const index = this.childrenList.indexOf(child);
      if (index >= 0) this.childrenList.splice(index, 1);
      if (child.parent === this) child.parent = null;
      this.node.removeChild(child.node);
    }

    setChildIndex(child: FakeGObject, index: number): void {
      const old = this.childrenList.indexOf(child);
      if (old < 0) return;
      this.childrenList.splice(old, 1);
      this.childrenList.splice(Math.max(0, Math.min(index, this.childrenList.length)), 0, child);
    }

    getChild<T extends FakeGObject = FakeGObject>(name: string): T {
      return this.childrenList.find((child) => child.name === name) as T;
    }

    getChildAt<T extends FakeGObject = FakeGObject>(index: number): T {
      return this.childrenList[index] as T;
    }

    getChildIndex(child: FakeGObject): number {
      return this.childrenList.indexOf(child);
    }

    get numItems(): number { return this._numItems; }

    set numItems(value: number) { this._numItems = value; }

    setVirtual(): void {}

    childIndexToItemIndex(index: number): number { return index; }

    setSize(width: number, height: number): void {
      this.width = width;
      this.height = height;
    }

    addRelation(): void {}

    getController(name: string): { selectedIndex: number } {
      let controller = this.controllers.get(name);
      if (!controller) {
        controller = { selectedIndex: 0 };
        this.controllers.set(name, controller);
      }
      return controller;
    }
  }

  class FakeGButton extends FakeGComponent {}
  class FakeGList extends FakeGComponent {}
  class FakeGLoader extends FakeGObject {}
  class FakeGLoader3D extends FakeGLoader {}
  class FakeGTextField extends FakeGObject {}
  class FakeGRichTextField extends FakeGTextField {}
  class FakeGGroup extends FakeGObject {}
  class FakeGProgressBar extends FakeGComponent {}

  class FakeGRoot extends FakeGComponent {
    static _inst: FakeGRoot | undefined;
    readonly inputProcessor = { enabled: false };

    static get inst(): FakeGRoot {
      if (!FakeGRoot._inst) FakeGRoot._inst = new FakeGRoot();
      return FakeGRoot._inst;
    }

    constructor() {
      super();
      this.node.name = "GRoot";
    }

    onWinResize(): void {
      this.width = 750;
      this.height = 1334;
    }
  }

  const packages = new Map<string, object>();
  let fguiObjectsCreated = 0;
  const fakeFgui = {
    GObject: FakeGObject,
    GComponent: FakeGComponent,
    GRoot: FakeGRoot,
    GButton: FakeGButton,
    GList: FakeGList,
    GLoader: FakeGLoader,
    GLoader3D: FakeGLoader3D,
    GTextField: FakeGTextField,
    GRichTextField: FakeGRichTextField,
    GGroup: FakeGGroup,
    GProgressBar: FakeGProgressBar,
    RelationType: { Size: 1 },
    Event: { CLICK_ITEM: "clickItem", STATUS_CHANGED: "statusChanged" },
    UIPackage: {
      getByName(name: string): object | undefined { return packages.get(name); },
      loadPackage(path: string, callback: (error: unknown, pkg?: object) => void): void {
        const name = path.slice(path.lastIndexOf("/") + 1);
        const pkg = {};
        packages.set(name, pkg);
        callback(null, pkg);
      },
      createObject(): FakeGComponent { fguiObjectsCreated += 1; return new FakeGComponent(); },
    },
  };
  const canvasNode = new FakeNode("Canvas");
  const cc = {
    Node: FakeNode,
    UITransform: FakeUITransform,
    Canvas: class { readonly node = canvasNode; },
    director: {
      getScene(): { getComponentInChildren(): { node: FakeNode } } {
        return { getComponentInChildren: () => ({ node: canvasNode }) };
      },
    },
    sys: {
      getSafeAreaRect: () => ({ x: 0, y: 0, width: 750, height: 1334 }),
      localStorage: {},
    },
    view: { getVisibleSize: () => ({ width: 750, height: 1334 }) },
  };

  const require = createRequire(import.meta.url);
  const moduleApi = require("node:module") as LoaderModule;
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
    if (request === "cc") return cc;
    if (request === "db://fairygui-cc/fairygui.mjs") return fakeFgui;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const [{ FguiView }, { CocosView }, { ViewMgr, setViewCatalog }, { VIEW_REGISTRY }, { LoginView }, { HomeView }, { AreaListView }, { LoginNoticeView }, { observePageAction }] = await Promise.all([
      import("../src/view/FguiView"),
      import("../src/view/CocosView"),
      import("../src/view/ViewMgr"),
      import("../src/view/viewRegistry"),
      import("../src/view/LoginView"),
      import("../src/view/HomeView"),
      import("../src/view/AreaListView"),
      import("../src/view/LoginNoticeView"),
      import("../src/view/pages"),
    ]);
    installedRuntime = {
      FguiView,
      CocosView,
      UITransform: FakeUITransform,
      ViewMgr,
      setViewCatalog,
      VIEW_REGISTRY: VIEW_REGISTRY as Record<string, any>,
      makeComponent: (name = "root") => {
        const component = new FakeGComponent();
        component.name = name;
        return component;
      },
      makeObject: (name = "object") => {
        const object = new FakeGObject();
        object.name = name;
        return object;
      },
      makeList: (name = "list") => {
        const list = new FakeGList();
        list.name = name;
        return list;
      },
      makeButton: (name = "button") => {
        const button = new FakeGButton();
        button.name = name;
        return button;
      },
      makeLoader: (name = "loader") => {
        const loader = new FakeGLoader();
        loader.name = name;
        return loader;
      },
      makeText: (name = "text") => {
        const text = new FakeGTextField();
        text.name = name;
        return text;
      },
      makeProgress: (name = "progress") => {
        const progress = new FakeGProgressBar();
        progress.name = name;
        return progress;
      },
      getInputEnabled: () => FakeGRoot.inst.inputProcessor.enabled,
      getLayerNode: (layer: string) => FakeGRoot.inst.node.children.find((child) => child.name === `layer_${layer}`),
      fguiObjectsCreated: () => fguiObjectsCreated,
      LoginView,
      HomeView,
      AreaListView,
      LoginNoticeView,
      observePageAction,
    };
    return installedRuntime;
  } finally {
    moduleApi._load = originalLoad;
  }
}

test("FguiView closeLifecycle publishes its promise before synchronous re-entry", async () => {
  const { FguiView } = await loadViewRuntime();
  let closeCalls = 0;
  let view: any;
  class ReentrantView extends FguiView {
    constructor(root: any) { super(root); }

    protected bind(): void {}

    protected onCloseLifecycle(): void {
      closeCalls += 1;
      // Both paths synchronously re-enter the close boundary. They must see
      // the already-published promise and avoid invoking the hook recursively.
      view.closeLifecycle();
      view.dispose();
    }
  }
  const root = { removeFromParent(): void {}, dispose(): void {} } as any;
  view = new ReentrantView(root);
  const context = view.beginLifecycle(1);
  const close = view.closeLifecycle();
  assert.equal(context.isActive(), false);
  await close;
  await view.closeLifecycle();
  assert.equal(closeCalls, 1);
  assert.equal(view.isDisposed, true);
});

test("FguiView runs an instance create hook once across a cancelled generation", async () => {
  const { FguiView } = await loadViewRuntime();
  const gate = deferred<void>();
  let creates = 0;
  class TestView extends FguiView {
    constructor(root: any) { super(root); }

    protected bind(): void {}

    protected onCreate(): Promise<void> {
      creates += 1;
      return gate.promise;
    }
  }
  const root = { removeFromParent(): void {}, dispose(): void {} } as any;
  const view = new TestView(root);
  const first = view.beginLifecycle(1);
  const firstRun = view.runCreate(first);
  await Promise.resolve();
  view.closeLifecycle();
  const second = view.beginLifecycle(2);
  const secondRun = view.runCreate(second);
  assert.equal(creates, 1, "the second generation must share the first create flight");
  gate.resolve();
  await assert.rejects(firstRun, /页面打开世代已失效/);
  await secondRun;
  assert.equal(creates, 1, "a successful cancelled-generation hook must not rerun");
  markFaultPoint("view-close-deferred");
  view.dispose();
});

test("ViewMgr detaches a view when disabling input throws", async () => {
  const { FguiView, ViewMgr, VIEW_REGISTRY } = await loadViewRuntime();
  class TestView extends FguiView {
    protected bind(): void {}
  }
  const name = "__cleanup_probe__";
  VIEW_REGISTRY[name] = {
    name,
    contract: { pkg: "TestCleanup", comp: "Root", required: [] },
    layer: "top",
    fullscreen: false,
    onlyOne: false,
    permanent: false,
    interactive: true,
    load: async () => TestView,
  };
  const originalSetInputEnabled = FguiView.setInputEnabled;
  let throwOnDisable = false;
  FguiView.setInputEnabled = ((enabled: boolean): void => {
    if (!enabled && throwOnDisable) throw new Error("input processor disposed");
    originalSetInputEnabled.call(FguiView, enabled);
  }) as typeof FguiView.setInputEnabled;
  let handle: any = null;
  try {
    handle = await ViewMgr.open(name);
    throwOnDisable = true;
    assert.doesNotThrow(() => handle.close());
    assert.equal(handle.view.isDisposed, true);
    assert.equal(ViewMgr.isOpen(name), false);
  } finally {
    handle?.close();
    FguiView.setInputEnabled = originalSetInputEnabled;
    delete VIEW_REGISTRY[name];
  }
});

test("ViewMgr teardown closes active uncached views and permits a fresh root", async () => {
  const { FguiView, ViewMgr, VIEW_REGISTRY } = await loadViewRuntime();
  const name = "__uncached_teardown_probe__";
  let closeCalls = 0;
  class TestView extends FguiView {
    constructor(root: any) { super(root); }

    protected bind(): void {}

    protected onCloseLifecycle(): void {
      closeCalls += 1;
    }
  }
  VIEW_REGISTRY[name] = {
    name,
    contract: { pkg: "TestUncachedTeardown", comp: "Root", required: [] },
    layer: "top",
    fullscreen: false,
    onlyOne: false,
    permanent: false,
    interactive: true,
    load: async () => TestView,
  };
  let first: any = null;
  let second: any = null;
  try {
    first = await ViewMgr.open(name);
    assert.equal(first.signal.aborted, false);
    ViewMgr.disposeViewRoot();
    assert.equal(first.signal.aborted, true);
    assert.equal(first.view.isDisposed, true);
    assert.equal(closeCalls, 1);

    second = await ViewMgr.open(name);
    assert.notEqual(second, first);
    second.close();
    assert.equal(second.view.isDisposed, true);
    assert.equal(closeCalls, 2);
  } finally {
    first?.close();
    second?.close();
    ViewMgr.disposeViewRoot();
    delete VIEW_REGISTRY[name];
  }
});

test("ViewMgr catalog 注入 seam：替身 catalog 不触碰生产 catalog，复位后按名回落 generated", async () => {
  const { FguiView, ViewMgr, setViewCatalog, VIEW_REGISTRY } = await loadViewRuntime();
  class StubView extends FguiView {
    protected bind(): void {}
  }
  const name = "__injected_catalog_probe__";
  const stubCatalog: Record<string, any> = {
    [name]: {
      name,
      contract: { pkg: "TestInjected", comp: "Root", required: [] },
      layer: "top",
      fullscreen: false,
      onlyOne: false,
      permanent: false,
      interactive: false,
      load: async () => StubView,
    },
  };
  let handle: any = null;
  try {
    setViewCatalog(stubCatalog);
    handle = await ViewMgr.open(name);
    assert.equal(handle.view instanceof StubView, true, "注入 catalog 后 open 必须按替身元数据加载");
    assert.equal(name in VIEW_REGISTRY, false, "注入是整表替换，⛔ 不得改写生产 catalog");
    await assert.rejects(ViewMgr.open("Login"), /未注册页面/, "替身 catalog 之外的页面必须 fail-fast");
    handle.close();
    setViewCatalog(null);
    assert.ok(VIEW_REGISTRY["Login"], "复位后默认查询源回到 generated catalog（经 viewRegistry façade）");
    await assert.rejects(ViewMgr.open(name), /未注册页面/, "复位后替身条目不得残留（无运行时注销语义）");
  } finally {
    handle?.close();
    setViewCatalog(null);
    ViewMgr.disposeViewRoot();
  }
});

/** cocos 路由页面的元数据：⛔ 无 FGUI 段（contract/sharedPkgs 是 FguiViewMeta 才有的字段）。 */
function cocosRouteMeta(name: string, ctor: unknown, overrides: Record<string, unknown> = {}): any {
  return {
    name,
    kind: "cocos",
    layer: "base",
    fullscreen: true,
    onlyOne: true,
    permanent: false,
    // cocos 页面固定 interactive:false：FGUI 的 InputProcessor 一开就全屏吞指针，
    // 自建节点上的 Cocos 事件收不到（见 CocosView 类注释）。
    interactive: false,
    load: async () => ctor,
    ...overrides,
  };
}

test("ViewMgr kind:\"cocos\" 路由页面：跳过 FGUI 创建、挂层容器节点，事务序与 FGUI 分支逐段一致", async () => {
  const runtime = await loadViewRuntime();
  const name = "__cocos_route_probe__";
  const hooks: string[] = [];
  const created: any[] = [];
  class ProbeCocosView extends runtime.CocosView {
    constructor() {
      super();
      created.push(this);
    }

    protected onCreate(): void { hooks.push("create"); }
    protected onOpen(): void { hooks.push("open"); }
    protected onCloseLifecycle(): void { hooks.push("close"); }
  }
  runtime.VIEW_REGISTRY[name] = cocosRouteMeta(name, ProbeCocosView);
  let handle: any = null;
  let reopened: any = null;
  try {
    runtime.ViewMgr.disposeViewRoot();
    const fguiObjectsBefore = runtime.fguiObjectsCreated();
    handle = await runtime.ViewMgr.open(name, () => { hooks.push("setup"); });

    assert.ok(handle.view instanceof ProbeCocosView,
      "cocos 页面必须由 catalog 的 load 闭包直接实例化（⛔ 不经 UIPackage.createObject）");
    assert.equal(runtime.fguiObjectsCreated(), fguiObjectsBefore,
      "cocos 分支必须跳过 FGUI 组件创建（ensurePackages/createObject 一次都不碰）");
    assert.deepEqual(hooks, ["create", "open", "setup"],
      "事务序 runCreate → mount → runOpen → setup 必须与 FGUI 分支一致");

    const layerNode = runtime.getLayerNode("base");
    assert.ok(layerNode, "base 层容器必须已建立");
    assert.equal(handle.view.root.parent, layerNode,
      "cocos 页面必须挂在层容器的 .node 下（⛔ 不挂 GComponent）");
    const transform = handle.view.root.getComponent(runtime.UITransform);
    assert.equal(transform.width, 750, "全屏 cocos 页面必须按层容器尺寸铺满（宽）");
    assert.equal(transform.height, 1334, "全屏 cocos 页面必须按层容器尺寸铺满（高）");
    assert.equal(runtime.getInputEnabled(), false,
      "interactive:false 的 cocos 页面 ⛔ 不得启用 FGUI 输入（否则自建节点收不到触摸）");

    const first = handle.view;
    handle.close();
    handle.close();
    assert.deepEqual(hooks, ["create", "open", "setup", "close"], "二次 close 幂等");
    assert.equal(first.isDisposed, true, "关闭非 permanent 的 cocos 页面必须销毁实例");
    assert.equal(first.root.isValid, false, "close 必须销毁 cocos 节点树");
    assert.equal(first.root.parent, null, "close 必须把节点从层容器摘下");
    assert.equal(runtime.ViewMgr.isOpen(name), false);

    reopened = await runtime.ViewMgr.open(name);
    assert.notEqual(reopened.view, first, "重开必须得到新实例（非 permanent）");
    assert.equal(created.length, 2);
    assert.equal(reopened.view.root.parent, runtime.getLayerNode("base"));
  } finally {
    handle?.close();
    reopened?.close();
    runtime.ViewMgr.disposeViewRoot();
    delete runtime.VIEW_REGISTRY[name];
  }
});

test("ViewMgr cocos 路由页面：在途 close 在实例化前拦截；teardown 关闭并销毁节点树", async () => {
  const runtime = await loadViewRuntime();
  const name = "__cocos_cancel_probe__";
  const created: any[] = [];
  let closeCalls = 0;
  let gate: Deferred<void> | null = null;
  class ProbeCocosView extends runtime.CocosView {
    constructor() {
      super();
      created.push(this);
    }

    protected onCloseLifecycle(): void { closeCalls += 1; }
  }
  runtime.VIEW_REGISTRY[name] = cocosRouteMeta(name, ProbeCocosView, {
    load: async () => {
      if (gate) await gate.promise;
      return ProbeCocosView;
    },
  });
  let opened: any = null;
  let afterTeardown: any = null;
  try {
    runtime.ViewMgr.disposeViewRoot();

    // 在途取消：与 FGUI 分支同一段（load 之后的 ensurePendingActive）拦截，⛔ 不留幽灵实例。
    gate = deferred<void>();
    const opening = runtime.ViewMgr.open(name);
    runtime.ViewMgr.close(name);
    gate.resolve();
    await assert.rejects(opening, /页面打开已取消/);
    assert.equal(created.length, 0, "在途取消必须在实例化前拦截（不得建出无人回收的节点树）");
    assert.equal(runtime.ViewMgr.isOpen(name), false);
    gate = null;

    // teardown：场景/GRoot 重载时 cocos 页面与 FGUI 页面同批关闭并销毁。
    opened = await runtime.ViewMgr.open(name);
    const view = opened.view;
    assert.equal(opened.signal.aborted, false);
    runtime.ViewMgr.disposeViewRoot();
    assert.equal(opened.signal.aborted, true);
    assert.equal(closeCalls, 1, "teardown 必须且只能关闭一次");
    assert.equal(view.isDisposed, true);
    assert.equal(view.root.isValid, false, "teardown 必须销毁 cocos 节点树");

    afterTeardown = await runtime.ViewMgr.open(name);
    assert.notEqual(afterTeardown.view, view, "teardown 后必须能在新层容器上重开");
    assert.equal(afterTeardown.view.root.parent, runtime.getLayerNode("base"));
    afterTeardown.close();
    assert.equal(closeCalls, 2);
  } finally {
    gate?.resolve();
    opened?.close();
    afterTeardown?.close();
    runtime.ViewMgr.disposeViewRoot();
    delete runtime.VIEW_REGISTRY[name];
  }
});

test("ViewMgr cacheable open transaction rolls back mount/onOpen/setup/render failures and input lease", async () => {
  const runtime = await loadViewRuntime();
  const name = "__open_transaction_probe__";
  const modes: Array<"mount" | "open" | "setup" | "render"> = ["mount", "open", "setup", "render"];
  let mode: "mount" | "open" | "setup" | "render" = "mount";
  const created: any[] = [];
  class ProbeView extends runtime.FguiView {
    constructor(root: any) {
      super(root);
      created.push(this);
    }

    protected bind(): void {}

    protected onOpen(): void {
      if (mode === "open") throw new Error("open failed");
    }

    mountTo(parent?: any): this {
      super.mountTo(parent);
      if (mode === "mount") throw new Error("mount failed");
      return this;
    }

    render(): void {
      if (mode === "render") throw new Error("render failed");
    }
  }
  runtime.VIEW_REGISTRY[name] = {
    name,
    contract: { pkg: "OpenTransactionProbe", comp: "Root", required: [] },
    layer: "top",
    fullscreen: false,
    onlyOne: true,
    permanent: false,
    interactive: true,
    load: async () => ProbeView,
  };
  try {
    runtime.ViewMgr.disposeViewRoot();
    for (const nextMode of modes) {
      mode = nextMode;
      const action = nextMode === "setup"
        ? () => { throw new Error("setup failed"); }
        : nextMode === "render"
          ? (view: any) => view.render()
          : undefined;
      await assert.rejects(runtime.ViewMgr.open(name, action), new RegExp(`${nextMode} failed`));
      const view = created.at(-1);
      assert.equal(view.isDisposed, true, `${nextMode} 失败后 View 必须销毁`);
      assert.equal((view as any).root.parent, null, `${nextMode} 失败后组件必须摘下`);
      assert.equal(runtime.ViewMgr.isOpen(name), false, `${nextMode} 失败后不得留下缓存入口`);
      assert.equal(runtime.getInputEnabled(), false, `${nextMode} 失败后必须归还输入租约`);
    }
  } finally {
    runtime.ViewMgr.disposeViewRoot();
    delete runtime.VIEW_REGISTRY[name];
  }
});

test("ViewMgr permanent remount preserves setup errors and remains retryable", async () => {
  const runtime = await loadViewRuntime();
  const name = "__permanent_remount_probe__";
  let closeCalls = 0;
  class ProbeView extends runtime.FguiView {
    protected bind(): void {}
    protected onCloseLifecycle(): void { closeCalls++; }
  }
  runtime.VIEW_REGISTRY[name] = {
    name,
    contract: { pkg: "PermanentRemountProbe", comp: "Root", required: [] },
    layer: "top",
    fullscreen: false,
    onlyOne: true,
    permanent: true,
    interactive: true,
    load: async () => ProbeView,
  };
  let first: any = null;
  let reopened: any = null;
  try {
    runtime.ViewMgr.disposeViewRoot();
    first = await runtime.ViewMgr.open(name);
    const ownedView = first.view;
    first.close();
    first.close();
    assert.equal(closeCalls, 1, "同一 permanent 句柄二次 close 只能执行一次 onClose");
    assert.equal(ownedView.isDisposed, false, "permanent close 只卸载、不销毁实例");

    await assert.rejects(
      runtime.ViewMgr.open(name, () => { throw new Error("remount setup failed"); }),
      /remount setup failed/,
    );
    assert.equal(runtime.ViewMgr.isOpen(name), false);
    assert.equal(runtime.getInputEnabled(), false);
    assert.equal(ownedView.isDisposed, false, "失败回滚后 permanent 实例仍可重试");
    assert.equal(closeCalls, 2, "失败的重挂事务也必须只关闭其自身世代");

    reopened = await runtime.ViewMgr.open(name);
    assert.equal(reopened.view, ownedView);
    assert.notEqual(reopened, first, "每次重挂必须获得新世代句柄");
    reopened.close();
    reopened.close();
    first.close();
    assert.equal(closeCalls, 3, "旧世代句柄不得关闭新重挂世代");
  } finally {
    first?.close();
    reopened?.close();
    runtime.ViewMgr.disposeViewRoot();
    delete runtime.VIEW_REGISTRY[name];
  }
});

test("ViewMgr permanent stale handle cannot close a remounted same-name generation", async () => {
  const runtime = await loadViewRuntime();
  const name = "__permanent_identity_probe__";
  let closeCalls = 0;
  class ProbeView extends runtime.FguiView {
    protected bind(): void {}
    protected onCloseLifecycle(): void { closeCalls++; }
  }
  runtime.VIEW_REGISTRY[name] = {
    name,
    contract: { pkg: "PermanentIdentityProbe", comp: "Root", required: [] },
    layer: "top",
    fullscreen: false,
    onlyOne: true,
    permanent: true,
    interactive: true,
    load: async () => ProbeView,
  };
  let first: any = null;
  let reopened: any = null;
  try {
    runtime.ViewMgr.disposeViewRoot();
    first = await runtime.ViewMgr.open(name);
    // Close through the manager so the old handle remains apparently live;
    // this is the identity-only path, independent of state.closed idempotence.
    runtime.ViewMgr.close(name);
    assert.equal(runtime.ViewMgr.isOpen(name), false);

    reopened = await runtime.ViewMgr.open(name);
    assert.notEqual(reopened, first);
    assert.equal(runtime.ViewMgr.isOpen(name), true);
    const closeCountBeforeStale = closeCalls;

    first.close();

    assert.equal(runtime.ViewMgr.isOpen(name), true,
      "未关闭的旧句柄不得按名称关闭新重挂世代");
    assert.equal(closeCalls, closeCountBeforeStale,
      "旧句柄调用 close 不得触发新世代 onClose");
    reopened.close();
    assert.equal(closeCalls, closeCountBeforeStale + 1);
  } finally {
    first?.close();
    reopened?.close();
    runtime.ViewMgr.disposeViewRoot();
    delete runtime.VIEW_REGISTRY[name];
  }
});

test("ViewMgr interactive lease stays enabled until the last view closes, then restores input", async () => {
  const runtime = await loadViewRuntime();
  const firstName = "__lease_first__";
  const secondName = "__lease_second__";
  class ProbeView extends runtime.FguiView {
    protected bind(): void {}
  }
  for (const name of [firstName, secondName]) {
    runtime.VIEW_REGISTRY[name] = {
      name,
      contract: { pkg: `LeaseProbe_${name}`, comp: "Root", required: [] },
      layer: "top",
      fullscreen: false,
      onlyOne: false,
      permanent: false,
      interactive: true,
      load: async () => ProbeView,
    };
  }
  let first: any = null;
  let second: any = null;
  try {
    runtime.ViewMgr.disposeViewRoot();
    first = await runtime.ViewMgr.open(firstName);
    assert.equal(runtime.getInputEnabled(), true);
    second = await runtime.ViewMgr.open(secondName);
    assert.equal(runtime.getInputEnabled(), true);
    first.close();
    assert.equal(runtime.getInputEnabled(), true, "仍有交互页时不能提前恢复输入");
    second.close();
    assert.equal(runtime.getInputEnabled(), false, "最后一个交互页关闭后恢复输入");
  } finally {
    first?.close();
    second?.close();
    runtime.ViewMgr.disposeViewRoot();
    delete runtime.VIEW_REGISTRY[firstName];
    delete runtime.VIEW_REGISTRY[secondName];
  }
});

test("concrete View setup is idempotent across repeated calls and keeps the latest callback", async () => {
  const runtime = await loadViewRuntime();

  const loginRoot = makeLoginRoot(runtime);
  const login = runtime.FguiView.fromComponent(runtime.LoginView, loginRoot);
  let enters = 0;
  login.onEnter = () => { enters++; };
  login.onNotice = () => {};
  login.onSelectServer = () => {};
  for (let i = 0; i < 100; i++) login.setup();
  assert.equal(loginRoot.getChild("btn_login").listenerCount(), 1);
  assert.equal(loginRoot.getChild("btn_notice").listenerCount(), 1);
  assert.equal(loginRoot.getChild("btn_select").listenerCount(), 1);
  assert.equal(loginRoot.getChild("btn_server").listenerCount(), 1);
  loginRoot.getChild("btn_login").emitClick();
  assert.equal(enters, 1, "重复 setup 后一次点击只能触发一次 action");

  const homeRoot = makeHomeRoot(runtime);
  const home = runtime.FguiView.fromComponent(runtime.HomeView, homeRoot);
  let homeEnters = 0;
  home.onEnterBattle = () => { homeEnters++; };
  for (let i = 0; i < 100; i++) home.setup(`u-${i}`);
  assert.equal(homeRoot.getChild("btn_enter").listenerCount(), 1);
  homeRoot.getChild("btn_enter").emitClick();
  assert.equal(homeEnters, 1);

  const areaRoot = makeAreaListRoot(runtime);
  const areaView = runtime.FguiView.fromComponent(runtime.AreaListView, areaRoot);
  const areaLogic = new AreaListLogic({ fetchAreaList: async () => ({
    isOps: false, hash: "", servers: [], myServerIds: [],
  }) });
  for (let i = 0; i < 100; i++) areaView.setup(areaLogic);
  assert.equal(areaRoot.getChild("btn_mask").listenerCount(), 1);
  assert.equal(areaRoot.getChild("btn_close").listenerCount(), 1);
  assert.equal(areaRoot.getChild("jb_tabbar").listenerCount("clickItem"), 1);
  assert.equal(areaRoot.getChild("lst_server").listenerCount("clickItem"), 1);

  const noticeRoot = makeLoginNoticeRoot(runtime);
  const noticeView = runtime.FguiView.fromComponent(runtime.LoginNoticeView, noticeRoot);
  const noticeLogic = new LoginNoticeLogic({
    fetchNotices: async () => ({ list: [] }),
    readDontRemindToday: () => false,
    writeDontRemindToday: () => {},
  });
  for (let i = 0; i < 100; i++) noticeView.setup(noticeLogic);
  assert.equal(noticeRoot.getChild("btn_mask").listenerCount(), 1);
  assert.equal(noticeRoot.getChild("btn_close").listenerCount(), 1);
  assert.equal(noticeRoot.getChild("tge_tip").listenerCount("statusChanged"), 1);
  assert.equal(noticeRoot.getChild("jb_tabbar").getChild("lst_jb").listenerCount("clickItem"), 1);

  login.dispose();
  home.dispose();
  areaView.dispose();
  noticeView.dispose();
});

test("concrete AreaList/LoginNotice closeLifecycle stops pending logic before late UI callbacks", async () => {
  const runtime = await loadViewRuntime();

  const areaPending = deferred<WebPlatformAreaListResponse>();
  let areaSignal: AbortSignal | undefined;
  const areaRoot = makeAreaListRoot(runtime);
  const areaView = runtime.FguiView.fromComponent(runtime.AreaListView, areaRoot);
  const areaLogic = new AreaListLogic({
    fetchAreaList: async (signal) => {
      areaSignal = signal;
      return areaPending.promise;
    },
  });
  areaView.setup(areaLogic);
  areaView.beginLifecycle(10_001);
  const areaStart = areaLogic.start();
  await areaView.closeLifecycle();
  assert.equal(areaSignal?.aborted, true, "AreaListView close 必须调用真实 logic.stop");
  areaPending.resolve({
    isOps: false,
    hash: "late",
    servers: [{
      serverId: 1,
      name: "late",
      status: "smooth",
      tag: "normal",
      openTime: 1,
      gameHttpUrl: "http://127.0.0.1:3001",
      gameWsUrl: "ws://127.0.0.1:3001",
    }],
    myServerIds: [],
  });
  await areaStart;
  assert.equal(areaRoot.getChild("jb_tabbar").numItems, 0);
  assert.equal(areaRoot.getChild("lst_server").numItems, 0);
  areaView.dispose();

  const noticePending = deferred<INoticeListRes>();
  let noticeSignal: AbortSignal | undefined;
  const noticeRoot = makeLoginNoticeRoot(runtime);
  const noticeView = runtime.FguiView.fromComponent(runtime.LoginNoticeView, noticeRoot);
  const noticeLogic = new LoginNoticeLogic({
    fetchNotices: async (signal) => {
      noticeSignal = signal;
      return noticePending.promise;
    },
    readDontRemindToday: () => false,
    writeDontRemindToday: () => {},
  });
  noticeView.setup(noticeLogic);
  noticeView.beginLifecycle(10_002);
  const noticeStart = noticeLogic.start();
  await noticeView.closeLifecycle();
  assert.equal(noticeSignal?.aborted, true, "LoginNoticeView close 必须调用真实 logic.stop");
  noticePending.resolve({
    list: [{ id: 1, category: "notice", title: "late", desc: "", content: "late", at: 1 }],
  });
  await noticeStart;
  assert.equal(noticeRoot.getChild("jb_tabbar").getChild("lst_jb").numItems, 0);
  assert.equal(noticeRoot.getChild("txt_content").text, "");
  noticeView.dispose();
});

test("LoginView setProgress normalizes ratio and marks unsupported controls as placeholders", async () => {
  const runtime = await loadViewRuntime();
  const root = makeLoginRoot(runtime);
  const view = runtime.FguiView.fromComponent(runtime.LoginView, root);
  const progress = root.getChild("pg_loading");
  progress.min = 10;
  progress.max = 110;
  view.setProgress(0.25, "quarter");
  assert.equal(progress.value, 35);
  view.setProgress(0.5, "half");
  assert.equal(progress.value, 60);
  view.setProgress(-1, "low");
  assert.equal(progress.value, 10);
  view.setProgress(2, "high");
  assert.equal(progress.value, 110);
  view.setProgress(Number.NaN, "nan");
  assert.equal(progress.value, 10);
  assert.equal(root.getChild("txt_progress").text, "nan");

  view.setup();
  for (const name of [
    "btn_copy", "btn_ageTip", "btn_musicon", "btn_musicoff", "btn_account", "btn_test", "btn_clearDataCache",
  ]) {
    const control = root.getChild(name);
    assert.equal(control.touchable, false, `${name} 不支持当前能力时不可交互`);
    assert.equal(control.grayed, true, `${name} 应明确置灰`);
  }
  assert.equal(root.getChild("ld3_testAnim").visible, false);
  view.dispose();
});

test("View event boundary observes rejected async actions without unhandledRejection", async () => {
  const runtime = await loadViewRuntime();
  const root = makeLoginRoot(runtime);
  const view = runtime.FguiView.fromComponent(runtime.LoginView, root);
  const rejection = new Error("async click failed");
  let unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    view.onEnter = () => Promise.reject(rejection);
    view.setup();
    root.getChild("btn_login").emitClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(unhandled, [], "事件回调 rejection 必须被观察");
  } finally {
    process.off("unhandledRejection", onUnhandled);
    view.dispose();
  }
});

test("page navigation boundary observes rejected async actions without unhandledRejection", async () => {
  const { observePageAction } = await loadViewRuntime();
  const rejection = new Error("async navigation failed");
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    observePageAction(() => Promise.reject(rejection), "test-navigation");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(unhandled, [], "页面导航 rejection 必须被观察");
    // 阶段 5b：页面组合根状态机迁至 app/loginFlow.ts（view/pages.ts 为零状态转发
    // façade），导航调用点源文本 pin 跟随迁移。
    const pagesSource = readFileSync(new URL("../src/app/loginFlow.ts", import.meta.url), "utf8");
    assert.match(
      pagesSource,
      /view\.onNotice\s*=\s*\(\)\s*=>\s*\{\s*observePageAction\(\(\)\s*=>\s*openNotice\(\),\s*"openNotice"\);\s*\}/,
      "Login 公告导航调用点必须经过被测 observePageAction 边界",
    );
    assert.match(
      pagesSource,
      /view\.onSelectServer\s*=\s*\(\)\s*=>\s*\{\s*observePageAction\(\(\)\s*=>\s*openAreaList\(/,
      "Login 选服导航调用点必须经过被测 observePageAction 边界",
    );
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("pages login flight：重复打开与重复进入只完成一次首屏导航", async () => {
  const runtime = await loadViewRuntime();
  const pages = await import("../src/view/pages");
  const { initPortal } = await import("../src/core/http");
  const { clearSession } = await import("../src/net/session");
  const { WebSocketClient } = await import("../src/net/WebSocketClient");

  class LoginFlowXhr {
    static readonly requests: Array<{ method: string; url: string; body: unknown }> = [];
    private method = "";
    private url = "";
    status = 0;
    responseText = "";
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;

    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(): void {}

    send(body?: unknown): void {
      LoginFlowXhr.requests.push({ method: this.method, url: this.url, body });
      this.status = 200;
      this.responseText = JSON.stringify(this.url.endsWith("/v1/areas") ? {
        hash: "login-flight-directory",
        isOps: false,
        myServerIds: [],
        servers: [{
          serverId: 7,
          name: "区7",
          status: "smooth",
          tag: "normal",
          openTime: 1,
          gameHttpUrl: "https://game-7.example",
          gameWsUrl: "wss://game-7.example",
        }],
      } : {
        userId: "login-flight-user",
        accessToken: "login-flight-access-token",
        isNewAccount: false,
      });
      queueMicrotask(() => this.onload?.());
    }
  }

  const originalXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  const mgr = runtime.ViewMgr as any;
  const originalMgr = {
    open: mgr.open,
    close: mgr.close,
    disposeViewRoot: mgr.disposeViewRoot,
  };
  const socket = WebSocketClient.inst as any;
  const originalSocket = {
    init: socket.init,
    join: socket.join,
    rpc: socket.rpc,
    leave: socket.leave,
  };
  const joinGate = deferred<void>();
  let joinCalls = 0;
  let rpcCalls = 0;
  let loginOpens = 0;
  let promoOpens = 0;
  let settingsOpens = 0;
  let loginCloses = 0;
  let loginActive = true;
  let firstBattle = 0;
  let latestBattle = 0;
  let postSetupBattle = 0;
  const loginView: any = {
    onEnter: null,
    onNotice: null,
    onSelectServer: null,
    setProgress: () => {},
    setup: () => {},
    showCurrentServer: () => {},
  };
  // 宣传首屏的 setup 只收 PromoHomeLogic（⛔ 无 onEnterBattle 字段——首屏不摆玩法入口）。
  let promoLogic: any = null;
  const promoView: any = { setup: (logic: any) => { promoLogic = logic; } };
  const settingsView: any = { onClose: null, setup: () => {} };
  const loginController = new AbortController();
  const loginContext = {
    signal: loginController.signal,
    generation: 1,
    isActive: () => loginActive,
  };
  const promoContext = {
    signal: new AbortController().signal,
    generation: 2,
    isActive: () => true,
  };
  const settingsContext = {
    signal: new AbortController().signal,
    generation: 3,
    isActive: () => true,
  };
  const handle = (view: any, context: any, close: () => void): any => ({
    view,
    signal: context.signal,
    generation: context.generation,
    close,
    run: async (action: (opened: any, activeContext: any) => unknown) => action(view, context),
  });
  const scope = (() => {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = LoginFlowXhr;
    initPortal("https://portal.example");
    clearSession();
    socket.init = () => {};
    socket.join = async () => { joinCalls++; await joinGate.promise; };
    socket.rpc = async () => {
      rpcCalls++;
      return {
        user: {
          uid: "login-flight-user",
          star: 0,
          maxRound: 0,
          wins: 0,
          losses: 0,
          stamina: 100,
          lastStaminaRecoverAt: 0,
          musicOn: true,
          sfxOn: true,
          guildId: 0,
          ver: 1,
        },
      };
    };
    socket.leave = async () => {};
    mgr.open = async (name: string) => {
      if (name === "Login") {
        loginOpens++;
        return handle(loginView, loginContext, () => {
          if (!loginActive) return;
          loginActive = false;
          loginCloses++;
          loginController.abort();
        });
      }
      if (name === "PromoHome") {
        promoOpens++;
        return handle(promoView, promoContext, () => {});
      }
      if (name === "Settings") {
        settingsOpens++;
        return handle(settingsView, settingsContext, () => {});
      }
      throw new Error(`unexpected page ${name}`);
    };
    mgr.close = () => {};
    mgr.disposeViewRoot = () => {};
    return pages.createPageSessionScope();
  })();

  try {
    const loadingFirst = pages.openLogin(() => { firstBattle++; }, scope);
    const loadingLatest = pages.openLogin(() => { latestBattle++; }, scope);
    assert.strictEqual(loadingLatest, loadingFirst, "重复 openLogin 必须合流同一 flight");
    await loadingFirst;
    assert.equal(loginOpens, 1);
    assert.equal(LoginFlowXhr.requests.filter((request) => request.url.endsWith("/v1/areas")).length, 1);

    const enter = loginView.onEnter as () => Promise<void>;
    assert.equal(typeof enter, "function");
    const enteringFirst = enter();
    const enteringAgain = enter();
    assert.strictEqual(enteringAgain, enteringFirst, "重复点击进入必须合流完整登录 continuation");
    for (let spin = 0; spin < 20 && joinCalls === 0; spin++) await Promise.resolve();
    assert.equal(joinCalls, 1);
    const reopenedAfterSetup = pages.openLogin(() => { postSetupBattle++; }, scope);
    assert.strictEqual(reopenedAfterSetup, loadingFirst,
      "Login setup 已完成但 Enter 仍在途时也必须复用同一 active flight");
    assert.strictEqual(loginView.onEnter?.(), enteringFirst,
      "setup 后重复 openLogin 不得换掉在途 LoginLogic continuation");
    assert.equal(loginOpens, 1);
    joinGate.resolve(undefined);
    await enteringFirst;

    assert.equal(LoginFlowXhr.requests.filter((request) => request.method === "POST").length, 1,
      "完整 flow 只能签发一次开发会话");
    assert.equal(rpcCalls, 1);
    assert.equal(loginCloses, 1, "成功登录只关闭一次 Login");
    assert.equal(loginActive, false, "假句柄必须复现真实 close 的同步 context 失效");
    assert.equal(promoOpens, 1, "关闭 Login 后仍必须且只能导航一次首屏");

    // ⚠ authenticated base 从 FGUI Home 改为宣传首屏（docs/PLUGIN.md §6）后，「首屏绑定
    // 哪个 enterBattle 回调」这个判据随调用点一起消失——首屏 ⛔ 不摆玩法入口，也就不再
    // 绑定任何 enterBattle。这里把断言翻转成新契约的机检：三个计数都必须是 0，谁把玩法
    // 入口塞回首屏（重新绑上 flight 回调）就会红。
    assert.equal((promoView as { onEnterBattle?: unknown }).onEnterBattle, undefined,
      "宣传首屏 ⛔ 不得出现 onEnterBattle 绑定面（玩法入口只在设置面板）");
    assert.deepEqual({ firstBattle, latestBattle, postSetupBattle }, { firstBattle: 0, latestBattle: 0, postSetupBattle: 0 },
      "首屏不摆玩法入口：任何 Main enterBattle 回调都不得被首屏触发");

    // 首屏上唯一的动作是右上角设置按钮 → settings 路由。
    assert.equal(typeof promoLogic?.openSettings, "function", "首屏必须拿到 PromoHomeLogic");
    await promoLogic.openSettings();
    assert.equal(settingsOpens, 1, "首屏设置按钮必须打开 settings 路由");
  } finally {
    scope.dispose();
    clearSession();
    mgr.open = originalMgr.open;
    mgr.close = originalMgr.close;
    mgr.disposeViewRoot = originalMgr.disposeViewRoot;
    socket.init = originalSocket.init;
    socket.join = originalSocket.join;
    socket.rpc = originalSocket.rpc;
    socket.leave = originalSocket.leave;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXhr;
  }
});

type PageFlowBaseFailure = "open" | "setup";

interface PageFlowHarnessOptions {
  /** authenticated base（宣传首屏）在 open / setup 阶段失败一次。 */
  baseFailure?: PageFlowBaseFailure;
  baseGate?: Deferred<void>;
}

async function waitForPageFlow(predicate: () => boolean, message: string): Promise<void> {
  for (let spin = 0; spin < 100; spin++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

async function createPageFlowHarness(runtime: ViewRuntime, options: PageFlowHarnessOptions = {}) {
  const pages = await import("../src/view/pages");
  const http = await import("../src/core/http");
  const session = await import("../src/net/session");
  const { WebSocketClient } = await import("../src/net/WebSocketClient");

  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  let loginResponses = 0;
  class PageFlowXhr {
    private method = "";
    private url = "";
    status = 0;
    responseText = "";
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;

    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(): void {}

    send(body?: unknown): void {
      requests.push({ method: this.method, url: this.url, body });
      this.status = 200;
      if (this.url.endsWith("/v1/areas")) {
        this.responseText = JSON.stringify({
          hash: "page-flow-directory",
          isOps: false,
          myServerIds: [],
          servers: [{
            serverId: 9,
            name: "区9",
            status: "smooth",
            tag: "normal",
            openTime: 1,
            gameHttpUrl: "https://game-9.example",
            gameWsUrl: "wss://game-9.example",
          }],
        });
      } else {
        const generation = ++loginResponses;
        this.responseText = JSON.stringify({
          userId: `page-flow-user-${generation}`,
          accessToken: `page-flow-access-token-${generation}`,
          isNewAccount: false,
        });
      }
      queueMicrotask(() => this.onload?.());
    }
  }

  const mgr = runtime.ViewMgr as any;
  const originalMgr = {
    open: mgr.open,
    close: mgr.close,
    disposeViewRoot: mgr.disposeViewRoot,
  };
  const socket = WebSocketClient.inst as any;
  const originalSocket = {
    init: socket.init,
    join: socket.join,
    joinOwned: socket.joinOwned,
    rpc: socket.rpc,
    leave: socket.leave,
  };
  const originalXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;

  let nextViewGeneration = 0;
  const makeLifecycle = () => {
    const controller = new AbortController();
    let active = true;
    const context = {
      signal: controller.signal,
      generation: ++nextViewGeneration,
      isActive: () => active && !controller.signal.aborted,
    };
    return {
      context,
      isActive: context.isActive,
      close: () => {
        if (!active) return;
        active = false;
        controller.abort();
      },
    };
  };
  const makeHandle = (view: any, lifecycle = makeLifecycle()): any => {
    let handle: any;
    handle = {
      view,
      signal: lifecycle.context.signal,
      generation: lifecycle.context.generation,
      close: lifecycle.close,
      run: async (action: (opened: any, context: any) => unknown) => {
        if (!lifecycle.isActive()) throw new Error("page flow fake handle is inactive");
        try {
          const result = await action(view, lifecycle.context);
          if (!lifecycle.isActive()) throw new Error("page flow fake handle was closed during run");
          return result;
        } catch (error) {
          handle.close();
          throw error;
        }
      },
      isActive: lifecycle.isActive,
    };
    return handle;
  };

  const loginHandles: any[] = [];
  const baseHandles: any[] = [];
  const confirmLogics: any[] = [];
  const namedCloses: string[] = [];
  const currentHandles = new Map<string, any>();
  let baseAttempts = 0;
  let joinCalls = 0;
  let reconcileJoinCalls = 0;
  let rpcCalls = 0;
  let leaveCalls = 0;
  let rootDisposals = 0;
  /** authenticated base 每次 setup 消费到的会话摘要行（对账后必须是刷新过的快照）。 */
  const baseSetups: string[] = [];

  socket.init = () => {};
  socket.join = async () => { joinCalls++; };
  socket.joinOwned = (_token: string, _options: unknown, control: { timeoutMs?: number; signal?: AbortSignal }) => {
    reconcileJoinCalls++;
    assert.equal(control.timeoutMs, 15_000, "页面 reconciliation 必须给 Lobby join 显式超时");
    return { ready: Promise.resolve(), leave: async () => {} };
  };
  socket.rpc = async () => {
    rpcCalls++;
    return {
      user: {
        uid: `page-flow-user-${loginResponses}`,
        star: 0,
        maxRound: 0,
        wins: rpcCalls,
        losses: 0,
        stamina: 100,
        lastStaminaRecoverAt: 0,
        musicOn: true,
        sfxOn: true,
        guildId: 0,
        ver: rpcCalls,
      },
    };
  };
  socket.leave = async () => { leaveCalls++; };

  mgr.open = async (name: string) => {
    if (name === "Login") {
      const view: any = {
        onEnter: null,
        onNotice: null,
        onSelectServer: null,
        setProgress: () => {},
        setup: () => {},
        showCurrentServer: () => {},
      };
      const handle = makeHandle(view);
      loginHandles.push(handle);
      currentHandles.set(name, handle);
      return handle;
    }
    if (name === "PromoHome") {
      baseAttempts++;
      if (baseAttempts === 1 && options.baseFailure === "open") {
        throw new Error("PromoHome open failed");
      }
      const failSetup = baseAttempts === 1 && options.baseFailure === "setup";
      const view: any = {
        // 首屏的 setup 收 PromoHomeLogic；会话摘要行就是它消费权威快照的地方。
        setup: (logic: any) => {
          if (failSetup) throw new Error("PromoHome setup failed");
          baseSetups.push(logic.sessionLine());
        },
      };
      const handle = makeHandle(view);
      baseHandles.push(handle);
      currentHandles.set(name, handle);
      if (baseAttempts === 1 && options.baseGate) await options.baseGate.promise;
      return handle;
    }
    if (name === "Confirm") {
      const view = { setup: (logic: unknown) => { confirmLogics.push(logic); } };
      return makeHandle(view);
    }
    throw new Error(`unexpected page ${name}`);
  };
  mgr.close = (name: string) => {
    namedCloses.push(name);
    currentHandles.get(name)?.close();
  };
  // Keep the pending base page independent from the fake root so a non-cancellable
  // load can report a late success after the production page scope has been disposed.
  mgr.disposeViewRoot = () => { rootDisposals++; };

  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = PageFlowXhr;
  http.initPortal("https://portal.example");
  session.clearSession();
  const scope = pages.createPageSessionScope();

  return {
    pages,
    http,
    session,
    scope,
    requests,
    loginHandles,
    baseHandles,
    confirmLogics,
    namedCloses,
    get baseAttempts() { return baseAttempts; },
    get joinCalls() { return joinCalls; },
    get reconcileJoinCalls() { return reconcileJoinCalls; },
    get rpcCalls() { return rpcCalls; },
    get leaveCalls() { return leaveCalls; },
    get rootDisposals() { return rootDisposals; },
    baseSetups,
    cleanup: () => {
      scope.dispose();
      session.clearSession();
      mgr.open = originalMgr.open;
      mgr.close = originalMgr.close;
      mgr.disposeViewRoot = originalMgr.disposeViewRoot;
      socket.init = originalSocket.init;
      socket.join = originalSocket.join;
      socket.joinOwned = originalSocket.joinOwned;
      socket.rpc = originalSocket.rpc;
      socket.leave = originalSocket.leave;
      (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXhr;
    },
  };
}

test("pages Lobby 最终断线：复用 session 对账 GetInfo 并刷新首屏，不重新签发登录", async () => {
  const runtime = await loadViewRuntime();
  const harness = await createPageFlowHarness(runtime);
  try {
    await harness.pages.openLogin(() => {}, harness.scope);
    await harness.loginHandles[0].view.onEnter();
    assert.equal(harness.session.isLoggedIn(), true);
    assert.equal(harness.rpcCalls, 1);
    assert.equal(harness.baseAttempts, 1);
    const loginPostsBefore = harness.requests.filter((request) => request.method === "POST").length;

    harness.session.notifyConnLost();
    // base 恢复经 NavigationService.restoreAuthenticatedBase（多几跳微任务），以
    // setup 完成为恢复完成的判据（断言意图不变：GetInfo 对账 + 首屏消费新快照）。
    await waitForPageFlow(() => harness.rpcCalls === 2 && harness.baseSetups.length === 2,
      "最终断线后必须完成 Lobby rejoin、GetInfo 和首屏恢复");

    assert.equal(harness.reconcileJoinCalls, 1);
    assert.equal(harness.joinCalls, 1, "reconciliation 不应重跑初始隐式 join 流程");
    assert.equal(harness.requests.filter((request) => request.method === "POST").length, loginPostsBefore,
      "有效 token 对账不能重新调用会签发 token 的登录 HTTP");
    assert.equal(harness.session.isLoggedIn(), true);
    assert.equal(harness.session.getSessionProfile()?.ver, 2);
    assert.equal(harness.session.getSessionProfile()?.wins, 2);
    assert.match(harness.baseSetups.at(-1) ?? "", /2胜0负/,
      "authenticated base 必须消费刷新后的角色快照（首屏的会话摘要行）");
    assert.equal(harness.confirmLogics.length, 0, "成功对账不应弹回登录提示");
  } finally {
    harness.cleanup();
  }
});

test("pages 首屏 open/setup 失败：清理会话与 Lobby 后提示并重开可用 Login", async () => {
  const runtime = await loadViewRuntime();
  for (const failure of ["open", "setup"] as const) {
    const harness = await createPageFlowHarness(runtime, { baseFailure: failure });
    try {
      await harness.pages.openLogin(() => {}, harness.scope);
      const firstLogin = harness.loginHandles[0];
      assert.equal(typeof firstLogin?.view.onEnter, "function");

      const entering = firstLogin.view.onEnter() as Promise<void>;
      await waitForPageFlow(() => harness.confirmLogics.length === 1,
        `${failure}: 首屏失败后必须进入可确认的回登录提示`);

      assert.equal(harness.session.isLoggedIn(), false, `${failure}: 提示前必须已清理会话`);
      assert.equal(harness.session.getUserId(), "", `${failure}: 不得保留旧 userId`);
      assert.equal(harness.http.getToken(), "", `${failure}: 不得保留旧 bearer`);
      assert.equal(harness.leaveCalls, 1, `${failure}: 必须释放已建立的 Lobby`);
      assert.equal(harness.loginHandles.length, 1, `${failure}: 确认提示前不应提前重开 Login`);
      assert.equal(harness.confirmLogics[0].title, "进入失败");
      assert.equal(harness.confirmLogics[0].content, "进入对局失败，请重试");

      harness.confirmLogics[0].yes();
      await entering;

      assert.equal(harness.loginHandles.length, 2, `${failure}: 确认后必须重开 Login`);
      const reopened = harness.loginHandles[1];
      assert.equal(reopened.isActive(), true, `${failure}: 重开 Login 必须拥有活动 context`);
      assert.equal(typeof reopened.view.onEnter, "function", `${failure}: 重开 Login 必须可再次进入`);

      await reopened.view.onEnter();
      assert.equal(harness.baseAttempts, 2, `${failure}: 重试必须能完成新的首屏导航`);
      assert.equal(harness.baseHandles.at(-1)?.isActive(), true, `${failure}: 重试后首屏必须保持打开`);
      assert.equal(harness.session.isLoggedIn(), true, `${failure}: 新登录会话必须可用`);
      assert.equal(harness.joinCalls, 2);
      assert.equal(harness.rpcCalls, 2);
    } finally {
      harness.cleanup();
    }
  }
});

test("pages 首屏迟到成功：scope/session 失效后只关闭旧首屏 handle", async () => {
  const runtime = await loadViewRuntime();
  for (const invalidation of ["scope", "session"] as const) {
    const baseGate = deferred<void>();
    const harness = await createPageFlowHarness(runtime, { baseGate });
    try {
      await harness.pages.openLogin(() => {}, harness.scope);
      const entering = harness.loginHandles[0].view.onEnter() as Promise<void>;
      await waitForPageFlow(() => harness.baseAttempts === 1,
        `${invalidation}: 首屏 open Promise 必须进入在途状态`);
      assert.equal(harness.baseHandles[0]?.isActive(), true);

      if (invalidation === "scope") harness.scope.dispose();
      else harness.session.clearSession();
      baseGate.resolve(undefined);
      await entering;

      assert.equal(harness.namedCloses.filter((name: string) => name === "PromoHome").length, 0,
        `${invalidation}: 旧 continuation 不得按名误关可能属于新世代的首屏`);
      assert.equal(harness.baseHandles[0].isActive(), false,
        `${invalidation}: 迟到的首屏必须通过自己的 handle 关闭`);
      assert.equal(harness.confirmLogics.length, 0, `${invalidation}: 过期成功不应误报进入失败`);
    } finally {
      baseGate.resolve(undefined);
      harness.cleanup();
    }
  }
});

test("启动链路单槽注册各只注册一次：openLogin 全链在 fail-fast 语义下可重入（§7.2 (b) 断言）", async () => {
  const runtime = await loadViewRuntime();
  const harness = await createPageFlowHarness(runtime);
  try {
    // fail-fast 语义下，链路里任何第二次注册都会当场 throw——openLogin 全链能走完
    // 本身就是「returnToLogin / reconciler 各只注册一次」的机检。
    await harness.pages.openLogin(() => {}, harness.scope);
    assert.throws(() => harness.session.registerReturnToLogin(() => {}), /fail-fast/,
      "启动链路完成后 returnToLogin 槽必须已被唯一占用");
    assert.throws(() => harness.session.registerSessionReconciler(() => true), /fail-fast/,
      "启动链路完成后 reconciler 槽必须已被唯一占用");

    // 场景 supersede（先 dispose 后 claim/register 的固定顺序）不得触发 fail-fast。
    const nextScope = harness.pages.createPageSessionScope();
    await harness.pages.openLogin(() => {}, nextScope);
    assert.throws(() => harness.session.registerReturnToLogin(() => {}), /fail-fast/,
      "supersede 后新场景同样各只注册一次");
    nextScope.dispose();

    // 组合根释放后槽位清空，外部可重新注册（disposer 身份比对语义保留）。
    const offReturn = harness.session.registerReturnToLogin(() => {});
    const offReconcile = harness.session.registerSessionReconciler(() => true);
    offReturn();
    offReconcile();
  } finally {
    harness.cleanup();
  }
});
