#!/usr/bin/env node
/** Offline SC0-B5 numeric evidence. Never connects to Creator/CDP or changes acceptance. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { aggregateStage3dSampling } from "./stage3d-sampling.mjs";

const copy = (value) => value === undefined ? null : structuredClone(value);
const pick = (value, keys) => value ? Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, copy(value[key])])) : null;
const duration = (start, end) => {
  const value = Date.parse(end) - Date.parse(start);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const compactState = (state) => state ? {
  ...pick(state, ["atMs", "loadStartedAtMs", "loadStartedAtEpochMs", "sceneUuid", "sceneName", "businessRefs",
    "instanceNodes", "sceneNodes", "cameraNodes", "runtimeLights", "lightmapGlobals", "camera", "gfx"]),
  assetRefs: (state.assets ?? []).map((asset) => pick(asset, ["uuid", "refCount", "valid"])),
  lifecycleEventCount: state.lifecycle?.length ?? 0,
} : null;

function compactSampling(entry) {
  if (!entry) return null;
  // Revalidate raw evidence; a stale precomputed p95 must not hide a long/invalid interval.
  const value = entry.raw ? aggregateStage3dSampling(entry.raw) : entry.summary;
  const frames = entry.raw?.frames;
  return {
    loadError: entry.loadError ?? null,
    rawAvailable: !!entry.raw,
    status: entry.raw?.status ?? null,
    captureValid: entry.raw?.valid ?? null,
    captureReasons: copy(entry.raw?.reasons),
    valid: value?.valid ?? null,
    reasons: copy(value?.reasons),
    clock: entry.raw?.clock ?? null,
    frameEvent: entry.raw?.frameEvent ?? null,
    options: copy(entry.raw?.options),
    startedAtMs: entry.raw?.startedAtMs ?? null,
    endedAtMs: entry.raw?.endedAtMs ?? null,
    visibilityChanges: entry.raw?.visibilityChanges ?? null,
    // Retain the observed numeric values even if independent aggregation rejects them.
    warmupFrameIntervalsMs: Array.isArray(frames) ? frames.filter((frame) => frame?.phase === "warmup").map((frame) => frame.intervalMs) : null,
    rawFrameIntervalsMs: Array.isArray(frames) ? frames.filter((frame) => frame?.phase === "sample").map((frame) => frame.intervalMs) : copy(value?.rawFrameIntervalsMs),
    frameIntervals: copy(value?.frameIntervals),
    allFramesPeak: copy(value?.allFramesPeak),
    lastFrame: pick(value?.lastFrame, ["seq", "phase", "atMs", "intervalMs", "engineDtMs", "gfx"]),
  };
}

function compactBindings(state) {
  return state ? (state.meshes ?? []).map((mesh) => ({
    ...pick(mesh, ["node", "meshUuid", "static", "active", "hasUv2", "bakeable", "uvParam", "textureUuid", "imageUuid",
      "imageNativeUrl", "width", "height", "modelLightmapUuid"]),
    materials: (mesh.materials ?? []).map((material) => pick(material, ["uuid", "effectName", "effectUuid", "passes"])),
    subModels: (mesh.subModels ?? []).map((subModel) => pick(subModel, ["lightmapBound", "macroPatches", "passes"])),
  })) : null;
}

/** Pure projection. Status, pending items and diagnostics are copied, never reclassified. */
export function createStage3dBakedSummary(report, evidence) {
  if (!report || report.schemaVersion !== 1 || report.scenario !== "stage3d-independent-baked-prefab") {
    throw new Error("Expected a schemaVersion 1 stage3d-independent-baked-prefab report");
  }
  if (typeof evidence?.reportPath !== "string" || !evidence.reportPath.trim()
    || !/^[a-f0-9]{64}$/u.test(evidence.reportSha256 ?? "")) {
    throw new Error("A local report path and exact SHA256 are required");
  }
  const artifacts = report.artifacts;
  const consoleEntries = report.console ?? [];
  const severityCounts = {};
  for (const entry of consoleEntries) severityCounts[entry.level] = (severityCounts[entry.level] ?? 0) + 1;
  return {
    schemaVersion: 1,
    kind: "stage3d-baked-numeric-summary",
    scenario: report.scenario,
    startedAt: report.startedAt ?? null,
    finishedAt: report.finishedAt ?? null,
    durationMs: duration(report.startedAt, report.finishedAt),
    options: copy(report.options),
    scope: report.scope ?? null,
    status: report.status ?? null,
    executedOk: report.executedOk ?? null,
    ok: report.ok ?? null,
    exitCode: report.exitCode ?? null,
    sc0Exit: report.sc0Exit ?? null,
    b5Complete: report.b5Complete ?? null,
    error: copy(report.error),
    cleanupError: copy(report.cleanupError),
    consoleReadError: copy(report.consoleReadError),
    pending: copy(report.pending ?? []),
    diagnostics: copy(report.diagnostics),
    consoleDiagnostics: copy(report.consoleDiagnostics),
    expectedBootDiagnostics: copy(report.expectedBootDiagnostics),
    console: copy(consoleEntries),
    consoleCounts: { total: consoleEntries.length, severityCounts },
    evidence: {
      reportPath: evidence.reportPath, reportSha256: evidence.reportSha256,
      storage: "local-only raw report and screenshots",
      note: "Exact raw JSON bytes are identified by SHA256. Summary generation neither approves visuals nor changes platform/B5/SC0 status.",
      authoringReference: copy(report.authoringReference),
      firstLoadScreenshot: copy(report.firstLoad?.screenshot),
      steadyStateScreenshot: copy(report.performance?.screenshot),
      finalScreenshot: copy(report.finalScreenshot),
      failureScreenshot: copy(report.failureScreenshot),
    },
    environment: copy(report.environment ?? report.bootstrap?.environment),
    browser: copy(report.browser),
    previewBinding: copy(report.previewBinding),
    artifacts: artifacts ? {
      ...pick(artifacts, ["project", "sourceReport", "sourceReportSha256", "exportedAt"]),
      prefab: pick(artifacts.prefab, ["file", "uuid", "resourcesPath", "sha256", "metaSha256"]),
      mainScene: pick(artifacts.mainScene, ["file", "uuid", "sha256"]),
      meshes: (artifacts.meshes ?? []).map((mesh) => pick(mesh, ["node", "meshUuid", "hasUv2", "bakeable", "uvParam", "textureUuid",
        "textureUrl", "imageUuid", "imageUrl", "pngSha256", "width", "height", "materialUuids"])),
      pngs: (artifacts.pngs ?? []).map((png) => pick(png, ["file", "sha256", "bytes", "metaSha256", "imageUuid", "textureUuid", "width", "height", "mipfilter"])),
    } : null,
    steps: (report.steps ?? []).map((step) => ({
      ...pick(step, ["name", "status", "startedAt", "finishedAt", "error", "pending", "diagnostics"]),
      durationMs: duration(step.startedAt, step.finishedAt),
      detailVerdict: pick(step.detail, ["status", "valid", "reasons", "pending", "diagnostics", "consoleDiagnostics"]),
    })),
    bootstrap: compactState(report.bootstrap),
    firstLoad: report.firstLoad ? { ...compactSampling(report.firstLoad), opened: compactState(report.firstLoad.opened), bindings: compactBindings(report.firstLoad.opened) } : null,
    performance: report.performance ? { ...compactSampling(report.performance), state: compactState(report.performance.state), bindings: compactBindings(report.performance.state) } : null,
    resources: {
      prewarm: report.prewarm ? { cachePolicy: report.prewarm.cachePolicy ?? null, baseline: compactState(report.prewarm.baseline),
        closes: (report.prewarm.closes ?? []).map(compactState) } : null,
      requestedCycles: report.options?.cycles ?? null,
      observedCycles: report.cycles?.length ?? 0,
      criterion: report.steps?.find((step) => step.name === "twenty-prefab-reference-and-node-lifecycles")?.detail?.criterion ?? null,
      cycles: (report.cycles ?? []).map((cycle) => ({ ...pick(cycle, ["cycle", "status", "error", "diagnostics"]),
        opened: compactState(cycle.opened), closed: compactState(cycle.closed) })),
    },
    cleanup: report.cleanup ? { ...pick(report.cleanup, ["cameraDestroyed", "remainingNodes", "status", "error", "diagnostics"]), closed: compactState(report.cleanup.closed) } : null,
  };
}

/** Writes a sidecar only. Refuse aliases of the raw report to protect original evidence. */
export function writeStage3dBakedSummary(reportPath, summaryPath) {
  const absoluteReport = fs.realpathSync(reportPath), output = path.resolve(summaryPath);
  const inputStat = fs.statSync(absoluteReport);
  if (fs.existsSync(output)) {
    const outputStat = fs.statSync(output);
    if (fs.realpathSync(output) === absoluteReport || (inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino)) {
      throw new Error("Summary output must not overwrite the raw report");
    }
  }
  const bytes = fs.readFileSync(absoluteReport);
  const summary = createStage3dBakedSummary(JSON.parse(bytes.toString("utf8")), {
    reportPath: absoluteReport, reportSha256: createHash("sha256").update(bytes).digest("hex"),
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export function parseStage3dBakedSummaryArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    if (["--help", "-h"].includes(argv[index])) return { help: true };
    const key = { "--report": "report", "--out": "out" }[argv[index]];
    if (!key || options[key] || !argv[index + 1] || argv[index + 1].startsWith("-")) throw new Error(`Unknown, duplicate or incomplete argument: ${argv[index]}`);
    options[key] = argv[++index];
  }
  if (!options.report || !options.out) throw new Error("--report FILE and --out FILE are required");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseStage3dBakedSummaryArgs(process.argv.slice(2));
    if (options.help) console.log("Usage: node tools/creator-preview/summarize-stage3d-baked.mjs --report FILE --out FILE\nOffline projection only; preserves pending/failed acceptance and original diagnostics.");
    else {
      const summary = writeStage3dBakedSummary(options.report, options.out);
      console.log(JSON.stringify({ summary: path.resolve(options.out), reportSha256: summary.evidence.reportSha256,
        executedOk: summary.executedOk, reportExitCode: summary.exitCode, b5Complete: summary.b5Complete }));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
