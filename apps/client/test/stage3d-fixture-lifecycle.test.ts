import { rawInput, type RawInputSubscriber } from "../src/view/input/RawInput";
import type { ViewLifecycleContext } from "../src/view/ViewBase";
/** Resource/lifecycle contract of the real Stage3D View; rendering remains a Creator gate. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { ViewBase } from "../src/view/ViewBase";
import { Stage3D, type Stage3DScene } from "../src/view/scene3d/Stage3D";
import { fixtureSession } from "../src/view/scene3d/fixtureSession";

type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const afterDraw: (() => void)[] = [];
const destroyQueue: FakeNode[] = [];
const allNodes: FakeNode[] = [];
const clonedMaterials: FakeMaterial[] = [];
const destructionOrder: string[] = [];
const instantiatedPrefabs: string[] = [];
let copyFailure = false;
let retirementFrames = 0;

class FakeJointTexturePool {
  readonly layouts: unknown[] = [];
  registerCustomTextureLayouts(layouts: unknown): void { this.layouts.push(structuredClone(layouts)); }
  clear(): never { throw new Error("Stage3D must not clear the shared joint texture pool"); }
}
let jointTexturePool = new FakeJointTexturePool();

class FakeNode {
  name: string;
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  isValid = true;
  private readonly components: unknown[] = [];
  constructor(name = "node") { this.name = name; allNodes.push(this); }
  addChild(node: FakeNode): void { node.removeFromParent(); this.children.push(node); node.parent = this; }
  removeFromParent(): void { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
  destroy(): void { destroyQueue.push(this); }
  destroyNow(): void { this.isValid = false; for (const child of this.children) child.destroyNow(); destructionOrder.push(`node:${this.name}`); }
  setPosition(..._values: unknown[]): void {}
  setRotationFromEuler(..._values: unknown[]): void {}
  lookAt(..._values: unknown[]): void {}
  addComponent<T>(Type: new () => T): T { const component = new Type(); this.components.push(component); return component; }
  getComponentsInChildren<T>(Type: new (...args: any[]) => T): T[] {
    return [...this.components.filter((component): component is T => component instanceof Type), ...this.children.flatMap((child) => child.getComponentsInChildren(Type))];
  }
}
class FakeCamera { static ProjectionType = { PERSPECTIVE: 1 }; static ClearFlag = { SOLID_COLOR: 7 }; }
class FakeMaterial {
  destroyed = false;
  defines: unknown = null;
  constructor(source = false) { if (!source) clonedMaterials.push(this); }
  copy(_source: FakeMaterial, options?: unknown): void { this.defines = options; if (copyFailure) throw new Error("material copy failed"); }
  destroy(): void {
    assert.ok(!allNodes.some((node) => node.isValid && node.getComponentsInChildren(FakeMeshRenderer).some((renderer) => renderer.sharedMaterials.includes(this))),
      "material must not be destroyed while a live renderer still references it");
    this.destroyed = true;
    destructionOrder.push("material");
  }
}
class FakeMeshRenderer {
  sharedMaterials: FakeMaterial[] = [];
  setMaterial(material: FakeMaterial, index: number): void { this.sharedMaterials[index] = material; }
}
class FakeSkinnedMeshRenderer extends FakeMeshRenderer {
  skeleton = { hash: 77, joints: ["Root", "Root/Upper"] };
}
class FakeSkeletalAnimation {
  useBakedAnimation = false;
  clips = [{ name: "sway-main", hash: 11 }, { name: "bow-main", hash: 12 }];
  played: string | null = null;
  addClip(clip: { name: string; hash: number }): void { if (!this.clips.includes(clip)) this.clips.push(clip); }
  play(clip: string): void {
    assert.ok(this.clips.some((candidate) => candidate.name === clip), "play must resolve an attached clip");
    this.played = clip;
  }
  stop(): void { this.played = null; }
}
class FakeParticle {
  readonly ownedMaterial = new FakeMaterial();
  readonly processor = { getDefaultMaterial: () => this.ownedMaterial };
  play(): void {}
}
class FakeBillboard {
  readonly _model = {};
  readonly _mesh = { destroy: () => destructionOrder.push("billboard-mesh") };
  readonly _material = new FakeMaterial();
}
class FakePrefab {
  readonly isValid = true;
  refCount = 0;
  adds = 0;
  removes = 0;
  readonly material = new FakeMaterial(true);
  readonly data: FakeNode;
  constructor(readonly name: string) {
    this.data = this.makeNode();
  }
  makeNode(): FakeNode {
    const node = new FakeNode(this.name);
    const skinned = this.name.includes("biped");
    const renderer = skinned ? node.addComponent(FakeSkinnedMeshRenderer) : node.addComponent(FakeMeshRenderer);
    renderer.sharedMaterials = [this.material];
    if (skinned) {
      const animation = node.addComponent(FakeSkeletalAnimation);
      if (this.name.includes("atlas-b")) {
        animation.clips = [{ name: "sway-b", hash: 21 }, { name: "bow-b", hash: 22 }];
      }
    }
    return node;
  }
  addRef(): void { this.refCount++; this.adds++; }
  decRef(): void { this.refCount--; this.removes++; destructionOrder.push(`asset:${this.name}`); assert.ok(this.refCount >= 0); }
}
class FakeCocosBase extends ViewBase {
  protected subscribeRawInput(owner: ViewLifecycleContext, subscriber: RawInputSubscriber) { return rawInput.subscribe(owner, subscriber); }
  unmount(): void {}
  bringToFront(): void {}
  protected disposeRoot(): void {}
}
interface LoadRequest { path: string; callback(error: Error | null, asset?: FakePrefab): void; }
const requests: LoadRequest[] = [];
let scene = new FakeNode("scene");
const stageListeners = new Set<(event: "frame" | "resize" | "destroy") => void>();
let cameraMoves = 0;
function makeStage(): Stage3D {
  let globals = { toneMapping: "default", fog: { enabled: false, type: "linear", density: 0.01, start: 1, end: 500 },
    ambient: { skyIllum: 10 }, shadows: { enabled: false, kind: "planar" } };
  const adapter = {
    isValid: () => true, isNodeValid: (node: FakeNode) => node.isValid,
    createNode: (name: string) => { const node = new FakeNode(name); scene.addChild(node); return node; },
    addCamera: () => new FakeCamera(), addLight: () => ({}),
    destroyNode: (node: FakeNode) => { node.removeFromParent(); node.destroy(); },
    setCameraPose: () => { cameraMoves++; }, setCameraViewport: () => {}, setCameraClear: () => {},
    setLightDirection: () => {}, setLightColor: () => {}, screenPointToRay: () => { throw new Error("unused"); },
    readViewportMetrics: () => ({ design: { x: 0, y: 0, width: 750, height: 1500 },
      screen: { width: 750, height: 1500 }, content: { x: 0, y: 0, width: 750, height: 1500 } }),
    globals: { read: () => globals, apply: (next: typeof globals) => { globals = next; } },
    subscribe: (listener: (event: "frame" | "resize" | "destroy") => void) => {
      stageListeners.add(listener); return () => { stageListeners.delete(listener); };
    },
  } as unknown as Stage3DScene;
  return new Stage3D({ captureScene: () => adapter });
}
let stage = makeStage();

let View: any;
async function loadView(): Promise<any> {
  if (View) return View;
  const moduleApi = createRequire(import.meta.url)("node:module") as LoaderModule;
  const original = moduleApi._load;
  const cc = {
    Node: FakeNode, Camera: FakeCamera, Material: FakeMaterial, MeshRenderer: FakeMeshRenderer,
    SkinnedMeshRenderer: FakeSkinnedMeshRenderer,
    Prefab: FakePrefab, SkeletalAnimation: FakeSkeletalAnimation, ParticleSystem: FakeParticle, Billboard: FakeBillboard,
    DirectionalLight: class {}, Color: class {}, Vec3: class {}, Layers: { Enum: { DEFAULT: 1 << 30 } },
    Director: { EVENT_AFTER_DRAW: "after-draw" }, director: {
      get root() { return { dataPoolManager: { jointTexturePool }, destroyModel: () => destructionOrder.push("billboard-model") }; },
      getScene: () => scene,
      once: (_event: string, callback: () => void) => afterDraw.push(callback),
    },
    resources: { load: (path: string, _Type: unknown, callback: LoadRequest["callback"]) => requests.push({ path, callback }) },
    instantiate: (asset: FakePrefab) => {
      assert.equal(jointTexturePool.layouts.length, 1, "custom layouts must be registered before the first instantiate");
      instantiatedPrefabs.push(asset.name);
      return asset.makeNode();
    },
  };
  moduleApi._load = function (request, parent, isMain) {
    if (request === "cc") return cc;
    if (request === "cc/env") return { DEV: true };
    if (request === "./CocosView") return { CocosView: FakeCocosBase };
    if (request === "./scene3d/ownedRendering") return { ...(original.call(this, request, parent, isMain) as object), OwnedRenderingRetirement: class {
      private readonly cleanups: Array<() => number> = [];
      capture(node: FakeNode): void {
        assert.equal(node.isValid, true, "capture before deferred component destruction");
        let remaining = retirementFrames;
        this.cleanups.push(() => remaining-- > 0 ? 1 : 0);
      }
      finish(done: () => void): void {
        const next = () => { if (this.cleanups.map((run) => run()).some(Boolean)) afterDraw.push(next); else done(); };
        afterDraw.push(next);
      }
    } };
    return original.call(this, request, parent, isMain);
  };
  try { View = (await import("../src/view/Stage3dFixtureView")).Stage3dFixtureView; }
  finally { moduleApi._load = original; }
  return View;
}
function frame(): void {
  for (const node of destroyQueue.splice(0)) node.destroyNow();
  for (const callback of afterDraw.splice(0)) callback();
}
async function start(generation = 1): Promise<{ view: any; open: Promise<void>; loads: LoadRequest[] }> {
  const Type = await loadView();
  const view = new Type();
  const context = view.beginLifecycle(generation);
  await view.runCreate(context);
  const offset = requests.length;
  await view.runOpen(context);
  const open = view.setup({ stage3d: stage }, context) as Promise<void>;
  // Tests deliberately keep callbacks pending across cancellation.
  void open.catch(() => {});
  return { view, open, loads: requests.slice(offset) };
}
function resolveLoads(loads: LoadRequest[]): FakePrefab[] {
  return loads.map((request) => { const asset = new FakePrefab(request.path); request.callback(null, asset); return asset; });
}
async function reset(): Promise<void> {
  frame();
  assert.equal(fixtureSession.businessRefs, 0, "previous test leaked a business asset reference");
  requests.length = 0;
  clonedMaterials.length = 0;
  destructionOrder.length = 0;
  allNodes.length = 0;
  instantiatedPrefabs.length = 0;
  jointTexturePool = new FakeJointTexturePool();
  assert.equal(stageListeners.size, 0, "previous stage kept engine listeners");
  assert.equal(stage.active, false);
  stage = makeStage();
  cameraMoves = 0;
  scene = new FakeNode("scene");
  copyFailure = false;
  retirementFrames = 0;
}

test("Stage3D fixture closes render nodes before releasing retained Prefabs/materials, exactly once", async () => {
  await reset();
  const run = await start();
  const assets = resolveLoads(run.loads);
  await run.open;
  assert.equal(fixtureSession.ready, true);
  assert.equal(fixtureSession.businessRefs, 5);
  assert.equal(clonedMaterials.length, 6, "cube/biped shared, atlas-B, realtime, particle and Billboard materials");
  assert.equal(jointTexturePool.layouts.length, 1);
  assert.equal(fixtureSession.skinning?.registeredNow, true);
  assert.equal(instantiatedPrefabs.filter((name) => name.includes("biped")).length, 100);
  assert.equal(instantiatedPrefabs.some((name) => name.includes("atlas-b")), false, "alternate Prefab supplies clips, not a different rendered model");
  const crossAtlas = allNodes.find((node) => node.name === "Stage3dSpike.CrossAtlas");
  assert.ok(crossAtlas, "the observable cross-texture instance must use the main biped");
  const crossAnimation = crossAtlas.getComponentsInChildren(FakeSkeletalAnimation)[0]!;
  assert.deepEqual(crossAnimation.clips.map((clip) => clip.hash), [11, 12, 21, 22]);
  assert.equal(crossAnimation.played, "bow-main", "the probe performs the cross-texture switch after initial main-atlas playback");
  const crossRenderer = crossAtlas.getComponentsInChildren(FakeSkinnedMeshRenderer)[0]!;
  const sibling = allNodes.find((node) => node.name === "Stage3dSpike.Biped.0")!;
  const siblingRenderer = sibling.getComponentsInChildren(FakeSkinnedMeshRenderer)[0]!;
  const sharedMainMaterial = siblingRenderer.sharedMaterials[0];
  assert.equal(crossRenderer.sharedMaterials[0], sharedMainMaterial);
  assert.ok(fixtureSession.switchSkinningClip, "the fixed probe must use the owned switch callback");
  fixtureSession.switchSkinningClip("atlasB", 0);
  assert.equal(crossAnimation.played, "sway-b");
  assert.notEqual(crossRenderer.sharedMaterials[0], sharedMainMaterial, "cross-texture instances need a separate parent Material/Pass");
  assert.equal(siblingRenderer.sharedMaterials[0], sharedMainMaterial, "switching one unit cannot change the other 99");
  fixtureSession.switchSkinningClip("atlasB", 1);
  assert.equal(crossAnimation.played, "bow-b");
  fixtureSession.switchSkinningClip("main", 0);
  assert.equal(crossAnimation.played, "sway-main");
  assert.equal(crossRenderer.sharedMaterials[0], sharedMainMaterial, "returning to the main atlas restores shared batching");
  assert.ok(fixtureSession.switchRealtimeSkinning);
  fixtureSession.switchRealtimeSkinning(true);
  assert.equal(crossAnimation.useBakedAnimation, false);
  assert.deepEqual(crossRenderer.sharedMaterials[0]!.defines, { defines: { USE_INSTANCING: false } });
  assert.equal(siblingRenderer.sharedMaterials[0], sharedMainMaterial);
  fixtureSession.switchRealtimeSkinning(false);
  assert.equal(crossAnimation.useBakedAnimation, true);
  assert.equal(crossRenderer.sharedMaterials[0], sharedMainMaterial);
  assert.equal(clonedMaterials.length, 6, "clip/model switching must not allocate another parent material");
  for (const asset of assets.filter((asset) => asset.name.includes("biped"))) {
    assert.equal(asset.data.getComponentsInChildren(FakeSkeletalAnimation)[0]!.clips.length, 2, "instance setup must not mutate either source Prefab");
  }
  assert.equal(clonedMaterials.filter((material) => JSON.stringify(material.defines) === '{"defines":{"USE_INSTANCING":true}}').length, 3);
  assert.equal(clonedMaterials.filter((material) => JSON.stringify(material.defines) === '{"defines":{"USE_INSTANCING":false}}').length, 1);
  await run.view.closeLifecycle();
  await run.view.closeLifecycle();
  assert.equal(fixtureSession.switchSkinningClip, null, "close releases the callback's node/material references immediately");
  assert.equal(fixtureSession.switchRealtimeSkinning, null);
  assert.equal(scene.children.length, 0, "world is detached immediately");
  assert.equal(fixtureSession.businessRefs, 5, "release waits until engine node destruction");
  assert.ok(!destructionOrder.includes("billboard-model"));
  frame();
  assert.equal(fixtureSession.businessRefs, 0);
  assert.ok(clonedMaterials.every((material) => material.destroyed));
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
  assert.ok(destructionOrder.indexOf("material") > destructionOrder.lastIndexOf("node:Stage3DRoot"));
  assert.ok(destructionOrder.indexOf("billboard-model") > destructionOrder.indexOf("node:Stage3dFixture.Billboard"));
  assert.equal(destructionOrder.filter((item) => item === "billboard-mesh").length, 1);
  run.view.dispose();
  frame();
  for (const asset of assets) assert.equal(asset.removes, 1);
});

test("Stage3D partial load failure releases early successes and safely discards late successes", async () => {
  await reset();
  const run = await start();
  const first = new FakePrefab("first");
  run.loads[0]!.callback(null, first);
  run.loads[1]!.callback(new Error("fixture prefab missing"));
  let settled = false;
  void run.open.finally(() => { settled = true; }).catch(() => {});
  await Promise.resolve();
  assert.equal(settled, false, "ordinary failure must collect all in-flight loads before cleanup");
  const late = resolveLoads(run.loads.slice(2));
  await assert.rejects(run.open, /fixture prefab missing/u);
  assert.equal(fixtureSession.error, "fixture prefab missing");
  await run.view.closeLifecycle();
  run.view.dispose();
  frame();
  assert.equal(fixtureSession.businessRefs, 0);
  assert.equal(scene.children.length, 0);
  for (const asset of [first, ...late]) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
});

test("Stage3D closes an active realtime sample and retains assets until every pending old batch retires", async () => {
  await reset();
  const run = await start();
  const assets = resolveLoads(run.loads);
  await run.open;
  retirementFrames = 2;
  fixtureSession.switchRealtimeSkinning!(true);
  const cross = allNodes.find((node) => node.name === "Stage3dSpike.CrossAtlas")!;
  assert.equal(cross.getComponentsInChildren(FakeSkeletalAnimation)[0]!.useBakedAnimation, false);
  const particle = allNodes.find((node) => node.name === "Stage3dSpike.Particle")!.getComponentsInChildren(FakeParticle)[0]!;
  await run.view.closeLifecycle();
  assert.equal(fixtureSession.switchRealtimeSkinning, null);
  for (let index = 0; index < 2; index++) {
    frame();
    assert.equal(fixtureSession.businessRefs, 5, "pending queue items must block the closed-ref acceptance gate");
    assert.ok(clonedMaterials.every((material) => !material.destroyed));
    assert.ok(afterDraw.length > 0, "pending retirement must retry on a later AFTER_DRAW");
  }
  frame();
  assert.equal(fixtureSession.businessRefs, 0);
  assert.equal(afterDraw.length, 0);
  assert.ok(clonedMaterials.every((material) => material.destroyed));
  assert.equal(particle.ownedMaterial.destroyed, true, "processor-owned particle material belongs to the fixture");
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
  run.view.dispose();
});

test("Stage3D close during loading releases each late callback without creating scene content", async () => {
  await reset();
  const run = await start();
  await run.view.closeLifecycle();
  run.view.dispose();
  const assets = resolveLoads(run.loads);
  await assert.rejects(run.open, /cancelled|失效/u);
  frame();
  assert.equal(scene.children.length, 0);
  assert.equal(fixtureSession.businessRefs, 0);
  assert.equal(clonedMaterials.length, 0);
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
});

test("Stage3D late cancellation from a closed opening cannot overwrite a newer fixture's diagnostic state", async () => {
  await reset();
  const old = await start(10);
  await old.view.closeLifecycle();
  old.view.dispose();
  const current = await start(11);
  resolveLoads(current.loads);
  await current.open;
  assert.equal(fixtureSession.ready, true);
  assert.equal(fixtureSession.error, null);
  resolveLoads(old.loads);
  await assert.rejects(old.open, /cancelled|失效/u);
  try {
    assert.equal(fixtureSession.error, null, "old cancelled load must not poison the newly ready fixture");
    assert.equal(fixtureSession.ready, true);
  } finally { await current.view.closeLifecycle(); current.view.dispose(); frame(); }
});

test("Stage3D material copy failure still disposes the newly allocated material and all asset references", async () => {
  await reset();
  const run = await start();
  copyFailure = true;
  resolveLoads(run.loads);
  await assert.rejects(run.open, /material copy failed/u);
  await run.view.closeLifecycle();
  run.view.dispose();
  frame();
  assert.equal(fixtureSession.businessRefs, 0);
  assert.equal(clonedMaterials.length, 1);
  assert.ok(clonedMaterials.every((material) => material.destroyed), "copy threw before the material entered the cleanup map");
});

// Mutation: treating overlay as modal in ViewMgr makes viewLifecycle fail;
// removing the lease abort handler here makes the host-disposal assertions fail.
test("Stage3D host disposal cancels input and retires content without waiting for the View close hook", async () => {
  await reset();
  const run = await start();
  const assets = resolveLoads(run.loads);
  await run.open;
  assert.equal(stage.active, true);
  assert.equal(cameraMoves, 1, "camera pose goes through the injected production coordinator");
  assert.ok(instantiatedPrefabs.includes("stage3d/P_Stage3d_Baked"));
  stage.dispose();
  assert.equal(fixtureSession.ready, false);
  assert.equal(fixtureSession.businessRefs, 5, "abort must not release resources before AFTER_DRAW");
  assert.equal(rawInput.inspect().active, false);
  frame();
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
  await run.view.closeLifecycle();
  run.view.dispose();
});

test("Stage3D fixture returns nodes, references and listeners to baseline across 20 opens", async () => {
  await reset();
  for (let cycle = 0; cycle < 20; cycle++) {
    const run = await start(cycle);
    const assets = resolveLoads(run.loads);
    await run.open;
    assert.equal(stage.active, true);
    await run.view.closeLifecycle();
    frame();
    assert.equal(stage.active, false);
    assert.equal(scene.children.length, 0);
    assert.equal(stageListeners.size, 0);
    assert.equal(fixtureSession.businessRefs, 0);
    assert.equal(afterDraw.length, 0);
    for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
    run.view.dispose();
  }
});


test("Stage3D error callback returns its own hold while preserving another asset consumer", async () => {
  await reset();
  const run = await start();
  const shared = new FakePrefab("shared");
  shared.addRef(); // An unrelated owner's pre-existing hold.
  run.loads[0]!.callback(new Error("error with asset"), shared);
  for (const request of run.loads.slice(1)) request.callback(null, shared);
  await assert.rejects(run.open, /error with asset/);
  frame();
  assert.equal(shared.refCount, 1);
  assert.deepEqual([shared.adds, shared.removes], [6, 5]);
  assert.equal(fixtureSession.businessRefs, 0);
  assert.equal(stage.active, false);
  run.view.dispose();
});
