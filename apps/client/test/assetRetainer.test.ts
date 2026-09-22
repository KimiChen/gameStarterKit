import assert from "node:assert/strict";
import { test } from "node:test";
import {
    AssetRetainer,
    type LoadedAsset,
    type LoadedAssetRetainer,
    type RetainedAsset,
} from "../src/view/scene3d/AssetLease";

class FakeAsset implements LoadedAsset {
    isValid = true;
    references = 0;
    acquired = 0;
    returned = 0;
    destroyed = 0;
    onAddRef?: () => void;
    onDecRef?: () => void;
    addResult: unknown = this;
    addRef(): unknown {
        this.onAddRef?.();
        this.references++;
        this.acquired++;
        return this.addResult;
    }
    decRef(): unknown {
        this.onDecRef?.();
        assert.ok(this.references > 0, "must not return an unowned reference");
        this.references--;
        this.returned++;
        if (this.references === 0) {
            this.isValid = false;
            this.destroyed++;
        }
        return this;
    }
}

/** Consumer tests can substitute holds without loading or mutating engine assets. */
class FakeRetainer implements LoadedAssetRetainer {
    readonly live = new Set<RetainedAsset<LoadedAsset>>();
    retain<T extends LoadedAsset>(asset: T): RetainedAsset<T> {
        const hold: RetainedAsset<T> = { asset, release: () => { this.live.delete(hold); } };
        this.live.add(hold);
        return hold;
    }
}

test("retainer holds an asset until its last independent lease is returned", () => {
    const retainer = new AssetRetainer();
    const asset = new FakeAsset();
    const first = retainer.retain(asset);
    const second = retainer.retain(asset);
    const third = retainer.retain(asset);
    assert.equal(asset.references, 3);
    assert.notEqual(first, second);
    second.release();
    first.release();
    assert.equal(asset.references, 1);
    assert.equal(asset.destroyed, 0, "an outstanding lease still owns the resource");
    third.release();
    assert.equal(asset.references, 0);
    assert.equal(asset.acquired, 3);
    assert.equal(asset.returned, 3);
    assert.equal(asset.destroyed, 1);
});

test("retainer releases only its own reference and cannot consume the caller's hold", () => {
    const retainer = new AssetRetainer();
    const asset = new FakeAsset();
    asset.addRef(); // Existing loader/caller reference stays outside this lease.
    const hold = retainer.retain(asset);
    hold.release();
    hold.release();
    assert.equal(asset.references, 1);
    assert.equal(asset.returned, 1);
    assert.equal(asset.isValid, true);
    asset.decRef();
    assert.equal(asset.destroyed, 1);
});

test("retainer preserves input identity even if addRef returns another object", () => {
    const retainer = new AssetRetainer();
    const asset = new FakeAsset();
    const unrelated = new FakeAsset();
    asset.addResult = unrelated;
    const hold = retainer.retain(asset);
    assert.equal(hold.asset, asset);
    hold.release();
    assert.equal(asset.returned, 1);
    assert.equal(unrelated.acquired, 0);
    assert.equal(unrelated.returned, 0);
});

test("retainer rejects malformed or destroyed inputs before invoking reference methods", () => {
    const retainer = new AssetRetainer();
    const invalidInputs: unknown[] = [null, undefined, 0, "asset", {}, { isValid: true }, { addRef() {}, decRef() {} }];
    for (const value of invalidInputs) {
        assert.throws(() => Reflect.apply(retainer.retain, retainer, [value]), TypeError);
    }
    const destroyed = new FakeAsset();
    destroyed.isValid = false;
    assert.throws(() => retainer.retain(destroyed), /destroyed asset/u);
    assert.equal(destroyed.acquired, 0);
    assert.equal(destroyed.returned, 0);
});

test("addRef failures propagate without publishing a lease or returning another caller's reference", () => {
    const retainer = new AssetRetainer();
    const asset = new FakeAsset();
    asset.addRef();
    const failure = new Error("engine addRef failed");
    asset.onAddRef = () => { throw failure; };
    assert.throws(() => retainer.retain(asset), (error: unknown) => error === failure);
    assert.equal(asset.references, 1);
    assert.equal(asset.returned, 0);
    asset.onAddRef = undefined;
    const retry = retainer.retain(asset);
    retry.release();
    assert.equal(asset.references, 1);
    asset.decRef();
});

test("release consumes its lease before decRef so recursive release cannot decrement twice", () => {
    const retainer = new AssetRetainer();
    const asset = new FakeAsset();
    const first = retainer.retain(asset);
    const second = retainer.retain(asset);
    asset.onDecRef = () => {
        asset.onDecRef = undefined;
        first.release();
        second.release();
    };
    first.release();
    assert.equal(asset.references, 0);
    assert.equal(asset.returned, 2);
    assert.equal(asset.destroyed, 1);
    first.release();
    second.release();
    assert.equal(asset.returned, 2);
});

test("reentrant retain gets an independent lease without global bookkeeping collisions", () => {
    const retainer = new AssetRetainer();
    const asset = new FakeAsset();
    let nested: RetainedAsset<FakeAsset> | undefined;
    asset.onAddRef = () => {
        asset.onAddRef = undefined;
        nested = retainer.retain(asset);
    };
    const outer = retainer.retain(asset);
    assert.ok(nested);
    assert.equal(asset.references, 2);
    outer.release();
    assert.equal(asset.references, 1);
    nested.release();
    assert.equal(asset.references, 0);
    assert.equal(asset.returned, 2);
});

test("decRef failures propagate once and are never retried against a possibly consumed reference", () => {
    const retainer = new AssetRetainer();
    for (const afterDecrement of [false, true]) {
        const asset = new FakeAsset();
        const failure = new Error("engine decRef failed");
        let calls = 0;
        const decRef = asset.decRef.bind(asset);
        asset.decRef = () => {
            calls++;
            if (afterDecrement) decRef();
            throw failure;
        };
        const hold = retainer.retain(asset);
        assert.throws(() => hold.release(), (error: unknown) => error === failure);
        hold.release();
        assert.equal(calls, 1);
        assert.equal(asset.references, afterDecrement ? 0 : 1);
        // A failing custom engine operation needs explicit recovery by its owner.
        if (!afterDecrement) decRef();
        assert.equal(asset.references, 0);
    }
});

test("loaded-asset port admits a fake retainer without acquiring real engine references", () => {
    const fake = new FakeRetainer();
    const port: LoadedAssetRetainer = fake;
    const asset = new FakeAsset();
    const first = port.retain(asset);
    const second = port.retain(asset);
    assert.equal(first.asset, asset);
    assert.equal(fake.live.size, 2);
    second.release();
    second.release();
    assert.equal(fake.live.size, 1);
    first.release();
    assert.equal(fake.live.size, 0);
    assert.equal(asset.acquired, 0);
    assert.equal(asset.returned, 0);
});
