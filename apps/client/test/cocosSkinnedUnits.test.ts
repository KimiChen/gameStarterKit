import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { AnimationClip, Node } from "cc";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";

const frames = new Set<() => void>(), draws: (() => void)[] = [], materials: FakeMaterial[] = [];
const instances: FakeInstance[] = [];
let onEnable: (() => void) | undefined;
class FakeAsset {
    refs = 0; isValid = true;
    addRef() { this.refs++; return this; }
    decRef() { assert.ok(this.refs > 0); this.refs--; return this; }
}
class FakeMaterial extends FakeAsset {
    instancing = false; destroyed = false;
    copy(source: FakeMaterial, info: { defines: { USE_INSTANCING: boolean } }) { assert.notEqual(source, this); this.instancing = info.defines.USE_INSTANCING; materials.push(this); }
    destroy() { assert.equal(this.destroyed, false); this.destroyed = true; }
}
class FakeClip extends FakeAsset { constructor(readonly name: string, readonly texture: object) { super(); } }
class FakeInstance extends FakeMaterial {
    constructor(readonly owner: FakeRenderer, readonly parent: FakeMaterial) { super(); instances.push(this); }
}
const atlasA = {}, atlasB = {}, idle = new FakeClip("idle", atlasA), walk = new FakeClip("walk", atlasA), other = new FakeClip("other", atlasB);
class FakeRenderer {
    model = { type: 2, _jointsMedium: { texture: { handle: { texture: atlasA } } }, subModels: [{
        descriptorSet: { getTexture: (_slot: number) => this.model._jointsMedium.texture.handle.texture },
        instancedAttributeBlock: { buffer: new Uint8Array(), attributes: [] as { name: string; format: number; isNormalized: boolean; location: number }[] },
    }] };
    sharedMaterials: FakeMaterial[];
    instance: FakeInstance | undefined;
    constructor(readonly mesh: object, readonly layout: number, source: FakeMaterial) { this.sharedMaterials = [source]; }
    setMaterial(material: FakeMaterial, _slot: number) {
        if (this.model.type === 1) assert.equal(material.instancing, false, "no realtime model can receive an instanced material");
        if (this.instance && this.instance.parent !== material) { this.instance.destroy(); this.instance = undefined; }
        if (this.model.type === 1 && !this.instance) this.instance = new FakeInstance(this, material);
        this.sharedMaterials[0] = material;
        this.model.subModels[0].instancedAttributeBlock = { buffer: new Uint8Array(material.instancing ? 64 : 0),
            attributes: material.instancing ? [{ name: "a_jointAnimInfo", format: this.layout, isNormalized: false, location: 3 }] : [] };
    }
    getRenderMaterial(slot: number) { return this.instance ?? this.sharedMaterials[slot]; }
}
class FakeSkinnedRenderer extends FakeRenderer {
    skeleton = {}; skinningRoot!: FakeNode;
    uploadAnimation(clip: FakeClip) { this.model._jointsMedium.texture.handle.texture = clip.texture; }
}
class FakeAnimation {
    node!: FakeNode; playOnLoad = true; clips = [idle, walk]; sockets: { path: string; target: FakeNode }[] = [];
    played = ""; added: FakeClip[] = []; private baked = true;
    get useBakedAnimation() { return this.baked; }
    set useBakedAnimation(value: boolean) {
        if (!value) assert.equal(this.node.renderer!.sharedMaterials[0].instancing, false);
        this.baked = value; this.node.renderer!.model.type = value ? 2 : 1;
    }
    stop() { this.played = ""; }
    play(name: string) { this.played = name; }
    addClip(clip: FakeClip) { this.added.push(clip); if (!this.clips.includes(clip)) this.clips.push(clip); }
    createSocket(path: string) { const existing = this.sockets.find((socket) => socket.path === path); if (existing) return existing.target;
        const target = new FakeNode(); this.node.addChild(target); this.sockets.push({ path, target }); return target; }
}
class FakeNode {
    private enabled = false;
    get active() { return this.enabled; }
    set active(value: boolean) { this.enabled = value; if (value && this.animation) onEnable?.(); }
    isValid = true; layer = 7; children: FakeNode[] = []; parent: FakeNode | null = null;
    animation?: FakeAnimation; renderer?: FakeSkinnedRenderer;
    addChild(node: FakeNode) { node.parent = this; this.children.push(node); }
    removeFromParent() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    destroy() { this.isValid = false; }
    getChildByPath(path: string) { return path === "Root/Upper" ? this : null; }
    getComponentsInChildren(type: unknown) { return type === FakeAnimation ? this.animation ? [this.animation] : []
        : (type === FakeRenderer || type === FakeSkinnedRenderer) && this.renderer ? [this.renderer] : []; }
}
class FakePrefab extends FakeAsset { source = new FakeMaterial(); mesh = {}; layout = 1; }
let prefab: FakePrefab, alternate: FakePrefab;
const moduleApi = createRequire(import.meta.url)("node:module") as { _load(request: string, parent: unknown, isMain: boolean): unknown };
const original = moduleApi._load;
let create!: typeof import("../src/view/scene3d/cocosSkinnedUnits").createCocosSkinnedUnits;
let register!: typeof import("../src/view/scene3d/jointTextureLayouts").registerJointTextureLayouts;
let layoutCalls: unknown[] = [], failLayout = false;
const fakeDirector = {
    root: { dataPoolManager: { jointTexturePool: { registerCustomTextureLayouts: (layouts: unknown) => { layoutCalls.push(layouts); if (failLayout) throw new Error("GPU"); } } },
        pipeline: { _executor: { _context: { culling: { renderQueues: [], numRenderQueues: 0, cullingPools: { renderQueueRecycle: { data: [] } } } } } } },
    on: (_type: string, fn: () => void) => frames.add(fn), off: (_type: string, fn: () => void) => frames.delete(fn),
    once: (_type: string, fn: () => void) => draws.push(fn),
};
try {
    moduleApi._load = (request, parent, isMain) => request === "cc" ? {
        Node: FakeNode, Material: FakeMaterial, Prefab: FakePrefab, SkeletalAnimation: FakeAnimation,
        MeshRenderer: FakeRenderer, SkinnedMeshRenderer: FakeSkinnedRenderer,
        isValid: (node: FakeNode) => node.isValid,
        instantiate: (asset: FakePrefab) => {
            const node = new FakeNode(); node.animation = new FakeAnimation(); node.animation.node = node;
            node.renderer = new FakeSkinnedRenderer(asset.mesh, asset.layout, asset.source); node.renderer.skinningRoot = node; return node;
        }, director: fakeDirector, Director: { EVENT_AFTER_UPDATE: "frame", EVENT_AFTER_DRAW: "draw" },
        resources: { load: (path: string, _type: unknown, cb: (error: null, value: FakePrefab) => void) => cb(null, path.endsWith("alternate") ? alternate : prefab) },
        assetManager: {},
    } : original.call(moduleApi, request, parent, isMain);
    create = createRequire(import.meta.url)("../src/view/scene3d/cocosSkinnedUnits").createCocosSkinnedUnits;
    register = createRequire(import.meta.url)("../src/view/scene3d/jointTextureLayouts").registerJointTextureLayouts;
} finally { moduleApi._load = original; }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const frame = () => { for (const fn of [...frames]) fn(); };
const draw = () => { for (const fn of draws.splice(0)) fn(); };
const asFake = (node: Node) => node as unknown as FakeNode;
function setup(instancing = true) {
    onEnable = undefined;
    assert.equal(frames.size, 0); assert.equal(draws.length, 0); prefab = new FakePrefab(); alternate = new FakePrefab(); materials.length = 0; instances.length = 0;
    const address = { bundle: "resources", path: "stage3d/main" }, parent = new FakeNode(), errors: unknown[] = [];
    const pool = create({ quality: DEFAULT_QUALITY_TABLE,
        pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
            { id: "units", prefab: address, capacity: { low: 50, medium: 100, high: 100 } },
            { id: "alternate", prefab: { ...address, path: "stage3d/alternate" }, capacity: { low: 50, medium: 100, high: 100 } },
        ] }, layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["units", "alternate"], textures: [] }] },
    }, parent as unknown as Node, { quality: resolveQuality({ ...UNKNOWN_QUALITY_DEVICE,
        capabilities: { ...UNKNOWN_QUALITY_DEVICE.capabilities, instancing, rgba8JointTexture: true } }, true, { quality: "high" }),
        allowRealtime: true, clips: [other as unknown as AnimationClip], onError: (error) => errors.push(error) });
    const close = () => { pool.close(); draw(); assert.equal(prefab.refs, 0); assert.equal(alternate.refs, 0); assert.equal(other.refs, 0);
        assert.ok(materials.every((material) => material.destroyed)); assert.ok(instances.every(instance => instance.destroyed));
        assert.equal(prefab.source.destroyed, false); assert.deepEqual(errors, []); };
    return { pool, parent, close, errors };
}

test("CocosSkinnedUnits: same actual texture shares materials, another atlas splits, play regroups the same node", async () => {
    const h = setup(), a = h.pool.spawn("units", "idle")!, b = h.pool.spawn("units", "walk")!, c = h.pool.spawn("units", "other")!;
    await settle(); frame();
    const an = asFake(a.node!), bn = asFake(b.node!), cn = asFake(c.node!);
    assert.equal(an.renderer!.sharedMaterials[0], bn.renderer!.sharedMaterials[0]);
    assert.notEqual(an.renderer!.sharedMaterials[0], cn.renderer!.sharedMaterials[0]);
    assert.equal(an.animation!.useBakedAnimation, true); assert.equal(an.renderer!.sharedMaterials[0].instancing, true);
    assert.equal(prefab.source.instancing, false);
    h.pool.play(a, "other"); assert.equal(asFake(a.node!), an); assert.equal(an.renderer!.sharedMaterials[0], cn.renderer!.sharedMaterials[0]);
    h.pool.play(a, "walk"); assert.equal(an.renderer!.sharedMaterials[0], bn.renderer!.sharedMaterials[0]); h.close();
});

test("CocosSkinnedUnits: same stride but different instance attributes, mesh or source material never share a group", async () => {
    for (const difference of ["layout", "mesh", "source"] as const) {
        const h = setup(); alternate.mesh = prefab.mesh; alternate.source = prefab.source;
        if (difference === "layout") alternate.layout = 2;
        if (difference === "mesh") alternate.mesh = {};
        if (difference === "source") alternate.source = new FakeMaterial();
        const a = h.pool.spawn("units", "idle")!, b = h.pool.spawn("alternate", "idle")!; await settle(); frame();
        assert.notEqual(asFake(a.node!).renderer!.sharedMaterials[0], asFake(b.node!).renderer!.sharedMaterials[0], difference); h.close();
    }
});

test("CocosSkinnedUnits: realtime receives safe material before model replacement; each evaluator recreated once; socket survives", async () => {
    const h = setup(), a = h.pool.spawn("units", "idle")!, b = h.pool.spawn("units", "walk")!; await settle(); frame();
    const node = asFake(a.node!), baked = asFake(b.node!).renderer!.sharedMaterials[0], socket = h.pool.socket(a, "Root/Upper");
    for (let i = 0; i < 3; i++) {
        h.pool.play(a, "idle", "realtime"); assert.equal(node.renderer!.model.type, 1);
        assert.equal(node.renderer!.sharedMaterials[0].instancing, false); assert.equal(h.pool.socket(a, "Root/Upper"), socket);
        assert.equal(asFake(b.node!).renderer!.sharedMaterials[0], baked); assert.equal(baked.instancing, true);
        h.pool.play(a, "walk", "realtime"); h.pool.play(a, "idle", "baked");
    }
    assert.deepEqual(node.animation!.added, [idle, walk]); assert.equal(node.renderer!.sharedMaterials[0], baked);
    assert.throws(() => h.pool.socket(a, "missing"), /Unknown socket/); h.close();
});

test("CocosSkinnedUnits: non-instanced capability keeps baked RGBA8 and cleanup retains clips/materials until AFTER_DRAW", async () => {
    const h = setup(false), a = h.pool.spawn("units", "other")!; await settle(); frame();
    assert.equal(asFake(a.node!).animation!.useBakedAnimation, true); assert.ok(materials.every((material) => !material.instancing));
    a.despawn(); h.pool.evict(); assert.ok(materials.some((material) => !material.destroyed)); assert.equal(other.refs, 1);
    draw(); assert.equal(other.refs, 0); h.close();
});

test("CocosSkinnedUnits: retiring realtime releases renderer-owned material instances after draw, before their shared parents", async () => {
    const h = setup(), unit = h.pool.spawn("units", "idle", undefined, "realtime")!;
    await settle(); frame(); h.pool.play(unit, "walk", "realtime");
    const renderer = asFake(unit.node!).renderer!, instance = renderer.instance!;
    assert.ok(instance); assert.equal(instance.destroyed, false); assert.equal(instance.parent.destroyed, false);
    const destroy = instance.destroy.bind(instance);
    instance.destroy = () => { assert.equal(instance.parent.destroyed, false); destroy(); };
    unit.despawn(); h.pool.evict(); assert.equal(instance.destroyed, false, "wait until the retired node stops drawing");
    draw(); assert.equal(instance.destroyed, true); assert.equal(instance.parent.destroyed, true); h.close();
});

test("CocosSkinnedUnits: recycled realtime node becomes baked with latest clip, invalid clip is atomic", async () => {
    const h = setup(), a = h.pool.spawn("units", "idle", undefined, "realtime")!; await settle(); frame();
    const node = a.node!; a.despawn(); const b = h.pool.spawn("units", "other")!; frame();
    assert.equal(b.node, node); assert.equal(asFake(node).renderer!.model.type, 2);
    const material = asFake(node).renderer!.sharedMaterials[0];
    assert.throws(() => h.pool.play(b, "missing"), /Unknown animation/);
    assert.equal(b.clip, "other"); assert.equal(asFake(node).renderer!.sharedMaterials[0], material); h.close();
});

test("CocosSkinnedUnits: onEnable can close the pool without playing or regrouping a retired node", async () => {
    const h = setup(), a = h.pool.spawn("units", "idle")!;
    onEnable = () => h.pool.close(); await settle(); frame();
    assert.equal(a.state, "released"); assert.equal(h.parent.children.length, 0);
    assert.ok(materials.every((material) => !material.instancing)); h.close(); onEnable = undefined;
});

test("JointTextureLayouts: reopen is idempotent, duplicate/XOR collisions and unaligned rows fail before allocation", () => {
    layoutCalls = []; const layout = { textureLength: 72, contents: [{ skeleton: 1000, clips: [13, 12] }] };
    register([layout]); register([{ ...layout, contents: [{ skeleton: 1000, clips: [12, 13] }] }]); assert.equal(layoutCalls.length, 1);
    assert.throws(() => register([{ ...layout, textureLength: 64 }]), /12-aligned/);
    assert.throws(() => register([{ ...layout, textureLength: 84 }]), /conflicts/);
    assert.throws(() => register([{ ...layout, contents: [{ skeleton: 9, clips: [5] }, { skeleton: 8, clips: [4] }] }]), /colliding/);
    failLayout = true; const failure = [{ ...layout, contents: [{ skeleton: 2000, clips: [100] }] }];
    assert.throws(() => register(failure), /GPU/); failLayout = false;
    assert.throws(() => register(failure), /previously failed/); assert.equal(layoutCalls.length, 2);
});
