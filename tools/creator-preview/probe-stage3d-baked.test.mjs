/** Isolated VM regression vectors, never Creator evidence. No browser/Creator/cache assets required. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { assertBakedRuntime, createBakedHarnessSource } from "./probe-stage3d-baked.mjs";

function fixture() {
  const listeners = new Set(), assets = new Map(), trace = [];
  let sequence = 0, imported = 0;
  class Light {}
  class MeshRenderer {}
  class SkinnedMeshRenderer extends MeshRenderer {}
  class Camera { static ClearFlag = { SOLID_COLOR: 7 }; priority = 0; }
  class Vec3 {}
  class Color {}
  class Prefab {}
  class WebPipeline {}
  const registered = { "cc.Light": Light, "cc.MeshRenderer": MeshRenderer, "cc.SkinnedMeshRenderer": SkinnedMeshRenderer, "cc.Camera": Camera };
  class Node {
    constructor(name) { this.name = name; this.uuid = `unit-${sequence++}`; this.children = []; this.components = []; this.valid = true; }
    setPosition() {}
    lookAt() {}
    set parent(value) {
      if (this._parent) this._parent.children = this._parent.children.filter((node) => node !== this);
      this._parent = value; value?.children.push(this);
    }
    get parent() { return this._parent; }
    addComponent(Type) { assert.equal(typeof Type, "function"); const component = new Type(); component.node = this; this.components.push(component); return component; }
    getComponent(name) { assert.equal(typeof name, "string", "global cc component constructors are deliberately absent"); return this.components.find((component) => component instanceof registered[name]) ?? null; }
    getComponentsInChildren(name) {
      assert.equal(typeof name, "string", "global cc component constructors are deliberately absent");
      return [...this.components.filter((component) => component instanceof registered[name]), ...this.children.flatMap((node) => node.getComponentsInChildren(name))];
    }
    destroy() { trace.push(`destroy:${this.name}`); for (const child of [...this.children]) child.destroy(); this.parent = null; this.valid = false; }
  }
  const imageUuid = "55555555-5555-5555-5555-555555555555";
  const expected = {
    mainScene: { uuid: "11111111-1111-1111-1111-111111111111" },
    prefab: { uuid: "22222222-2222-2222-2222-222222222222", resourcesPath: "stage3d/P_Stage3d_Baked" },
    meshes: ["Plane", "Cube"].map((node, index) => ({ node,
      meshUuid: `${index ? "44444444-4444-4444-4444-444444444444" : "33333333-3333-3333-3333-333333333333"}@mesh`,
      textureUuid: `${imageUuid}@6c48a`, imageUuid, width: 1024, height: 1024,
      uvParam: [index * 0.5, 0, 0.5, 1], materialUuids: ["66666666-6666-6666-6666-666666666666@material"] })),
  };
  const scene = new Node("scene"); scene.uuid = expected.mainScene.uuid;
  scene.globals = { disableLightmap: false, bakedWithStationaryMainLight: false, bakedWithHighpLightmap: false };
  const asset = { uuid: expected.prefab.uuid, name: "P_Stage3d_Baked", refCount: 0,
    addRef() { trace.push("addRef"); this.refCount++; }, decRef() { trace.push("decRef"); this.refCount--; } };
  const cc = { Node, Vec3, Color, Prefab, Layers: { Enum: { DEFAULT: 1 } }, Director: { EVENT_AFTER_DRAW: "after" },
    // Deliberately no cc.Light, cc.MeshRenderer, cc.SkinnedMeshRenderer, or cc.Camera.
    js: { getClassName: (Type) => Type === Camera ? "cc.Camera" : "unknown" },
    isValid: (object) => object.valid !== false, assetManager: { assets },
    resources: { load(name, Type, callback) { assert.equal(name, expected.prefab.resourcesPath); assert.equal(Type, Prefab); assets.set(asset.uuid, asset); queueMicrotask(() => callback(null, asset)); } },
    instantiate(value) {
      assert.equal(value.refCount, 1, "resource must be retained before instantiate"); trace.push("instantiate");
      const root = new Node("P_Stage3d_Baked");
      for (const mesh of expected.meshes) {
        const node = new Node(mesh.node); node.parent = root;
        const renderer = node.addComponent(MeshRenderer); renderer.enabledInHierarchy = true;
        renderer.mesh = { uuid: mesh.meshUuid, struct: { vertexBundles: [{ attributes: [{ name: "a_texCoord1" }] }] } };
        const gfxTexture = {};
        const texture = { uuid: mesh.textureUuid, image: { uuid: mesh.imageUuid, nativeUrl: "http://127.0.0.1:7457/unit/lightmap.png" },
          width: mesh.width, height: mesh.height, getGFXTexture: () => gfxTexture };
        renderer.bakeSettings = { texture, bakeable: true, uvParam: Object.fromEntries(["x", "y", "z", "w"].map((key, index) => [key, mesh.uvParam[index]])) };
        renderer.sharedMaterials = mesh.materialUuids.map((uuid) => ({ uuid, name: "material", effectAsset: { uuid: "effect", name: "builtin-standard" }, passes: [{}] }));
        renderer.model = { _lightmap: texture, getMacroPatches: () => [{ name: "CC_USE_LIGHTMAP", value: 1 }],
          subModels: [{ descriptorSet: { getTexture: () => gfxTexture }, passes: [{}] }] };
      }
      return root;
    },
  };
  cc.director = { getScene: () => scene, on: (event, callback) => listeners.add(callback), off: (event, callback) => listeners.delete(callback),
    root: { pipeline: new WebPipeline(), device: { gl: { VERSION: 1, getParameter: () => "WebGL 1.0 unit mock", getExtension: () => null },
      memoryStatus: { bufferSize: 32, textureSize: 64 }, numDrawCalls: 2, numTris: 14, numInstances: 0 } } };
  const System = { entries: () => [["observed://unit-engine", { Camera }]],
    import: async (url) => { assert.equal(url, "observed://unit-engine"); imported++; return { Camera }; } };
  const context = vm.createContext({ cc, System, performance, navigator: { userAgent: "VM", platform: "VM" },
    innerWidth: 375, innerHeight: 812, devicePixelRatio: 2, setTimeout, clearTimeout,
    document: { hidden: false, visibilityState: "visible", getElementById: () => ({ width: 750, height: 1624,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 375, height: 812 }) }) } });
  return { expected, context, listeners, asset, trace, imported: () => imported,
    install: () => vm.runInContext(createBakedHarnessSource(expected), context) };
}

test("B5 three-node Prefab yields two meshes even when legacy cc component exports are missing", async () => {
  const h = fixture();
  await h.install();
  assert.equal(h.imported(), 1, "Camera must be imported from the observed SystemJS URL");
  const tick = setInterval(() => { for (const callback of [...h.listeners]) callback(); }, 1);
  try {
    const probe = h.context.__stage3dBakedPrefabProbe;
    const opened = await probe.open();
    assert.equal(opened.instanceNodes, 3); assert.equal(opened.meshes.length, 2); assert.equal(opened.businessRefs, 1);
    assert.equal(opened.runtimeModules.legacyComponentExports.MeshRenderer, "undefined");
    assert.equal(opened.runtimeModules.legacyComponentExports.Camera, "undefined");
    assertBakedRuntime(opened, h.expected);
    const closed = await probe.close();
    assert.equal(closed.businessRefs, 0); assert.equal(closed.instanceNodes, 0); assert.equal(h.asset.refCount, 0);
    assert(h.trace.indexOf("addRef") < h.trace.indexOf("instantiate"));
    assert(h.trace.indexOf("destroy:P_Stage3d_Baked") < h.trace.indexOf("decRef"));
    const disposed = await probe.dispose(); assert.equal(disposed.cameraDestroyed, true); assert.equal(disposed.remainingNodes, 1);
    assert.equal(h.listeners.size, 0);
  } finally { clearInterval(tick); }
});

test("B5 reports the exact missing PNG dependency when load callback succeeds but the texture has zero dimensions", async () => {
  const h = fixture(); await h.install();
  const tick = setInterval(() => { for (const callback of [...h.listeners]) callback(); }, 1);
  try {
    const probe = h.context.__stage3dBakedPrefabProbe;
    const opened = JSON.parse(JSON.stringify(await probe.open()));
    opened.meshes[0].width = 0; opened.meshes[0].height = 0;
    assert.throws(() => assertBakedRuntime(opened, h.expected), (error) => {
      for (const detail of ["Plane", h.expected.meshes[0].imageUuid, "http://127.0.0.1:7457/unit/lightmap.png", "expected=1024x1024", "observed=0x0"]) assert(error.message.includes(detail));
      assert(!error.message.includes("load callback"), "a fulfilled engine callback must not be rewritten as a callback error");
      return true;
    });
    opened.meshes[0].uvParam[0] = 0.25;
    assert.throws(() => assertBakedRuntime(opened, h.expected), /UV transform/u);
    await probe.dispose();
  } finally { clearInterval(tick); }
});
