/**
 * Runtime lifecycle probes for the FairyGUI shell.  The production view files
 * are Creator modules, so these tests install a deliberately small in-memory
 * cc/FGUI adapter before importing them.  This keeps the assertions focused
 * on cancellation and lease cleanup rather than on editor/runtime boot.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { markFaultPoint } from "./faultMatrix";

type LoaderModule = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/** Install enough of the Cocos/FairyGUI surface for FguiView + ViewMgr. */
async function loadViewRuntime(): Promise<{
  FguiView: any;
  ViewMgr: any;
  VIEW_REGISTRY: Record<string, any>;
}> {
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

    onClick(): void {}
    on(): void {}
    off(): void {}

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

    getChild<T extends FakeGObject = FakeGObject>(_name: string): T {
      return undefined as unknown as T;
    }

    getChildAt<T extends FakeGObject = FakeGObject>(index: number): T {
      return this.childrenList[index] as T;
    }

    setSize(width: number, height: number): void {
      this.width = width;
      this.height = height;
    }

    addRelation(): void {}

    getController(): { selectedIndex: number } {
      return { selectedIndex: 0 };
    }
  }

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
    GButton: class extends FakeGComponent {},
    GList: class extends FakeGComponent {},
    GLoader: class extends FakeGObject {},
    GLoader3D: class extends FakeGObject {},
    GTextField: class extends FakeGObject {},
    GRichTextField: class extends FakeGObject {},
    GGroup: class extends FakeGObject {},
    GProgressBar: class extends FakeGComponent {},
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
    const [{ FguiView }, { ViewMgr }, { VIEW_REGISTRY }] = await Promise.all([
      import("../src/view/FguiView"),
      import("../src/view/ViewMgr"),
      import("../src/view/viewRegistry"),
    ]);
    return { FguiView, ViewMgr, VIEW_REGISTRY: VIEW_REGISTRY as Record<string, any> };
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
