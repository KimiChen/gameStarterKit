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
  ViewMgr: any;
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
      createObject(): FakeGComponent { return new FakeGComponent(); },
    },
  };
  const canvasNode = new FakeNode("Canvas");
  const cc = {
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
    const [{ FguiView }, { ViewMgr }, { VIEW_REGISTRY }, { LoginView }, { HomeView }, { AreaListView }, { LoginNoticeView }, { observePageAction }] = await Promise.all([
      import("../src/view/FguiView"),
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
      ViewMgr,
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
  class ProbeView extends runtime.FguiView { protected bind(): void {} }
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
    assert.equal(ownedView.isDisposed, false, "permanent close 只卸载、不销毁实例");

    await assert.rejects(
      runtime.ViewMgr.open(name, () => { throw new Error("remount setup failed"); }),
      /remount setup failed/,
    );
    assert.equal(runtime.ViewMgr.isOpen(name), false);
    assert.equal(runtime.getInputEnabled(), false);
    assert.equal(ownedView.isDisposed, false, "失败回滚后 permanent 实例仍可重试");

    reopened = await runtime.ViewMgr.open(name);
    assert.equal(reopened.view, ownedView);
    assert.notEqual(reopened, first, "每次重挂必须获得新世代句柄");
    reopened.close();
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
  class ProbeView extends runtime.FguiView { protected bind(): void {} }
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
    const pagesSource = readFileSync(new URL("../src/view/pages.ts", import.meta.url), "utf8");
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
