import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// @ts-expect-error The standalone pure ESM summary tool has no TypeScript declaration.
import { createStage3dBakedSummary, parseStage3dBakedSummaryArgs, writeStage3dBakedSummary } from "../../../tools/creator-preview/summarize-stage3d-baked.mjs";

const evidence = { reportPath: "/local/raw-report.json", reportSha256: "a".repeat(64) };
const gfx = { drawCalls: 3, triangles: 14, instances: 0, bufferBytes: 100, textureBytes: 200, totalBytes: 300 };
function capture(warmupFrames: number, intervals: number[]) {
  let atMs = 0;
  const frames = [{ seq: 1, phase: "anchor", atMs, intervalMs: null as number | null, engineDtMs: 16, gfx }];
  for (let index = 0; index < warmupFrames + intervals.length; index++) {
    const intervalMs = index < warmupFrames ? 16 : intervals[index - warmupFrames]!;
    atMs += intervalMs;
    frames.push({ seq: index + 2, phase: index < warmupFrames ? "warmup" : "sample", atMs, intervalMs,
      engineDtMs: 16, gfx: index === 0 ? { ...gfx, bufferBytes: 1000, totalBytes: 1200 } : gfx });
  }
  return { raw: { schemaVersion: 1, status: "completed", valid: true, clock: "performance.now", frameEvent: "Director.EVENT_AFTER_DRAW",
    options: { warmupFrames, sampleFrames: intervals.length, timeoutMs: 60000 }, startedAtMs: 0, endedAtMs: atMs,
    visibilityChanges: 0, reasons: [], frames }, summary: { frameIntervals: { maxMs: 16 } } };
}
function fixture(): any {
  const state = (open: boolean) => ({ atMs: 123, loadStartedAtMs: 100, loadStartedAtEpochMs: 1000000,
    sceneUuid: "main", sceneName: "scene", businessRefs: open ? 1 : 0, instanceNodes: open ? 3 : 0,
    sceneNodes: open ? 110 : 107, cameraNodes: 1, runtimeLights: 0, gfx,
    assets: open ? [{ uuid: "prefab", refCount: 1, valid: true }] : [],
    nodes: [{ name: "DO_NOT_COPY_FULL_SCENE" }], lifecycle: [{ event: "release" }],
    meshes: [{ node: "Plane", meshUuid: "mesh", imageUuid: "png", modelLightmapUuid: "texture", width: 1024, height: 1024,
      subModels: [{ lightmapBound: true, macroPatches: [{ name: "CC_USE_LIGHTMAP", value: 1 }], passes: 6 }] }],
  });
  const bootEntry = { level: "error", at: 900000, text: "This device does not support WebGL2" };
  const expectedBootDiagnostics = [{ index: 0, entry: bootEntry, reason: "precise-cold-boot-only" }];
  return {
    schemaVersion: 1, scenario: "stage3d-independent-baked-prefab", status: "awaiting-review", executedOk: true, ok: false,
    exitCode: 2, sc0Exit: false, b5Complete: false, pending: ["visual review", "other WebGL context"],
    startedAt: "2026-09-22T00:00:00Z", finishedAt: "2026-09-22T00:01:00Z", options: { cycles: 20, expectWebgl: 1 },
    environment: { webgl: 1, device: "WebGLDevice", pipeline: "WebPipeline", bootStartedAtEpochMs: 800000 },
    previewBinding: { project: "/isolated/apps/Cocos", pid: 12, previewPort: 7457, readySha256: "r" },
    artifacts: { project: "/isolated/apps/Cocos", sourceReportSha256: "s", prefab: { file: "p.prefab", sha256: "p", metaSha256: "m" },
      pngs: [{ file: "lightmap.png", sha256: "g", width: 1024, height: 1024 }], mainScene: { uuid: "main", scene: "DO_NOT_COPY_SERIALIZED_SCENE" } },
    console: [bootEntry], expectedBootDiagnostics,
    consoleDiagnostics: { ruleId: "cold-boot-rule", context: { expectedWebgl: 1 }, windowValid: true, expectedBootDiagnostics,
      unexpectedErrors: [], nonErrorCount: 0 }, diagnostics: { unresolved: ["visual"], original: true },
    authoringReference: { file: "author.png", sha256: "h", visualReview: "pending" },
    bootstrap: state(false), firstLoad: { ...capture(0, [20, 1200]), opened: state(true) },
    performance: { ...capture(60, Array.from({ length: 240 }, (_, i) => i === 10 ? 1200 : i === 0 ? 0 : 16)), state: state(true) },
    prewarm: { baseline: state(false), closes: [state(false)], cachePolicy: "no flushing" },
    cycles: Array.from({ length: 20 }, (_, index) => ({ cycle: index + 1, opened: state(true), closed: state(false) })),
    steps: [{ name: "fresh-real-main-scene", status: "passed", detail: { nodes: state(false).nodes } }],
    cleanup: { closed: state(false), cameraDestroyed: true, remainingNodes: 106 },
  };
}

test("B5 summary keeps pending/diagnostics, project/hash bindings, all 60+240 intervals and 20 closed cycles", () => {
  const raw = fixture(), before = structuredClone(raw);
  const summary = createStage3dBakedSummary(raw, evidence);
  assert.deepEqual(raw, before, "pure projection cannot modify the report");
  for (const key of ["status", "executedOk", "ok", "exitCode", "sc0Exit", "b5Complete", "pending", "console", "diagnostics", "consoleDiagnostics", "expectedBootDiagnostics"]) {
    assert.deepEqual(summary[key], raw[key], `preserve ${key}`);
  }
  assert.deepEqual(summary.previewBinding, raw.previewBinding);
  assert.equal(summary.artifacts.prefab.sha256, "p");
  assert.equal(summary.artifacts.pngs[0].sha256, "g");
  assert.equal(summary.evidence.authoringReference.visualReview, "pending");
  assert.deepEqual(summary.firstLoad.rawFrameIntervalsMs, [20, 1200]);
  assert.equal(summary.firstLoad.frameIntervals.p95Ms, 1200);
  assert.equal(summary.firstLoad.frameIntervals.maxMs, 1200);
  assert.equal(summary.performance.warmupFrameIntervalsMs.length, 60);
  assert.equal(summary.performance.rawFrameIntervalsMs.length, 240);
  assert.equal(summary.performance.rawFrameIntervalsMs[0], 0);
  assert.equal(summary.performance.frameIntervals.maxMs, 1200);
  assert.equal(summary.performance.allFramesPeak.bufferBytes, 1000, "keep warmup/initial allocation peaks");
  assert.equal(summary.performance.lastFrame.gfx.instances, 0);
  assert.equal(summary.firstLoad.opened.loadStartedAtEpochMs, 1000000);
  assert.equal(summary.resources.cycles.length, 20);
  for (const cycle of summary.resources.cycles) {
    assert.equal(cycle.closed.sceneNodes, 107); assert.equal(cycle.closed.instanceNodes, 0);
    assert.equal(cycle.closed.businessRefs, 0); assert.deepEqual(cycle.closed.gfx, gfx);
  }
  assert.equal(summary.firstLoad.bindings[0].subModels[0].lightmapBound, true);
  assert.equal(JSON.stringify(summary).includes("DO_NOT_COPY"), false);
});

test("B5 summary preserves historical GL1 failure and untruncated errors rather than reclassifying them", () => {
  const raw = fixture();
  raw.executedOk = false; raw.exitCode = 1;
  raw.error = "late runtime failure"; raw.cleanupError = "cleanup failure"; raw.consoleReadError = "read failure";
  raw.console.push({ level: "uncaught", at: 1000001, text: "x".repeat(3000) });
  raw.consoleDiagnostics.unexpectedErrors.push({ index: 1, entry: raw.console[1], reason: "after-first-load" });
  const summary = createStage3dBakedSummary(raw, evidence);
  assert.equal(summary.executedOk, false); assert.equal(summary.exitCode, 1);
  assert.equal(summary.console[1].text.length, 3000);
  assert.deepEqual(summary.consoleDiagnostics, raw.consoleDiagnostics);
  assert.equal(summary.error, raw.error); assert.equal(summary.cleanupError, raw.cleanupError);
  assert.equal(summary.consoleReadError, raw.consoleReadError);
});

test("B5 summary independently rejects altered intervals and retains partial failed-load evidence", () => {
  const raw = fixture(); raw.firstLoad.raw.frames[2].intervalMs = 16;
  const summary = createStage3dBakedSummary(raw, evidence);
  assert.equal(summary.firstLoad.valid, false);
  assert.ok(summary.firstLoad.reasons.includes("invalid-frame-interval"));
  assert.deepEqual(summary.firstLoad.rawFrameIntervalsMs, [20, 16]);
  const partial = { schemaVersion: 1, scenario: raw.scenario, error: "load failed", executedOk: false, exitCode: 1,
    firstLoad: { loadError: "missing png", raw: { ...raw.firstLoad.raw, status: "stopped", valid: false, reasons: ["load-failed"] } } };
  const failed = createStage3dBakedSummary(partial, evidence);
  assert.equal(failed.firstLoad.loadError, "missing png");
  assert.equal(failed.firstLoad.status, "stopped");
  assert.equal(failed.firstLoad.valid, false);
  assert.equal(failed.performance, null);
  assert.equal(failed.resources.prewarm, null);
});

test("B5 summary CLI hashes exact original bytes and refuses raw-report output aliases", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baked-summary-"));
  try {
    const reportPath = path.join(dir, "report.json"), out = path.join(dir, "nested", "summary.json");
    const bytes = Buffer.from(JSON.stringify(fixture(), null, 3) + "\n\n"); fs.writeFileSync(reportPath, bytes);
    const entry = fileURLToPath(new URL("../../../tools/creator-preview/summarize-stage3d-baked.mjs", import.meta.url));
    const result = JSON.parse(execFileSync(process.execPath, [entry, "--report", reportPath, "--out", out], { encoding: "utf8" }));
    const summary = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(summary.evidence.reportSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(summary.evidence.reportPath, fs.realpathSync(reportPath));
    assert.equal(result.reportExitCode, 2); assert.equal(summary.b5Complete, false);
    assert.deepEqual(fs.readFileSync(reportPath), bytes);
    assert.throws(() => writeStage3dBakedSummary(reportPath, reportPath), /overwrite the raw report/);
    const link = path.join(dir, "alias.json"); fs.linkSync(reportPath, link);
    assert.throws(() => writeStage3dBakedSummary(reportPath, link), /overwrite the raw report/);
    assert.equal(spawnSync(process.execPath, [entry, "--report", reportPath]).status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("B5 summary requires scenario, evidence hash and complete unambiguous CLI arguments", () => {
  assert.throws(() => createStage3dBakedSummary({}, evidence), /Expected a schemaVersion/);
  assert.throws(() => createStage3dBakedSummary(fixture(), { ...evidence, reportSha256: "wrong" }), /SHA256/);
  assert.deepEqual(parseStage3dBakedSummaryArgs(["--report", "raw.json", "--out", "small.json"]), { report: "raw.json", out: "small.json" });
  assert.deepEqual(parseStage3dBakedSummaryArgs(["--help"]), { help: true });
  for (const args of [[], ["--report"], ["--report", "r", "--out", "o", "--out", "x"], ["--unknown", "x"]]) {
    assert.throws(() => parseStage3dBakedSummaryArgs(args));
  }
});
