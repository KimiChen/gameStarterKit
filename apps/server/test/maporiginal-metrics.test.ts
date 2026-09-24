import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
// @ts-expect-error The preview tool is ESM without declarations.
import { distribution, installMapOriginalMetrics } from "../../../tools/creator-preview/maporiginal-metrics.mjs";

test("mapOriginal metrics: no samples is unknown, percentile preserves long frames", () => {
    assert.equal(distribution([]).p99, null);
    assert.equal(distribution([16, 16, 16, 1200]).max, 1200);
    assert.equal(distribution([16, 16, 16, 1200]).p99, 1200);
});

test("mapOriginal metrics: serialized probe preserves callbacks and restores hooks", () => {
    const events = new Map<string, () => void>();
    let nativeLoads = 0, callbacks = 0, now = 0;
    const bufferData = () => {}, bufferSubData = () => {};
    const gl = { bufferData, bufferSubData, getExtension: () => null, getParameter: () => "WebGL 2.0" };
    const asset = { isValid: true, refCount: 2, _uuid: "texture", width: 4, height: 8,
        getGFXTexture: () => ({ size: 128, format: 35 }) };
    const load = (_path: string, _type: unknown, callback: (error: null, a: unknown) => void) => {
        nativeLoads++; callback(null, asset);
    };
    const modules = ["Terrain", "Bands", "Regions", "Roads", "Cities", "Tops", "Rivers", "Blocks"]
        .map(name => [name, { [`mapo${name}DataUsage`]: () => ({ arrayBufferBytes: 10 }) }]);
    const scene = { name: "Scene", children: [], getComponent: () => null };
    const cc = { resources: { load }, Director: { EVENT_BEFORE_UPDATE: "before", EVENT_AFTER_DRAW: "after" },
        director: { root: { device: { numDrawCalls: 3, memoryStatus: {} } }, getScene: () => scene,
            on: (event: string, f: () => void) => events.set(event, f),
            off: (event: string, f: () => void) => { if (events.get(event) === f) events.delete(event); } },
        view: { getDesignResolutionSize: () => ({ width: 750, height: 1624 }) } };
    const context = vm.createContext({ cc, WeakRef, System: { entries: () => modules },
        performance: { now: () => now++ }, navigator: { userAgent: "test", platform: "test" }, devicePixelRatio: 2,
        document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {}, getElementById: () => ({ width: 400, height: 800, getContext: () => gl,
            getBoundingClientRect: () => ({ width: 200, height: 400 }) }) } });
    vm.runInContext(`(${installMapOriginalMetrics.toString()})()`, context);
    cc.resources.load("kits/mapOriginal/maps/s1/decor-atlas/texture", null, () => callbacks++);
    assert.equal(nativeLoads, 1); assert.equal(callbacks, 1);
    events.get("before")!();
    vm.runInContext("document.getElementById().getContext().bufferSubData(0, 0, new Float32Array(8), 2, 3)", context);
    events.get("after")!();
    const state = vm.runInContext("__mapOriginalMetrics.snapshot()", context);
    assert.equal(state.loads[0].error, null);
    assert.equal(state.sourceTextureRgba8Bytes, 128);
    assert.equal(state.cpu.retainedArrayBufferBytes, 80);
    assert.equal(state.uploads.bytes, 12);
    assert.equal(state.environment.cssCanvas.width, 200);
    assert.equal(state.environment.backingCanvas.width, 400);
    vm.runInContext("__mapOriginalMetrics.stop()", context);
    assert.equal(cc.resources.load, load);
    assert.equal(gl.bufferData, bufferData); assert.equal(gl.bufferSubData, bufferSubData);
    assert.equal(events.size, 0);
    assert.equal(vm.runInContext("typeof __mapOriginalMetrics", context), "undefined");
});
