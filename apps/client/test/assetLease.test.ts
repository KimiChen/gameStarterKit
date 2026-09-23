/** Mutation: remove releaseAll(holds) in fail -> partial failure / timeout / cancellation leak tests fail. */
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import type { Asset } from "cc";
import {
    AssetLease, AssetLoadError, AssetReleaseError, DEFAULT_ASSET_DEADLINE_MS,
    type AssetLoader, type AssetLoadCallback, type AssetRequest, type AssetScheduler, type AssetType,
} from "../src/view/scene3d/AssetLease";

class FakeAsset implements Asset {
    name = "fake";
    uuid = "fake";
    isValid = true;
    refCount = 2; // Other pages keep the cached asset alive.
    acquired = 0;
    returned = 0;
    onAdd?: () => void;
    onRelease?: () => void;
    addRef(): this { this.refCount++; this.acquired++; this.onAdd?.(); return this; }
    decRef(): this { assert.ok(this.refCount > 2); this.refCount--; this.returned++; this.onRelease?.(); return this; }
    destroy(): boolean { this.isValid = false; return true; }
}
class FakeTexture extends FakeAsset { width = 64; }
class FakeJson extends FakeAsset { json = { count: 1 }; }
class Scheduler implements AssetScheduler {
    now = 0;
    readonly timers = new Map<object, { at: number; callback: () => void }>();
    setTimeout(callback: () => void, delayMs: number): object {
        const id = {}; this.timers.set(id, { at: this.now + delayMs, callback }); return id;
    }
    clearTimeout(handle: unknown): void { this.timers.delete(handle as object); }
    advance(ms: number): void {
        this.now += ms;
        for (const [id, timer] of this.timers) if (timer.at <= this.now) {
            this.timers.delete(id); timer.callback();
        }
    }
}
function harness() {
    const requests: { bundle: string; path: string; type: AssetType; callback: AssetLoadCallback<Asset> }[] = [];
    const scheduler = new Scheduler();
    const errors: unknown[] = [];
    const loader: AssetLoader = {
        addRef: (asset) => asset.addRef(), decRef: (asset) => asset.decRef(),
        load<T extends Asset>(bundle: string, path: string, type: AssetType<T>, callback: AssetLoadCallback<T>): void {
            requests.push({ bundle, path, type, callback: (error, asset) => callback(error, asset as T | undefined) });
        },
    };
    return { requests, scheduler, errors, loader,
        lease: new AssetLease(loader, { scheduler, onError: (error) => errors.push(error) }) };
}
const request = (path: string, bundle = "resources"): AssetRequest<FakeAsset> => ({ bundle, path, type: FakeAsset });
function failure(code: string) {
    return (error: unknown) => {
        assert.ok(error instanceof AssetLoadError);
        assert.equal(error.code, code);
        assert.equal(error.retryable, code !== "ASSET_CANCELLED");
        return true;
    };
}
const counts = (asset: FakeAsset) => [asset.refCount, asset.acquired, asset.returned];

test("AssetLease: unordered heterogeneous callbacks preserve request order, type and identity", async () => {
    const h = harness(), texture = new FakeTexture(), json = new FakeJson();
    const controller = new AbortController();
    const pending = h.lease.acquire([
        { bundle: "kit-fixture", path: "3d/data", type: FakeJson },
        { bundle: "resources", path: "stage3d/checker/texture", type: FakeTexture },
    ] as const, { signal: controller.signal });
    assert.equal(h.scheduler.timers.size, 1);
    assert.equal(getEventListeners(controller.signal, "abort").length, 1);
    assert.deepEqual(h.requests.map(({ bundle, path }) => [bundle, path]), [["kit-fixture", "3d/data"], ["resources", "stage3d/checker/texture"]]);
    h.requests[1].callback(null, texture);
    assert.deepEqual(counts(texture), [3, 1, 0]);
    h.requests[0].callback(null, json);
    const batch = await pending;
    const typedJson: FakeJson = batch.assets[0], typedTexture: FakeTexture = batch.assets[1];
    assert.equal(typedJson, json); assert.equal(typedTexture, texture);
    assert.ok(Object.isFrozen(batch.assets));
    assert.equal(h.scheduler.timers.size, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    controller.abort(); // Successful ownership outlives the in-flight cancellation window.
    assert.deepEqual(counts(texture), [3, 1, 0]);
    batch.release(); batch.release();
    assert.deepEqual(counts(texture), [2, 1, 1]); assert.deepEqual(counts(json), [2, 1, 1]);
});

test("AssetLease: partial failure settles immediately, drains holds and returns late successes", async () => {
    const h = harness(), first = new FakeAsset(), late = new FakeAsset(), errorAsset = new FakeAsset();
    const controller = new AbortController(), cause = new Error("download failed");
    const pending = h.lease.acquire([request("a"), request("b"), request("c")], { signal: controller.signal });
    const rejected = assert.rejects(pending, (error: unknown) => {
        failure("ASSET_MISSING")(error);
        assert.equal((error as AssetLoadError).cause, cause);
        assert.equal((error as AssetLoadError).request?.path, "b");
        return true;
    });
    h.requests[0].callback(null, first);
    h.requests[1].callback(cause, errorAsset);
    await rejected; // Deliberately do not wait for c.
    assert.deepEqual(counts(first), [2, 1, 1]);
    assert.deepEqual(counts(errorAsset), [2, 0, 0]);
    assert.equal(h.scheduler.timers.size, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    h.requests[2].callback(null, late);
    assert.deepEqual(counts(late), [2, 1, 1]); assert.deepEqual(h.errors, []);
});

test("AssetLease: default deadline is one 15000ms window for the whole batch", async () => {
    const h = harness(), first = new FakeAsset(), late = new FakeAsset();
    const pending = h.lease.acquire([request("a"), request("b")]);
    let settled = false;
    const rejected = assert.rejects(pending, (error: unknown) => {
        failure("ASSET_TIMEOUT")(error); settled = true;
        assert.equal((error as AssetLoadError).deadlineMs, DEFAULT_ASSET_DEADLINE_MS);
        assert.equal((error as AssetLoadError).request?.path, "b"); return true;
    });
    h.scheduler.advance(14_999); h.requests[0].callback(null, first);
    await Promise.resolve(); assert.equal(settled, false);
    h.scheduler.advance(1); await rejected;
    assert.deepEqual(counts(first), [2, 1, 1]);
    h.requests[1].callback(null, late); assert.deepEqual(counts(late), [2, 1, 1]);
    assert.equal(h.scheduler.timers.size, 0);
});

test("AssetLease: cancellation returns acquired and late refs and preserves the abort reason", async () => {
    const h = harness(), a = new FakeAsset(), late = new FakeAsset(), controller = new AbortController();
    const cause = new Error("page closed");
    const pending = h.lease.acquire([request("a"), request("b")], { deadlineMs: 8, signal: controller.signal });
    const rejected = assert.rejects(pending, (error: unknown) => {
        failure("ASSET_CANCELLED")(error); assert.equal((error as AssetLoadError).cause, cause); return true;
    });
    h.requests[0].callback(null, a); controller.abort(cause); await rejected;
    assert.deepEqual(counts(a), [2, 1, 1]);
    h.requests[1].callback(null, late); assert.deepEqual(counts(late), [2, 1, 1]);
    h.scheduler.advance(100);
    assert.equal(h.scheduler.timers.size, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("AssetLease: pre-aborted and empty batches do not allocate loads, listeners or timers", async () => {
    const h = harness(), controller = new AbortController(); controller.abort();
    await assert.rejects(h.lease.acquire([request("a")], { signal: controller.signal }), failure("ASSET_CANCELLED"));
    await assert.rejects(h.lease.acquire([], { signal: controller.signal }), failure("ASSET_CANCELLED"));
    const empty = await h.lease.acquire([]);
    assert.deepEqual(empty.assets, []); empty.release(); empty.release();
    assert.equal(h.requests.length, 0); assert.equal(h.scheduler.timers.size, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("AssetLease: duplicate addresses and concurrent pages each own exactly one ref per request", async () => {
    const h = harness(), shared = new FakeAsset();
    const first = h.lease.acquire([request("a"), request("a")]), second = h.lease.acquire([request("a")]);
    for (const load of h.requests) load.callback(null, shared);
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(counts(shared), [5, 3, 0]); assert.equal(a.assets[0], a.assets[1]);
    a.release(); a.release(); assert.deepEqual(counts(shared), [3, 3, 2]);
    b.release(); assert.deepEqual(counts(shared), [2, 3, 3]);
});

test("AssetLease: cancelled attempt and successful retry sharing an asset cannot release each other", async () => {
    const h = harness(), asset = new FakeAsset(), controller = new AbortController();
    const old = h.lease.acquire([request("same")], { signal: controller.signal });
    const rejected = assert.rejects(old, failure("ASSET_CANCELLED")); controller.abort(); await rejected;
    const fresh = h.lease.acquire([request("same")]); h.requests[1].callback(null, asset);
    const batch = await fresh;
    h.requests[0].callback(null, asset); assert.deepEqual(counts(asset), [3, 2, 1]);
    batch.release(); assert.deepEqual(counts(asset), [2, 2, 2]);
});

test("AssetLease: duplicate callbacks before and after release have no ref side effects", async () => {
    const h = harness(), asset = new FakeAsset(), unrelated = new FakeAsset();
    const pending = h.lease.acquire([request("a")]);
    h.requests[0].callback(null, asset); h.requests[0].callback(null, asset);
    const batch = await pending; batch.release();
    h.requests[0].callback(null, asset); h.requests[0].callback(null, unrelated); h.requests[0].callback(new Error("duplicate"));
    assert.deepEqual(counts(asset), [2, 1, 1]); assert.deepEqual(counts(unrelated), [2, 0, 0]);
});

test("AssetLease: missing, destroyed and wrong-type callback assets fail closed", async (t) => {
    for (const kind of ["missing", "destroyed", "wrong type"] as const) await t.test(kind, async () => {
        const h = harness(), asset = new FakeJson();
        if (kind === "destroyed") asset.destroy();
        const pending = h.lease.acquire([{ ...request("a"), type: FakeTexture }]);
        const rejected = assert.rejects(pending, failure("ASSET_MISSING"));
        h.requests[0].callback(null, kind === "missing" ? undefined : asset); await rejected;
        assert.deepEqual(counts(asset), kind === "wrong type" ? [2, 1, 1] : [2, 0, 0]);
        assert.equal(h.scheduler.timers.size, 0);
    });
});

test("AssetLease: synchronous success, synchronous throws and callback-then-throw settle once", async () => {
    const h = harness(), asset = new FakeAsset();
    h.loader.load = (_bundle, path, _type, callback) => {
        if (path === "throws") throw new Error("loader threw");
        callback(null, asset as never); throw new Error("after callback");
    };
    const batch = await h.lease.acquire([request("a")]); batch.release();
    await assert.rejects(h.lease.acquire([request("a"), request("throws"), request("never")]), failure("ASSET_MISSING"));
    assert.deepEqual(counts(asset), [2, 2, 2]); assert.equal(h.scheduler.timers.size, 0);
});

test("AssetLease: abort during addRef returns the hold that arrives after cancellation", async () => {
    const h = harness(), asset = new FakeAsset(), controller = new AbortController();
    asset.onAdd = () => controller.abort();
    const pending = h.lease.acquire([request("a")], { signal: controller.signal });
    const rejected = assert.rejects(pending, failure("ASSET_CANCELLED"));
    h.requests[0].callback(null, asset); await rejected;
    assert.deepEqual(counts(asset), [2, 1, 1]); assert.equal(h.scheduler.timers.size, 0);
});

test("AssetLease: release remains idempotent during reentry and drains all holds despite decRef errors", async () => {
    const h = harness(), a = new FakeAsset(), b = new FakeAsset(), cause = new Error("decRef failed");
    const pending = h.lease.acquire([request("a"), request("b")]);
    h.requests[0].callback(null, a); h.requests[1].callback(null, b);
    const batch = await pending;
    a.onRelease = () => { batch.release(); throw cause; };
    assert.throws(() => batch.release(), (error: unknown) => {
        assert.ok(error instanceof AssetReleaseError); assert.deepEqual(error.failures, [cause]); return true;
    });
    batch.release(); assert.deepEqual(counts(a), [2, 1, 1]); assert.deepEqual(counts(b), [2, 1, 1]);
});

test("AssetLease: failed-batch cleanup errors preserve primary failure and late errors reach the observer", async () => {
    const h = harness(), a = new FakeAsset(), b = new FakeAsset(), late = new FakeAsset();
    const cleanup = new Error("cleanup"), primary = new Error("missing");
    a.onRelease = late.onRelease = () => { throw cleanup; };
    const pending = h.lease.acquire([request("a"), request("b"), request("fail"), request("late")]);
    const rejected = assert.rejects(pending, (error: unknown) => {
        failure("ASSET_MISSING")(error);
        assert.equal((error as AssetLoadError).cause, primary);
        assert.deepEqual((error as AssetLoadError).cleanupErrors, [cleanup]); return true;
    });
    h.requests[0].callback(null, a); h.requests[1].callback(null, b); h.requests[2].callback(primary); await rejected;
    assert.deepEqual(counts(a), [2, 1, 1]); assert.deepEqual(counts(b), [2, 1, 1]);
    h.requests[3].callback(null, late); assert.deepEqual(counts(late), [2, 1, 1]);
    assert.equal(h.errors.length, 1); assert.ok(h.errors[0] instanceof AssetReleaseError);
});

test("AssetLease: invalid controls reject the entire batch before any engine work", async () => {
    const h = harness(), controller = new AbortController();
    for (const deadlineMs of [-1, 0.5, NaN, Infinity, 2147483648]) {
        await assert.rejects(h.lease.acquire([request("valid")], { deadlineMs, signal: controller.signal }), RangeError);
    }
    const invalid = [request(""), request("/a"), request("a/../b"), request("a//b"), request("a\\b"),
        request("a?b"), request("a", "https://invalid/bundle"), { ...request("a"), type: () => new FakeAsset() }];
    for (const item of invalid) {
        await assert.rejects(h.lease.acquire([request("valid"), item] as AssetRequest[], { signal: controller.signal }), TypeError);
    }
    const sparse: AssetRequest[] = new Array(2); sparse[0] = request("valid");
    await assert.rejects(h.lease.acquire(sparse), TypeError);
    assert.equal(h.requests.length, 0); assert.equal(h.scheduler.timers.size, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("AssetLease: request mutation during loading cannot change diagnostics or expected types", async () => {
    const h = harness(), controller = new AbortController();
    const input = { ...request("original") }, pending = h.lease.acquire([input], { signal: controller.signal });
    input.path = "changed"; input.bundle = "kit-other";
    const rejected = assert.rejects(pending, (error: unknown) => {
        failure("ASSET_CANCELLED")(error);
        assert.equal((error as AssetLoadError).request?.path, "original");
        assert.equal((error as AssetLoadError).request?.bundle, "resources"); return true;
    });
    controller.abort(); await rejected;
});

test("AssetLease: zero deadlines and synchronous timeout schedulers leave no dangling work", async () => {
    const h = harness(), late = new FakeAsset();
    const pending = h.lease.acquire([request("a")], { deadlineMs: 0 });
    const rejected = assert.rejects(pending, failure("ASSET_TIMEOUT")); h.scheduler.advance(0); await rejected;
    h.requests[0].callback(null, late); assert.deepEqual(counts(late), [2, 1, 1]);
    let cleared = 0;
    const immediate = new AssetLease(h.loader, { scheduler: {
        setTimeout: (callback) => { callback(); return 123; },
        clearTimeout: (handle) => { assert.equal(handle, 123); cleared++; },
    } });
    await assert.rejects(immediate.acquire([request("never")]), failure("ASSET_TIMEOUT"));
    assert.equal(cleared, 1); assert.equal(h.requests.length, 1);
});

test("AssetLease: 20 open/cancel/retry/close cycles restore refs, timers and abort listeners", async () => {
    const h = harness(), shared = new FakeAsset();
    for (let cycle = 0; cycle < 20; cycle++) {
        const controller = new AbortController(), before = h.requests.length;
        const first = h.lease.acquire([request("a"), request("b")], { signal: controller.signal });
        const rejected = assert.rejects(first, failure("ASSET_CANCELLED"));
        h.requests[before].callback(null, shared); controller.abort(); await rejected;
        const retry = h.lease.acquire([request("a")]); h.requests[before + 2].callback(null, shared);
        const batch = await retry; h.requests[before + 1].callback(null, shared); batch.release();
        assert.equal(shared.refCount, 2); assert.equal(shared.acquired, shared.returned);
        assert.equal(h.scheduler.timers.size, 0); assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    }
    assert.deepEqual(h.errors, []);
});
