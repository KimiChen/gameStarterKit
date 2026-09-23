import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";
import type { AssetCatalogData } from "../src/logic/scene3d/assetCatalog";
import { SkinnedUnits } from "../src/view/scene3d/SkinnedUnits";
import type { SkinnedUnitsOptions, SkinningMode } from "../src/view/scene3d/SkinnedUnits";

const address = { bundle: "resources", path: "stage3d/unit" };
const quality = (jointTexture = true) => resolveQuality({ ...UNKNOWN_QUALITY_DEVICE,
    capabilities: { ...UNKNOWN_QUALITY_DEVICE.capabilities, instancing: true, rgba8JointTexture: jointTexture } }, true, { quality: "high" });
const catalog: AssetCatalogData = { quality: DEFAULT_QUALITY_TABLE,
    pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
        { id: "units", prefab: address, capacity: { low: 50, medium: 100, high: 100 } },
    ] }, layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["units"], textures: [] }],
        hideAtLod: [{ prefab: address, lod: 2 }] } };
class FakeNode { active = false; clip = ""; mode: SkinningMode = "baked"; destroyed = false; socket = {} as FakeNode; }
function harness(options: Partial<SkinnedUnitsOptions> = {}) {
    const nodes: FakeNode[] = [], loads: boolean[] = [], errors: unknown[] = [];
    let holds = 0;
    const subject = new SkinnedUnits<FakeNode>(catalog, {
        async load(_address, instancing) {
            loads.push(instancing); holds++;
            return {
                create: () => { const node = new FakeNode(); nodes.push(node); return node; },
                activate: (node) => { assert.ok(node.clip); node.active = true; },
                deactivate: (node) => { node.active = false; },
                retire: (node) => { node.active = false; node.destroyed = true; },
                release: () => { holds--; },
                play: (node, clip, mode) => { if (!['idle', 'walk', 'atlasB'].includes(clip)) throw new Error("missing clip"); node.clip = clip; node.mode = mode; },
                socket: (node) => node.socket,
            };
        },
    }, { quality: quality(), onError: (error) => errors.push(error), ...options });
    return { subject, nodes, loads, errors, get holds() { return holds; } };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("SkinnedUnits: 100 units use EntityPool's shared 16/frame activation budget and RGBA8 stays baked", async () => {
    const h = harness();
    const entities = Array.from({ length: 100 }, (_, i) => h.subject.spawn("units", i % 2 ? "walk" : "idle")!);
    assert.equal(h.subject.spawn("units", "idle"), undefined); await settle();
    for (let frame = 0; frame < 7; frame++) { assert.ok(h.subject.step(frame) <= 16); assert.equal(h.subject.step(frame), 0); }
    assert.equal(entities.filter((e) => e.state === "active").length, 100);
    assert.deepEqual(h.loads, [true]); assert.ok(h.nodes.every((node) => node.mode === "baked"));
    h.subject.close(); assert.equal(h.holds, 0);
});

test("SkinnedUnits: pending play uses the latest clip; despawned handles cannot change reused nodes or sockets", async () => {
    const h = harness(), a = h.subject.spawn("units", "idle")!;
    h.subject.play(a, "walk"); assert.throws(() => h.subject.socket(a, "Root"), /active/);
    await settle(); h.subject.step(1); const node = a.node!;
    assert.equal(node.clip, "walk"); const socket = h.subject.socket(a, "Root");
    h.subject.play(a, "atlasB"); assert.equal(a.node, node); assert.equal(h.subject.socket(a, "Root"), socket);
    a.despawn(); const b = h.subject.spawn("units", "idle")!; h.subject.step(2); assert.equal(b.node, node);
    assert.throws(() => h.subject.play(a, "walk"), /Expired/); assert.throws(() => h.subject.socket(a, "Root"), /Expired/);
    assert.equal(node.clip, "idle"); h.subject.close();
});

test("SkinnedUnits: realtime requires opt-in, obeys its separate cap and does not turn off other baked units", async () => {
    const denied = harness(); assert.throws(() => denied.subject.spawn("units", "idle", undefined, "realtime"), /allowRealtime/); denied.subject.close();
    const h = harness({ allowRealtime: true, quality: { ...quality(), maxUnitsWithoutInstancing: 1 } });
    const a = h.subject.spawn("units", "idle")!, b = h.subject.spawn("units", "walk")!;
    h.subject.play(a, "idle", "realtime"); assert.throws(() => h.subject.play(b, "walk", "realtime"), /capacity/);
    assert.equal(h.subject.spawn("units", "walk", undefined, "realtime"), undefined);
    await settle(); h.subject.step(1); assert.equal(a.node!.mode, "realtime"); assert.equal(b.node!.mode, "baked");
    h.subject.play(a, "walk", "baked"); h.subject.play(b, "idle", "realtime"); h.subject.close();
});

test("SkinnedUnits: unknown clip fails admission; retry, cancellation and late loading leave no holds", async () => {
    const h = harness(), a = h.subject.spawn("units", "missing")!;
    await settle(); h.subject.step(1); assert.equal(a.state, "failed"); assert.equal(h.errors.length, 1);
    h.subject.play(a, "walk"); a.retry(); await settle(); h.subject.step(2); assert.equal(a.state, "active");
    h.subject.close(); assert.equal(h.holds, 0);
    const abort = new AbortController(), late = harness({ signal: abort.signal });
    const b = late.subject.spawn("units", "idle")!; await Promise.resolve(); abort.abort(); await settle();
    assert.equal(b.state, "released"); assert.equal(late.holds, 0); assert.equal(late.nodes.length, 0);
});

test("SkinnedUnits: LOD hides and returns latest animation, downgrade enforces total and realtime capacities", async () => {
    const h = harness({ allowRealtime: true }), a = h.subject.spawn("units", "idle")!, b = h.subject.spawn("units", "walk")!;
    await settle(); h.subject.step(1); const old = a.node;
    h.subject.setLod(2); assert.equal(a.state, "hidden"); assert.equal(h.holds, 0);
    h.subject.play(a, "atlasB", "realtime"); h.subject.setLod(0); await settle(); h.subject.step(2);
    assert.notEqual(a.node, old); assert.equal(a.node!.clip, "atlasB");
    h.subject.setQuality({ ...quality(), maxUnits: 1 }); assert.equal(b.state, "released");
    h.subject.setQuality({ ...quality(), maxUnitsWithoutInstancing: 0 }); assert.equal(a.state, "released"); h.subject.close();
});

test("SkinnedUnits: unavailable joint textures need explicit realtime selection; foreign/socket errors preserve active units", async () => {
    const h = harness({ allowRealtime: true }), other = harness(), a = h.subject.spawn("units", "idle")!;
    assert.throws(() => other.subject.play(a, "walk"), /foreign/);
    assert.throws(() => h.subject.setQuality(quality(false)), /explicitly/);
    await settle(); h.subject.step(1); assert.throws(() => h.subject.socket(a, "../Root"), /Invalid/);
    assert.throws(() => h.subject.play(a, "missing"), /missing/); assert.equal(a.clip, "idle");
    h.subject.play(a, "walk", "realtime"); h.subject.setQuality(quality(false));
    assert.throws(() => h.subject.play(a, "walk", "baked"), /unavailable/);
    h.subject.close(); other.subject.close();
});

test("SkinnedUnits: configure can close its owner without starting animation on a retired node", async () => {
    const h = harness(), a = h.subject.spawn("units", "idle", () => h.subject.close())!;
    await settle(); h.subject.step(1); assert.equal(a.state, "released"); assert.equal(h.holds, 0);
    assert.equal(h.nodes[0].clip, "");
});

test("SkinnedUnits: template class methods retain their receiver and lifecycle through the EntityPool adapter", async () => {
    class Template {
        held = true;
        create() { assert.equal(this.held, true); return new FakeNode(); }
        activate(node: FakeNode) { assert.equal(this.held, true); node.active = true; }
        deactivate(node: FakeNode) { assert.equal(this.held, true); node.active = false; }
        retire(node: FakeNode) { assert.equal(this.held, true); node.destroyed = true; }
        release() { this.held = false; }
        play(node: FakeNode, clip: string) { node.clip = clip; }
        socket(node: FakeNode) { return node.socket; }
    }
    const template = new Template(), subject = new SkinnedUnits<FakeNode>(catalog, { load: async () => template }, { quality: quality() });
    const unit = subject.spawn("units", "idle")!; await settle(); subject.step(1); const node = unit.node!;
    assert.equal(node.active, true); unit.despawn(); subject.evict(); assert.equal(node.destroyed, true);
    assert.equal(template.held, false); subject.close();
});
