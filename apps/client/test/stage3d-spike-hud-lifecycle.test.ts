/** Real HUD lifecycle with deterministic FGUI/ViewMgr adapters; no rendering claim. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { ViewBase } from "../src/view/ViewBase";
import type { ConfirmLogic } from "../src/logic/page/ConfirmLogic";
import {
  bindDeferredUISurface, createSurfaceNavigator, createUISurfaceRegistry, defineUISurface,
} from "../src/kits/uniflex/api/navigation/index";

type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
class FakeComponent {
  name = "";
  node = { name: "" };
  children: FakeComponent[] = [];
  click: () => void = () => {};
  setSize(_width: number, _height: number): void {}
  addChild(child: FakeComponent): void { this.children.push(child); }
  onClick(action: () => void): void { this.click = action; }
}
class FakeFguiView extends ViewBase {
  constructor(protected readonly root: FakeComponent) { super(); }
  unmount(): void {}
  bringToFront(): void {}
  protected disposeRoot(): void {}
}
interface OpenRequest { resolve(handle: FakeHandle): void; reject(error: Error): void; }
const requests: OpenRequest[] = [];
let activeAdapters = 0;
let releasedAdapters = 0;
let Hud: any;
class FakeHandle {
  closeCalls = 0;
  runCalls = 0;
  logic: ConfirmLogic | null = null;
  runFailure: Error | null = null;
  runWait: Promise<void> | null = null;
  onClose: (() => void) | null = null;
  close(): void { this.closeCalls++; this.onClose?.(); }
  async run(action: (view: { setup(logic: ConfirmLogic): void }) => unknown): Promise<void> {
    this.runCalls++;
    action({ setup: (logic) => { this.logic = logic; } });
    if (this.runWait) await this.runWait;
    if (this.runFailure) throw this.runFailure;
  }
}
async function loadHud(): Promise<any> {
  if (Hud) return Hud;
  const moduleApi = createRequire(import.meta.url)("node:module") as LoaderModule;
  const original = moduleApi._load;
  moduleApi._load = function (request, parent, isMain) {
    if (request === "cc") return { Color: class {} };
    if (request === "cc/env") return { DEV: true };
    if (request === "db://fairygui-cc/fairygui.mjs") return { GComponent: FakeComponent, GTextField: FakeComponent, GRoot: { inst: {} } };
    if (request === "./FguiView") return { FguiView: FakeFguiView };
    if (request === "./ViewMgr") return { ViewMgr: { open: (name: string) => {
      assert.equal(name, "Confirm");
      return new Promise<FakeHandle>((resolve, reject) => requests.push({ resolve, reject }));
    } } };
    if (request === "./scene3d/spikeFguiInput") return { installSpikeFguiInput: () => {
      activeAdapters++;
      return () => { activeAdapters--; releasedAdapters++; };
    } };
    return original.call(this, request, parent, isMain);
  };
  try { Hud = (await import("../src/view/Stage3dSpikeHudView")).Stage3dSpikeHudView; }
  finally { moduleApi._load = original; }
  return Hud;
}
async function flush(): Promise<void> { await new Promise<void>((resolve) => setImmediate(resolve)); }
function pendingNavigation() {
  const surface = defineUISurface<void, void>("Sc0ModalPending", { zIndex: "window" });
  const registry = createUISurfaceRegistry([bindDeferredUISurface(surface, () => new Promise(() => {}))]);
  const provider = { compositor: { present: async () => {} } } as unknown as Parameters<typeof createSurfaceNavigator>[0];
  const navigator = createSurfaceNavigator(provider, registry);
  return { ready: navigator.goto(surface).ready, destroy: () => navigator.destroy() };
}
async function start(): Promise<{ hud: any; modal(): OpenRequest }> {
  assert.equal(activeAdapters, 0, "previous HUD must release its adapter");
  requests.length = 0;
  releasedAdapters = 0;
  const Type = await loadHud();
  const root = new FakeComponent();
  const hud = new Type(root);
  const context = hud.beginLifecycle(1);
  await hud.runCreate(context);
  await hud.runOpen(context);
  assert.equal(activeAdapters, 1);
  return { hud, modal: () => {
    root.children.find((child) => child.name === "Stage3dSpike.ModalButton")!.click();
    return requests[requests.length - 1]!;
  } };
}

test("SC0 HUD closes every Confirm it opened and releases its adapter once", async () => {
  const { hud, modal } = await start();
  const handles = [new FakeHandle(), new FakeHandle()];
  for (const handle of handles) { modal().resolve(handle); await flush(); }
  assert.ok(handles.every((handle) => handle.logic?.hasCancel === false));
  await hud.closeLifecycle();
  await hud.closeLifecycle();
  hud.dispose();
  assert.deepEqual(handles.map((handle) => handle.closeCalls), [1, 1]);
  assert.equal(activeAdapters, 0);
  assert.equal(releasedAdapters, 1);
});

test("SC0 HUD closes a late Confirm immediately without configuring the stale view", async () => {
  const { hud, modal } = await start();
  const request = modal();
  await hud.closeLifecycle();
  const handle = new FakeHandle();
  request.resolve(handle);
  await flush();
  assert.equal(handle.closeCalls, 1);
  assert.equal(handle.runCalls, 0);
  assert.equal(handle.logic, null);
  assert.equal(activeAdapters, 0);
  hud.dispose();
});

test("SC0 Confirm completion relinquishes HUD ownership before closing its handle", async () => {
  const { hud, modal } = await start();
  const handle = new FakeHandle();
  modal().resolve(handle);
  await flush();
  handle.logic!.yes();
  handle.logic!.yes();
  assert.equal(handle.closeCalls, 1);
  await hud.closeLifecycle();
  assert.equal(handle.closeCalls, 1, "HUD must not retain a completed multi-instance modal");
  assert.equal(activeAdapters, 0);
  hud.dispose();
});

test("SC0 HUD cleans up a failed Confirm setup and observes its rejection", async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...values: unknown[]) => errors.push(values));
  const { hud, modal } = await start();
  const handle = new FakeHandle();
  handle.runFailure = new Error("Confirm setup failed");
  modal().resolve(handle);
  await flush();
  assert.equal(handle.closeCalls, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]![1], handle.runFailure);
  await hud.closeLifecycle();
  assert.equal(handle.closeCalls, 1);
  assert.equal(activeAdapters, 0);
  hud.dispose();
});

test("SC0 HUD closes an owned modal even while its setup operation is pending", async () => {
  const { hud, modal } = await start();
  const handle = new FakeHandle();
  let finish!: () => void;
  handle.runWait = new Promise<void>((resolve) => { finish = resolve; });
  modal().resolve(handle);
  await flush();
  assert.equal(handle.runCalls, 1);
  await hud.closeLifecycle();
  assert.equal(handle.closeCalls, 1);
  finish();
  await flush();
  assert.equal(handle.closeCalls, 1);
  assert.equal(activeAdapters, 0);
  hud.dispose();
});

for (const closeBy of ["confirm", "hud"] as const) {
  test(`SC0 ${closeBy} close accepts its real UniFlex destroyed cancellation during readiness`, async (t) => {
    const errors: unknown[][] = [];
    t.mock.method(console, "error", (...values: unknown[]) => errors.push(values));
    const { hud, modal } = await start();
    const handle = new FakeHandle();
    const navigation = pendingNavigation();
    handle.runWait = navigation.ready;
    handle.onClose = navigation.destroy;
    modal().resolve(handle);
    await flush();
    if (closeBy === "confirm") handle.logic!.yes();
    else await hud.closeLifecycle();
    await flush();
    assert.equal(handle.closeCalls, 1, "the cancelled setup must not close the handle again");
    assert.deepEqual(errors, [], "owned destruction is a normal cancellation, not a failed handler");
    await hud.closeLifecycle();
    assert.equal(handle.closeCalls, 1);
    assert.equal(activeAdapters, 0);
    assert.equal(releasedAdapters, 1);
    hud.dispose();
  });
}

test("SC0 HUD reports a real destroyed cancellation when it did not close the modal", async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...values: unknown[]) => errors.push(values));
  const { hud, modal } = await start();
  const handle = new FakeHandle();
  const navigation = pendingNavigation();
  handle.runWait = navigation.ready;
  modal().resolve(handle);
  await flush();
  navigation.destroy();
  await flush();
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]![1]), /NavigationCancelledError: Navigation was cancelled: destroyed/);
  assert.equal(handle.closeCalls, 1);
  await hud.closeLifecycle();
  assert.equal(handle.closeCalls, 1);
  hud.dispose();
});

for (const failure of [
  new Error("Confirm setup failed after close"),
  Object.assign(new Error("Navigation was cancelled: replaced"), { name: "NavigationCancelledError", reason: "replaced" }),
  Object.assign(new Error("Unexpected setup failure"), { name: "NavigationCancelledError", reason: "destroyed" }),
]) {
  test(`SC0 HUD retains setup errors after its own close: ${failure.message}`, async (t) => {
    const errors: unknown[][] = [];
    t.mock.method(console, "error", (...values: unknown[]) => errors.push(values));
    const { hud, modal } = await start();
    const handle = new FakeHandle();
    let finish!: () => void;
    handle.runWait = new Promise<void>((resolve) => { finish = resolve; });
    handle.runFailure = failure;
    modal().resolve(handle);
    await flush();
    handle.logic!.yes();
    finish();
    await flush();
    assert.equal(handle.closeCalls, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]![1], failure);
    await hud.closeLifecycle();
    assert.equal(handle.closeCalls, 1);
    hud.dispose();
  });
}
