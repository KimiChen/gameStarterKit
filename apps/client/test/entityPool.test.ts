import assert from "node:assert/strict";
import { test } from "node:test";
import { AssetPlan } from "../src/logic/scene3d/assetPlan";
import type { AssetCatalogData } from "../src/logic/scene3d/assetCatalog";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";
import type { QualityTier } from "../src/logic/scene3d/qualityData";
import { EntityPool } from "../src/view/scene3d/EntityPool";
import type { EntityPoolOptions, EntityTemplate, PooledEntity } from "../src/view/scene3d/EntityPool";

const main = { bundle: "resources", path: "stage3d/main" }, far = { ...main, path: "stage3d/far" };
const quality = (tier: QualityTier = "high", instancing = true) => resolveQuality({ ...UNKNOWN_QUALITY_DEVICE,
    capabilities: { ...UNKNOWN_QUALITY_DEVICE.capabilities, instancing } }, true, { quality: tier });
function catalog(details = false): AssetCatalogData {
    return { quality: DEFAULT_QUALITY_TABLE,
        pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
            { id: "cubes", prefab: main, capacity: { low: 100, medium: 300, high: 500 } },
        ] },
        layers: { version: 1, layers: [
            { id: "base", prefabs: [], pools: details ? [] : ["cubes"], textures: [] },
            { id: "details", prefabs: [], pools: details ? ["cubes"] : [], textures: [] },
        ] },
        prefabLods: [{ prefab: main, lods: [main, far, far] }],
    };
}
class FakeNode { active = false; destroyed = false; position = 0; constructor(readonly asset: string) {} }
function harness(data = catalog(), options: Partial<EntityPoolOptions> = {}) {
    const nodes: FakeNode[] = [], errors: unknown[] = [], events: string[] = [];
    const hooks: { deactivate?: () => void } = {};
    const jobs: { asset: string; instancing: boolean; signal: AbortSignal; resolve(): void; reject(error: unknown): void }[] = [];
    let holds = 0, activations = 0;
    const subject = new EntityPool<FakeNode>(data, { load(asset, instancing, signal) {
        return new Promise<EntityTemplate<FakeNode>>((resolve, reject) => jobs.push({ asset: asset.path, instancing, signal, reject, resolve() {
            holds++; let released = false;
            const owned = new Set<FakeNode>();
            resolve({
                create() { assert.ok(!released); const node = new FakeNode(asset.path); nodes.push(node); owned.add(node); events.push("create"); return node; },
                activate(node) { assert.ok(!node.destroyed && !released); node.active = true; activations++; events.push("activate"); },
                deactivate(node) { assert.ok(!node.destroyed); node.active = false; hooks.deactivate?.(); },
                retire(node) { assert.ok(!node.destroyed); node.destroyed = true; node.active = false; events.push("destroy"); },
                release() { assert.ok(!released); assert.ok([...owned].every((n) => n.destroyed)); released = true; holds--; events.push("release"); },
            });
        } }));
    } }, { quality: quality(), onError: (error) => errors.push(error), ...options });
    return { subject, nodes, jobs, errors, events, hooks, get holds() { return holds; }, get activations() { return activations; } };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
async function ready(h: ReturnType<typeof harness>) { await settle(); h.jobs.at(-1)!.resolve(); await settle(); }

for (const tier of ["low", "medium", "high"] as const) test(`EntityPool: 500 spawn requests obey ${tier} capacity and every frame budget`, async () => {
    const h = harness(catalog(), { quality: quality(tier) });
    const entities = Array.from({ length: 500 }, () => h.subject.spawn("cubes")).filter((e) => e !== undefined);
    assert.equal(entities.length, { low: 100, medium: 300, high: 500 }[tier]);
    assert.equal(h.nodes.length, 0); await ready(h); assert.equal(h.nodes.length, 0);
    const budget = { low: 4, medium: 8, high: 16 }[tier];
    for (let frame = 0; entities.some((e) => e.state === "pending"); frame++) {
        const before = h.activations;
        assert.ok(h.subject.step(frame) <= budget);
        h.subject.step(frame); // Repeated calls may not mint another frame budget.
        assert.ok(h.activations - before <= budget);
        assert.ok(frame < 1000);
    }
    assert.equal(h.nodes.length, entities.length); assert.equal(h.jobs.length, 1);
    h.subject.close(); assert.equal(h.holds, 0); assert.ok(h.nodes.every((n) => n.destroyed));
});

test("EntityPool: reuse restores caller state, stale handles cannot despawn a reused node, idle holds until eviction", async () => {
    const h = harness(), first = h.subject.spawn("cubes", (n) => { n.position = 7; })!;
    await ready(h); h.subject.step(0); const node = first.node!;
    first.despawn(); assert.equal(first.node, undefined); assert.equal(h.holds, 1); assert.equal(node.active, false);
    const second = h.subject.spawn("cubes", (n) => { n.position = 12; })!;
    h.subject.step(1); assert.equal(second.node, node); assert.equal(node.position, 12);
    first.despawn(); first.retry(); assert.equal(second.state, "active");
    h.subject.evict(); assert.equal(node.destroyed, false); assert.equal(h.holds, 1);
    second.despawn(); h.subject.evict(); assert.equal(h.holds, 0);
    assert.deepEqual(h.events.slice(-2), ["destroy", "release"]); h.subject.close();
});

test("EntityPool: LOD swaps invalidate queued work and retire old idle nodes before releasing the prefab", async () => {
    const h = harness(), entities = Array.from({ length: 30 }, () => h.subject.spawn("cubes")!);
    await ready(h); h.subject.step(0); assert.equal(h.activations, 16);
    h.subject.setLod(1); assert.ok(h.nodes.every((n) => n.destroyed)); assert.equal(h.holds, 0);
    await ready(h); h.subject.step(0); assert.equal(h.activations, 16);
    h.subject.step(1); assert.equal(entities.filter((e) => e.node?.asset === far.path).length, 16);
    h.subject.setLod(2); h.subject.step(2); assert.equal(h.jobs.length, 2); // Two-level far address is shared.
    assert.ok(entities.every((e) => e.node?.asset === far.path)); h.subject.close(); assert.equal(h.holds, 0);
});

test("EntityPool: same-address load ABA never accepts old completion after a LOD round trip", async () => {
    const h = harness(), entity = h.subject.spawn("cubes")!;
    await settle(); h.subject.setLod(1); await settle(); h.subject.setLod(0); await settle();
    assert.equal(h.jobs.length, 3); assert.ok(h.jobs[0].signal.aborted && h.jobs[1].signal.aborted);
    h.jobs[0].resolve(); h.jobs[1].resolve(); await settle();
    h.subject.step(0); assert.equal(entity.state, "pending"); assert.equal(h.holds, 0);
    h.jobs[2].resolve(); await settle(); h.subject.step(1); assert.equal(entity.node?.asset, main.path);
    h.subject.close(); assert.equal(h.holds, 0);
});

test("EntityPool: closing queued/loading work prevents late creation and retires late leases exactly once", async () => {
    const h = harness(), entities = Array.from({ length: 500 }, () => h.subject.spawn("cubes")!);
    await settle(); h.subject.close(); h.subject.close(); h.jobs[0].resolve(); await settle();
    assert.equal(h.subject.step(1), 0); assert.equal(h.nodes.length, 0); assert.equal(h.holds, 0);
    assert.ok(entities.every((e) => e.state === "released")); assert.throws(() => h.subject.spawn("cubes"), /closed/);
});

test("EntityPool: despawn before a pending load resolves cancels the last consumer without reviving it", async () => {
    const h = harness(), a = h.subject.spawn("cubes")!, b = h.subject.spawn("cubes")!;
    await settle(); a.despawn(); assert.equal(h.jobs[0].signal.aborted, false);
    b.despawn(); assert.equal(h.jobs[0].signal.aborted, true);
    h.jobs[0].resolve(); await settle(); h.subject.step(0); assert.equal(h.holds, 0); assert.equal(h.activations, 0);
});

test("EntityPool: low details are neither requested nor activated; upgrading and downgrading match AssetPlan", async () => {
    const data = catalog(true), h = harness(data, { quality: quality("low") });
    const entity = h.subject.spawn("cubes")!;
    const plan = new AssetPlan({ ...data, chunks: [{ key: 0, pools: ["cubes"] }] }, { now: () => 0, graceMs: 0 });
    await settle(); h.subject.step(0); assert.equal(h.jobs.length, 0); assert.equal(entity.state, "hidden");
    assert.equal(plan.update("low", 0, [0]).acquire.length, 0);
    h.subject.setQuality(quality("high")); await ready(h); h.subject.step(1); assert.equal(entity.state, "active");
    assert.equal(plan.update("high", 0, [0]).acquire[0].path, entity.node?.asset);
    h.subject.setQuality(quality("low")); assert.equal(entity.state, "hidden"); assert.equal(h.holds, 0);
    assert.equal(plan.update("low", 0, [0]).release.length, 1); h.subject.close();
});

test("EntityPool: hideAtLod applies identically to loading plans and activation; hidden entities can return", async () => {
    const data = { ...catalog(), layers: { ...catalog().layers, hideAtLod: [{ prefab: main, lod: 2 as const }] } };
    const h = harness(data), entity = h.subject.spawn("cubes")!;
    await ready(h); h.subject.step(0); h.subject.setLod(2);
    assert.equal(entity.state, "hidden"); assert.equal(h.holds, 0);
    const plan = new AssetPlan({ ...data, chunks: [{ key: 0, pools: ["cubes"] }] }, { now: () => 0 });
    assert.equal(plan.update("high", 2, [0]).acquire.length, 0);
    h.subject.setLod(1); await ready(h); h.subject.step(1); assert.equal(entity.node?.asset, far.path); h.subject.close();
});

test("EntityPool: downgrade keeps oldest admissions, lowers current frame allowance and releases old instancing mode", async () => {
    const h = harness(), entities = Array.from({ length: 500 }, () => h.subject.spawn("cubes")!);
    await ready(h); h.subject.step(0); h.subject.setQuality(quality("low", false));
    assert.ok(entities.slice(100).every((e) => e.state === "released"));
    assert.ok(h.nodes.every((n) => n.destroyed)); assert.equal(h.holds, 0);
    await ready(h); assert.equal(h.jobs[1].instancing, false); assert.equal(h.subject.step(0), 0);
    assert.equal(h.subject.step(1), 4); h.subject.close();
});

test("EntityPool: capacity includes inactive nodes; unchanged prefab is reused after admission replacement", async () => {
    const data = catalog(); const h = harness({ ...data, pool: { ...data.pool, entries: [
        { ...data.pool.entries[0], capacity: { low: 1, medium: 1, high: 1 } },
    ] } });
    const a = h.subject.spawn("cubes")!; await ready(h); h.subject.step(0); a.despawn();
    const b = h.subject.spawn("cubes")!; assert.equal(h.subject.spawn("cubes"), undefined); h.subject.step(1);
    assert.equal(h.nodes.length, 1); assert.equal(b.state, "active"); h.subject.close();
});

test("EntityPool: failed acquisition retries explicitly and stale failures cannot poison replacement", async () => {
    const h = harness(), entity = h.subject.spawn("cubes")!;
    await settle(); const error = new Error("missing"); h.jobs[0].reject(error); await settle();
    assert.equal(entity.state, "failed"); assert.equal(entity.error, error); assert.deepEqual(h.errors, [error]);
    h.subject.step(0); assert.equal(h.jobs.length, 1); entity.retry(); await ready(h); h.subject.step(1);
    assert.equal(entity.state, "active"); assert.equal(entity.error, undefined); h.subject.close();
    const stale = harness(); const other = stale.subject.spawn("cubes")!;
    await settle(); stale.subject.setLod(1); await settle(); stale.jobs[0].reject(error); await settle();
    assert.equal(other.state, "pending"); assert.deepEqual(stale.errors, []); stale.subject.close();
});

test("EntityPool: configure failure consumes budget and destroys its node without blocking later entities", async () => {
    const h = harness(), bad = h.subject.spawn("cubes", () => { throw new Error("configure"); })!, good = h.subject.spawn("cubes")!;
    await ready(h); assert.equal(h.subject.step(0), 2); assert.equal(bad.state, "failed"); assert.equal(good.state, "active");
    assert.equal(h.nodes[0].destroyed, true); assert.equal(h.holds, 1); h.subject.close(); assert.equal(h.holds, 0);
});

for (const action of ["close", "despawn", "lod"] as const) test(`EntityPool: reentrant ${action} from configure never activates obsolete node`, async () => {
    const h = harness(); let entity: PooledEntity<FakeNode>;
    entity = h.subject.spawn("cubes", () => { if (action === "close") h.subject.close(); else if (action === "despawn") entity.despawn(); else h.subject.setLod(1); })!;
    await ready(h); h.subject.step(0); assert.equal(h.activations, 0); h.subject.close(); await settle(); assert.equal(h.holds, 0);
});

test("EntityPool: shared frame budget spans multiple prefab keys and slow head loads do not block ready work", async () => {
    const data = catalog(), extra = { id: "other", prefab: far, capacity: { low: 30, medium: 30, high: 30 } };
    const h = harness({ ...data, pool: { ...data.pool, entries: [...data.pool.entries, extra] },
        layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["cubes", "other"], textures: [] }] } });
    const cubes = Array.from({ length: 30 }, () => h.subject.spawn("cubes")!);
    const others = Array.from({ length: 30 }, () => h.subject.spawn("other")!);
    await settle(); h.jobs[1].resolve(); await settle(); assert.equal(h.subject.step(0), 16);
    assert.ok(cubes.every((e) => e.state === "pending")); assert.equal(others.filter((e) => e.state === "active").length, 16);
    h.jobs[0].resolve(); await settle(); assert.equal(h.subject.step(0), 0); assert.equal(h.subject.step(1), 16); h.subject.close();
});

test("EntityPool: abort signal closes both ready and pending owners, including pre-aborted construction", async () => {
    const controller = new AbortController(), h = harness(catalog(), { signal: controller.signal });
    h.subject.spawn("cubes"); await ready(h); h.subject.step(0); controller.abort(); assert.equal(h.holds, 0);
    const closed = harness(catalog(), { signal: controller.signal }); assert.throws(() => closed.subject.spawn("cubes"), /closed/);
});

test("EntityPool: validates tables, LOD, unknown IDs and monotonic frame numbers before changing ownership", async () => {
    const h = harness(); assert.throws(() => h.subject.spawn("missing"), /unknown pool/);
    assert.throws(() => h.subject.setLod(3 as never), /invalid LOD/);
    assert.throws(() => h.subject.step(NaN), /monotonic/); h.subject.step(3);
    assert.throws(() => h.subject.step(2), /monotonic/);
    assert.throws(() => harness({ ...catalog(), layers: { ...catalog().layers, hideAtLod: [{ prefab: main, lod: 9 as never }] } }), /expected 0/);
    h.subject.close();
});

test("EntityPool: onDisable cannot reuse a node while its previous owner is still detaching", async () => {
    const h = harness(), a = h.subject.spawn("cubes")!; await ready(h); h.subject.step(0);
    let b: PooledEntity<FakeNode> | undefined;
    h.hooks.deactivate = () => { b = h.subject.spawn("cubes"); assert.equal(h.subject.step(1), 0); };
    a.despawn(); h.hooks.deactivate = undefined;
    assert.equal(b!.state, "pending"); h.subject.step(1); assert.equal(b!.state, "active"); h.subject.close();
});
