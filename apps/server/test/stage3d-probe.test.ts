/** SC0 sampling contract only; these tests do not substitute for Creator evidence. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

// @ts-expect-error Pure ESM browser/CDP tool has no TypeScript declaration.
import { aggregateStage3dSampling, createStage3dSamplingSource, normalizeStage3dSamplingOptions, STAGE3D_SAMPLER_KEY, stopStage3dSamplingSource, summarizeStage3dIntervals } from "../../../tools/creator-preview/stage3d-sampling.mjs";
// @ts-expect-error Pure ESM probe; importing it must not open Chrome or write evidence.
import { assertStage3dFraming, createStage3dFramingSource, resetStage3dPerformanceView, assertStage3dClosedBaseline, assertStage3dSkinningPhase, assertStage3dSkinningTransition, assertStage3dRealtimePhase, assertStage3dRealtimeAdvancement, assertStage3dRealtimeRestored, assertStage3dViewport, createStage3dHarnessSource, createStage3dProbeSummary, createStage3dTouchTraceSource, createStage3dViewportSource, parseStage3dProbeArgs, prepareStage3dViewport, selectStage3dReuseTab, Stage3dTouchDriver, STAGE3D_VIEWPORT, validateStage3dPrefabMetadata, writeStage3dProbeSummary } from "../../../tools/creator-preview/probe-stage3d.mjs";
// @ts-expect-error Pure ESM preboot provenance source is exercised without a browser.
import { assertStage3dOwnedBoot, createStage3dOwnedBootSource, createStage3dOwnedBootInspectionSource } from "../../../tools/creator-preview/stage3d-boot.mjs";

function harness(initialHidden = false) {
  let now = 0;
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const visibility = new EventEmitter();
  const device = { numDrawCalls: 5, numTris: 30, numInstances: 7, memoryStatus: { bufferSize: 100, textureSize: 200 } };
  const director = Object.assign(new EventEmitter(), { root: { device, frameTime: 0.016, frameCount: 900 } });
  const document = {
    hidden: initialHidden,
    visibilityState: initialHidden ? "hidden" : "visible",
    addEventListener: (name: string, listener: () => void) => visibility.on(name, listener),
    removeEventListener: (name: string, listener: () => void) => visibility.off(name, listener),
  };
  const context = vm.createContext({
    cc: { director, Director: { EVENT_AFTER_DRAW: "after-draw" } },
    document,
    performance: { now: () => now },
    setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const evaluate = (source: string): any => vm.runInContext(source, context);
  return {
    director, device, document, context, evaluate,
    sample: (options: object = {}): Promise<any> => evaluate(createStage3dSamplingSource(options)),
    frame: (atMs: number) => { now = atMs; director.emit("after-draw"); },
    visibility: (hidden: boolean) => {
      document.hidden = hidden;
      document.visibilityState = hidden ? "hidden" : "visible";
      visibility.emit("visibilitychange");
    },
    timeout: () => { for (const callback of [...timers.values()]) callback(); },
    assertClean: () => {
      assert.equal(director.listenerCount("after-draw"), 0, "must unsubscribe from AFTER_DRAW");
      assert.equal(visibility.listenerCount("visibilitychange"), 0, "must unsubscribe from visibilitychange");
      assert.equal(timers.size, 0, "must cancel the timeout");
      assert.equal(context[STAGE3D_SAMPLER_KEY], undefined, "must remove the owned control handle");
    },
  };
}

// Browser-created arrays/objects come from a separate realm. This also checks JSON transport.
const transported = (value: unknown): any => JSON.parse(JSON.stringify(value));

test("stage3d sampling defaults and configurable windows reject invalid numbers", () => {
  assert.deepEqual(normalizeStage3dSamplingOptions(), { warmupFrames: 60, sampleFrames: 240, timeoutMs: 60_000 });
  assert.deepEqual(normalizeStage3dSamplingOptions({ warmupFrames: 0, sampleFrames: 1, timeoutMs: 1 }),
    { warmupFrames: 0, sampleFrames: 1, timeoutMs: 1 });
  for (const options of [{ warmupFrames: -1 }, { sampleFrames: 0 }, { sampleFrames: 1.5 }, { timeoutMs: NaN }, { timeoutMs: Infinity }]) {
    assert.throws(() => createStage3dSamplingSource(options), /must be an integer/u);
  }
});

test("stage3d injection is self-contained and uses 60 warmup plus 240 measured intervals", async () => {
  const h = harness();
  const pending = h.sample();
  for (let index = 0; index <= 300; index++) h.frame(100 + index * 16);
  const report = transported(await pending);
  assert.equal(report.valid, true);
  assert.equal(report.frames.length, 301);
  assert.equal(report.frames.filter((frame: any) => frame.phase === "warmup").length, 60);
  assert.equal(report.frames.filter((frame: any) => frame.phase === "sample").length, 240);
  assert.equal(report.frames[0].intervalMs, null, "first callback is a clock anchor, not a fabricated interval");
  assert.equal(aggregateStage3dSampling(report).valid, true);
  h.assertClean();
});

test("stage3d keeps a 1.2s long frame, independent sequence across frameCount reset, and frame-end counters", async () => {
  const h = harness();
  const pending = h.sample({ warmupFrames: 2, sampleFrames: 4 });
  h.device.memoryStatus.textureSize = 2000;
  h.device.numDrawCalls = 90;
  h.frame(100);
  h.device.memoryStatus.textureSize = 200;
  h.device.numDrawCalls = 5;
  h.frame(110);
  h.frame(130);
  h.frame(150);
  h.director.root.frameCount = 0;
  h.frame(170);
  h.frame(1370);
  h.device.numDrawCalls = 8;
  h.device.numTris = 45;
  h.device.numInstances = 12;
  h.frame(1390);
  const report = transported(await pending);
  const result = aggregateStage3dSampling(report);
  assert.equal(result.valid, true);
  assert.deepEqual(report.frames.map((frame: any) => frame.seq), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(result.rawFrameIntervalsMs, [20, 20, 1200, 20]);
  assert.deepEqual(result.frameIntervals, { count: 4, p50Ms: 20, p95Ms: 1200, maxMs: 1200, meanMs: 315 });
  assert.equal(report.frames[5].engineDtMs, 16, "engine dt is auxiliary and cannot replace the 1200 ms interval");
  assert.deepEqual(result.lastFrame.gfx, { drawCalls: 8, triangles: 45, instances: 12, bufferBytes: 100, textureBytes: 200, totalBytes: 300 });
  assert.equal(result.allFramesPeak.textureBytes, 2000, "warmup/anchor memory peak must remain observable");
  assert.equal(result.allFramesPeak.drawCalls, 90);
  h.assertClean();
});

test("stage3d visibility pollution fails and cleans up even during warmup", async () => {
  const h = harness();
  const pending = h.sample();
  h.frame(100);
  h.visibility(true);
  const report = transported(await pending);
  assert.equal(report.valid, false);
  assert.equal(report.status, "failed");
  assert.equal(report.visibilityChanges, 1);
  assert.ok(report.reasons.includes("visibility-changed"));
  assert.equal(report.frames.length, 1);
  assert.equal(aggregateStage3dSampling(report).valid, false);
  h.assertClean();
  h.visibility(false);
  h.frame(200);
  assert.equal(report.frames.length, 1, "visible again must not resume the old window");
});

test("stage3d initially hidden page fails before any subscriptions are installed", async () => {
  const h = harness(true);
  const report = transported(await h.sample());
  assert.equal(report.valid, false);
  assert.ok(report.reasons.includes("document-hidden-or-unavailable"));
  h.assertClean();
});

test("stage3d explicit stop is idempotent and releases partial samples", async () => {
  const h = harness();
  const pending = h.sample({ warmupFrames: 0, sampleFrames: 10 });
  h.frame(100);
  h.frame(130);
  assert.equal(h.evaluate(stopStage3dSamplingSource("fixture closed")), true);
  const report = transported(await pending);
  assert.equal(report.status, "cancelled");
  assert.ok(report.reasons.includes("fixture closed"));
  assert.equal(report.frames[1].intervalMs, 30);
  assert.equal(h.evaluate(stopStage3dSamplingSource()), false);
  h.assertClean();
});

test("stage3d timeout cannot silently produce valid performance evidence", async () => {
  const h = harness();
  const pending = h.sample({ warmupFrames: 0, sampleFrames: 2, timeoutMs: 1 });
  h.frame(100);
  h.timeout();
  const report = transported(await pending);
  assert.equal(report.status, "timed-out");
  assert.equal(aggregateStage3dSampling(report).valid, false);
  h.assertClean();
});

test("stage3d missing GFX counters fail instead of becoming zero and retain prior frames", async () => {
  const h = harness();
  const pending = h.sample({ warmupFrames: 0, sampleFrames: 3 });
  h.frame(100);
  Object.defineProperty(h.device, "numTris", { get: () => undefined });
  h.frame(120);
  const report = transported(await pending);
  assert.equal(report.status, "failed");
  assert.ok(report.reasons.some((reason: string) => reason.includes("numTris")));
  assert.equal(report.frames.length, 1);
  h.assertClean();
});

test("stage3d engine replacement invalidates the window, while frameCount resets do not", async () => {
  const h = harness();
  const pending = h.sample();
  h.frame(100);
  h.director.root = { ...h.director.root };
  h.frame(120);
  const report = transported(await pending);
  assert.ok(report.reasons.includes("engine-root-or-device-changed"));
  h.assertClean();
});

test("stage3d initialization failure clears subscriptions already installed", async () => {
  const h = harness();
  const originalOn = h.director.on.bind(h.director);
  h.director.on = ((name: string, listener: (...args: any[]) => void) => {
    originalOn(name, listener);
    throw new Error("registration failed");
  }) as typeof h.director.on;
  const report = transported(await h.sample());
  assert.equal(report.status, "failed");
  assert.ok(report.reasons.some((reason: string) => reason.includes("registration failed")));
  h.assertClean();
});

test("stage3d replacement stops the preceding capture without deleting the new handle", async () => {
  const h = harness();
  const first = h.sample();
  h.frame(100);
  const second = h.sample({ warmupFrames: 0, sampleFrames: 1 });
  assert.ok((await first).reasons.includes("superseded"));
  assert.equal(h.director.listenerCount("after-draw"), 1);
  h.frame(110);
  h.frame(130);
  assert.equal((await second).valid, true);
  h.assertClean();
});

test("stage3d aggregation rejects altered sequence/interval/counter/source evidence", async () => {
  const h = harness();
  const pending = h.sample({ warmupFrames: 0, sampleFrames: 2 });
  h.frame(100);
  h.frame(120);
  h.frame(140);
  const original = transported(await pending);
  const alterations = [
    (report: any) => { report.frames[1].seq = 0; },
    (report: any) => { report.frames[1].intervalMs = 16; },
    (report: any) => { report.frames[0].phase = "sample"; },
    (report: any) => { delete report.frames[1].gfx.drawCalls; },
    (report: any) => { report.frames[1].gfx.totalBytes = 0; },
    (report: any) => { report.clock = "engine dt"; },
    (report: any) => { report.visibilityChanges = 1; },
    (report: any) => { delete report.options; },
    (report: any) => { report.frames.pop(); },
  ];
  for (const alter of alterations) {
    const report = transported(original);
    alter(report);
    assert.equal(aggregateStage3dSampling(report).valid, false);
  }
  assert.equal(aggregateStage3dSampling(null).valid, false);
  h.assertClean();
});

test("stage3d percentile summary preserves zero and long intervals without sorting input", () => {
  const input = [1200, 0, 10, 10];
  assert.deepEqual(summarizeStage3dIntervals(input), { count: 4, p50Ms: 10, p95Ms: 1200, maxMs: 1200, meanMs: 305 });
  assert.deepEqual(input, [1200, 0, 10, 10]);
  assert.deepEqual(summarizeStage3dIntervals([]), { count: 0, p50Ms: null, p95Ms: null, maxMs: null, meanMs: null });
  assert.throws(() => summarizeStage3dIntervals([NaN]), /finite/u);
  assert.throws(() => summarizeStage3dIntervals([-1]), /non-negative/u);
});

test("stage3d real probe defaults to isolated 7457 and validates explicit modes/windows", () => {
  const defaults = parseStage3dProbeArgs([]);
  assert.equal(defaults.inputOnly, undefined);
  assert.equal(parseStage3dProbeArgs(["--input-only", "--expect-webgl", "2"]).inputOnly, true);
  assert.equal(parseStage3dProbeArgs(["--input-only", "--expect-webgl", "1", "--force-webgl1"]).forceWebgl1, true);
  for (const args of [["--force-webgl1"], ["--input-only", "--expect-webgl", "2", "--force-webgl1"],
    ["--input-only", "--reuse", "--expect-webgl", "1", "--force-webgl1"]]) assert.throws(() => parseStage3dProbeArgs(args), /requires a fresh/);
  assert.equal(defaults.preview, "http://127.0.0.1:7457");
  assert.equal(defaults.devtools, "http://127.0.0.1:9222");
  assert.equal(defaults.cycles, 20);
  assert.equal(defaults.mode, "fixture");
  const snake = parseStage3dProbeArgs(["--mode", "snake", "--reuse", "--expect-webgl", "1", "--cycles", "2"]);
  assert.equal(snake.mode, "snake");
  assert.equal(snake.reuse, true);
  assert.equal(snake.expectWebgl, 1);
  assert.equal(snake.cycles, 2);
  for (const args of [["--mode", "unknown"], ["--cycles", "0"], ["--expect-webgl", "3"], ["--preview", "https://example.com"], ["--out"], ["--unknown"]]) {
    assert.throws(() => parseStage3dProbeArgs(args));
  }
});

test("stage3d real probe accepts only imported named Prefab subresources, not GLB roots", () => {
  const meta = { importer: "gltf", imported: true, uuid: "parent", subMetas: {
    scene: { importer: "gltf-scene", imported: true, uuid: "parent@scene", name: "greybox-biped.prefab" },
  } };
  assert.deepEqual(validateStage3dPrefabMetadata(meta, "greybox-biped"), {
    name: "greybox-biped", uuid: "parent", prefabUuid: "parent@scene", prefabPath: "stage3d/greybox-biped/greybox-biped", importedName: "greybox-biped.prefab",
  });
  assert.throws(() => validateStage3dPrefabMetadata({ ...meta, imported: false }, "greybox-biped"), /not imported/u);
  assert.throws(() => validateStage3dPrefabMetadata({ ...meta, subMetas: {} }, "greybox-biped"), /no imported/u);
  assert.throws(() => validateStage3dPrefabMetadata(meta, "wrong-name"), /no imported/u);
});

test("stage3d closed-cycle evidence refuses node/ref/input leaks and GFX above its prewarmed baseline", () => {
  const baseline = { sceneNodes: 10, fixtureNodes: 0, session: { businessRefs: 0 }, input: { ownersCount: 0, active: false }, gfx: { bufferBytes: 100, textureBytes: 200 } };
  assert.equal(assertStage3dClosedBaseline(baseline, [baseline, transported(baseline)]).cycles, 2);
  const alterations = [
    (value: any) => { value.sceneNodes++; },
    (value: any) => { value.fixtureNodes++; },
    (value: any) => { value.session.businessRefs++; },
    (value: any) => { value.input.ownersCount++; },
    (value: any) => { value.input.active = true; },
    (value: any) => { value.gfx.textureBytes++; },
    (value: any) => { value.gfx.bufferBytes = null; },
  ];
  for (const alter of alterations) { const value = transported(baseline); alter(value); assert.throws(() => assertStage3dClosedBaseline(baseline, [value])); }
  assert.throws(() => assertStage3dClosedBaseline(baseline, []), /No closed-cycle/u);
});

test("stage3d browser harness imports discovered hashed SystemJS URLs and queries components by engine names", async () => {
  const imported: string[] = [], queried: string[] = [];
  const session = { ready: false, error: null, businessRefs: 0, nodeCount: 0, logic: { starts: 0, moves: 0, ends: 0, cancels: 0, wheels: 0, hudClicks: 0, x: 0, y: 0, activePointers: 0 }, close: () => {} };
  const entries = [
    ["http://127.0.0.1:7457/scripting/x/chunks/aaa.js", { ViewMgr: { open: () => {}, close: () => {} } }],
    ["http://127.0.0.1:7457/scripting/x/chunks/bbb.js", { spikeSession: session }],
    ["http://127.0.0.1:7457/scripting/x/chunks/ccc.js", { rawInput: { inspect: () => ({ active: false, blocked: false, ownersCount: 0 }) } }],
  ] as const;
  const node = { name: "scene", activeInHierarchy: true, children: [],
    getComponent: (name: string) => { queried.push(name); return null; },
    getComponentsInChildren: (name: string) => { queried.push(name); return []; } };
  const context = vm.createContext({
    System: { entries: () => entries, import: async (url: string) => { imported.push(url); return entries.find(([key]) => key === url)![1]; } },
    cc: { director: { getScene: () => node, root: { device: { memoryStatus: { bufferSize: 0, textureSize: 0 } } } },
      sys: { hasFeature: (feature: string) => feature === "INPUT_TOUCH", get capabilities() { throw new Error("Deprecated capabilities must not be read when hasFeature exists"); } },
      Layers: { Enum: { DEFAULT: 1 << 30, UI_2D: 1 << 25 } } },
    document: { hidden: false, visibilityState: "visible" }, navigator: { userAgent: "test", platform: "test" }, performance: { now: () => 10 },
  });
  const result = transported(await vm.runInContext(createStage3dHarnessSource("snake"), context));
  assert.deepEqual(imported, entries.map(([url]) => url));
  assert.equal(result.moduleUrls.ViewMgr, entries[0][0]);
  assert.ok(queried.includes("cc.Camera"));
  assert.ok(queried.includes("cc.SkeletalAnimation"));
  assert.ok(queried.includes("cc.SkinnedMeshRenderer"));
  assert.equal(result.baseline.environment.webgl, null, "unobservable WebGL cannot be guessed from a device enum");
  assert.deepEqual(result.baseline.environment.engineInput, { inputTouchFeature: true, capabilitiesTouches: null });
});

function touchHarness(fault: "none" | "wrong-end" | "missing-dom" = "none") {
  const events = new EventEmitter();
  const browserTouches = new Map<number, { id: number; x: number; y: number }>();
  const context = vm.createContext({
    window: {
      addEventListener: (type: string, listener: (...args: any[]) => void, options: any) => {
        assert.equal(options.capture, true);
        assert.equal(options.passive, true, "diagnostic capture must not alter browser behavior");
        events.on(type, listener);
      },
      removeEventListener: (type: string, listener: (...args: any[]) => void, capture: boolean) => {
        assert.equal(capture, true);
        events.off(type, listener);
      },
    },
    performance: { now: () => 1 },
  });
  const evaluate = async (source: string): Promise<any> => transported(vm.runInContext(source, context) ?? null);
  vm.runInContext(createStage3dTouchTraceSource(), context);
  const sent: any[] = [], evidence: any[] = [];
  const client = {
    evaluate,
    send: async (method: string, command: any) => {
      assert.equal(method, "Input.dispatchTouchEvent");
      sent.push(transported(command));
      if (fault === "missing-dom") return;
      let changed: any[] = [];
      if (command.type === "touchStart" || command.type === "touchMove") {
        changed = command.touchPoints.filter((point: any) => {
          const previous = browserTouches.get(point.id);
          return !previous || previous.x !== point.x || previous.y !== point.y;
        });
        for (const point of command.touchPoints) browserTouches.set(point.id, point);
      } else if (command.type === "touchEnd") {
        changed = command.touchPoints.length ? command.touchPoints : [...browserTouches.values()];
        if (fault === "wrong-end" && command.touchPoints.length) {
          changed = [...browserTouches.values()].filter((point) => !command.touchPoints.some((ended: any) => ended.id === point.id));
        }
        for (const point of changed) browserTouches.delete(point.id);
      } else {
        changed = [...browserTouches.values()];
        browserTouches.clear();
      }
      if (!changed.length) return;
      const domPoints = (points: any[]) => points.map((point) => ({ identifier: point.id, clientX: point.x, clientY: point.y }));
      events.emit(command.type.toLowerCase(), { type: command.type.toLowerCase(), changedTouches: domPoints(changed),
        touches: domPoints([...browserTouches.values()]), isTrusted: true, target: { id: "GameCanvas" } });
    },
  };
  return { context, evaluate, events, sent, evidence, driver: new Stage3dTouchDriver(client, evidence, async () => {}) };
}

test("stage3d touch transport ends the requested finger and validates real DOM changed/active IDs", async () => {
  const h = touchHarness();
  await h.driver.dispatch("touchStart", 901, { x: 100, y: 200 });
  await h.driver.dispatch("touchStart", 903, { x: 300, y: 400 });
  await h.driver.dispatch("touchMove", 901, { x: 110, y: 210 });
  await h.driver.dispatch("touchEnd", 903);
  assert.deepEqual(h.sent.at(-1).touchPoints.map((point: any) => point.id), [903], "partial end names the ended point, not remaining 901");
  assert.deepEqual(h.evidence.at(-1).events[0].changed.map((point: any) => point.id), [903]);
  assert.deepEqual(h.evidence.at(-1).events[0].active.map((point: any) => point.id), [901]);
  await h.driver.dispatch("touchEnd", 901);
  assert.deepEqual(h.sent.at(-1).touchPoints, [], "last finger end uses the protocol's empty array");
  await h.driver.dispatch("touchCancel");
  assert.ok(h.evidence.every((record) => record.status === "passed"));
  assert.equal(h.driver.pointers.size, 0);
  vm.runInContext("__stage3dTouchTrace.stop()", h.context);
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) assert.equal(h.events.listenerCount(type), 0);
});

test("stage3d cleanup does not dispatch cancel outside a touch sequence and preserves active cancellation failures", async () => {
  const h = touchHarness();
  assert.deepEqual(await h.driver.cancelActive(), { dispatched: false, reason: "no-active-touch-sequence" });
  assert.equal(h.sent.length, 0); assert.equal(h.evidence.length, 0);
  await h.driver.dispatch("touchStart", 901, { x: 100, y: 200 });
  await h.driver.cancelActive();
  assert.equal(h.evidence.at(-1).status, "passed");
  assert.deepEqual(h.evidence.at(-1).expectedChangedIds, [901]);
  const count = h.sent.length;
  await h.driver.cancelActive();
  assert.equal(h.sent.length, count);
  const broken = touchHarness("missing-dom");
  await assert.rejects(broken.driver.dispatch("touchStart", 902, { x: 100, y: 200 }));
  await assert.rejects(broken.driver.cancelActive(), /DOM delivery mismatch/u);
  assert.equal(broken.evidence.at(-1).status, "failed", "cleanup cannot disguise an actual cancellation failure");
});

test("stage3d touch transport fails when the browser ends another finger instead", async () => {
  const h = touchHarness("wrong-end");
  await h.driver.dispatch("touchStart", 901, { x: 100, y: 200 });
  await h.driver.dispatch("touchStart", 903, { x: 300, y: 400 });
  await assert.rejects(h.driver.dispatch("touchEnd", 903), /DOM delivery mismatch/u);
  assert.equal(h.evidence.at(-1).status, "failed");
  assert.deepEqual(h.evidence.at(-1).events[0].changed.map((point: any) => point.id), [901], "failure retains the actual wrong input");
});

test("stage3d touch transport refuses mouse-only/no-DOM evidence and trace reinstall removes previous listeners", async () => {
  const h = touchHarness("missing-dom");
  vm.runInContext(createStage3dTouchTraceSource(), h.context);
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) assert.equal(h.events.listenerCount(type), 1);
  await assert.rejects(h.driver.dispatch("touchStart", 901, { x: 100, y: 200 }), /DOM delivery mismatch/u);
  assert.equal(h.evidence.at(-1).status, "failed");
  assert.deepEqual(h.evidence.at(-1).events, []);
});

async function skinningHarness() {
  const mainClips = [{ name: "sway", hash: 11 }, { name: "bow", hash: 12 }];
  const atlasBClips = [{ name: "sway-b", hash: 21 }, { name: "bow-b", hash: 22 }];
  const textureA = { width: 72, height: 72, format: 44 }, textureB = { ...textureA };
  const mainPass = { batchingScheme: 1, phaseID: 0 }, alternatePass = { batchingScheme: 1, phaseID: 0 };
  const queried: string[] = [];
  const nodes = Array.from({ length: 100 }, (_, index) => {
    const node: any = { name: index === 99 ? "Stage3dSpike.CrossAtlas" : `Stage3dSpike.Biped.${index}`, uuid: `node-${index}`, activeInHierarchy: true, children: [] };
    const model: any = { constructor: { name: "BakedSkinningModel" }, type: 2, uploadedAnim: mainClips[index % 2], _jointsMedium: {
      texture: { handle: { texture: textureA }, pixelOffset: 0 }, animInfo: { currentClip: mainClips[index % 2], data: [1] },
    } };
    model.subModels = [{ instancedAttributeBlock: { buffer: new Uint8Array(80) }, passes: [mainPass],
      descriptorSet: { getTexture: (binding: number) => { assert.equal(binding, 7); return model._jointsMedium.texture.handle.texture; } } }];
    const renderer = { node, model, skeleton: { hash: 7, joints: ["Root", "Root/Upper"] }, mesh: { hash: 8 } };
    const animation: any = { node, enabled: true, useBakedAnimation: true, clips: index === 99 ? [...mainClips, ...atlasBClips] : mainClips,
      time: 0.1, getState: (name: string) => ({ isPlaying: name === renderer.model.uploadedAnim.name, isPaused: false, time: animation.time, clip: renderer.model.uploadedAnim }) };
    node.getComponent = (name: string) => { queried.push(name); return name === "cc.SkeletalAnimation" ? animation : name === "cc.SkinnedMeshRenderer" ? renderer : null; };
    node.getComponentsInChildren = (name: string) => { queried.push(name); return name === "cc.SkeletalAnimation" ? [animation] : name === "cc.SkinnedMeshRenderer" ? [renderer] : []; };
    return node;
  });
  const camera = { node: { name: "Stage3dSpike.Camera", activeInHierarchy: true }, camera: {}, enabled: true, rect: { x: 0, y: 0, width: 1, height: 1 } };
  const directQueue: any = { camera: camera.camera, sceneFlags: 1, opaqueQueue: { instances: [] }, transparentQueue: { instances: [] } };
  const targetRenderer = nodes[99]!.getComponent("cc.SkinnedMeshRenderer"), originalModel = targetRenderer.model;
  const session: any = { ready: true, error: null, businessRefs: 4, nodeCount: 604, logic: {},
    skinning: { mainClips, atlasBClips, skeletonHash: 7 },
    switchSkinningClip: (group: string, index: number) => {
      const model = nodes[99]!.getComponent("cc.SkinnedMeshRenderer").model;
      model.uploadedAnim = (group === "main" ? mainClips : atlasBClips)[index];
      model._jointsMedium.animInfo.currentClip = model.uploadedAnim;
      model._jointsMedium.texture.handle.texture = group === "main" ? textureA : textureB;
      model.subModels[0].passes = [group === "main" ? mainPass : alternatePass];
    }, switchRealtimeSkinning: (enabled: boolean) => {
      const animation = nodes[99]!.getComponent("cc.SkeletalAnimation");
      animation.useBakedAnimation = !enabled;
      originalModel.uploadedAnim = mainClips[0]; originalModel._jointsMedium.animInfo.currentClip = mainClips[0];
      if (enabled) {
        const buffer = { size: 192 };
        const subModel = { instancedAttributeBlock: { buffer: new Uint8Array() }, passes: Array.from({ length: 6 }, (_, phaseID) => ({ batchingScheme: 0, phaseID })),
          descriptorSet: { getTexture: () => null, getBuffer: (index: number) => { assert.equal(index, 3); return buffer; } } };
        targetRenderer.model = { constructor: { name: "SkinningModel" }, type: 1, uploadedAnim: mainClips[0],
          _joints: [{}, {}], _realTimeTextureMode: false, _buffers: [buffer], _bufferIndices: [0],
          _dataArray: [new Float32Array(24).fill(1)], subModels: [subModel] };
        directQueue.opaqueQueue.instances = [{ subModel, passIndex: 0 }];
      } else { targetRenderer.model = originalModel; directQueue.opaqueQueue.instances = []; }
    }, close: () => {} };
  const scene = { name: "scene", activeInHierarchy: true, children: nodes, getComponent: () => null,
    getComponentsInChildren: (name: string) => name === "cc.Camera" ? [camera] : [] };
  const director = Object.assign(new EventEmitter(), { getScene: () => scene, root: {
    pipeline: { _executor: { _context: { culling: { renderQueues: [directQueue], numRenderQueues: 1, kFilterMask: 2, kDrawMask: 1,
      renderQueueQueryIndex: new Map([[0, { renderQueueTarget: 0, lightBoundsCulledResultID: 0xffffffff, frustumCulledResultID: 0 }]]),
      renderQueueIndex: new Map([["0-4294967295-0", 0]]),
      renderGraph: { getParent: () => { throw new Error("renderGraph was cleared after the submitted frame"); } },
      get frustumCullingResults() { return [nodes.map((node) => node.getComponent("cc.SkinnedMeshRenderer").model)]; },
    } } } }, device: {
    memoryStatus: { bufferSize: 100, textureSize: 200 }, numDrawCalls: 10, numTris: 1000, numInstances: 600, getFormatFeatures: () => 2,
  } } });
  const entries = [["chunks/a", { ViewMgr: {} }], ["chunks/b", { spikeSession: session }], ["chunks/c", { rawInput: { inspect: () => ({}) } }]] as const;
  const context = vm.createContext({ System: { entries: () => entries, import: async (url: string) => entries.find(([key]) => key === url)![1] },
    cc: { director, Director: { EVENT_AFTER_DRAW: "draw" }, Layers: { Enum: {} },
      gfx: { Format: { RGBA32F: 44, RGBA8: 35, 44: "RGBA32F", 35: "RGBA8" }, FormatFeatureBit: { SAMPLED_TEXTURE: 2 } } },
    document: { hidden: false, visibilityState: "visible" }, navigator: { userAgent: "test", platform: "test" },
    performance: { now: () => 1 }, setTimeout, clearTimeout,
  });
  const installed = transported(await vm.runInContext(createStage3dHarnessSource("snake"), context));
  const invoke = async (group: string, index: number): Promise<any> => {
    const pending = vm.runInContext(`__stage3dProbeHarness.switchSkinning(${JSON.stringify(group)},${index})`, context);
    assert.equal(director.listenerCount("draw"), 1, "switch must wait for actual AFTER_DRAW observations");
    director.emit("draw"); director.emit("draw");
    assert.equal(director.listenerCount("draw"), 1);
    director.emit("draw");
    const result = transported(await pending);
    assert.equal(director.listenerCount("draw"), 0);
    return result;
  };
  const realtime = async (enabled: boolean): Promise<any> => {
    const pending = vm.runInContext(`__stage3dProbeHarness.switchRealtime(${enabled})`, context);
    assert.equal(director.listenerCount("draw"), 1);
    director.emit("draw"); director.emit("draw"); director.emit("draw");
    return transported(await pending);
  };
  const advance = (delta: number): any => {
    nodes[99]!.getComponent("cc.SkeletalAnimation").time += delta;
    targetRenderer.model._dataArray[0][0] += delta;
    return transported(vm.runInContext("__stage3dProbeHarness.snapshot()", context));
  };
  return { before: installed.baseline, invoke, realtime, advance, queried, context, directQueue };
}

test("stage3d observes the same actual instance switch texture and material pass, then rejoin the main atlas", async () => {
  const h = await skinningHarness();
  assert.equal(h.before.bipeds, 100, "CrossAtlas is part of the required 100 main-prefab instances");
  const alternate0 = await h.invoke("atlasB", 0);
  const alternate1 = await h.invoke("atlasB", 1);
  const restored = await h.invoke("main", 0);
  const result = assertStage3dSkinningTransition(h.before, alternate0, alternate1, restored);
  assert.deepEqual(result.phases[0].mainClipCounts, [{ name: "sway", count: 50 }, { name: "bow", count: 49 }]);
  assert.equal(result.phases[0].mainTextureId, result.phases[3].targetTextureId);
  assert.notEqual(result.phases[0].mainTextureId, result.phases[1].targetTextureId);
  assert.equal(result.phases[1].targetTextureId, result.phases[2].targetTextureId);
  assert.deepEqual(result.phases[0].textureFormatNames, ["RGBA32F"]);
  assert.equal(h.before.environment.skinningCapabilities.rgba32fSampled, true);
  assert.ok(h.queried.includes("cc.SkeletalAnimation") && h.queried.includes("cc.SkinnedMeshRenderer"));
  assert.equal(h.before.animation.skinningInstances[99].renderers[0].subModels[0].boundTextureId, result.phases[0].mainTextureId);
});

test("stage3d skinning rejects layout-only success, stale GPU bindings, unsplit material passes and replaced instances", async () => {
  const h = await skinningHarness();
  const phases = [h.before, await h.invoke("atlasB", 0), await h.invoke("atlasB", 1), await h.invoke("main", 0)];
  const target = (state: any) => state.animation.skinningInstances[99];
  const cases: Array<(values: any[]) => void> = [
    (values) => { values[0].animation.skinningInstances[1].renderers[0].texture.id = 999; },
    (values) => { target(values[1]).renderers[0].uploadedClip.hash = 11; },
    (values) => { target(values[1]).renderers[0].sampledClip.hash = 11; },
    (values) => { target(values[1]).renderers[0].subModels[0].boundTextureId = target(values[0]).renderers[0].texture.id; },
    (values) => { target(values[1]).renderers[0].subModels[0].passes[0].id = target(values[0]).renderers[0].subModels[0].passes[0].id; },
    (values) => { target(values[1]).renderers[0].subModels[0].passes[0].batchingScheme = 0; },
    (values) => { target(values[1]).id = 999; },
    (values) => { target(values[1]).renderers[0].modelId = 999; },
    (values) => { target(values[2]).renderers[0].texture.id = 999; target(values[2]).renderers[0].subModels[0].boundTextureId = 999; },
    (values) => { target(values[2]).renderers[0].subModels[0].passes[0].id = 999; },
    (values) => { target(values[3]).renderers[0].subModels[0].passes[0].id = 999; },
    (values) => { values[0].session.skinning = { ...values[0].session.skinning, mainClips: [{ name: "wrong", hash: 90 }, { name: "wrong2", hash: 91 }] }; },
  ];
  for (const corrupt of cases) {
    const mutated = transported(phases);
    corrupt(mutated);
    assert.throws(() => assertStage3dSkinningTransition(...mutated));
  }
  const missing = transported(h.before);
  missing.animation.skinningInstances.pop();
  assert.throws(() => assertStage3dSkinningPhase(missing), /100 observed/u);
});

test("stage3d skinning rejects actual cross-row joint textures and unaligned allocation offsets", async () => {
  const h = await skinningHarness();
  for (const [formatName, width, pixelsPerJoint] of [["RGBA32F", 72, 3], ["RGBA8", 144, 12]] as const) {
    const state = transported(h.before);
    for (const instance of state.animation.skinningInstances) for (const renderer of instance.renderers) {
      renderer.texture.formatName = formatName;
      renderer.texture.width = renderer.texture.height = width;
      renderer.jointTexturePixelOffset = pixelsPerJoint * 2;
    }
    assert.doesNotThrow(() => assertStage3dSkinningPhase(state));
    const brokenWidth = transported(state);
    brokenWidth.animation.skinningInstances[99].renderers[0].texture.width = formatName === "RGBA32F" ? 64 : 128;
    assert.throws(() => assertStage3dSkinningPhase(brokenWidth), /splits.*joint records.*rows/u);
    for (const offset of [undefined, null, -1, 0.1, pixelsPerJoint + 1]) {
      const brokenOffset = transported(state);
      brokenOffset.animation.skinningInstances[99].renderers[0].jointTexturePixelOffset = offset;
      assert.throws(() => assertStage3dSkinningPhase(brokenOffset), /pixel offset.*aligned/u);
    }
  }
});

test("stage3d observes real non-instanced model, descriptor UBO, direct draws and advancing matrices then restores shared baked bindings", async () => {
  const h = await skinningHarness();
  const realtime = await h.realtime(true);
  const proof = assertStage3dRealtimePhase(realtime);
  assert.equal(proof.renderers[0].modelType, "SkinningModel");
  assert.equal(proof.renderers[0].texture, null);
  assert.deepEqual(proof.renderers[0].subModels[0].batchingSchemes, [0, 0, 0, 0, 0, 0], "unused shadow/reflection/gbuffer passes must also disable instancing");
  assert.deepEqual(proof.renderers[0].subModels[0].scheduledPassIndices, [0]);
  assert.deepEqual(proof.renderers[0].subModels[0].directDrawPasses, [0], "only the scheduled phase should need a draw");
  const later = h.advance(0.2);
  assert.equal(assertStage3dRealtimeAdvancement(realtime, later).matricesChanged, true);
  const restored = await h.realtime(false);
  const result = assertStage3dRealtimeRestored(h.before, later, restored);
  assert.equal(result.bakedSiblingsUnchanged, 99);
  assert.equal(result.restoredBatchingScheme, 1);
  assert.equal(result.originalBindingsRestored, true);
  const changedSibling = transported(later);
  changedSibling.animation.skinningInstances[0].renderers[0].modelId++;
  assert.throws(() => assertStage3dRealtimeRestored(h.before, changedSibling, restored), /another baked instance/u);
});

test("stage3d realtime evidence rejects configuration-only success, stale UBOs, missing direct draws and unchanging matrices", async () => {
  const h = await skinningHarness();
  const realtime = await h.realtime(true);
  const cases: Array<(target: any) => void> = [
    (target) => { target.animations[0].baked = true; },
    (target) => { target.renderers[0].modelType = "BakedSkinningModel"; },
    (target) => { target.renderers[0].texture = { id: 1 }; },
    (target) => { target.renderers[0].realtime.buffers = []; },
    (target) => { target.renderers[0].realtime.jointMatrices = []; },
    (target) => { target.renderers[0].subModels[0].passes[0].batchingScheme = 1; },
    (target) => { target.renderers[0].subModels[0].passes[5].batchingScheme = 1; },
    (target) => { target.renderers[0].subModels[0].scheduledPassIndices = []; },
    (target) => { target.renderers[0].subModels[0].boundSkinningBufferId++; },
    (target) => { target.renderers[0].subModels[0].nonInstancedDrawPasses = []; },
  ];
  for (const corrupt of cases) {
    const copy = transported(realtime); corrupt(copy.animation.skinningInstances[99]);
    assert.throws(() => assertStage3dRealtimePhase(copy), /Realtime skinning/u);
  }
  const sameMatrices = transported(realtime);
  sameMatrices.animation.skinningInstances[99].animations[0].playing[0].time += 0.2;
  assert.throws(() => assertStage3dRealtimeAdvancement(realtime, sameMatrices), /matrices must advance/u);
  h.directQueue.camera = {};
  assert.throws(() => assertStage3dRealtimePhase(h.advance(0.1)), /stage non-instanced draw queue/u);
  const shadowOnly = await skinningHarness();
  await shadowOnly.realtime(true);
  shadowOnly.directQueue.sceneFlags |= 2;
  assert.throws(() => assertStage3dRealtimePhase(shadowOnly.advance(0.1)), /stage non-instanced draw queue/u);
});

test("stage3d numeric summary preserves evidence, frame intervals and actual groups without raw DOM/full instance snapshots", async () => {
  const skin = await skinningHarness();
  const sampler = harness();
  const pending = sampler.sample({ warmupFrames: 0, sampleFrames: 2 });
  sampler.frame(10); sampler.frame(30); sampler.frame(1230);
  const raw = transported(await pending);
  const alternate0 = await skin.invoke("atlasB", 0), alternate1 = await skin.invoke("atlasB", 1), restored = await skin.invoke("main", 0);
  const realtime = await skin.realtime(true), later = skin.advance(0.2), bakedAgain = await skin.realtime(false);
  const report: any = { scenario: "stage3d-fixture", startedAt: "2026-09-22T00:00:00Z", finishedAt: "2026-09-22T00:00:05Z",
    executedOk: false, ok: false, exitCode: 1, sc0Exit: false, pending: [{ name: "visual", reason: "review pending" }],
    steps: [{ name: "cross-atlas", status: "passed", startedAt: "2026-09-22T00:00:01Z", finishedAt: "2026-09-22T00:00:03Z",
      detail: { hiddenRawPayload: "RAW_STEP_SENTINEL", fullSnapshot: skin.before } },
    { name: "modal", status: "failed", error: "wrong DOM target", startedAt: "2026-09-22T00:00:03Z", finishedAt: "2026-09-22T00:00:04Z" }],
    bootstrap: { baseline: skin.before }, environment: skin.before.environment, error: "wrong DOM target",
    performance: { raw, summary: aggregateStage3dSampling(raw) }, startupPerformance: { raw, readyAtMs: 20 },
    skinning: { phases: { main: skin.before, alternate0, alternate1, restored }, visualReview: "pending", errors: [],
      transition: assertStage3dSkinningTransition(skin.before, alternate0, alternate1, restored), screenshots: { main: "001-main.png" } },
    realtimeSkinning: { phases: { realtime, later, restored: bakedAgain }, proof: assertStage3dRealtimePhase(realtime),
      advancement: assertStage3dRealtimeAdvancement(realtime, later), restoration: assertStage3dRealtimeRestored(restored, later, bakedAgain),
      visualReview: "pending", errors: [], screenshots: { realtime: "002-realtime.png" } },
    prewarm: { note: "stable", baseline: skin.before, closes: [skin.before] }, cycles: [{ cycle: 1, opened: skin.before, closed: skin.before }],
    finalState: skin.before,
    touchTransport: { policy: "real DOM required", commands: [{ command: { type: "touchEnd", touchPoints: [{ id: 903, x: 123 }] },
      expectedChangedIds: [903], events: [{ changed: [{ id: 901, x: "RAW_DOM_SENTINEL" }] }], status: "failed", error: "wrong pointer" }],
      domEvents: [{ type: "touchend", changed: [{ id: 901 }] }] },
    console: [{ level: "warn", text: "warning", at: 1 }, { level: "error", text: "engine failure", at: 2 }],
  };
  const previous = transported(report);
  const summary = createStage3dProbeSummary(report, { reportPath: "/local/stage3d/report.json", reportSha256: "a".repeat(64) });
  assert.deepEqual(transported(report), previous, "summarizing cannot mutate the local raw evidence");
  assert.equal(summary.durationMs, 5000);
  assert.equal(summary.steps[0].durationMs, 2000);
  assert.equal(summary.executedOk, false);
  assert.equal(summary.error, "wrong DOM target");
  assert.deepEqual(summary.performance.rawFrameIntervalsMs, [20, 1200]);
  assert.equal(summary.performance.frameIntervals.p95Ms, 1200);
  assert.equal(summary.startupPerformance.allFramesPeak.textureBytes, 200);
  assert.equal(summary.skinning.phases.main.instanceCount, 100);
  assert.equal(summary.skinning.phases.main.groups.length, 2, "two actual clips share the same texture/pass");
  assert.equal(summary.skinning.phases.alternate0.groups.length, 3, "alternate clip/texture/pass forms the third numeric group");
  assert.equal(summary.resources.cycles.length, 1);
  assert.equal(summary.realtimeSkinning.proof.renderers[0].modelType, "SkinningModel");
  assert.equal(summary.realtimeSkinning.advancement.matricesChanged, true);
  assert.equal(summary.realtimeSkinning.restoration.restoredBatchingScheme, 1);
  assert.deepEqual(summary.input.failedCommands[0].actualChangedIds, [901]);
  assert.equal(summary.console.severityCounts.error, 1);
  assert.equal(summary.console.severityCounts.warn, 1);
  const encoded = JSON.stringify(summary);
  for (const forbidden of ["RAW_DOM_SENTINEL", "RAW_STEP_SENTINEL", "skinningInstances", "touchPoints", "domEvents"]) assert.ok(!encoded.includes(forbidden), forbidden);
  assert.throws(() => createStage3dProbeSummary(report, { reportPath: "/local/report.json", reportSha256: "not-a-hash" }), /SHA256/u);
});

test("stage3d offline summary hashes exact report bytes and never copies the full report", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stage3d-summary-"));
  try {
    const reportPath = path.join(directory, "report.json"), summaryPath = path.join(directory, "summary.json");
    const bytes = '{ "scenario": "stage3d-fixture", "steps": [], "pending": [], "console": [], "rawPrivateSentinel": [1,2,3] }\n';
    fs.writeFileSync(reportPath, bytes);
    const summary = writeStage3dProbeSummary(reportPath, summaryPath);
    assert.equal(summary.evidence.reportSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(summary.evidence.reportPath, reportPath);
    assert.equal(fs.readFileSync(reportPath, "utf8"), bytes);
    assert.ok(!fs.readFileSync(summaryPath, "utf8").includes("rawPrivateSentinel"));
    assert.equal(JSON.parse(fs.readFileSync(summaryPath, "utf8")).kind, "stage3d-numeric-summary");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("stage3d fixed portrait metrics and touch support are configured before a fresh navigation without mobile UA/GPU claims", async () => {
  const sent: any[] = [];
  const client = { send: async (method: string, params: unknown) => sent.push({ method, params }),
    evaluate: async () => { throw new Error("fresh boot must not depend on a preexisting page layout"); } };
  const result = await prepareStage3dViewport(client, false);
  assert.deepEqual(sent, [
    { method: "Emulation.setDeviceMetricsOverride", params: { width: 375, height: 812, deviceScaleFactor: 2, mobile: false } },
    { method: "Emulation.setTouchEmulationEnabled", params: { enabled: true, maxTouchPoints: 5 } },
  ]);
  assert.equal(result.actual, null, "requested dimensions are not reported as observed dimensions");
  assert.equal(result.valid, null);
  assert.equal(STAGE3D_VIEWPORT.mobile, false);
});

test("stage3d reused Snake viewport is read-only and mismatching boot layout cannot be repaired silently", async () => {
  const actual = { window: { width: 375, height: 812, dpr: 2 },
    canvas: { x: 0, y: 0, width: 375, height: 812, backingWidth: 750, backingHeight: 1624 },
    preview: { device: "WebpageFullScreen", rotated: false }, cc: { visible: { width: 750, height: 1624 } } };
  const client = { evaluate: async () => actual, send: async () => { throw new Error("reused viewport must never be mutated"); } };
  assert.equal((await prepareStage3dViewport(client, true)).valid, true);
  const variations = [
    (value: any) => { value.window.width = 1280; },
    (value: any) => { value.window.dpr = 1; },
    (value: any) => { value.cc.visible.height = 700; },
    (value: any) => { value.canvas.height = 750; },
    (value: any) => { value.canvas.y = 47; },
    (value: any) => { value.canvas.backingHeight = 1530; },
    (value: any) => { value.preview.device = "Default"; },
    (value: any) => { value.preview.rotated = true; },
  ];
  for (const change of variations) {
    const mismatch = transported(actual); change(mismatch);
    const result = await prepareStage3dViewport({ ...client, evaluate: async () => mismatch }, true);
    assert.equal(result.valid, false);
    assert.ok(/viewport|layout mismatch|Creator preview/u.test(result.error));
  }
});

test("stage3d viewport diagnostics read actual window, canvas backbuffer and Cocos visible dimensions", () => {
  const context = vm.createContext({
    window: { innerWidth: 375, innerHeight: 812, devicePixelRatio: 2, visualViewport: { width: 375, height: 812, scale: 1 } },
    document: { getElementById: (id: string) => ({
      GameCanvas: { width: 750, height: 1624, getBoundingClientRect: () => ({ x: 0, y: 0, width: 375, height: 812 }) },
      "view-select": { getAttribute: () => "WebpageFullScreen" }, "btn-rotate": { classList: { contains: () => false } },
    } as Record<string, unknown>)[id] ?? null,
    querySelector: () => ({ getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }) }) },
    getComputedStyle: () => ({ display: "none" }),
    cc: { view: { getVisibleSize: () => ({ width: 750, height: 1624 }), getDesignResolutionSize: () => ({ width: 750, height: 1334 }),
      getFrameSize: () => { throw new Error("do not query deprecated size APIs"); }, getDevicePixelRatio: () => { throw new Error("do not query deprecated DPR APIs"); } },
    screen: { windowSize: { width: 750, height: 1624 }, devicePixelRatio: 2 } },
  });
  const actual = transported(vm.runInContext(createStage3dViewportSource(), context));
  assert.equal(assertStage3dViewport(actual), actual);
  assert.equal(actual.canvas.backingHeight, 1624);
  assert.equal(actual.cc.design.height, 1334, "actual design dimensions must not be replaced by the requested viewport");
  assert.deepEqual(actual.cc.screenPixels, { width: 750, height: 1624 });
  assert.deepEqual(actual.preview, { device: "WebpageFullScreen", rotated: false, toolbar: { x: 0, y: 0, width: 0, height: 0, hidden: true } });
});

test("stage3d explicit tab reuse rejects ambiguous, non-page, wrong-origin and prefix-only targets", () => {
  const options = parseStage3dProbeArgs(["--mode", "snake", "--reuse", "--tab", "snake-page"]);
  assert.equal(options.tabId, "snake-page");
  assert.throws(() => parseStage3dProbeArgs(["--tab", "snake-page"]), /requires --reuse/u);
  const tabs = [
    { id: "fixture-page", type: "page", url: "http://127.0.0.1:7457/?scene=fixture", webSocketDebuggerUrl: "ws://127.0.0.1:9222/fixture" },
    { id: "snake-page", type: "page", url: "http://127.0.0.1:7457/?scene=snake", webSocketDebuggerUrl: "ws://127.0.0.1:9222/snake" },
    { id: "worker", type: "worker", url: "http://127.0.0.1:7457/", webSocketDebuggerUrl: "ws://127.0.0.1:9222/worker" },
    { id: "wrong-port", type: "page", url: "http://127.0.0.1:74570/", webSocketDebuggerUrl: "ws://127.0.0.1:9222/wrong-port" },
    { id: "no-websocket", type: "page", url: "http://127.0.0.1:7457/" },
  ];
  assert.deepEqual(selectStage3dReuseTab(tabs, options), { id: "snake-page", wsUrl: "ws://127.0.0.1:9222/snake", created: false });
  assert.throws(() => selectStage3dReuseTab(tabs, { ...options, tabId: null }), /exact page/u);
  for (const tabId of ["missing", "worker", "wrong-port"]) assert.throws(() => selectStage3dReuseTab(tabs, { ...options, tabId }), /must identify a page/u);
  assert.throws(() => selectStage3dReuseTab(tabs, { ...options, tabId: "no-websocket" }), /no CDP websocket/u);
  assert.throws(() => selectStage3dReuseTab(tabs, { ...options, reuse: false }), /requires --reuse/u);
  const onlyOne = selectStage3dReuseTab(tabs.slice(0, 1), { ...options, tabId: null });
  assert.equal(onlyOne.id, "fixture-page");
  const paths = [{ ...tabs[1], url: "http://127.0.0.1:7457/preview-other" }];
  assert.throws(() => selectStage3dReuseTab(paths, { ...options, preview: "http://127.0.0.1:7457/preview" }), /must identify a page/u);
});

test("stage3d isolated CDP ports preserve explicit Snake page handoff", () => {
  for (const port of [9224, 9225]) {
    const options = parseStage3dProbeArgs(["--mode", "snake", "--reuse", "--tab", `snake-${port}`,
      "--devtools", `http://127.0.0.1:${port}`, "--preview", "http://127.0.0.1:7457"]);
    assert.equal(options.devtools, `http://127.0.0.1:${port}`);
    const tabs = [{ id: `snake-${port}`, type: "page", url: "http://127.0.0.1:7457/?scene=snake",
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/snake-${port}` }];
    assert.equal(selectStage3dReuseTab(tabs, options).id, `snake-${port}`);
    assert.throws(() => selectStage3dReuseTab(tabs, { ...options, tabId: "other-browser-page" }), /must identify a page/u);
  }
});

function ownedBootEvidence() {
  let now = 1010;
  const request = { tabId: "owned-tab", expectedWebgl: 1, preview: "http://127.0.0.1:7457" };
  const session = { skinning: null, ready: false, businessRefs: 0, nodeCount: 0 };
  const loaded = new Map<string, unknown>(), fixtureUuids = ["a", "b", "c", "d"];
  const context: any = vm.createContext({ performance: { timeOrigin: 1000, now: () => now - 1000 }, Date: { now: () => now }, location: { href: "http://127.0.0.1:7457/?scene=main" },
    System: { entries: () => [["chunk", { spikeSession: session }]] } });
  vm.runInContext(createStage3dOwnedBootSource(request), context);
  context.cc = { director: { getScene: () => ({ uuid: "main" }), root: { device: { constructor: { name: "WebGLDevice" },
    gl: { VERSION: 1, getParameter: () => "WebGL 1.0" } }, pipeline: { constructor: { name: "WebPipeline" } } } }, assetManager: { assets: loaded } };
  now = 2000;
  vm.runInContext(createStage3dOwnedBootInspectionSource(fixtureUuids, true), context);
  now = 5000;
  const read = () => transported(vm.runInContext(createStage3dOwnedBootInspectionSource(fixtureUuids), context));
  return { request, read, context, loaded, session };
}

test("stage3d owned Snake boot captures pre-engine provenance and a real completion bound for exact-tab reuse", () => {
  const h = ownedBootEvidence(), evidence = h.read();
  const result = assertStage3dOwnedBoot(evidence, h.request);
  assert.equal(result.coldBoot, true);
  assert.equal(result.bootStartedAtEpochMs, 1000);
  assert.equal(result.bootCompletedAtEpochMs, 2000);
  assert.equal(result.firstFixtureLoadStartedAtEpochMs, null, "Snake does not pretend to have loaded the fixture");
  assert.equal(evidence.marker.installedBeforeCocos, true);
  h.loaded.set("a", {});
  assert.throws(() => assertStage3dOwnedBoot(h.read(), h.request), /fixture was loaded/u);
  h.loaded.clear(); h.session.ready = true;
  assert.throws(() => assertStage3dOwnedBoot(h.read(), h.request), /fixture was loaded/u);
});

test("stage3d boot provenance rejects old helpers, guessed GL, stale navigation, wrong tabs and unavailable fixture state", () => {
  const h = ownedBootEvidence(), evidence = h.read();
  const corruptions: Array<(value: any) => void> = [
    (value) => { value.marker = null; }, (value) => { value.marker.completed = null; },
    (value) => { value.marker.installedBeforeCocos = false; }, (value) => { value.marker.tabId = "another"; },
    (value) => { value.marker.expectedWebgl = 2; }, (value) => { value.observed.timeOrigin++; },
    (value) => { value.marker.completed.timeOrigin--; }, (value) => { value.marker.completed.atEpochMs = 1000; },
    (value) => { value.observed.webgl = 2; }, (value) => { value.observed.pipeline = "unknown"; },
    (value) => { value.observed.url = "http://127.0.0.1:7456/"; }, (value) => { value.marker.completed.loadedFixtureUuids = ["a"]; },
    (value) => { value.observed.fixtureSessionUntouched = false; }, (value) => { value.marker.fixtureLoadStartedAtEpochMs = 3000; },
  ];
  for (const corrupt of corruptions) { const changed = transported(evidence); corrupt(changed); assert.throws(() => assertStage3dOwnedBoot(changed, h.request), /boot provenance/u); }
  assert.throws(() => assertStage3dOwnedBoot(evidence, { ...h.request, expectedWebgl: null }), /explicit expected WebGL/u);
  assert.throws(() => createStage3dOwnedBootSource({ ...h.request, expectedWebgl: null }), /explicit --expect-webgl/u);
  assert.throws(() => createStage3dOwnedBootInspectionSource(["a"]), /Four actual/u);
});

function framingEvidence() {
  class Vector {
    constructor(public x: number, public y: number, public z: number) {}
  }
  const pass = { batchingScheme: 1, phaseID: 0 }, ia = { indexBuffer: { objectID: 11 }, vertexBuffers: [{ objectID: 12 }], instanceCount: 500 };
  const unusedPasses = Array.from({ length: 5 }, (_, index) => ({ batchingScheme: 1, phaseID: index + 1 }));
  const camera = { width: 750, height: 1624, viewport: { x: 0, y: 0, width: 1, height: 1 } };
  const component = { camera, node: { name: "Stage3dSpike.Camera", activeInHierarchy: true,
    worldPosition: { x: 0, y: 110, z: 145 }, worldRotation: { x: 0, y: 0, z: 0, w: 1 } },
    enabled: true, fov: 45, near: 0.1, far: 1000, visibility: 1,
    worldToScreen: (world: Vector) => {
      assert.ok(world instanceof Vector, "component API takes worldPos first");
      return { x: world.x + 375, y: world.y + 812, z: 0.5 + world.z / 100 };
    } };
  const models: any[] = [], cubes = Array.from({ length: 500 }, (_, index) => {
    const model = { enabled: true, worldBounds: { center: { x: index % 25, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      subModels: [{ passes: [pass, ...unusedPasses], inputAssembler: ia }] };
    models.push(model);
    const renderer = { enabled: true, node: { name: "CubeMesh", activeInHierarchy: true }, model };
    return { name: `Stage3dSpike.Cube.${index}`, children: [], getComponentsInChildren: (type: string) => type === "cc.MeshRenderer" ? [renderer] : [] };
  });
  const batch = { hasPendingModels: true, pass, instances: [{ count: 500, ia }] };
  const stageQueue = { camera, sceneFlags: 1, opaqueInstancingQueue: { instanceBuffers: [batch] }, transparentInstancingQueue: { instanceBuffers: [] } };
  const otherQueue = { ...stageQueue, camera: {}, opaqueInstancingQueue: { instanceBuffers: [{ ...batch, instances: [{ count: 999, ia: { ...ia, instanceCount: 999 } }] }] } };
  const culling = { renderQueueQueryIndex: new Map([[0, { renderQueueTarget: 0, lightBoundsCulledResultID: 0xffffffff, frustumCulledResultID: 0 }],
    [1, { renderQueueTarget: 1, lightBoundsCulledResultID: 0xffffffff, frustumCulledResultID: 1 }]]),
    renderQueues: [stageQueue, otherQueue], numRenderQueues: 2, frustumCullingResults: [models, models], lightBoundsCullingResults: [],
    kFilterMask: 2, kDrawMask: 1, renderQueueIndex: new Map([["0-4294967295-0", 0], ["1-4294967295-0", 1]]),
    renderGraph: { getParent: () => { throw new Error("renderGraph was cleared after the submitted frame"); } } };
  const scene = { name: "Scene", children: cubes, getComponentsInChildren: () => [component] };
  const context = vm.createContext({ cc: { Vec3: Vector, director: { getScene: () => scene,
    root: { pipeline: { _executor: { _context: { culling } } }, device: { numDrawCalls: 9, numTris: 16066, numInstances: 649 } } } },
    performance: { now: () => 100 } });
  return { read: () => transported(vm.runInContext(createStage3dFramingSource(), context)), culling, batch };
}

test("stage3d framing observes all eight actual bounds corners and only submitted stage-camera instancing", () => {
  const h = framingEvidence(), raw = h.read(), summary = assertStage3dFraming(raw);
  assert.equal(raw.cubes[0].renderers[0].corners.length, 8);
  assert.equal(raw.stageQueueCount, 1, "other-camera queues must not provide cube drawing evidence");
  assert.equal(raw.batches.length, 1);
  assert.equal(raw.cubes[0].renderers[0].bindings.length, 1, "unused five material phases are not scheduled draws");
  assert.equal(summary.visibleMeshes, 500);
  assert.equal(summary.submissions[0].submittedInstances, 500);
  assert.deepEqual(summary.camera.position, { x: 0, y: 110, z: 145 });
  h.culling.frustumCullingResults[0] = h.culling.frustumCullingResults[0].slice(1);
  assert.throws(() => assertStage3dFraming(h.read()), /absent from actual stage culling/u);
  const onlyShadow = framingEvidence();
  onlyShadow.culling.renderQueues[0]!.sceneFlags |= 2;
  assert.throws(() => assertStage3dFraming(onlyShadow.read()), /no submitted stage-camera/u);
  const onlyCached = framingEvidence();
  onlyCached.culling.numRenderQueues = 0;
  assert.throws(() => assertStage3dFraming(onlyCached.read()), /no submitted stage-camera/u);
});

test("stage3d framing fails cropped, behind-camera, disabled, missing-corner and underdrawn meshes", () => {
  const good = framingEvidence().read();
  const corruptions: Array<[(value: any) => void, RegExp]> = [
    [(value) => { value.cubes[499].renderers[0].corners[7].x = 750.01; }, /outside the stage camera/u],
    [(value) => { value.cubes[499].renderers[0].corners[7].z = -0.01; }, /outside the stage camera/u],
    [(value) => { value.cubes[0].renderers[0].corners.pop(); }, /8 actual/u],
    [(value) => { value.cubes[0].renderers[0].enabled = false; }, /disabled/u],
    [(value) => { value.batches[0].count = value.batches[0].uploadedInstanceCount = 499; }, /underdraw/u],
    [(value) => { value.batches[0].uploadedInstanceCount = 0; }, /uploaded instanced draw/u],
    [(value) => { value.batches[0].key = "another-mesh"; }, /uploaded instanced draw/u],
  ];
  for (const [change, expected] of corruptions) { const value = transported(good); change(value); assert.throws(() => assertStage3dFraming(value), expected); }
});

test("stage3d submitted phase keys survive cleared renderGraph and reject malformed, ambiguous or mismatched indices", () => {
  const h = framingEvidence();
  assert.equal(assertStage3dFraming(h.read()).submissions[0].submittedInstances, 500);
  assert.deepEqual(h.read().scheduledPhases, [{ queueId: 0, queueKey: "0-4294967295-0", phaseId: 0, culledModels: 500 }]);
  const invalid = ["bad-key", "0-4294967295-01", "0-4294967295-4294967296", "1-4294967295-0", "0-1-0"];
  for (const key of invalid) {
    const broken = framingEvidence();
    broken.culling.renderQueueIndex.delete("0-4294967295-0");
    broken.culling.renderQueueIndex.set(key, 0);
    assert.throws(() => broken.read(), /queue key/u, key);
  }
  const duplicate = framingEvidence();
  duplicate.culling.renderQueueIndex.set("0-4294967295-1", 0);
  assert.throws(() => duplicate.read(), /one exact retained queue key/u);
  const missing = framingEvidence();
  missing.culling.renderQueueIndex.delete("0-4294967295-0");
  assert.throws(() => missing.read(), /one exact retained queue key/u);
});

test("stage3d performance reset closes and reopens before independent framing and frame sampling", async () => {
  const calls: string[] = [], report: any = {}, raw = framingEvidence().read();
  const probe = { report, invoke: async (action: string) => {
    calls.push(action);
    return action === "close" ? { fixtureNodes: 0, session: { businessRefs: 0 } }
      : { session: { ready: true }, logic: { x: 0, y: 0, activePointers: 0 }, atMs: 90 };
  }, client: { evaluate: async () => { calls.push("framing"); return raw; } } };
  const reset = await resetStage3dPerformanceView(probe);
  assert.deepEqual(calls, ["close", "open", "framing"]);
  assert.equal(reset.summary.fullyProjectedCubes, 500);
  assert.equal(report.framing.before, reset);
  probe.invoke = async () => ({ fixtureNodes: 1, session: { businessRefs: 4 } } as any);
  await assert.rejects(() => resetStage3dPerformanceView(probe), /did not close/u);
});
