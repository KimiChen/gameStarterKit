/** Exercise real adapter + lease together; only the cc bundle transport is replaced. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { Asset, AssetManager } from "cc";
import { AssetLease, AssetLoadError, type AssetLoadCallback, type AssetType } from "../src/view/scene3d/AssetLease";

class FakeAsset {
    isValid = true;
    refs = 2;
    addRef(): this { this.refs++; return this; }
    decRef(): this { assert.ok(this.refs > 2); this.refs--; return this; }
}
interface Transport {
    getBundle(name: string): unknown;
    loadBundle(name: string, callback: (error: unknown, bundle?: unknown) => void): void;
}
let transport: Transport;
let subject: typeof import("../src/view/scene3d/cocosAssetLoader") | undefined;
async function loadSubject() {
    if (subject) return subject;
    const moduleApi = createRequire(import.meta.url)("node:module") as {
        _load(request: string, parent: unknown, isMain: boolean): unknown;
    };
    const original = moduleApi._load;
    moduleApi._load = function (request, parent, isMain) {
        if (request === "cc") return { resources: { load: (path: string, type: AssetType, callback: AssetLoadCallback<Asset>) => (transport.getBundle("resources") as AssetManager.Bundle).load(path, type, callback) }, assetManager: {
            getBundle: (name: string) => transport.getBundle(name),
            loadBundle: (name: string, callback: (error: unknown, bundle?: unknown) => void) => transport.loadBundle(name, callback),
        } };
        return original.call(this, request, parent, isMain);
    };
    try { subject = await import("../src/view/scene3d/cocosAssetLoader"); return subject; }
    finally { moduleApi._load = original; }
}
const request = (bundle: string, path = "3d/model/Prefab") => ({ bundle, path, type: FakeAsset as unknown as AssetType });
function bundleHarness() {
    const calls: { path: string; type: AssetType; callback: AssetLoadCallback<Asset> }[] = [];
    const bundle = { load(path: string, type: AssetType, callback: AssetLoadCallback<Asset>) { calls.push({ path, type, callback }); } };
    return { bundle: bundle as unknown as AssetManager.Bundle, calls };
}
const complete = (callback: AssetLoadCallback<Asset>, asset: FakeAsset) => callback(null, asset as unknown as Asset);
const missing = (error: unknown) => error instanceof AssetLoadError && error.code === "ASSET_MISSING";

test("CocosAssetLoader: resources uses the built-in typed Bundle.load without loading another bundle", async () => {
    const h = bundleHarness(), lookedUp: string[] = [];
    transport = { getBundle: (name) => { lookedUp.push(name); return h.bundle; }, loadBundle: () => assert.fail("already loaded") };
    const { assetLease } = await loadSubject(), asset = new FakeAsset();
    const pending = assetLease.acquire([request("resources", "stage3d/greybox-cube/Prefab")]);
    assert.deepEqual(lookedUp, ["resources"]);
    assert.equal(h.calls[0].path, "stage3d/greybox-cube/Prefab"); assert.equal(h.calls[0].type, FakeAsset);
    complete(h.calls[0].callback, asset); const batch = await pending;
    assert.equal(batch.assets[0], asset); assert.equal(asset.refs, 3);
    batch.release(); batch.release(); assert.equal(asset.refs, 2);
});

test("CocosAssetLoader: uncached package bundle loads before the exact relative asset path", async () => {
    const h = bundleHarness(), names: string[] = [], callbacks: ((error: unknown, bundle?: unknown) => void)[] = [];
    transport = { getBundle: () => null, loadBundle: (name, callback) => { names.push(name); callbacks.push(callback); } };
    const { assetLease } = await loadSubject(), asset = new FakeAsset();
    const pending = assetLease.acquire([request("kit-fixture-map")]);
    assert.deepEqual(names, ["kit-fixture-map"]); assert.equal(h.calls.length, 0);
    callbacks[0](null, h.bundle); callbacks[0](null, h.bundle); // Duplicate bundle completion must not load twice.
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, "3d/model/Prefab");
    complete(h.calls[0].callback, asset); const batch = await pending; batch.release(); assert.equal(asset.refs, 2);
});

test("CocosAssetLoader: timeout spans bundle and asset phases; late bundle/asset completion returns its ref", async () => {
    const h = bundleHarness(), asset = new FakeAsset();
    let done!: (error: unknown, bundle?: unknown) => void, timeout!: () => void;
    let clears = 0;
    transport = { getBundle: () => null, loadBundle: (_name, callback) => { done = callback; } };
    const { cocosAssetLoader } = await loadSubject();
    const lease = new AssetLease(cocosAssetLoader, { scheduler: {
        setTimeout: (callback, ms) => { assert.equal(ms, 50); timeout = callback; return 1; },
        clearTimeout: () => { clears++; },
    } });
    const pending = lease.acquire([request("plugin-fixture")], { deadlineMs: 50 });
    const rejected = assert.rejects(pending, (error: unknown) => error instanceof AssetLoadError && error.code === "ASSET_TIMEOUT");
    timeout(); await rejected; assert.equal(clears, 1);
    done(null, h.bundle); complete(h.calls[0].callback, asset); assert.equal(asset.refs, 2);
});

test("CocosAssetLoader: cancellation during asset load leaves another page's bundle references intact", async () => {
    const h = bundleHarness(), asset = new FakeAsset(), controller = new AbortController();
    transport = { getBundle: () => h.bundle, loadBundle: () => assert.fail("already loaded") };
    const { assetLease } = await loadSubject();
    const a = assetLease.acquire([request("kit-fixture")], { signal: controller.signal });
    const b = assetLease.acquire([request("kit-fixture")]);
    complete(h.calls[1].callback, asset); const batch = await b;
    const rejected = assert.rejects(a, (error: unknown) => error instanceof AssetLoadError && error.code === "ASSET_CANCELLED");
    controller.abort(); await rejected;
    complete(h.calls[0].callback, asset); assert.equal(asset.refs, 3);
    batch.release(); assert.equal(asset.refs, 2);
});

test("CocosAssetLoader: missing bundle, missing asset and synchronous transport exceptions are classified", async (t) => {
    const { assetLease } = await loadSubject();
    for (const kind of ["get throws", "loadBundle throws", "missing bundle", "bundle error with value", "load throws", "missing asset", "late load throws"]) {
        await t.test(kind, async () => {
            const h = bundleHarness();
            transport = {
                getBundle: () => {
                    if (kind === "get throws") throw new Error(kind);
                    return kind === "load throws" || kind === "missing asset" ? h.bundle : null;
                },
                loadBundle: (_name, callback) => {
                    if (kind === "loadBundle throws") throw new Error(kind);
                    if (kind === "bundle error with value") callback(new Error(kind), h.bundle);
                    else if (kind === "late load throws") queueMicrotask(() => callback(null, h.bundle));
                    else callback(null);
                },
            };
            if (kind === "load throws" || kind === "late load throws") h.bundle.load = () => { throw new Error(kind); };
            const pending = assetLease.acquire([request("kit-fixture")]);
            const rejected = assert.rejects(pending, missing);
            if (kind === "missing asset") h.calls[0].callback(null);
            await rejected;
            if (kind === "bundle error with value") assert.equal(h.calls.length, 0);
        });
    }
});
