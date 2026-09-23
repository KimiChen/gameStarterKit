#!/usr/bin/env node
/** SC3-B5: real Creator Stage3dDevScene performance evidence, outside verify:all. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireTab, CdpClient, consoleHookSource, openScene, sceneUuidFromMeta, sleep } from "./lib.mjs";
import { STAGE3D_PREVIEW_DEVICE, STAGE3D_VIEWPORT } from "./probe-stage3d.mjs";
import { aggregateStage3dSampling, createStage3dSamplingSource, STAGE3D_SAMPLER_KEY, stopStage3dSamplingSource } from "./stage3d-sampling.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FRAME_PROBE = "__stage3dPerfFrameProbe";
const POPULATION = Object.freeze({ low: 0, medium: 300, high: 500 });

export function parseStage3dPerfArgs(argv) {
  const options = { preview: "http://127.0.0.1:7456", devtools: "http://127.0.0.1:9222", out: null,
    summary: null, quality: "high", expectWebgl: null, forceWebgl1: false, newWindow: false, bootTimeoutMs: 300_000 };
  const strings = { "--preview": "preview", "--devtools": "devtools", "--out": "out", "--summary": "summary", "--quality": "quality" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--perf") continue;
    if (arg === "--new-window") { options.newWindow = true; continue; }
    if (arg === "--force-webgl1") { options.forceWebgl1 = true; continue; }
    const key = strings[arg] ?? { "--expect-webgl": "expectWebgl", "--boot-timeout": "bootTimeoutMs" }[arg];
    if (!key) throw new Error(`Unknown --perf option: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    options[key] = strings[arg] ? value : Number(value);
  }
  if (!Object.hasOwn(POPULATION, options.quality)) throw new Error("--quality must be low, medium or high");
  if (options.expectWebgl !== null && ![1, 2].includes(options.expectWebgl)) throw new Error("--expect-webgl must be 1 or 2");
  if (options.forceWebgl1 && options.expectWebgl !== 1) throw new Error("--force-webgl1 requires --expect-webgl 1");
  if (!Number.isSafeInteger(options.bootTimeoutMs) || options.bootTimeoutMs <= 0) throw new Error("--boot-timeout must be a positive integer");
  for (const key of ["preview", "devtools"]) {
    const url = new URL(options[key]);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error(`${key} must use a loopback host`);
    options[key] = url.toString().replace(/\/$/u, "");
  }
  return options;
}

/** Self-contained page code; reads only the developer scene's public component and actual GFX device. */
function readPerfScene() {
  const scene = typeof cc === "undefined" ? null : cc.director?.getScene();
  const component = scene?.getComponentsInChildren("Stage3dDevScene")?.[0];
  if (!component) return { status: "missing" };
  const population = { requested: component.entitiesEnabled ? 500 : 0, admitted: component.entities.length,
    active: 0, pending: 0, hidden: 0, failed: 0 };
  for (const entity of component.entities) if (Object.hasOwn(population, entity.state)) population[entity.state]++;
  const device = cc.director.root?.device;
  const gl = device?.gl;
  const version = gl?.getParameter(gl.VERSION) ?? null;
  const rendererExtension = gl?.getExtension("WEBGL_debug_renderer_info");
  const canvas = document.getElementById("GameCanvas");
  const rect = canvas?.getBoundingClientRect();
  const quality = component.stage?.quality ?? null;
  let sceneNodes = 0;
  const visit = (node) => { sceneNodes++; for (const child of node.children) visit(child); };
  visit(scene);
  return { status: component.status, error: component.error, population, quality,
    sceneNodes,
    environment: { userAgent: navigator.userAgent, webgl: typeof version === "string" && /WebGL 2/u.test(version) ? 2
      : typeof version === "string" && /WebGL 1/u.test(version) ? 1 : null,
      glVersion: version, gpu: rendererExtension ? gl.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL) : null,
      device: device?.constructor?.name ?? null, pipeline: cc.director.root?.pipeline?.constructor?.name ?? null,
      previewDevice: document.getElementById("view-select")?.getAttribute("value") ?? null,
      viewport: { cssWidth: rect?.width ?? null, cssHeight: rect?.height ?? null,
        backingWidth: canvas?.width ?? null, backingHeight: canvas?.height ?? null, dpr: window.devicePixelRatio } },
    gfx: device ? { drawCalls: device.numDrawCalls, triangles: device.numTris, instances: device.numInstances,
      bufferBytes: device.memoryStatus?.bufferSize, textureBytes: device.memoryStatus?.textureSize } : null };
}

function installPerfFrameProbe(key) {
  const component = cc.director.getScene()?.getComponentsInChildren("Stage3dDevScene")?.[0];
  if (!component) throw new Error("Stage3dDevScene component is unavailable");
  globalThis[key] = () => {
    const population = { admitted: component.entities.length, active: 0, pending: 0, hidden: 0, failed: 0 };
    for (const entity of component.entities) if (Object.hasOwn(population, entity.state)) population[entity.state]++;
    return population;
  };
  return true;
}

function setPerfEntities(enabled) {
  const component = cc.director.getScene()?.getComponentsInChildren("Stage3dDevScene")?.[0];
  if (!component || component.status !== "ready") throw new Error("Stage3dDevScene is not ready");
  component.setEntitiesEnabled(enabled);
  return component.entities.length;
}

const sceneSource = `(${readPerfScene.toString()})()`;
const entitySource = (enabled) => `(${setPerfEntities.toString()})(${JSON.stringify(enabled)})`;
const validWindow = (raw) => {
  const summary = aggregateStage3dSampling(raw);
  if (!summary.valid) {
    const error = new Error(`Invalid real-frame window: ${summary.reasons.join(", ")}`);
    error.invalidWindow = { raw, summary };
    throw error;
  }
  return { raw, summary };
};

/** Reject auxiliary-dt-only, truncated, hidden, mixed-unit or fabricated sequence reports. */
export function aggregateStage3dPerfEvidence(perf) {
  if (!perf?.activation?.raw || !perf?.steady?.raw || !perf?.memory) throw new Error("raw activation, steady and memory evidence required");
  const activation = validWindow(perf.activation.raw);
  const steady = validWindow(perf.steady.raw);
  if (activation.raw.options.warmupFrames !== 0 || activation.raw.options.sampleFrames < 60
    || steady.raw.options.warmupFrames !== 60 || steady.raw.options.sampleFrames !== 240) {
    throw new Error("--perf requires activation raw frames and 60 warmup + 240 measured frames");
  }
  for (const [name, capture] of [["activation", activation], ["steady", steady]]) {
    if (capture.raw.frames.some((frame) => !frame.extra || !Number.isSafeInteger(frame.extra.active)
      || !Number.isSafeInteger(frame.extra.admitted))) throw new Error(`${name} population sequence missing`);
  }
  const before = perf.memory.prewarmedClosed?.gfx, cycles = perf.memory.cycles;
  if (!before || !Array.isArray(cycles) || cycles.length !== 20) throw new Error("20 post-prewarm memory cycles required");
  for (const [index, cycle] of cycles.entries()) {
    const after = cycle.closed?.gfx;
    if (!after || ["bufferBytes", "textureBytes"].some((key) => !Number.isFinite(before[key])
      || !Number.isFinite(after[key]) || after[key] > before[key])) throw new Error(`Cycle ${index + 1}: GFX memory exceeds prewarmed closed baseline`);
    if (cycle.closed?.sceneNodes !== perf.memory.prewarmedClosed.sceneNodes
      || cycle.closed?.population?.admitted !== 0 || cycle.closed?.population?.active !== 0) {
      throw new Error(`Cycle ${index + 1}: closed nodes or business references differ from baseline`);
    }
  }
  const measured = steady.raw.frames.filter((frame) => frame.phase === "sample");
  const counters = (key) => { const values = measured.map((frame) => frame.gfx[key]); return { p50: percentile(values, 0.5),
    p95: percentile(values, 0.95), max: Math.max(...values), last: values.at(-1) }; };
  return { unit: { frame: "ms", gfxMemory: "bytes", drawCalls: "calls/frame", triangles: "triangles/frame", instances: "instances/frame" },
    clock: "performance.now", frameEvent: "Director.EVENT_AFTER_DRAW", sampleIndex: "independent seq; not root.frameCount",
    activation: { intervals: activation.summary.frameIntervals, peak: activation.summary.allFramesPeak,
      firstActiveSeq: activation.raw.frames.find((frame) => frame.extra.active > 0)?.seq ?? null,
      peakActive: Math.max(...activation.raw.frames.map((frame) => frame.extra.active)) },
    steady: { intervals: steady.summary.frameIntervals, drawCalls: counters("drawCalls"), triangles: counters("triangles"),
      instances: counters("instances"), finalMemory: { bufferBytes: measured.at(-1).gfx.bufferBytes,
        textureBytes: measured.at(-1).gfx.textureBytes } },
    memory: { prewarmedClosed: before, finalClosed: cycles.at(-1).closed.gfx, cycles: cycles.length, stable: true } };
}

function percentile(values, fraction) {
  if (!values.length) throw new Error("No measured GFX values");
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
}

async function newPerfTab(options) {
  if (!options.newWindow) return acquireTab({ ...options, reuse: false });
  const browser = await (await fetch(`${options.devtools}/json/version`)).json();
  const control = await CdpClient.connect(browser.webSocketDebuggerUrl);
  let id;
  try { ({ targetId: id } = await control.send("Target.createTarget", { url: "about:blank", newWindow: true })); }
  finally { control.close(); }
  const target = (await (await fetch(`${options.devtools}/json`)).json()).find((entry) => entry.id === id);
  if (!target?.webSocketDebuggerUrl) throw new Error("New Chrome window has no CDP page endpoint");
  return { id, wsUrl: target.webSocketDebuggerUrl, created: true };
}

async function waitScene(client, accept, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  while (Date.now() < deadline) {
    state = await client.evaluate(sceneSource);
    if (state.status === "failed") throw new Error(`Stage3dDevScene failed: ${state.error}`);
    if (accept(state)) return state;
    await sleep(100);
  }
  throw new Error(`Stage3dDevScene population timeout: ${JSON.stringify(state?.population)}`);
}

async function capture(client, options, extra = true) {
  const raw = await client.evaluate(createStage3dSamplingSource(options, extra ? FRAME_PROBE : null));
  return validWindow(raw);
}

async function captureAfter(client, action, options) {
  const pending = client.evaluate(createStage3dSamplingSource(options, FRAME_PROBE));
  try {
    const deadline = Date.now() + 5_000;
    let installed = false;
    while (Date.now() < deadline) {
      installed = await client.evaluate(`typeof globalThis[${JSON.stringify(STAGE3D_SAMPLER_KEY)}]?.stop === "function"`);
      if (installed) break;
      await sleep(10);
    }
    if (!installed) throw new Error("Frame sampler did not subscribe before activation");
    await action();
    return validWindow(await pending);
  }
  catch (error) { await client.evaluate(stopStage3dSamplingSource("activation-failed")).catch(() => {}); await pending.catch(() => {}); throw error; }
}

export async function runStage3dPerf(options) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const out = path.resolve(options.out ?? path.join(os.tmpdir(), `stage3d-perf-${date}-${options.quality}`));
  fs.mkdirSync(out, { recursive: true });
  const report = { schemaVersion: 1, tool: "tools/creator-preview/perf.mjs", scenario: "stage3d",
    startedAt: new Date().toISOString(), options, ok: false, invalidWindows: [], perf: {} };
  let client;
  try {
    const tab = await newPerfTab(options);
    report.tab = { id: tab.id, created: tab.created };
    client = await CdpClient.connect(tab.wsUrl);
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", STAGE3D_VIEWPORT);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource });
    if (options.forceWebgl1) await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === "webgl2" ? null : get.call(this, type, ...args); };
    })()` });
    const sceneUuid = sceneUuidFromMeta(fs.readFileSync(path.join(ROOT, "apps/Cocos/assets/stage3d-dev.scene.meta"), "utf8"));
    await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs,
      query: { quality: options.quality, shadows: 0 }, ready: (walk) => walk.sceneName === "stage3d-dev" });
    report.ready = await waitScene(client, (state) => state.status === "ready");
    report.environment = report.ready.environment;
    report.quality = report.ready.quality;
    const viewport = report.environment.viewport;
    if (report.environment.previewDevice !== STAGE3D_PREVIEW_DEVICE || viewport.cssWidth !== 375 || viewport.cssHeight !== 812
      || viewport.backingWidth !== 750 || viewport.backingHeight !== 1624 || viewport.dpr !== 2) {
      throw new Error(`Creator must use native ${STAGE3D_PREVIEW_DEVICE} at 375x812 CSS / DPR 2: ${JSON.stringify(report.environment)}`);
    }
    if (report.environment.webgl !== options.expectWebgl && options.expectWebgl !== null) throw new Error("Actual WebGL context differs from --expect-webgl");
    if (report.quality?.tier !== options.quality) throw new Error(`Actual quality ${report.quality?.tier} differs from requested ${options.quality}`);
    await client.evaluate(`(${installPerfFrameProbe.toString()})(${JSON.stringify(FRAME_PROBE)})`);
    // First activation: preserve every raw interval, GFX counter and population count, including long frames.
    report.perf.activation = await captureAfter(client, () => client.evaluate(entitySource(true)),
      { warmupFrames: 0, sampleFrames: 120, timeoutMs: 60_000 });
    report.activated = await waitScene(client, (state) => state.population.active === POPULATION[options.quality]
      && state.population.pending === 0);
    report.perf.steady = await capture(client, { warmupFrames: 60, sampleFrames: 240, timeoutMs: 60_000 });
    await client.evaluate(entitySource(false));
    await capture(client, { warmupFrames: 60, sampleFrames: 1, timeoutMs: 30_000 }, false);
    report.perf.memory = { prewarmedClosed: await client.evaluate(sceneSource), cycles: [] };
    for (let index = 0; index < 20; index++) {
      await client.evaluate(entitySource(true));
      const opened = await waitScene(client, (state) => state.population.active === POPULATION[options.quality] && state.population.pending === 0);
      await client.evaluate(entitySource(false));
      await capture(client, { warmupFrames: 60, sampleFrames: 1, timeoutMs: 30_000 }, false);
      report.perf.memory.cycles.push({ index: index + 1, opened: { population: opened.population,
        sceneNodes: opened.sceneNodes, gfx: opened.gfx }, closed: await client.evaluate(sceneSource) });
    }
    report.perf.summary = aggregateStage3dPerfEvidence(report.perf);
    report.console = await client.evaluate("window.__creatorPreviewLogs || []");
    if (report.console.some((entry) => ["error", "uncaught", "rejection"].includes(entry.level))) throw new Error("Creator console contains runtime errors");
    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    if (error?.invalidWindow) report.invalidWindows.push(error.invalidWindow);
  }
  finally {
    if (client) {
      await client.evaluate(stopStage3dSamplingSource("perf-cleanup")).catch(() => {});
      if (!report.console) report.console = await client.evaluate("window.__creatorPreviewLogs || []").catch(() => []);
      client.close();
    }
    report.finishedAt = new Date().toISOString();
    const reportPath = path.join(out, "report.json");
    const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(reportPath, bytes);
    if (report.ok) {
      const webgl = report.environment.webgl;
      const summaryPath = path.resolve(options.summary ?? path.join(ROOT, "docs/perf/stage3d", `${date}-sc3-b5-${options.quality}-webgl${webgl}.json`));
      fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      const summary = { schemaVersion: 1, kind: "stage3d-perf", scenario: report.scenario, quality: report.quality,
        environment: report.environment, summary: report.perf.summary,
        raw: { path: reportPath, sha256: createHash("sha256").update(bytes).digest("hex"),
          activationFrames: report.perf.activation.raw.frames.length, steadyFrames: report.perf.steady.raw.frames.length },
        limitations: "Desktop Creator preview and greybox scene; not mobile or WeChat capacity evidence." };
      fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
      report.summaryPath = summaryPath;
    }
    return { report, reportPath, summaryPath: report.summaryPath ?? null };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseStage3dPerfArgs(process.argv.slice(2));
    if (options.help) console.log("Usage: node tools/creator-preview/run.mjs stage3d --perf [--quality low|medium|high] [--expect-webgl 1|2] [--force-webgl1] [--preview URL] [--new-window] [--out DIR]");
    else {
      const result = await runStage3dPerf(options);
      console.log(JSON.stringify({ ok: result.report.ok, report: result.reportPath, summary: result.summaryPath, error: result.report.error ?? null }));
      process.exitCode = result.report.ok ? 0 : 1;
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
