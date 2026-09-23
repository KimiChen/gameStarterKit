import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { Node } from "cc";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";

const afterDraw: (() => void)[] = [], frames = new Set<() => void>(), copies: FakeMaterial[] = [];
class FakeMaterial {
    destroyed = false; instancing?: boolean;
    copy(_source: unknown, info: { defines: { USE_INSTANCING: boolean } }) { this.instancing = info.defines.USE_INSTANCING; copies.push(this); }
    destroy() { assert.equal(this.destroyed, false); this.destroyed = true; }
}
class FakeRenderer {
    model = null; sharedMaterials: FakeMaterial[];
    constructor(source: FakeMaterial) { this.sharedMaterials = [source]; }
    setMaterial(material: FakeMaterial, slot: number) { this.sharedMaterials[slot] = material; }
}
class FakeSkinnedRenderer extends FakeRenderer {}
let retiredBillboardModels = 0;
class FakeBillboard {
    enabledInHierarchy = false;
    _model = {};
    _mesh = new FakeMaterial();
    _material = new FakeMaterial();
}
class FakeNode {
    active = true; isValid = true; layer = 123; children: FakeNode[] = []; parent: FakeNode | null = null;
    constructor(readonly renderers: FakeRenderer[] = []) {}
    billboard: FakeBillboard | undefined;
    addChild(node: FakeNode) { assert.equal(node.active, false, "attach inactive before activation"); node.parent = this; this.children.push(node); }
    removeFromParent() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    destroy() { this.isValid = false; }
    getComponentsInChildren(type: unknown) { return type === FakeBillboard ? this.billboard ? [this.billboard] : [] : this.renderers; }
}
class FakePrefab {
    isValid = true; refs = 3; readonly source = new FakeMaterial(); skinned = false; billboard = false;
    addRef() { this.refs++; return this; }
    decRef() { assert.ok(this.refs > 3); this.refs--; return this; }
}
let prefab = new FakePrefab();
const moduleApi = createRequire(import.meta.url)("node:module") as { _load(request: string, parent: unknown, isMain: boolean): unknown };
const original = moduleApi._load;
let create!: typeof import("../src/view/scene3d/cocosEntityPool").createCocosEntityPool;
try {
    moduleApi._load = (request, parent, isMain) => request === "cc" ? {
        Node: FakeNode, Material: FakeMaterial, Prefab: FakePrefab, Billboard: FakeBillboard,
        MeshRenderer: FakeRenderer, SkinnedMeshRenderer: FakeSkinnedRenderer,
        isValid: (node: FakeNode) => node.isValid,
        instantiate: (asset: FakePrefab) => { const node = new FakeNode([new (asset.skinned ? FakeSkinnedRenderer : FakeRenderer)(asset.source)]);
            if (asset.billboard) node.billboard = new FakeBillboard(); return node; },
        Director: { EVENT_AFTER_DRAW: "draw", EVENT_AFTER_UPDATE: "frame" },
        director: { root: { destroyModel: () => { retiredBillboardModels++; } },
            on: (_type: string, cb: () => void) => frames.add(cb), off: (_type: string, cb: () => void) => frames.delete(cb),
            once: (_type: string, cb: () => void) => afterDraw.push(cb) },
        assetManager: { getBundle: () => ({ load: (_path: string, _type: unknown, cb: (error: null, asset: FakePrefab) => void) => cb(null, prefab) }) },
    } : original.call(moduleApi, request, parent, isMain);
    create = createRequire(import.meta.url)("../src/view/scene3d/cocosEntityPool").createCocosEntityPool;
} finally { moduleApi._load = original; }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup(instancing = true) {
    assert.equal(frames.size, 0); assert.equal(afterDraw.length, 0); prefab = new FakePrefab(); copies.length = 0;
    const root = new FakeNode(), address = { bundle: "resources", path: "stage3d/cube" };
    const pool = create({ quality: DEFAULT_QUALITY_TABLE,
        pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
            { id: "cubes", prefab: address, capacity: { low: 100, medium: 300, high: 500 } },
            { id: "sameMaterial", prefab: { ...address, path: "stage3d/other" }, capacity: { low: 100, medium: 300, high: 500 } },
        ] },
        layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["cubes", "sameMaterial"], textures: [] }] },
    }, root as unknown as Node, { quality: resolveQuality({ ...UNKNOWN_QUALITY_DEVICE,
        capabilities: { ...UNKNOWN_QUALITY_DEVICE.capabilities, instancing } }, true, { quality: "high" }) });
    return { root, pool };
}
function frame() { for (const callback of [...frames]) callback(); }
function draw() { for (const callback of afterDraw.splice(0)) callback(); }

test("CocosEntityPool: 500 requests share materials, prepare inactive nodes and activate through frame subscription", async () => {
    const h = setup(); for (let i = 0; i < 500; i++) h.pool.spawn("cubes");
    await settle(); assert.equal(h.root.children.length, 0); frame(); assert.equal(h.root.children.length, 16);
    assert.equal(copies.length, 1); assert.equal(copies[0].instancing, true);
    assert.ok(h.root.children.every((n) => n.renderers[0].sharedMaterials[0] === copies[0] && n.layer === h.root.layer));
    assert.equal(prefab.source.instancing, undefined); assert.equal(prefab.refs, 4);
    h.pool.close(); assert.equal(frames.size, 0); assert.equal(h.root.children.length, 0);
    assert.equal(prefab.refs, 4); assert.equal(copies[0].destroyed, false);
    draw(); assert.equal(prefab.refs, 3); assert.equal(copies[0].destroyed, true); assert.equal(prefab.source.destroyed, false);
});

test("CocosEntityPool: templates sharing a source material keep it until the last retired owner", async () => {
    const h = setup(); const a = h.pool.spawn("cubes")!, b = h.pool.spawn("sameMaterial")!;
    await settle(); frame(); assert.equal(copies.length, 1); assert.equal(prefab.refs, 5);
    a.despawn(); h.pool.evict(); draw(); assert.equal(prefab.refs, 4); assert.equal(copies[0].destroyed, false);
    assert.equal(b.state, "active"); h.pool.close(); draw(); assert.equal(prefab.refs, 3); assert.equal(copies[0].destroyed, true);
});

test("CocosEntityPool: inactive reuse preserves lease and material until eviction's frame boundary", async () => {
    const h = setup(); const a = h.pool.spawn("cubes")!; await settle(); frame(); const node = a.node;
    a.despawn(); draw(); assert.equal(prefab.refs, 4); assert.equal(h.root.children.length, 0);
    const b = h.pool.spawn("cubes")!; frame(); assert.equal(b.node, node); assert.equal(copies.length, 1);
    b.despawn(); h.pool.evict(); assert.equal(prefab.refs, 4); draw(); assert.equal(prefab.refs, 3);
    h.pool.close(); draw();
});

test("CocosEntityPool: capability fallback and realtime skinning never enable shared source instancing", async () => {
    for (const skinned of [false, true]) {
        const h = setup(skinned); prefab.skinned = skinned;
        h.pool.spawn("cubes"); await settle(); frame(); assert.equal(copies[0].instancing, false);
        assert.equal(prefab.source.instancing, undefined); h.pool.close(); draw();
    }
});

test("CocosEntityPool: destroyed parent closes pool and unsubscribes before another activation", async () => {
    const h = setup(); const entity = h.pool.spawn("cubes")!;
    await settle(); h.root.isValid = false; frame(); assert.equal(entity.state, "released");
    assert.equal(h.root.children.length, 0); assert.equal(frames.size, 0); draw(); assert.equal(prefab.refs, 3);
});

test("CocosEntityPool: Billboard enabled on reuse retires its allocations even while the prefab still has active users", async () => {
    const h = setup(); prefab.billboard = true;
    const a = h.pool.spawn("cubes")!, other = h.pool.spawn("cubes")!;
    await settle(); frame(); const node = a.node as unknown as FakeNode, before = retiredBillboardModels;
    a.despawn(); const b = h.pool.spawn("cubes", (node) => { (node as unknown as FakeNode).billboard!.enabledInHierarchy = true; })!;
    frame(); assert.equal(b.node as unknown, node);
    b.despawn(); h.pool.evict(); assert.equal(node.billboard!._mesh.destroyed, false);
    draw(); assert.equal(node.billboard!._mesh.destroyed, true); assert.equal(retiredBillboardModels, before + 1);
    assert.equal(other.state, "active"); assert.equal(prefab.refs, 4); h.pool.close(); draw(); assert.equal(prefab.refs, 3);
});
