import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssetCatalogData } from "../src/logic/scene3d/assetCatalog";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";
import type { EntityPoolOptions } from "../src/view/scene3d/EntityPool";
import { Vfx } from "../src/view/scene3d/Vfx";
import type { VfxPosition } from "../src/view/scene3d/Vfx";

// Mutation: remove `this.lod < 2 &&` in Vfx.visible → "far LOD" rejects the mutant.
const at = { at: { x: 1, y: 2, z: 3 } };
const quality = resolveQuality(UNKNOWN_QUALITY_DEVICE, true, { quality: "high" });
const address = { bundle: "resources", path: "stage3d/effect" };
const catalog: AssetCatalogData = { quality: DEFAULT_QUALITY_TABLE,
    pool: { version: 1, maxActivationsPerFrame: { low: 1, medium: 2, high: 2 }, entries: [
        { id: "sparks", prefab: address, capacity: { low: 1, medium: 2, high: 3 } },
        { id: "smoke", prefab: { ...address, path: "stage3d/smoke" }, capacity: { low: 1, medium: 2, high: 3 } },
    ] }, layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["sparks", "smoke"], textures: [] }] } };
class FakeNode { active = false; destroyed = false; plays = 0; particles = 0; position = { x: 0, y: 0, z: 0 }; }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(options: Partial<EntityPoolOptions> = {}, data = catalog) {
    const nodes: FakeNode[] = [], loads: boolean[] = [], errors: unknown[] = [];
    let holds = 0, fail = false, delay: Promise<void> | undefined, frame: ((frame: number, time: number) => void) | undefined;
    let onActivate: (() => void) | undefined;
    const subject = new Vfx<FakeNode>(data, {
        subscribeFrames: (step) => { frame = step; return () => { frame = undefined; }; },
        place: (node, position) => { node.position = { ...position }; },
        async load(_address, instancing) {
            loads.push(instancing); await delay;
            if (fail) throw new Error("load failed"); holds++;
            const owned: FakeNode[] = [];
            return {
                create: () => { const node = new FakeNode(); nodes.push(node); owned.push(node); return node; },
                activate: (node) => { node.active = true; node.plays++; node.particles = 5; onActivate?.(); },
                deactivate: (node) => { node.active = false; node.particles = 0; },
                retire: (node) => { node.active = false; node.destroyed = true; node.particles = 0; },
                release: () => { assert.ok(owned.every((n) => !n.active && n.destroyed)); holds--; },
            };
        },
    }, { quality, onError: (error) => errors.push(error), ...options });
    return { subject, nodes, loads, errors, get holds() { return holds; }, get subscribed() { return !!frame; },
        tick: (id: number, time: number) => frame?.(id, time), setFail: (value: boolean) => { fail = value; },
        setDelay: (value: Promise<void>) => { delay = value; }, setOnActivate: (action: () => void) => { onActivate = action; } };
}

test("Vfx: pool reuse clears old particles, resets duration and isolates stale handles", async () => {
    const h = harness(), a = h.subject.play("sparks", at, 100)!;
    await settle(); h.tick(1, 1000); const node = a.node!;
    assert.equal(node.plays, 1); assert.equal(node.particles, 5); assert.deepEqual(node.position, at.at);
    h.tick(2, 1099); assert.equal(a.state, "active"); h.tick(3, 1100); assert.equal(a.state, "released");
    assert.equal(node.particles, 0); assert.equal(h.holds, 1);
    const b = h.subject.play("sparks", { at: { x: 7, y: 8, z: 9 } }, 200)!; h.tick(4, 5000);
    assert.equal(b.node, node); assert.equal(node.plays, 2); a.stop(); assert.equal(b.state, "active");
    h.tick(5, 5199); assert.equal(b.state, "active"); h.tick(6, 5200); assert.equal(b.state, "released");
    h.subject.evict(); assert.equal(h.holds, 0); assert.equal(node.destroyed, true); h.subject.close();
});

test("Vfx: pending loads do not spend lifetime; a long raw-time frame expires immediately", async () => {
    const h = harness(); let resolve!: () => void; h.setDelay(new Promise<void>((done) => { resolve = done; }));
    const effect = h.subject.play("sparks", at, 100)!;
    h.tick(1, 9999); assert.equal(effect.state, "pending"); resolve(); await settle(); h.tick(2, 12000);
    assert.equal(effect.state, "active"); h.tick(3, 30000); assert.equal(effect.state, "released"); h.subject.close();
});

test("Vfx: at is copied; follow tracks world coordinates and stops when the target disappears", async () => {
    const h = harness(); let target: VfxPosition | undefined = { x: 5, y: 6, z: 7 };
    const position = { x: 1, y: 0, z: 0 }, fixed = h.subject.play("sparks", { at: position }, 1000)!;
    position.x = 99;
    const follow = h.subject.play("sparks", { follow: () => target }, 1000)!;
    await settle(); h.tick(1, 1); assert.equal(fixed.node!.position.x, 1); assert.deepEqual(follow.node!.position, target);
    target = { x: 11, y: 22, z: 33 }; h.tick(2, 2); assert.deepEqual(follow.node!.position, target);
    target = undefined; h.tick(3, 3); assert.equal(follow.state, "released"); assert.equal(fixed.state, "active"); h.subject.close();
});

test("Vfx: far LOD refuses new loads, stops active and pending effects, never replays old effects", async () => {
    const h = harness({ lod: 2 });
    assert.equal(h.subject.play("sparks", at, 1000), undefined); await settle(); assert.equal(h.loads.length, 0);
    h.subject.setLod(0); const a = h.subject.play("sparks", at, 1000)!;
    await settle(); h.tick(1, 1); const b = h.subject.play("sparks", at, 1000)!;
    h.subject.setLod(2); assert.equal(a.state, "released"); assert.equal(b.state, "released"); assert.equal(h.holds, 0);
    h.subject.setLod(0); await settle(); h.tick(2, 2); assert.equal(h.nodes.filter((n) => n.active).length, 0); h.subject.close();
});

test("Vfx: content hideAtLod and low details gates refuse effects before acquisition", async () => {
    const data: AssetCatalogData = { ...catalog, layers: { ...catalog.layers, hideAtLod: [{ prefab: address, lod: 1 }] } };
    const h = harness({}, data), a = h.subject.play("sparks", at, 1000)!;
    await settle(); h.tick(1, 1); h.subject.setLod(1); assert.equal(a.state, "released");
    assert.equal(h.subject.play("sparks", at, 100), undefined); h.subject.close();
    const details: AssetCatalogData = { ...catalog, layers: { version: 1, layers: [
        { id: "base", prefabs: [], pools: ["smoke"], textures: [] }, { id: "details", prefabs: [], pools: ["sparks"], textures: [] },
    ] } };
    const low = harness({ quality: resolveQuality(UNKNOWN_QUALITY_DEVICE, false) }, details);
    assert.equal(low.subject.play("sparks", at, 100), undefined); await settle(); assert.equal(low.loads.length, 0); low.subject.close();
});

test("Vfx: per-key and global caps include pending effects; activation budget shared across keys", async () => {
    const h = harness({ quality: { ...quality, maxEffects: 4 } });
    const effects = Array.from({ length: 3 }, () => h.subject.play("sparks", at, 1000)!);
    assert.equal(h.subject.play("sparks", at, 1000), undefined);
    effects.push(h.subject.play("smoke", at, 1000)!); assert.equal(h.subject.play("smoke", at, 1000), undefined);
    await settle(); assert.equal(h.subject.step(1, 1), 2); assert.equal(h.subject.step(1, 1), 0);
    assert.equal(h.subject.step(2, 2), 2); assert.ok(effects.every((e) => e.state === "active"));
    assert.deepEqual(h.loads, [false, false]); h.subject.close();
});

test("Vfx: downgrade enforces total and per-key capacities and zero effects reclaims all", async () => {
    const h = harness(); const a = h.subject.play("sparks", at, 1000)!, b = h.subject.play("sparks", at, 1000)!, c = h.subject.play("smoke", at, 1000)!;
    await settle(); h.tick(1, 1); h.subject.setQuality({ ...quality, tier: "low", maxEffects: 3 });
    assert.equal(a.state, "active"); assert.equal(b.state, "released"); h.tick(2, 2); assert.equal(c.state, "active");
    h.subject.setQuality({ ...quality, maxEffects: 0 }); assert.equal(a.state, "released"); assert.equal(c.state, "released");
    assert.equal(h.subject.play("smoke", at, 1000), undefined); h.subject.evict(); assert.equal(h.holds, 0); h.subject.close();
});

test("Vfx: owner abort releases active/idle/pending holds and frame subscription, including late loads", async () => {
    const owner = new AbortController(), h = harness({ signal: owner.signal });
    const a = h.subject.play("sparks", at, 100)!; await settle(); h.tick(1, 1); a.stop();
    let resolve!: () => void; h.setDelay(new Promise<void>((done) => { resolve = done; }));
    const b = h.subject.play("smoke", at, 100)!; await Promise.resolve(); owner.abort();
    assert.equal(b.state, "released"); assert.equal(h.subscribed, false); resolve(); await settle();
    assert.equal(h.holds, 0); assert.ok(h.nodes.every((n) => n.destroyed)); h.subject.close();
    assert.throws(() => h.subject.play("sparks", at, 100), /closed/);
    const closed = harness({ signal: owner.signal }); assert.equal(closed.subscribed, false);
});

test("Vfx: failed loads and follow exceptions release admissions; fresh calls can recover", async () => {
    const h = harness(); h.setFail(true); const a = h.subject.play("sparks", at, 100)!;
    await settle(); h.tick(1, 1); assert.equal(a.state, "released"); assert.match(String(a.error), /load failed/);
    h.setFail(false); let throws = false;
    const b = h.subject.play("sparks", { follow: () => { if (throws) throw new Error("target error"); return at.at; } }, 100)!;
    await settle(); h.tick(2, 2); throws = true; h.tick(3, 3); assert.equal(b.state, "released");
    assert.equal(h.errors.length, 2); h.subject.close(); assert.equal(h.holds, 0);
});

test("Vfx: missing target, reentrant follow close and onEnable abort never restart stale effects", async () => {
    for (const mode of ["missing", "follow", "activation"]) {
        const owner = new AbortController(), h = harness({ signal: owner.signal });
        if (mode === "activation") h.setOnActivate(() => owner.abort());
        const a = h.subject.play("sparks", { follow: () => { if (mode === "follow") owner.abort(); return mode === "missing" ? undefined : at.at; } }, 100)!;
        await settle(); h.tick(1, 1); assert.equal(a.state, "released"); assert.ok(h.nodes.every((n) => !n.active)); h.subject.close(); assert.equal(h.holds, 0);
    }
});

test("Vfx: invalid duration, coordinates, LOD, key and clocks fail explicitly", () => {
    const h = harness();
    for (const ms of [0, -1, Infinity, NaN]) assert.throws(() => h.subject.play("sparks", at, ms), /durationMs/);
    assert.throws(() => h.subject.play("sparks", { at: { ...at.at, x: NaN } }, 1), /finite/);
    assert.throws(() => h.subject.play("unknown", at, 1), /unknown/);
    assert.throws(() => h.subject.setLod(3 as 2), /LOD/);
    h.tick(1, 10); assert.throws(() => h.subject.step(0, 11), /monotonic/); assert.throws(() => h.subject.step(2, 9), /monotonic/);
    assert.throws(() => h.subject.step(2, Infinity), /monotonic/); h.subject.close();
});
