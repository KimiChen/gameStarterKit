/**
 * SC3-B2 mutations (executed in temporary copies): remove the details filter ->
 * low-acquire/policy tests fail; remove the grace comparison -> deadline/reentry
 * tests fail. The plan owns intentions; AssetLease owns actual reference counts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Asset } from "cc";
import { AssetPlan, DEFAULT_ASSET_GRACE_MS, type AssetPlanCatalog, type AssetPlanLod, type PlannedAsset } from "../src/logic/scene3d/assetPlan";
import { QUALITY_TIERS, type AssetAddress, type QualityTier, type TextureVariant } from "../src/logic/scene3d/qualityData";
import { DEFAULT_QUALITY_TABLE } from "../src/logic/scene3d/qualityTiers";
import { lodForValueStable } from "../src/shared/logic/lodBands";
import { AssetLease, type AssetLoader, type AssetLoadCallback, type AssetType } from "../src/view/scene3d/AssetLease";

const address = (path: string, bundle = "resources"): AssetAddress => ({ bundle, path });
const main = address("stage3d/main"), far = address("stage3d/main_lod_1"), farthest = address("stage3d/main_lod_2");
const detail = address("stage3d/detail"), cube = address("stage3d/cube");
const variants = (id: string): TextureVariant[] => QUALITY_TIERS.flatMap((quality) => ([0, 1, 2] as const)
    .map((lod) => ({ quality, lod, asset: address(`stage3d/${id}_${quality}_${lod}`) })));
const paths = (requests: readonly PlannedAsset[]): string[] => requests.map((r) => `${r.kind}:${r.bundle}:${r.path}`).sort();
const expected = (...assets: AssetAddress[]): string[] => assets.map((a) => `prefab:${a.bundle}:${a.path}`).sort();
const empty = { acquire: [], release: [] };
function catalog(): AssetPlanCatalog {
    return {
        quality: DEFAULT_QUALITY_TABLE,
        pool: { version: 1, maxActivationsPerFrame: { low: 4, medium: 8, high: 16 },
            entries: [{ id: "cubes", prefab: cube, capacity: { low: 100, medium: 300, high: 500 } }] },
        layers: { version: 1, layers: [
            { id: "base", prefabs: [main], pools: [], textures: [{ id: "ground", variants: variants("ground") }] },
            { id: "details", prefabs: [detail], pools: ["cubes"], textures: [{ id: "decoration", variants: variants("decoration") }] },
        ] },
        prefabLods: [{ prefab: main, lods: [main, far, farthest] }],
        chunks: [
            { key: 0, prefabs: [main], pools: ["cubes"], textures: ["ground"] },
            { key: 1, prefabs: [main], textures: ["ground"] },
            { key: 2, prefabs: [detail], textures: ["decoration"] },
            { key: 3 },
        ],
    };
}
function harness(data = catalog(), graceMs?: number) {
    let clock = 0;
    const subject = new AssetPlan(data, { now: () => clock, graceMs });
    return { subject, time: (value: number) => { clock = value; } };
}

test("AssetPlan: low requests only base prefab and the exact low texture cell", () => {
    const h = harness();
    const result = h.subject.update("low", 0, [0, 1, 2]);
    assert.deepEqual(paths(result.acquire), [...expected(main), "texture:resources:stage3d/ground_low_0"]);
    assert.deepEqual(result.release, []);
    assert.deepEqual(h.subject.update("low", 0, [2, 1, 0, 0]), empty);
});

for (const quality of QUALITY_TIERS) for (const lod of [0, 1, 2] as const) {
    test(`AssetPlan: ${quality} × LOD ${lod} uses explicit cells and keeps mesh LOD independent`, () => {
        const h = harness(), chosen = [main, far, farthest][lod];
        const result = h.subject.update(quality, lod, [0, 2]);
        const want = [...expected(chosen), `texture:resources:stage3d/ground_${quality}_${lod}`];
        if (quality !== "low") want.push(...expected(cube, detail), `texture:resources:stage3d/decoration_${quality}_${lod}`);
        assert.deepEqual(paths(result.acquire), want.sort());
        assert.equal(result.acquire.filter((a) => a.path === chosen.path).length, 1);
        assert.deepEqual(result.release, []);
    });
}

test("AssetPlan: the provided quality policy controls filtering, including a disabled medium tier", () => {
    const source = catalog();
    const h = harness({ ...source, quality: { ...source.quality, tiers: { ...source.quality.tiers,
        medium: { ...source.quality.tiers.medium, details: false } } } });
    assert.deepEqual(paths(h.subject.update("medium", 1, [0, 2]).acquire),
        [...expected(far), "texture:resources:stage3d/ground_medium_1"]);
});

test("AssetPlan: chunks share one hold and removing one consumer cannot start its release clock", () => {
    const h = harness();
    const held = h.subject.update("low", 0, [0, 1, 1]).acquire;
    h.time(10);
    assert.deepEqual(h.subject.update("low", 0, [1]), empty);
    h.time(100_000);
    assert.deepEqual(h.subject.flush(), empty);
    assert.ok(held.every((r) => h.subject.current(r)));
    h.subject.update("low", 0, []);
    h.time(104_999);
    assert.deepEqual(h.subject.flush(), empty);
    h.time(105_000);
    assert.deepEqual(h.subject.flush(), { acquire: [], release: held });
    assert.ok(held.every((r) => !h.subject.current(r)));
    assert.deepEqual(h.subject.flush(), empty);
});

test("AssetPlan: grace is 5000ms, is not renewed by empty updates, and expires at the exact deadline", () => {
    assert.equal(DEFAULT_ASSET_GRACE_MS, 5000);
    const h = harness(), held = h.subject.update("low", 0, [1]).acquire;
    h.time(100);
    assert.deepEqual(h.subject.update("low", 0, []), empty);
    h.time(5099);
    assert.deepEqual(h.subject.update("low", 0, []), empty);
    h.time(5100);
    assert.deepEqual(h.subject.update("low", 0, []), { acquire: [], release: held });
});

test("AssetPlan: reentry cancels release, including an unflushed exact deadline, then starts a fresh grace", () => {
    const h = harness(), original = h.subject.update("low", 0, [1]).acquire;
    h.time(100); h.subject.update("low", 0, []);
    h.time(5100);
    assert.deepEqual(h.subject.update("low", 0, [1]), empty);
    h.time(10_000); assert.deepEqual(h.subject.flush(), empty);
    assert.ok(original.every((r) => h.subject.current(r)));
    h.subject.update("low", 0, []);
    h.time(14_999); assert.deepEqual(h.subject.flush(), empty);
    h.time(15_000); assert.deepEqual(h.subject.flush().release, original);
    const next = h.subject.update("low", 0, [1]).acquire;
    assert.deepEqual(paths(next), paths(original));
    assert.ok(next.every((r) => r.generation > original[original.length - 1].generation));
});

test("AssetPlan: cut to low acquires no details and retires old details/high textures after grace", () => {
    const h = harness(), high = h.subject.update("high", 0, [0, 2]).acquire;
    h.time(10);
    const low = h.subject.update("low", 0, [0, 2]);
    assert.deepEqual(paths(low.acquire), ["texture:resources:stage3d/ground_low_0"]);
    assert.deepEqual(low.release, []);
    h.time(5009); assert.deepEqual(h.subject.flush(), empty);
    h.time(5010);
    const release = h.subject.flush().release;
    assert.deepEqual(paths(release), paths(high.filter((a) => a.path !== main.path)));
    assert.equal(h.subject.current(high.find((a) => a.path === main.path)!), true);
    assert.deepEqual(paths(h.subject.close().release), [...expected(main), "texture:resources:stage3d/ground_low_0"]);
});

test("AssetPlan: rapid quality and LOD switches reuse holds until their individual deadlines", () => {
    const h = harness();
    const first = h.subject.update("high", 0, [0]).acquire;
    h.time(100);
    const second = h.subject.update("low", 2, [0]).acquire;
    assert.deepEqual(paths(second), [...expected(farthest), "texture:resources:stage3d/ground_low_2"]);
    h.time(200);
    assert.deepEqual(h.subject.update("high", 0, [0]), empty);
    h.time(5100); assert.deepEqual(h.subject.flush(), empty);
    assert.ok(first.every((r) => h.subject.current(r)));
    h.time(5200); assert.deepEqual(h.subject.flush().release, second);
});

test("AssetPlan: stabilized scale LOD does not churn within the hysteresis band", () => {
    const h = harness();
    let lod: AssetPlanLod = 0;
    const stable = (scale: number) => {
        lod = lodForValueStable(lod, scale, [1, 2], 0.1) as AssetPlanLod;
        return h.subject.update("low", lod, [1]);
    };
    const near = stable(2.3).acquire;
    for (const scale of [2.01, 1.99, 1.9, 1.81]) assert.deepEqual(stable(scale), empty);
    const distant = stable(1.79).acquire;
    assert.deepEqual(paths(distant), [...expected(far), "texture:resources:stage3d/ground_low_1"]);
    for (const scale of [1.85, 2.0, 2.1, 2.19]) assert.deepEqual(stable(scale), empty);
    assert.deepEqual(stable(2.21), empty, "return to a still-retained near set needs no load");
    assert.ok(near.every((r) => h.subject.current(r)));
});

test("AssetPlan: same addresses across all texture/mesh cells do not trigger redundant reloads", () => {
    const source = catalog(), common = address("stage3d/common");
    const h = harness({ ...source, prefabLods: [{ prefab: main, lods: [main, far, far] }],
        layers: { ...source.layers, layers: source.layers.layers.map((layer) => ({ ...layer,
            textures: layer.textures.map((texture) => ({ ...texture, variants: texture.variants.map((v) => ({ ...v, asset: common })) })) })) } });
    const initial = h.subject.update("high", 1, [1]).acquire;
    assert.deepEqual(h.subject.update("low", 2, [1]), empty);
    assert.deepEqual(h.subject.close().release, initial);
});

test("AssetPlan: pool prefabs use explicit mesh variants after their owning layer passes the quality gate", () => {
    const source = catalog(), cubeFar = address("stage3d/cube_lod_1");
    const h = harness({ ...source, prefabLods: [{ prefab: cube, lods: [cube, cubeFar, cubeFar] }] }, 0);
    h.subject.update("low", 1, [0]);
    assert.deepEqual(paths(h.subject.update("high", 1, [0]).acquire),
        [...expected(cubeFar), "texture:resources:stage3d/ground_high_1"]);
    assert.deepEqual(paths(h.subject.update("high", 2, [0]).acquire), ["texture:resources:stage3d/ground_high_2"]);
    assert.deepEqual(paths(h.subject.update("low", 2, [0]).release),
        [...expected(cubeFar), "texture:resources:stage3d/ground_high_2"]);
});

test("AssetPlan: distinct bundle and type addresses never alias, while duplicate content does", () => {
    const source = catalog(), other = address(main.path, "kit-fixture");
    const h = harness({ ...source, prefabLods: [],
        layers: { version: 1, layers: [{ ...source.layers.layers[0], prefabs: [main, other],
            textures: [{ id: "ground", variants: variants("ground").map((v) => ({ ...v, asset: main })) }] }, source.layers.layers[1]] },
        chunks: [{ key: 0, prefabs: [other, main, main], textures: ["ground", "ground"] }] });
    assert.deepEqual(paths(h.subject.update("low", 0, [0, 0]).acquire), [...expected(main, other), `texture:resources:${main.path}`]);
});

test("AssetPlan: empty viewport/chunk is empty and zero grace releases in the same update", () => {
    const h = harness(catalog(), 0);
    assert.deepEqual(h.subject.update("high", 0, []), empty);
    assert.deepEqual(h.subject.update("high", 0, [3]), empty);
    const held = h.subject.update("low", 0, [1]).acquire;
    assert.deepEqual(h.subject.update("low", 0, []), { acquire: [], release: held });
    assert.deepEqual(h.subject.close(), empty);
});

test("AssetPlan: fractional injected milliseconds are supported and longer grace is honored", () => {
    const h = harness(catalog(), 10_000.5);
    h.time(0.25); const held = h.subject.update("low", 0, [1]).acquire;
    h.subject.update("low", 0, []);
    h.time(10_000.5); assert.deepEqual(h.subject.flush(), empty);
    h.time(10_000.75); assert.deepEqual(h.subject.flush().release, held);
});

test("AssetPlan: close drains active and grace tokens without consulting the clock and never reopens", () => {
    const h = harness(), near = h.subject.update("high", 0, [0, 2]).acquire;
    const farTokens = h.subject.update("low", 1, [1]).acquire;
    h.time(NaN);
    assert.deepEqual(paths(h.subject.close().release), paths([...near, ...farTokens]));
    for (const token of [...near, ...farTokens]) {
        assert.equal(h.subject.current(token), false); assert.equal(h.subject.reject(token), false);
    }
    assert.deepEqual(h.subject.close(), empty);
    assert.deepEqual(h.subject.flush(), empty);
    assert.throws(() => h.subject.update("low", 0, [0]), /closed/);
});

test("AssetPlan: failed loads can retry without moving the viewport; stale failures cannot remove retries", () => {
    const h = harness(), initial = h.subject.update("low", 0, [1]).acquire;
    assert.equal(h.subject.reject(initial[0]), true);
    assert.equal(h.subject.reject(initial[0]), false);
    const retry = h.subject.update("low", 0, [1]).acquire;
    assert.equal(retry.length, 1); assert.equal(retry[0].key, initial[0].key);
    assert.ok(retry[0].generation > initial[0].generation);
    assert.equal(h.subject.current({ ...retry[0] }), false, "token identity fences other plans and copies");
    assert.equal(h.subject.reject(initial[0]), false);
    assert.equal(h.subject.current(retry[0]), true);
    assert.equal(h.subject.current(initial[1]), true);
});

test("AssetPlan: a failed grace entry is not re-requested outside the viewport", () => {
    const h = harness(), initial = h.subject.update("low", 0, [1]).acquire;
    h.subject.update("low", 0, []);
    assert.equal(h.subject.reject(initial[0]), true);
    h.time(5000);
    assert.deepEqual(h.subject.update("low", 0, []), { acquire: [], release: [initial[1]] });
});

test("AssetPlan: invalid update/clock inputs leave holds and release deadlines intact", () => {
    const h = harness(), initial = h.subject.update("low", 0, [1]).acquire;
    h.time(100); h.subject.update("low", 0, []);
    assert.throws(() => h.subject.update("ultra" as QualityTier, 0, [1]), /quality/);
    assert.throws(() => h.subject.update("low", 3 as AssetPlanLod, [1]), /LOD/);
    assert.throws(() => h.subject.update("low", 0, [1, 999]), /unknown visible chunk/);
    for (const time of [99, NaN, Infinity, -Infinity]) {
        h.time(time); assert.throws(() => h.subject.update("low", 0, [1]), /clock/);
        assert.throws(() => h.subject.flush(), /clock/);
    }
    h.time(5100); assert.deepEqual(h.subject.flush().release, initial);
});

test("AssetPlan: catalog snapshot and output tokens cannot be mutated into different ownership", () => {
    const source = JSON.parse(JSON.stringify(catalog()));
    const h = harness(source);
    source.quality.tiers.low.details = true;
    source.layers.layers[0].textures[0].variants[0].asset.path = "wrong";
    source.prefabLods[0].lods[0].path = "wrong";
    source.chunks[1].prefabs.length = 0;
    const result = h.subject.update("low", 0, [1]);
    assert.deepEqual(paths(result.acquire), [...expected(main), "texture:resources:stage3d/ground_low_0"]);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.acquire) && Object.isFrozen(result.release));
    assert.equal(Reflect.set(result.acquire[0], "path", "wrong"), false);
    assert.deepEqual(h.subject.close().release, result.acquire);
});

test("AssetPlan: input order and duplicate chunk references produce deterministic deltas", () => {
    const a = harness(), b = harness();
    assert.deepEqual(a.subject.update("high", 2, [0, 1, 2]), b.subject.update("high", 2, [2, 0, 2, 1]));
    assert.deepEqual(a.subject.close(), b.subject.close());
});

for (const [name, change, message] of [
    ["missing texture cell", (c: any) => c.layers.layers[0].textures[0].variants.pop(), /every quality/],
    ["duplicate texture cell", (c: any) => c.layers.layers[0].textures[0].variants.push(c.layers.layers[0].textures[0].variants[0]), /duplicate/],
    ["missing prefab variant", (c: any) => c.prefabLods[0].lods.pop(), /three prefab LOD/],
    ["invalid variant address", (c: any) => { c.prefabLods[0].lods[1].path = "../missing"; }, /relative/],
    ["unknown variant source", (c: any) => { c.prefabLods[0].prefab.path = "missing"; }, /unknown prefab variant source/],
    ["duplicate variants", (c: any) => c.prefabLods.push(c.prefabLods[0]), /duplicate prefab variants/],
    ["unknown chunk prefab", (c: any) => c.chunks[0].prefabs.push(address("missing")), /unknown prefab/],
    ["unknown chunk texture", (c: any) => c.chunks[0].textures.push("missing"), /unknown texture/],
    ["unknown chunk pool", (c: any) => c.chunks[0].pools.push("missing"), /unknown pool/],
    ["conflicting prefab layers", (c: any) => c.layers.layers[1].prefabs.push(c.layers.layers[0].prefabs[0]), /multiple layers/],
    ["duplicate chunk", (c: any) => c.chunks.push(c.chunks[0]), /duplicate chunk/],
    ["fractional chunk key", (c: any) => { c.chunks[0].key = 0.5; }, /safe integer/],
] as const) test(`AssetPlan: rejects ${name} before publishing a plan`, () => {
    const source = JSON.parse(JSON.stringify(catalog())); change(source);
    assert.throws(() => harness(source), message);
});

test("AssetPlan: invalid grace periods and missing clock fail before any acquisition", () => {
    for (const value of [-1, NaN, Infinity]) assert.throws(() => harness(catalog(), value), /graceMs/);
    assert.throws(() => new AssetPlan(catalog(), { now: undefined! }), /clock/);
});

test("AssetPlan: checked-in SC1-B8 tables produce the actual framework resource addresses", () => {
    const load = (name: string) => JSON.parse(readFileSync(new URL(`../../Cocos/assets/resources/stage3d/data/${name}.json`, import.meta.url), "utf8"));
    const h = harness({ quality: load("quality"), pool: load("pool"), layers: load("detail-layers"),
        chunks: [{ key: 0, prefabs: [address("stage3d/P_Stage3d_Baked")], pools: ["cubes"], textures: ["checker"] }] });
    assert.deepEqual(paths(h.subject.update("low", 0, [0]).acquire), [
        "prefab:resources:stage3d/P_Stage3d_Baked", "texture:resources:stage3d/T_Greybox_Checker_BC/texture",
    ]);
    assert.deepEqual(paths(h.subject.update("high", 2, [0]).acquire), ["prefab:resources:stage3d/greybox-cube/greybox-cube"]);
});

class FakeAsset implements Asset {
    name = "fake"; uuid = "fake"; isValid = true; refCount = 0;
    addRef(): this { this.refCount++; return this; }
    decRef(): this { assert.ok(this.refCount > 0); this.refCount--; return this; }
    destroy(): boolean { this.isValid = false; return true; }
}
test("AssetPlan + AssetLease: close between successful loading and promise consumption returns the ready lease", async () => {
    const h = harness(), asset = new FakeAsset();
    const lease = new AssetLease({ addRef: (a) => a.addRef(), decRef: (a) => a.decRef(),
        load<T extends Asset>(_bundle: string, _path: string, _type: AssetType<T>, cb: AssetLoadCallback<T>): void {
            cb(null, asset as unknown as T);
        } });
    const token = h.subject.update("low", 0, [1]).acquire[0], cancel = new AbortController();
    const pending = lease.acquire([{ ...token, type: FakeAsset }], { signal: cancel.signal });
    assert.equal(asset.refCount, 1);
    assert.ok(h.subject.close().release.includes(token));
    cancel.abort(); // A ready AssetLease deliberately outlives cancellation.
    assert.equal(asset.refCount, 1);
    const loaded = await pending;
    assert.equal(h.subject.current(token), false);
    loaded.release();
    assert.equal(asset.refCount, 0);
});
test("AssetPlan + AssetLease: missing resources retry and close cancels pending loads without late ownership", async () => {
    const h = harness();
    const callbacks: AssetLoadCallback<Asset>[] = [];
    const loader: AssetLoader = {
        addRef: (a) => a.addRef(), decRef: (a) => a.decRef(),
        load<T extends Asset>(_bundle: string, _path: string, _type: AssetType<T>, cb: AssetLoadCallback<T>): void {
            callbacks.push((error, asset) => cb(error, asset as T));
        },
    };
    const lease = new AssetLease(loader);
    const jobs = new Map<PlannedAsset, { cancel: AbortController; loaded?: { release(): void } }>();
    const start = (request: PlannedAsset) => {
        const job = { cancel: new AbortController(), loaded: undefined as { release(): void } | undefined };
        jobs.set(request, job);
        return lease.acquire([{ ...request, type: FakeAsset }], { signal: job.cancel.signal }).then((loaded) => {
            if (h.subject.current(request)) job.loaded = loaded;
            else loaded.release();
        }, (error) => { h.subject.reject(request); return error.code; });
    };
    const original = h.subject.update("low", 0, [1]).acquire;
    const work = original.map(start), asset = new FakeAsset();
    callbacks[0](new Error("missing")); callbacks[1](null, asset);
    assert.deepEqual(await Promise.all(work), ["ASSET_MISSING", undefined]);
    assert.equal(asset.refCount, 1);
    const retry = h.subject.update("low", 0, [1]).acquire;
    assert.equal(retry.length, 1);
    const pending = start(retry[0]);
    for (const token of h.subject.close().release) {
        jobs.get(token)!.cancel.abort(); jobs.get(token)!.loaded?.release();
    }
    assert.equal(await pending, "ASSET_CANCELLED");
    const late = new FakeAsset(); callbacks[2](null, late);
    assert.equal(asset.refCount, 0); assert.equal(late.refCount, 0);
    assert.equal(h.subject.current(retry[0]), false);
    assert.deepEqual(h.subject.close(), empty);
});
