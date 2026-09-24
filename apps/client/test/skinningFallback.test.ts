import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssetCatalogData } from "../src/logic/scene3d/assetCatalog";
import { DEFAULT_QUALITY_TABLE, resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../src/logic/scene3d/qualityTiers";
import { resolveSkinningPolicy } from "../src/logic/scene3d/skinningPolicy";
import type { BakedFrameBudget } from "../src/logic/scene3d/skinningPolicy";
import { SkinnedUnits } from "../src/view/scene3d/SkinnedUnits";
import type { EntityTemplate } from "../src/view/scene3d/EntityPool";

const main = { bundle: "kit-fixture", path: "3d/unit" }, far = { ...main, path: "3d/billboard" };
const low = (joint = true, instancing = true) => resolveQuality({ ...UNKNOWN_QUALITY_DEVICE, platform: "wechat",
    api: "webgl1", capabilities: { ...UNKNOWN_QUALITY_DEVICE.capabilities, rgba8JointTexture: joint, instancing } });
const catalog: AssetCatalogData = { quality: DEFAULT_QUALITY_TABLE,
    pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 }, entries: [
        { id: "units", prefab: main, capacity: { low: 50, medium: 100, high: 100 } },
    ] }, layers: { version: 1, layers: [{ id: "base", prefabs: [], pools: ["units"], textures: [] }] } };
class FakeNode { active = false; retired = false; clip = ""; mode = ""; constructor(readonly billboard: boolean) {} }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(joint = false, instancing = true, measuredBakedBudget?: BakedFrameBudget, data = catalog) {
    const loads: { path: string; instancing: boolean; billboard: boolean }[] = [], nodes: FakeNode[] = [], errors: unknown[] = [];
    let holds = 0, fail = false, late: (() => void) | undefined, defer = false;
    const load = async (address: typeof main, instancing: boolean, billboard: boolean): Promise<EntityTemplate<FakeNode>> => {
        loads.push({ path: address.path, instancing, billboard });
        if (fail) throw new Error("remote cache write failed");
        if (defer) await new Promise<void>((resolve) => { late = resolve; });
        holds++;
        return { create: () => { const node = new FakeNode(billboard); nodes.push(node); return node; },
            activate: (node) => { assert.ok(billboard || node.clip); node.active = true; },
            deactivate: (node) => { node.active = false; }, retire: (node) => { node.active = false; node.retired = true; },
            release: () => { holds--; } };
    };
    const abort = new AbortController();
    const pool = new SkinnedUnits<FakeNode>(data, {
        load: async (address, instancing) => ({ ...await load(address, instancing, false),
            play: (node, clip, mode) => { node.clip = clip; node.mode = mode; }, socket: (node) => node }),
        loadBillboard: (address, instancing) => load(address, instancing, true),
    }, { quality: low(joint, instancing), allowRealtime: true, signal: abort.signal,
        fallback: { billboards: { units: far }, measuredBakedBudget }, onError: (error) => errors.push(error) });
    return { pool, abort, loads, nodes, errors, get holds() { return holds; }, setFail: (value: boolean) => { fail = value; },
        setDeferred: () => { defer = true; }, finish: () => late?.() };
}

test("Skinning fallback: RGBA8 stays baked, absent instancing clamps units without forcing CPU skinning", async () => {
    for (const instancing of [true, false]) {
        const h = harness(true, instancing), count = instancing ? 50 : 25;
        const units = Array.from({ length: count }, () => h.pool.spawn("units", "walk")!);
        assert.equal(h.pool.spawn("units", "walk"), undefined); await settle();
        for (let frame = 0; frame < 13; frame++) assert.ok(h.pool.step(frame) <= 4);
        assert.ok(units.every((unit) => unit.state === "active" && unit.mode === "baked"));
        h.pool.setLod(2); await settle(); h.pool.step(14);
        assert.deepEqual(h.loads, [{ path: main.path, instancing, billboard: false }]);
        assert.equal(h.pool.policy.reason, "baked"); h.pool.close(); assert.equal(h.holds, 0);
    }
});

test("Skinning fallback: variant rewriting cannot hide duplicate author rows or reinterpret a near Prefab as a billboard", () => {
    const row = { prefab: main, lods: [main, main, main] as const };
    assert.throws(() => harness(false, true, undefined, { ...catalog, prefabLods: [row, row] }), /duplicate prefab variants/);
    assert.throws(() => harness(false, true, undefined, { ...catalog, prefabLods: [{ ...row, lods: [main, far, main] }] }), /near-LOD/);
});

test("Skinning fallback: no vertex sampling uses 25 direct realtime units, far billboards and restores the latest clip", async () => {
    const h = harness(), units = Array.from({ length: 25 }, () => h.pool.spawn("units", "idle")!);
    assert.equal(h.pool.spawn("units", "idle"), undefined);
    assert.throws(() => h.pool.spawn("units", "idle", undefined, "baked"), /fallback/);
    await settle(); for (let f = 0; f < 7; f++) { assert.ok(h.pool.step(f) <= 4); assert.equal(h.pool.step(f), 0); }
    assert.ok(units.every((u) => u.state === "active" && u.mode === "realtime" && u.node!.mode === "realtime"));
    const near = units[0].node!;
    h.pool.setLod(2); assert.equal(h.holds, 0); assert.equal(near.retired, true);
    await settle(); for (let f = 7; f < 14; f++) h.pool.step(f);
    assert.ok(units.every((u) => u.presentation === "billboard" && u.node!.billboard && !u.node!.clip));
    assert.throws(() => h.pool.socket(units[0], "Root"), /Billboard/);
    h.pool.play(units[0], "walk"); h.pool.setLod(0); await settle();
    for (let f = 14; f < 21; f++) h.pool.step(f);
    assert.equal(units[0].node!.clip, "walk"); assert.equal(units[0].presentation, "realtime");
    assert.ok(h.loads.every((load) => !load.instancing)); h.abort.abort();
    assert.ok(units.every((u) => u.state === "released")); assert.equal(h.holds, 0);
});

test("Skinning fallback: measured excess is required for budget fallback and the profile cannot change silently", async () => {
    assert.equal(resolveSkinningPolicy(low(), { observedP95Ms: 20, budgetP95Ms: 20 }).mode, "baked");
    for (const invalid of [0, NaN, Infinity, -1]) assert.throws(() => resolveSkinningPolicy(low(), { observedP95Ms: invalid, budgetP95Ms: 20 }), /milliseconds/);
    const h = harness(true, true, { observedP95Ms: 40, budgetP95Ms: 33.4 });
    assert.equal(h.pool.policy.reason, "measured-budget");
    const unit = h.pool.spawn("units", "idle")!; await settle(); h.pool.step(0);
    assert.equal(unit.mode, "realtime"); h.pool.close(); assert.equal(h.holds, 0);
    const unavailable = harness(); assert.throws(() => unavailable.pool.setQuality(low()), /reopen/); unavailable.pool.close();
});

test("Skinning fallback: remote failure retries cleanly and cancelled far load cannot resurrect a near unit", async () => {
    const h = harness(); h.setFail(true); const unit = h.pool.spawn("units", "walk")!;
    await settle(); assert.equal(unit.state, "failed"); assert.equal(h.holds, 0); assert.equal(h.nodes.length, 0);
    h.setFail(false); unit.retry(); await settle(); h.pool.step(0); assert.equal(unit.state, "active");
    h.setDeferred(); h.pool.setLod(2); await settle(); h.abort.abort(); h.finish(); await settle();
    assert.equal(unit.state, "released"); assert.equal(h.holds, 0); assert.ok(h.nodes.every((node) => node.retired));
});

test("Skinning fallback: 20 far/near close cycles release every template and rejected LOD preserves active nodes", async () => {
    for (let i = 0; i < 20; i++) {
        const h = harness(), unit = h.pool.spawn("units", "idle")!; await settle(); h.pool.step(0);
        assert.throws(() => h.pool.setLod(3 as 2), /LOD/); assert.equal(unit.presentation, "realtime");
        h.pool.setLod(2); await settle(); h.pool.step(1); const old = unit.node!;
        unit.despawn(); const next = h.pool.spawn("units", "walk")!; h.pool.step(2);
        assert.equal(next.node, old); assert.throws(() => h.pool.play(unit, "other"), /Expired/);
        h.pool.close(); assert.equal(h.holds, 0); assert.ok(h.nodes.every((n) => n.retired));
    }
});
