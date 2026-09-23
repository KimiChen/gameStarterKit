import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { Node } from "cc";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";

const afterDraw: (() => void)[] = [], frames = new Set<() => void>();
class Material { destroyed = false; destroy() { assert.equal(this.destroyed, false); this.destroyed = true; } }
class Particle {
    playOnAwake = true; playing = false; count = 0;
    readonly fallback = new Material();
    processor = { getDefaultMaterial: () => this.fallback };
    constructor(readonly node: FakeNode) {}
    get enabledInHierarchy() { return this.node.activeInHierarchy; }
    stop() { this.playing = false; this.clear(); }
    clear() { if (this.enabledInHierarchy) this.count = 0; }
    play() { assert.ok(this.node.activeInHierarchy); assert.equal(this.playOnAwake, false); assert.equal(this.count, 0); this.playing = true; this.count = 9; }
}
let onEnable: (() => void) | undefined;
class FakeNode {
    private enabled = true;
    isValid = true; layer = 77; children: FakeNode[] = []; parent: FakeNode | null = null;
    worldPosition = { x: 0, y: 0, z: 0 }; particle: Particle | undefined;
    get active() { return this.enabled; }
    set active(value: boolean) { this.enabled = value; if (value) onEnable?.(); }
    get activeInHierarchy(): boolean { return this.active && (this.parent?.activeInHierarchy ?? true); }
    addChild(node: FakeNode) { assert.equal(node.active, false); node.parent = this; this.children.push(node); }
    setWorldPosition(x: number, y: number, z: number) { assert.ok(this.parent); this.worldPosition = { x, y, z }; }
    removeFromParent() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    destroy() { this.isValid = false; }
    getComponentsInChildren() { return this.particle ? [this.particle] : []; }
}
class Prefab {
    refs = 1; isValid = true; particles = true; readonly source = new Material();
    addRef() { this.refs++; return this; } decRef() { this.refs--; return this; }
}
let prefab = new Prefab(); const nodes: FakeNode[] = [];
const require = createRequire(import.meta.url), moduleApi = require("node:module") as { _load(request: string, parent: unknown, isMain: boolean): unknown };
const original = moduleApi._load;
let create!: typeof import("../src/view/scene3d/cocosVfx").createCocosVfx;
try {
    moduleApi._load = (request, parent, main) => request === "cc" ? {
        Node: FakeNode, Material, ParticleSystem: Particle, Prefab, isValid: (node: FakeNode) => node.isValid,
        instantiate: () => { const node = new FakeNode(); if (prefab.particles) node.particle = new Particle(node); nodes.push(node); return node; },
        Director: { EVENT_AFTER_DRAW: "draw", EVENT_AFTER_UPDATE: "frame" },
        director: { on: (_type: string, cb: () => void) => frames.add(cb), off: (_type: string, cb: () => void) => frames.delete(cb),
            once: (_type: string, cb: () => void) => afterDraw.push(cb) },
        resources: { load: (_path: string, _type: unknown, cb: (error: null, asset: Prefab) => void) => cb(null, prefab) },
        assetManager: { getBundle: () => undefined },
    } : original.call(moduleApi, request, parent, main);
    create = require("../src/view/scene3d/cocosVfx").createCocosVfx;
} finally { moduleApi._load = original; }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const draw = () => { for (const callback of afterDraw.splice(0)) callback(); };
const frame = () => { for (const callback of [...frames]) callback(); };
function setup() {
    assert.equal(frames.size, 0); assert.equal(afterDraw.length, 0); onEnable = undefined; prefab = new Prefab(); nodes.length = 0;
    const parent = new FakeNode(), owner = new AbortController(), errors: unknown[] = [];
    const pool = create({ quality: DEFAULT_QUALITY_TABLE,
        pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
            { id: "sparks", prefab: { bundle: "resources", path: "stage3d/sparks" }, capacity: { low: 8, medium: 24, high: 50 } },
        ] }, layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["sparks"], textures: [] }] },
    }, parent as unknown as Node, { signal: owner.signal, quality: resolveQuality(UNKNOWN_QUALITY_DEVICE, true, { quality: "high" }), onError: (error) => errors.push(error) });
    return { pool, parent, owner, errors };
}

test("CocosVfx: applies world position after parenting, reuses cleared particles and retires fallback after draw", async () => {
    const h = setup(), a = h.pool.play("sparks", { at: { x: 10, y: 2, z: 3 } }, 1000)!;
    await settle(); frame(); const node = nodes[0], particle = node.particle!;
    assert.deepEqual(node.worldPosition, { x: 10, y: 2, z: 3 }); assert.equal(particle.count, 9); assert.equal(prefab.refs, 2);
    a.stop(); assert.equal(particle.count, 0); assert.equal(particle.playing, false); assert.equal(h.parent.children.length, 0);
    const b = h.pool.play("sparks", { at: { x: 20, y: 4, z: 6 } }, 1000)!; frame(); assert.equal(b.node, a.node ?? node);
    assert.equal(nodes.length, 1); assert.equal(particle.count, 9); assert.equal(node.worldPosition.x, 20);
    h.owner.abort(); assert.equal(b.state, "released"); assert.equal(frames.size, 0); assert.equal(node.isValid, false);
    assert.equal(particle.count, 0); assert.equal(particle.fallback.destroyed, false); assert.equal(prefab.refs, 2);
    draw(); assert.equal(particle.fallback.destroyed, true); assert.equal(prefab.refs, 1); assert.equal(prefab.source.destroyed, false);
    assert.deepEqual(h.errors, []);
});

test("CocosVfx: onEnable release does not restart particles and still retires captured fallback", async () => {
    const h = setup(); h.pool.play("sparks", { at: { x: 0, y: 0, z: 0 } }, 1000);
    await settle(); onEnable = () => h.owner.abort(); frame(); onEnable = undefined;
    assert.equal(nodes[0].particle!.playing, false); assert.equal(frames.size, 0); draw();
    assert.equal(nodes[0].particle!.fallback.destroyed, true); assert.equal(prefab.refs, 1); assert.deepEqual(h.errors, []);
});

test("CocosVfx: missing ParticleSystem fails cleanly and destroyed parent cancels automatic updates", async () => {
    const h = setup(); prefab.particles = false;
    const a = h.pool.play("sparks", { at: { x: 0, y: 0, z: 0 } }, 1000)!;
    await settle(); frame(); assert.match(String(a.error), /ParticleSystem/); assert.equal(nodes[0].isValid, false);
    draw(); assert.equal(prefab.refs, 1); h.parent.isValid = false; frame(); assert.equal(frames.size, 0); draw();
    assert.equal(h.errors.length, 1);
});

test("CocosVfx: activation failure still returns the prefab and destroys its fallback material", async () => {
    const h = setup(), effect = h.pool.play("sparks", { at: { x: 0, y: 0, z: 0 } }, 1000)!;
    await settle(); onEnable = () => { throw new Error("component onEnable failed"); }; frame(); onEnable = undefined;
    assert.equal(effect.state, "released"); assert.match(String(effect.error), /onEnable failed/);
    assert.equal(nodes[0].isValid, false); draw(); assert.equal(nodes[0].particle!.fallback.destroyed, true);
    assert.equal(prefab.refs, 1); h.pool.close(); draw(); assert.equal(h.errors.length, 1);
});
