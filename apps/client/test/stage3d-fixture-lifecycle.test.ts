/** Resource/lifecycle contract of the real SC0 View; rendering remains a Creator gate. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { ViewBase } from "../src/view/ViewBase";
import { spikeSession } from "../src/view/scene3d/spikeSession";

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
  clear(): never { throw new Error("SC0 must not clear the shared joint texture pool"); }
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
class FakePrefab {
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
  unmount(): void {}
  bringToFront(): void {}
  protected disposeRoot(): void {}
}
interface LoadRequest { path: string; callback(error: Error | null, asset?: FakePrefab): void; }
const requests: LoadRequest[] = [];
let scene = new FakeNode("scene");

let View: any;
async function loadView(): Promise<any> {
  if (View) return View;
  const moduleApi = createRequire(import.meta.url)("node:module") as LoaderModule;
  const original = moduleApi._load;
  const cc = {
    Node: FakeNode, Camera: FakeCamera, Material: FakeMaterial, MeshRenderer: FakeMeshRenderer,
    SkinnedMeshRenderer: FakeSkinnedMeshRenderer,
    Prefab: FakePrefab, SkeletalAnimation: FakeSkeletalAnimation, ParticleSystem: FakeParticle,
    DirectionalLight: class {}, Color: class {}, Vec3: class {}, Layers: { Enum: { DEFAULT: 1 << 30 } },
    Director: { EVENT_AFTER_DRAW: "after-draw" }, director: {
      get root() { return { dataPoolManager: { jointTexturePool } }; },
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
    if (request === "./scene3d/spikeOwnedInstancing") return { captureSpikeOwnedInstancing: (node: FakeNode) => {
      assert.equal(node.isValid, true, "capture queue ownership before destroying/replacing its model");
      let remaining = retirementFrames;
      return () => ({ releasedItems: 0, releasedBytes: 0, pendingItems: remaining-- > 0 ? 1 : 0 });
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
  const open = view.runOpen(context) as Promise<void>;
  // Tests deliberately keep callbacks pending across cancellation.
  void open.catch(() => {});
  return { view, open, loads: requests.slice(offset) };
}
function resolveLoads(loads: LoadRequest[]): FakePrefab[] {
  return loads.map((request) => { const asset = new FakePrefab(request.path); request.callback(null, asset); return asset; });
}
async function reset(): Promise<void> {
  frame();
  assert.equal(spikeSession.businessRefs, 0, "previous test leaked a business asset reference");
  requests.length = 0;
  clonedMaterials.length = 0;
  destructionOrder.length = 0;
  allNodes.length = 0;
  instantiatedPrefabs.length = 0;
  jointTexturePool = new FakeJointTexturePool();
  scene = new FakeNode("scene");
  copyFailure = false;
  retirementFrames = 0;
}

test("SC0 fixture closes render nodes before releasing retained Prefabs/materials, exactly once", async () => {
  await reset();
  const run = await start();
  const assets = resolveLoads(run.loads);
  await run.open;
  assert.equal(spikeSession.ready, true);
  assert.equal(spikeSession.businessRefs, 4);
  assert.equal(clonedMaterials.length, 5, "cube/biped shared, atlas-B, realtime and processor-owned particle materials");
  assert.equal(jointTexturePool.layouts.length, 1);
  assert.equal(spikeSession.skinning?.registeredNow, true);
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
  assert.ok(spikeSession.switchSkinningClip, "the fixed probe must use the owned switch callback");
  spikeSession.switchSkinningClip("atlasB", 0);
  assert.equal(crossAnimation.played, "sway-b");
  assert.notEqual(crossRenderer.sharedMaterials[0], sharedMainMaterial, "cross-texture instances need a separate parent Material/Pass");
  assert.equal(siblingRenderer.sharedMaterials[0], sharedMainMaterial, "switching one unit cannot change the other 99");
  spikeSession.switchSkinningClip("atlasB", 1);
  assert.equal(crossAnimation.played, "bow-b");
  spikeSession.switchSkinningClip("main", 0);
  assert.equal(crossAnimation.played, "sway-main");
  assert.equal(crossRenderer.sharedMaterials[0], sharedMainMaterial, "returning to the main atlas restores shared batching");
  assert.ok(spikeSession.switchRealtimeSkinning);
  spikeSession.switchRealtimeSkinning(true);
  assert.equal(crossAnimation.useBakedAnimation, false);
  assert.deepEqual(crossRenderer.sharedMaterials[0]!.defines, { defines: { USE_INSTANCING: false } });
  assert.equal(siblingRenderer.sharedMaterials[0], sharedMainMaterial);
  spikeSession.switchRealtimeSkinning(false);
  assert.equal(crossAnimation.useBakedAnimation, true);
  assert.equal(crossRenderer.sharedMaterials[0], sharedMainMaterial);
  assert.equal(clonedMaterials.length, 5, "clip/model switching must not allocate another parent material");
  for (const asset of assets.filter((asset) => asset.name.includes("biped"))) {
    assert.equal(asset.data.getComponentsInChildren(FakeSkeletalAnimation)[0]!.clips.length, 2, "instance setup must not mutate either source Prefab");
  }
  assert.equal(clonedMaterials.filter((material) => JSON.stringify(material.defines) === '{"defines":{"USE_INSTANCING":true}}').length, 3);
  assert.equal(clonedMaterials.filter((material) => JSON.stringify(material.defines) === '{"defines":{"USE_INSTANCING":false}}').length, 1);
  await run.view.closeLifecycle();
  await run.view.closeLifecycle();
  assert.equal(spikeSession.switchSkinningClip, null, "close releases the callback's node/material references immediately");
  assert.equal(spikeSession.switchRealtimeSkinning, null);
  assert.equal(scene.children.length, 0, "world is detached immediately");
  assert.equal(spikeSession.businessRefs, 4, "release waits until engine node destruction");
  frame();
  assert.equal(spikeSession.businessRefs, 0);
  assert.ok(clonedMaterials.every((material) => material.destroyed));
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
  assert.ok(destructionOrder.indexOf("material") > destructionOrder.lastIndexOf("node:Stage3dSpike.World"));
  run.view.dispose();
  frame();
  for (const asset of assets) assert.equal(asset.removes, 1);
});

test("SC0 partial load failure releases early successes and safely discards late successes", async () => {
  await reset();
  const run = await start();
  const first = new FakePrefab("first");
  run.loads[0]!.callback(null, first);
  run.loads[1]!.callback(new Error("fixture prefab missing"));
  await assert.rejects(run.open, /fixture prefab missing/u);
  assert.equal(spikeSession.error, "fixture prefab missing");
  await run.view.closeLifecycle();
  run.view.dispose();
  const late = resolveLoads(run.loads.slice(2));
  frame();
  assert.equal(spikeSession.businessRefs, 0);
  assert.equal(scene.children.length, 0);
  for (const asset of [first, ...late]) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
});

test("SC0 closes an active realtime sample and retains assets until every pending old batch retires", async () => {
  await reset();
  const run = await start();
  const assets = resolveLoads(run.loads);
  await run.open;
  retirementFrames = 2;
  spikeSession.switchRealtimeSkinning!(true);
  const cross = allNodes.find((node) => node.name === "Stage3dSpike.CrossAtlas")!;
  assert.equal(cross.getComponentsInChildren(FakeSkeletalAnimation)[0]!.useBakedAnimation, false);
  const particle = allNodes.find((node) => node.name === "Stage3dSpike.Particle")!.getComponentsInChildren(FakeParticle)[0]!;
  await run.view.closeLifecycle();
  assert.equal(spikeSession.switchRealtimeSkinning, null);
  for (let index = 0; index < 2; index++) {
    frame();
    assert.equal(spikeSession.businessRefs, 4, "pending queue items must block the closed-ref acceptance gate");
    assert.ok(clonedMaterials.every((material) => !material.destroyed));
    assert.ok(afterDraw.length > 0, "pending retirement must retry on a later AFTER_DRAW");
  }
  frame();
  assert.equal(spikeSession.businessRefs, 0);
  assert.equal(afterDraw.length, 0);
  assert.ok(clonedMaterials.every((material) => material.destroyed));
  assert.equal(particle.ownedMaterial.destroyed, true, "processor-owned particle material belongs to the fixture");
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
  run.view.dispose();
});

test("SC0 close during loading releases each late callback without creating scene content", async () => {
  await reset();
  const run = await start();
  await run.view.closeLifecycle();
  run.view.dispose();
  const assets = resolveLoads(run.loads);
  await assert.rejects(run.open, /cancelled|失效/u);
  frame();
  assert.equal(scene.children.length, 0);
  assert.equal(spikeSession.businessRefs, 0);
  assert.equal(clonedMaterials.length, 0);
  for (const asset of assets) assert.deepEqual([asset.adds, asset.removes, asset.refCount], [1, 1, 0]);
});

test("SC0 late cancellation from a closed opening cannot overwrite a newer fixture's diagnostic state", async () => {
  await reset();
  const old = await start(10);
  await old.view.closeLifecycle();
  old.view.dispose();
  const current = await start(11);
  resolveLoads(current.loads);
  await current.open;
  assert.equal(spikeSession.ready, true);
  assert.equal(spikeSession.error, null);
  resolveLoads(old.loads);
  await assert.rejects(old.open, /cancelled|失效/u);
  try {
    assert.equal(spikeSession.error, null, "old cancelled load must not poison the newly ready fixture");
    assert.equal(spikeSession.ready, true);
  } finally { await current.view.closeLifecycle(); current.view.dispose(); frame(); }
});

test("SC0 material copy failure still disposes the newly allocated material and all asset references", async () => {
  await reset();
  const run = await start();
  copyFailure = true;
  resolveLoads(run.loads);
  await assert.rejects(run.open, /material copy failed/u);
  await run.view.closeLifecycle();
  run.view.dispose();
  frame();
  assert.equal(spikeSession.businessRefs, 0);
  assert.equal(clonedMaterials.length, 1);
  assert.ok(clonedMaterials.every((material) => material.destroyed), "copy threw before the material entered the cleanup map");
});
