import assert from "node:assert/strict";
import { test } from "node:test";
import { UniFlexRuntime, type UniFlexUIBundle } from "../src/kits/uniflex/runtime";
import type { SurfaceNavigator, UIDefinition } from "../src/kits/uniflex/api/navigation/index";
import type { UIProvider } from "../src/kits/uniflex/api/core/index";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

test("UniFlex kit runtimes own loading, navigation and disposal", async (t) => {
    let providerDisposals = 0;
    let navigatorCreations = 0;
    let navigatorDisposals = 0;
    let ready = deferred<void>();
    let destroyError: Error | undefined;
    let createError: Error | undefined;
    class FakeProvider {
        dispose() { providerDisposals++; }
    }
    const initial = {} as UIDefinition<void, boolean>;
    const bundle = { registry: { bindings: [] }, layers: [] } as unknown as UniFlexUIBundle;
    function make(loadUI = async () => bundle) {
        providerDisposals = navigatorCreations = navigatorDisposals = 0;
        ready = deferred<void>();
        destroyError = undefined;
        createError = undefined;
        return new UniFlexRuntime({
            provider: new FakeProvider() as UIProvider & { dispose(): void },
            loadUI,
            createNavigator: () => {
                navigatorCreations++;
                if (createError) throw createError;
                return {
                    goto: () => ({ ready: ready.promise }),
                    back: async () => true,
                    destroy: () => {
                        navigatorDisposals++;
                        if (destroyError) throw destroyError;
                    },
                } as unknown as SurfaceNavigator;
            },
        });
    }

    await t.test("dispose during load releases late bindings without mounting", async () => {
        const load = deferred<UniFlexUIBundle>();
        const runtime = make(() => load.promise);
        let released = 0;
        const starting = runtime.start(initial, undefined);
        const rejected = assert.rejects(starting, /stopped during loading/);
        runtime.dispose();
        load.resolve({
            registry: { bindings: [{ dispose: () => released++ }] },
            layers: [{ dispose: () => released++ }],
        } as unknown as UniFlexUIBundle);
        await rejected;
        assert.equal(released, 2);
        assert.equal(navigatorCreations, 0);
        assert.equal(providerDisposals, 1);
        assert.equal(await runtime.back(), false);
    });

    for (const fail of [false, true]) {
        await t.test(`dispose during readiness (${fail ? "reject" : "resolve"})`, async () => {
            const runtime = make();
            const starting = runtime.start(initial, undefined);
            const rejected = assert.rejects(starting);
            await Promise.resolve();
            assert.equal(navigatorCreations, 1);
            runtime.dispose();
            assert.equal(navigatorDisposals, 1);
            if (fail) ready.reject(new Error("cancelled"));
            else ready.resolve();
            await rejected;
            runtime.dispose();
            assert.equal(navigatorDisposals, 1);
            assert.equal(providerDisposals, 1);
            assert.equal(await runtime.back(), false);
        });
    }

    await t.test("concurrent and subsequent starts are rejected", async () => {
        let loads = 0;
        const runtime = make(async () => { loads++; return bundle; });
        const starting = runtime.start(initial, undefined);
        await assert.rejects(runtime.start(initial, undefined), /already started/);
        ready.resolve();
        await starting;
        assert.equal(await runtime.back(), true);
        await assert.rejects(runtime.start(initial, undefined), /already started/);
        assert.equal(loads, 1);
        assert.equal(navigatorCreations, 1);
        runtime.dispose();
        await assert.rejects(runtime.start(initial, undefined), /stopped/);
    });

    await t.test("load failure disposes provider", async () => {
        const runtime = make(async () => { throw new Error("load failed"); });
        await assert.rejects(runtime.start(initial, undefined), /load failed/);
        assert.equal(providerDisposals, 1);
        assert.equal(navigatorCreations, 0);
    });

    await t.test("navigator construction failure releases unowned bundle", async () => {
        let released = 0;
        const runtime = make(async () => ({
            registry: { bindings: [{ dispose: () => released++ }] },
            layers: [{ dispose: () => released++ }],
        } as unknown as UniFlexUIBundle));
        createError = new Error("create failed");
        await assert.rejects(runtime.start(initial, undefined), /create failed/);
        assert.equal(released, 2);
        assert.equal(providerDisposals, 1);
    });

    await t.test("one late disposer throwing does not skip remaining owners", async () => {
        const load = deferred<UniFlexUIBundle>();
        const runtime = make(() => load.promise);
        let released = 0;
        const starting = assert.rejects(runtime.start(initial, undefined), /release failed/);
        runtime.dispose();
        load.resolve({
            registry: { bindings: [
                { dispose: () => { throw new Error("release failed"); } },
                { dispose: () => released++ },
            ] },
            layers: [{ dispose: () => released++ }],
        } as unknown as UniFlexUIBundle);
        await starting;
        assert.equal(released, 2);
        assert.equal(providerDisposals, 1);
    });

    await t.test("provider is disposed even if navigator destruction throws", async () => {
        const runtime = make();
        const starting = runtime.start(initial, undefined);
        ready.resolve();
        await starting;
        destroyError = new Error("destroy failed");
        assert.throws(() => runtime.dispose(), /destroy failed/);
        assert.equal(providerDisposals, 1);
        runtime.dispose();
        assert.equal(navigatorDisposals, 1);
    });
});
