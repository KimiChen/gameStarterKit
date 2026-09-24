import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
// @ts-expect-error The preview tool is ESM without declarations.
import { distribution, installMapOriginalMetrics } from "../../../tools/creator-preview/maporiginal-metrics.mjs";
// @ts-expect-error The preview tool is ESM without declarations.
import { judgeMapOriginalMinimapLayout, readMapOriginalMinimapEvidence } from "../../../tools/creator-preview/maporiginal.mjs";

test("mapOriginal minimap evidence: actual CSS ratios, half-height art and complete viewport edges", () => {
    const root = "scene/Canvas/MapOriginalWorldView/mapo-minimap";
    const node = (name: string, path: string, x: number, y: number, width: number, height: number) =>
        ({ name, path, center: { x, y, width, height } });
    const walk = { canvas: { width: 375, height: 800 }, visible: { width: 750, height: 1600 }, nodes: [
        node("mapo-minimap", root, 300, 700, 180, 180),
        node("mapo-minimap-image", `${root}/mapo-minimap-image`, 300, 700, 180, 90),
        node("edge-0", `${root}/viewport/edge-0`, 300, 695, 20, 2),
        node("edge-1", `${root}/viewport/edge-1`, 300, 705, 20, 2),
        node("edge-2", `${root}/viewport/edge-2`, 295, 700, 2, 20),
        node("edge-3", `${root}/viewport/edge-3`, 305, 700, 2, 20),
    ] };
    const value = readMapOriginalMinimapEvidence(walk);
    assert.deepEqual(value.image, { x: 255, y: 677.5, w: 90, h: 45 });
    assert.equal(judgeMapOriginalMinimapLayout(value), null);
    assert.match(judgeMapOriginalMinimapLayout({ ...value, image: { ...value.image, h: 90 } }), /半高/u);
    assert.match(judgeMapOriginalMinimapLayout({ ...value, image: { ...value.image, y: 680 } }), /半高/u);
    assert.match(judgeMapOriginalMinimapLayout({ ...value, edges: value.edges.slice(1) }), /四条/u);
    assert.match(judgeMapOriginalMinimapLayout({ ...value, edges: value.edges.map((e: object) => ({ ...e, x: 200, w: 200 })) }), /超出/u);
    assert.equal(readMapOriginalMinimapEvidence({ ...walk, visible: { width: 0, height: 0 } }), null);
    const wide = readMapOriginalMinimapEvidence({ ...walk, canvas: { width: 1624, height: 750 },
        visible: { width: 750, height: 346.366995 }, nodes: walk.nodes.map(n =>
            n.name === "edge-3" ? { ...n, center: { ...n.center, x: 300 + 90 * 1624 / 750 } } : n) });
    assert.ok(wide.strokeHalfWidth.x > 2);
    assert.equal(judgeMapOriginalMinimapLayout(wide), null, "横版边框半线宽必须按实际 CSS 比例计算");
});

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
    const readers = ["Terrain", "Bands", "Regions", "Roads", "Cities", "Tops", "Rivers", "Blocks"]
        .map(name => [name, { [`mapo${name}DataUsage`]: () => ({ arrayBufferBytes: 10 }) }]);
    const modules = [...readers, ["MapoArtResources", { mapoArtDiagnostics: () => [
        { closed: false, groups: {}, data: { terrain: { arrayBufferBytes: 120 } } },
    ] }]];
    const scene = { name: "Scene", children: [], getComponent: () => null };
    const bundlePrototype = { load };
    const mapBundle = Object.assign(Object.create(bundlePrototype) as { load: typeof load }, { name: "kit-mapOriginal-s1" });
    const cc = { resources: Object.assign(Object.create(bundlePrototype), { name: "resources" }), Director: { EVENT_BEFORE_UPDATE: "before", EVENT_AFTER_DRAW: "after" },
        director: { root: { device: { numDrawCalls: 3, memoryStatus: {} } }, getScene: () => scene,
            on: (event: string, f: () => void) => events.set(event, f),
            off: (event: string, f: () => void) => { if (events.get(event) === f) events.delete(event); } },
        view: { getDesignResolutionSize: () => ({ width: 750, height: 1624 }) } };
    const context = vm.createContext({ cc, WeakRef, System: { entries: () => modules },
        performance: { now: () => now++ }, navigator: { userAgent: "test", platform: "test" }, devicePixelRatio: 2,
        document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {}, getElementById: () => ({ width: 400, height: 800, getContext: () => gl,
            getBoundingClientRect: () => ({ width: 200, height: 400 }) }) } });
    vm.runInContext(`(${installMapOriginalMetrics.toString()})()`, context);
    mapBundle.load("2d/resources/decor-atlas-abcdef1234567890/texture", null, () => callbacks++);
    assert.equal(nativeLoads, 1); assert.equal(callbacks, 1);
    events.get("before")!();
    vm.runInContext("document.getElementById().getContext().bufferSubData(0, 0, new Float32Array(8), 2, 3)", context);
    events.get("after")!();
    const state = vm.runInContext("__mapOriginalMetrics.snapshot()", context);
    assert.equal(state.loads[0].error, null);
    assert.equal(state.sourceTextureRgba8Bytes, 128);
    assert.equal(state.cpu.legacyArrayBufferBytes, 80);
    assert.equal(state.cpu.ownedArrayBufferBytes, 120);
    assert.equal(state.cpu.retainedArrayBufferBytes, 200);
    assert.equal(state.uploads.bytes, 12);
    assert.equal(state.environment.cssCanvas.width, 200);
    assert.equal(state.environment.backingCanvas.width, 400);
    vm.runInContext("__mapOriginalMetrics.stop()", context);
    assert.equal(bundlePrototype.load, load);
    assert.equal(gl.bufferData, bufferData); assert.equal(gl.bufferSubData, bufferSubData);
    assert.equal(events.size, 0);
    assert.equal(vm.runInContext("typeof __mapOriginalMetrics", context), "undefined");
});
