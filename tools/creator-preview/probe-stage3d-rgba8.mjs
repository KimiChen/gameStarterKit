#!/usr/bin/env node
/** Explicit WebGL1 float-capability FAULT INJECTION, not a naturally limited GPU/device.
 * Owns one fresh page only. No vendor edits, graphics-format overrides, browser launches,
 * backend launches, or changes to existing tabs. The real Creator engine must select RGBA8.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CdpClient, consoleHookSource, openScene, sceneUuidFromMeta, sleep } from "./lib.mjs";
import {
  parseStage3dProbeArgs, prepareStage3dViewport, runStage3dProbe, validateStage3dPrefabMetadata,
  assertStage3dClosedBaseline, assertStage3dRealtimePhase, assertStage3dRealtimeAdvancement, writeStage3dProbeSummary,
} from "./probe-stage3d.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FLOAT_FAULT_KEY = "__stage3dFloatCapabilityFaultInjection";
export const FLOAT_FAULT_KIND = "WebGL1 float-capability fault injection";
const SCOPE = "Native float support must be independently observed and is recorded separately. This owned page deliberately masks WebGL1 float texture/linear and dependent float color-buffer extensions before engine boot. Actual engine-selected RGBA8, absent RGBA32F sampled/render-target features and WebPipeline float-texture macro 0 are required; this is not natural low-end, WeChat, or mobile hardware evidence.";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

/** Serialized before any engine script. Keep originals in this closure; never patch a GFX format table. */
function installFloatCapabilityFault(key) {
  if (globalThis[key]) throw new Error("Float capability fault hook is already installed");
  if (typeof WebGLRenderingContext === "undefined") throw new Error("WebGL1 prototype is unavailable");
  const prototype = WebGLRenderingContext.prototype;
  const extensionDescriptor = Object.getOwnPropertyDescriptor(prototype, "getExtension");
  const supportedDescriptor = Object.getOwnPropertyDescriptor(prototype, "getSupportedExtensions");
  if (typeof extensionDescriptor?.value !== "function" || typeof supportedDescriptor?.value !== "function") throw new Error("Native WebGL1 extension methods are not observable");
  const nativeGetExtension = extensionDescriptor.value;
  const nativeGetSupportedExtensions = supportedDescriptor.value;
  // WEBGL_color_buffer_float independently sets RGBA32F RENDER_TARGET in
  // Creator 3.8.8. Leaving it enabled makes WebPipeline select its float shader
  // while JointTexturePool (SAMPLED_TEXTURE only) chooses byte textures.
  const isMasked = (name) => typeof name === "string" && /^(?:(?:WEBKIT|MOZ)_)?(?:OES_texture_float(?:_linear)?|(?:WEBGL|EXT)_color_buffer_float)$/iu.test(name);
  const isFloat = (name) => typeof name === "string" && /^(?:(?:WEBKIT|MOZ)_)?OES_texture_float$/iu.test(name);
  const isLinear = (name) => typeof name === "string" && /^(?:(?:WEBKIT|MOZ)_)?OES_texture_float_linear$/iu.test(name);
  const isFloatColorBuffer = (name) => typeof name === "string" && /^(?:(?:WEBKIT|MOZ)_)?(?:WEBGL|EXT)_color_buffer_float$/iu.test(name);
  let installed = true, nextContext = 0;
  const contexts = new WeakMap(), calls = [];
  const contextId = (context) => { if (!contexts.has(context)) contexts.set(context, ++nextContext); return contexts.get(context); };
  const installedAtMs = performance.now();
  const installedBeforeCocos = typeof cc === "undefined";
  function getExtension(name) {
    if (isMasked(name)) {
      calls.push({ atMs: performance.now(), contextId: contextId(this), method: "getExtension", name, returned: null });
      return null;
    }
    return Reflect.apply(nativeGetExtension, this, arguments);
  }
  function getSupportedExtensions() {
    const native = Reflect.apply(nativeGetSupportedExtensions, this, arguments);
    calls.push({ atMs: performance.now(), contextId: contextId(this), method: "getSupportedExtensions",
      removed: Array.isArray(native) ? native.filter(isMasked) : [] });
    return Array.isArray(native) ? native.filter((name) => !isMasked(name)) : native;
  }
  Object.defineProperty(prototype, "getExtension", { ...extensionDescriptor, value: getExtension });
  Object.defineProperty(prototype, "getSupportedExtensions", { ...supportedDescriptor, value: getSupportedExtensions });
  const inspect = (context) => {
    const webgl1 = context instanceof WebGLRenderingContext
      && !(typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext);
    if (!webgl1) throw new Error("Fault injection evidence requires an actual WebGL1 context; WebGL2 is refused");
    // The native support list is read through the saved function. This does not
    // enable a float extension, fabricate its absence, or query a patched GFX table.
    const nativeSupportedExtensions = Reflect.apply(nativeGetSupportedExtensions, context, []);
    const effectiveSupportedExtensions = context.getSupportedExtensions();
    const id = contextId(context);
    return { kind: "WebGL1 float-capability fault injection", installedAtMs, installedBeforeCocos, installed,
      maskActive: installed && prototype.getExtension === getExtension && prototype.getSupportedExtensions === getSupportedExtensions
        && context.getExtension === getExtension && context.getSupportedExtensions === getSupportedExtensions,
      contextId: id, nativeSupportedExtensions, effectiveSupportedExtensions,
      nativeFloatSupported: Array.isArray(nativeSupportedExtensions) && nativeSupportedExtensions.some(isFloat),
      nativeFloatLinearSupported: Array.isArray(nativeSupportedExtensions) && nativeSupportedExtensions.some(isLinear),
      nativeFloatRenderTargetSupported: Array.isArray(nativeSupportedExtensions) && nativeSupportedExtensions.some(isFloatColorBuffer),
      effectiveFloatSupported: Array.isArray(effectiveSupportedExtensions) && effectiveSupportedExtensions.some((name) => isFloat(name) || isLinear(name)),
      effectiveFloatRenderTargetSupported: Array.isArray(effectiveSupportedExtensions) && effectiveSupportedExtensions.some(isFloatColorBuffer),
      extensionQueries: calls.filter((call) => call.contextId === id),
      originals: { getExtension: "saved in private hook closure", getSupportedExtensions: "native function used for support-list evidence" },
    };
  };
  const restore = () => {
    // Do not overwrite an unrelated later patch. This page will be closed either way.
    if (prototype.getExtension !== getExtension || prototype.getSupportedExtensions !== getSupportedExtensions) {
      return { restored: false, reason: "WebGL1 prototype changed after this hook" };
    }
    Object.defineProperty(prototype, "getExtension", extensionDescriptor);
    Object.defineProperty(prototype, "getSupportedExtensions", supportedDescriptor);
    installed = false;
    return { restored: prototype.getExtension === nativeGetExtension && prototype.getSupportedExtensions === nativeGetSupportedExtensions };
  };
  globalThis[key] = { inspect, restore };
}

export function createFloatFaultSource() {
  return `(${installFloatCapabilityFault.toString()})(${JSON.stringify(FLOAT_FAULT_KEY)})`;
}

/** Browser observation: do not mutate cc, formats, capabilities, assets, animation, or textures. */
function inspectFloatFault(key, prefabUuids) {
  if (typeof cc === "undefined" || !cc.director?.root?.device) throw new Error("Real Creator GFX device is unavailable");
  const device = cc.director.root.device, gl = device.gl;
  const version = gl?.getParameter(gl.VERSION);
  if (!/WebGL 1/u.test(version ?? "")) throw new Error(`Exact WebGL1 required; observed ${version}`);
  const hook = globalThis[key];
  if (!hook || typeof hook.inspect !== "function") throw new Error("Pre-boot fault hook is missing");
  const format = cc.gfx?.Format, sampled = cc.gfx?.FormatFeatureBit?.SAMPLED_TEXTURE,
    renderTarget = cc.gfx?.FormatFeatureBit?.RENDER_TARGET;
  if (typeof sampled !== "number" || typeof renderTarget !== "number" || typeof format?.RGBA32F !== "number" || typeof format?.RGBA8 !== "number") throw new Error("Real engine format feature API unavailable");
  const rgba32fFeatures = device.getFormatFeatures(format.RGBA32F), rgba8Features = device.getFormatFeatures(format.RGBA8);
  const constantMacros = cc.director.root.pipeline?.constantMacros;
  const floatMacro = typeof constantMacros === "string"
    ? /^#define[ \t]+CC_DEVICE_SUPPORT_FLOAT_TEXTURE[ \t]+([01])[ \t]*$/mu.exec(constantMacros) : null;
  const scene = cc.director.getScene();
  return { ...hook.inspect(gl), glVersion: version, webgl: 1, sceneUuid: scene?.uuid,
    page: { url: location.href, visible: !document.hidden && document.visibilityState === "visible" },
    bootStartedAtEpochMs: performance.timeOrigin,
    engine: { device: device.constructor.name, rgba32fFormat: format.RGBA32F, rgba32fFeatures,
      rgba32fSampled: (rgba32fFeatures & sampled) !== 0, rgba32fRenderTarget: (rgba32fFeatures & renderTarget) !== 0,
      pipelineFloatTextureMacro: floatMacro ? Number(floatMacro[1]) : null,
      pipelineFloatTextureMacroLine: floatMacro?.[0] ?? null,
      pipelineFloatTextureMacroSource: "Creator 3.8.8 WebPipeline.constantMacros (read only)",
      rgba8Format: format.RGBA8, rgba8Features, rgba8Sampled: (rgba8Features & sampled) !== 0 },
    alreadyLoadedFixturePrefabs: prefabUuids.filter((uuid) => !!cc.assetManager.assets.get(uuid)) };
}

export function createFloatFaultInspectionSource(prefabUuids = []) {
  return `(${inspectFloatFault.toString()})(${JSON.stringify(FLOAT_FAULT_KEY)},${JSON.stringify(prefabUuids)})`;
}

export function assertFloatFaultBoot(observation, { requireCold = true } = {}) {
  assert(observation?.webgl === 1 && /WebGL 1/u.test(observation.glVersion ?? ""), "The fault-injection runner requires a real WebGL1 context");
  assert(observation.installedBeforeCocos === true && observation.maskActive === true, "The float mask must be active before Cocos boot");
  assert(observation.nativeFloatSupported === true, "Native float support must be observable; do not relabel a naturally limited device as this injected case");
  assert(observation.effectiveFloatSupported === false, "Float extensions remain visible despite the requested mask");
  assert(observation.effectiveFloatRenderTargetSupported === false, "Dependent float color-buffer extensions remain visible or unobserved");
  assert(observation.extensionQueries.some((query) => query.method === "getExtension"), "No actual masked extension query was observed from engine boot");
  assert(observation.engine.rgba32fSampled === false && observation.engine.rgba8Sampled === true, "Actual engine feature selection did not enter the RGBA8-compatible path");
  assert(observation.engine.rgba32fRenderTarget === false && observation.engine.pipelineFloatTextureMacro === 0,
    "Actual engine RGBA32F render-target feature / WebPipeline float-texture macro contradicts the injected byte-texture path");
  assert(observation.page.visible === true, "Fault-injection preview is hidden");
  if (requireCold) assert(observation.alreadyLoadedFixturePrefabs.length === 0, "Fixture Prefabs were loaded before the first recorded load/activation");
  return { webgl: observation.webgl, nativeFloatSupported: observation.nativeFloatSupported,
    nativeFloatLinearSupported: observation.nativeFloatLinearSupported, forcedFloatMask: true,
    nativeFloatRenderTargetSupported: observation.nativeFloatRenderTargetSupported,
    engineRgba32fSampled: observation.engine.rgba32fSampled, engineRgba32fRenderTarget: observation.engine.rgba32fRenderTarget,
    pipelineFloatTextureMacro: observation.engine.pipelineFloatTextureMacro, engineRgba8Sampled: observation.engine.rgba8Sampled };
}

/** Additional checks over genuine base-probe output. The base probe still owns its full animation/input/perf assertions. */
export function validateRgba8FaultRun(report, before, after) {
  const boot = assertFloatFaultBoot(before);
  assertFloatFaultBoot(after, { requireCold: false });
  assert(report.executedOk === true, "The underlying real fixture probe did not pass its automated assertions");
  assert(report.environment?.webgl === 1 && report.environment.skinningCapabilities?.rgba32fSampled === false,
    "Fixture evidence does not show actual WebGL1 / non-sampled RGBA32F");
  for (const name of ["initial-load-and-first-activation", "actual-skinning-textures-and-cross-atlas-switch", "actual-realtime-skinning-without-instancing", "steady-state-frame-window", "repeated-open-close-resource-evidence"]) {
    assert(report.steps?.some((step) => step.name === name && step.status === "passed"), `Missing passing fixture evidence: ${name}`);
  }
  assert(report.skinning?.mainAdvancingClips?.length === 2 && report.skinning.alternateAdvancingClips?.length >= 1
    && report.skinning.transition, "Animation advancement and actual cross-atlas transition were not demonstrated");
  const phases = report.skinning.phases ?? {};
  for (const name of ["main-shared", "main-shared-later", "alternate-0", "alternate-0-later", "alternate-1", "main-restored"]) assert(phases[name], `Missing actual skinning phase ${name}`);
  assert(report.cycles?.length >= 20, "At least 20 complete fixture open/close cycles are required");
  assertStage3dClosedBaseline(report.prewarm.baseline, report.cycles.map((cycle) => cycle.closed));
  const realtimePhases = report.realtimeSkinning?.phases ?? {};
  for (const name of ["baked-before", "realtime", "realtime-later", "baked-restored"]) assert(realtimePhases[name], `Missing actual realtime phase ${name}`);
  assertStage3dRealtimeAdvancement(realtimePhases.realtime, realtimePhases["realtime-later"]);
  assert(report.realtimeSkinning.restoration?.originalBindingsRestored === true, "Realtime sample did not restore its original baked bindings");
  const observations = [...Object.entries(phases),
    ...Object.entries(realtimePhases).map(([name, state]) => [`realtime-phase-${name}`, state, name === "realtime" || name === "realtime-later"]),
    ...report.cycles.flatMap((cycle) => {
      assert(cycle.realtime && ["realtime", "restored-baked"].includes(cycle.closeMode), `Cycle ${cycle.cycle}: missing realtime close coverage`);
      assert(cycle.closeMode !== "restored-baked" || (cycle.restored && cycle.restorationProof?.originalBindingsRestored === true), `Cycle ${cycle.cycle}: baked restoration missing`);
      return [[`cycle-${cycle.cycle}`, cycle.opened], [`cycle-${cycle.cycle}-realtime`, cycle.realtime, true],
        ...(cycle.restored ? [[`cycle-${cycle.cycle}-restored`, cycle.restored]] : [])];
    })];
  let actualTextureObservations = 0;
  let realtimeObservations = 0;
  const perPhase = [];
  for (const [name, state, realtime] of observations) {
    const instances = state.animation?.skinningInstances;
    assert(instances?.length === 100, `${name}: actual skinned-instance observations are missing`);
    if (realtime) { assertStage3dRealtimePhase(state); realtimeObservations++; }
    const baked = realtime ? instances.filter((instance) => instance.name !== "Stage3dSpike.CrossAtlas") : instances;
    const textures = baked.flatMap((instance) => instance.renderers.map((renderer) => renderer.texture));
    assert(textures.length >= (realtime ? 99 : 100) && textures.every((texture) => texture?.formatName === "RGBA8"), `${name}: an actual GPU joint texture is missing or is not RGBA8`);
    actualTextureObservations += textures.length;
    perPhase.push({ name, instances: instances.length, realtimeInstances: realtime ? 1 : 0,
      rendererTextures: textures.length, actualFormats: [...new Set(textures.map((texture) => texture.formatName))] });
  }
  return { status: "automated-fault-injection-checks-passed-visual-review-pending", boot, cycles: report.cycles.length,
    actualTextureObservations, realtimeObservations, perPhase, scope: SCOPE };
}

export function parseRgba8FaultArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  assert(!argv.some((arg) => ["--reuse", "--tab", "--mode", "--expect-webgl"].includes(arg)), "This runner owns a fresh fixture page and requires WebGL1; --reuse/--tab/--mode/--expect-webgl are not accepted");
  const options = parseStage3dProbeArgs(["--mode", "fixture", "--expect-webgl", "1", ...argv]);
  assert(options.cycles >= 20, "RGBA8 fault evidence requires at least 20 cycles");
  const date = new Date().toISOString().slice(0, 10);
  options.out = path.resolve(options.out ?? path.join(ROOT, "docs/evidence", `creator-${date}`, "stage3d-rgba8-fault-injection"));
  options.summary = path.resolve(options.summary ?? path.join(ROOT, "docs/perf/stage3d", `${date}-spike-webgl1-rgba8-fault-injection.json`));
  return options;
}

export function writeRgba8FaultReport(report, out, summaryPath) {
  report.scenario = "stage3d-webgl1-rgba8-fault-injection";
  report.sc0Exit = false;
  fs.mkdirSync(out, { recursive: true });
  const reportPath = path.join(out, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  // Recompute the summary's raw-report SHA after adding the explicit injection facts.
  const summary = writeStage3dProbeSummary(reportPath, summaryPath);
  summary.capabilityFaultInjection = report.capabilityFaultInjection;
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  return { reportPath, summaryPath };
}

export async function runRgba8FaultProbe(options) {
  const startedAt = new Date().toISOString();
  const injection = { schemaVersion: 1, kind: FLOAT_FAULT_KIND, artificial: true, scope: SCOPE,
    changedSurface: "Owned fresh page's WebGLRenderingContext.prototype.getExtension/getSupportedExtensions only",
    maskedExtensions: ["OES_texture_float", "OES_texture_float_linear", "WEBGL_color_buffer_float", "EXT_color_buffer_float", "WEBKIT_ and MOZ_ aliases"],
    dependencyClosure: "Creator 3.8.8 JointTexturePool checks SAMPLED_TEXTURE, but WebPipeline float-texture macro checks RENDER_TARGET | SAMPLED_TEXTURE. Both float capabilities must be absent; half-float extensions are unchanged.",
    before: null, after: null, checks: null, cleanup: {} };
  let client, tab, hookId, consoleHookId, result;
  let report = { schemaVersion: 1, scenario: "stage3d-webgl1-rgba8-fault-injection", startedAt, options,
    steps: [], pending: [], console: [], executedOk: false, ok: false, exitCode: 1 };
  try {
    const mainSceneUuid = sceneUuidFromMeta(fs.readFileSync(path.join(ROOT, "apps/Cocos/assets/scene.scene.meta"), "utf8"));
    assert(!options.scene || options.scene === mainSceneUuid, "Only this worktree's real main scene is permitted");
    const fixtureUuids = ["greybox-plane", "greybox-cube", "greybox-biped", "greybox-biped-atlas-b"].map((name) => validateStage3dPrefabMetadata(
      JSON.parse(fs.readFileSync(path.join(ROOT, "apps/Cocos/assets/resources/stage3d", `${name}.glb.meta`), "utf8")), name).prefabUuid);
    const response = await fetch(`${options.devtools}/json/new?about:blank`, { method: "PUT" });
    assert(response.ok, `Failed to create owned blank page: HTTP ${response.status}`);
    tab = await response.json(); injection.ownedTabId = tab.id;
    client = await CdpClient.connect(tab.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await prepareStage3dViewport(client, false);
    hookId = (await client.send("Page.addScriptToEvaluateOnNewDocument", { source: createFloatFaultSource() })).identifier;
    consoleHookId = (await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource })).identifier;
    await openScene(client, { preview: options.preview, sceneUuid: mainSceneUuid, timeoutMs: options.bootTimeoutMs });
    injection.before = await client.evaluate(createFloatFaultInspectionSource(fixtureUuids));
    assert(injection.before.sceneUuid === mainSceneUuid, "Booted scene UUID differs from the exact main scene");
    assertFloatFaultBoot(injection.before);
    fs.mkdirSync(options.out, { recursive: true });
    fs.writeFileSync(path.join(options.out, "fault-injection.json"), JSON.stringify(injection, null, 2) + "\n");
    // The unmodified fixture runner performs the first model load. Its temporary
    // report options already disclose injection, even if this wrapper is interrupted.
    result = await runStage3dProbe({ ...options, mode: "fixture", reuse: true, tabId: tab.id, scene: mainSceneUuid,
      expectWebgl: 1, capabilityFaultInjection: { kind: FLOAT_FAULT_KIND, artificial: true, scope: SCOPE, before: injection.before } });
    report = result.report;
    injection.after = await client.evaluate(createFloatFaultInspectionSource());
    injection.checks = validateRgba8FaultRun(report, injection.before, injection.after);
  } catch (error) {
    injection.error = error instanceof Error ? error.message : String(error);
    report.error = report.error ? `${report.error}; RGBA8 fault probe: ${injection.error}` : injection.error;
    report.executedOk = false;
  } finally {
    if (client) {
      if (hookId) try { await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: hookId }); injection.cleanup.hookRemoved = true; }
      catch (error) { injection.cleanup.hookError = error.message; }
      if (consoleHookId) await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: consoleHookId }).catch(() => {});
      try { injection.cleanup.restore = await client.evaluate(`globalThis[${JSON.stringify(FLOAT_FAULT_KEY)}]?.restore() ?? { restored: false, reason: "hook unavailable" }`); }
      catch (error) { injection.cleanup.restoreError = error.message; }
    }
    if (tab?.id) try {
      const closed = await fetch(`${options.devtools}/json/close/${encodeURIComponent(tab.id)}`);
      assert(closed.ok, `Owned-page close returned HTTP ${closed.status}`);
      for (let attempt = 0; attempt < 20; attempt++) {
        const tabs = await (await fetch(`${options.devtools}/json`)).json();
        injection.cleanup.ownedPageClosed = !tabs.some((item) => item.id === tab.id);
        if (injection.cleanup.ownedPageClosed) break;
        await sleep(100);
      }
      assert(injection.cleanup.ownedPageClosed, "Owned injected page still exists after close");
    } catch (error) { injection.cleanup.closeError = error.message; }
    client?.close();
    const clean = (!hookId || injection.cleanup.hookRemoved) && (!tab || injection.cleanup.ownedPageClosed);
    if (!clean) { report.executedOk = false; report.cleanupError = "Fault hook/page cleanup was not confirmed; inspect capabilityFaultInjection.cleanup"; }
    report.capabilityFaultInjection = injection;
    report.pending ??= [];
    report.pending.push({ name: "fault-injection-only", reason: SCOPE });
    report.ok = false;
    report.exitCode = report.executedOk && injection.checks ? 2 : 1;
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(options.out, { recursive: true });
    fs.writeFileSync(path.join(options.out, "fault-injection.json"), JSON.stringify(injection, null, 2) + "\n");
    writeRgba8FaultReport(report, options.out, options.summary);
  }
  return { report, out: options.out, summary: options.summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseRgba8FaultArgs(process.argv.slice(2));
    if (options.help) console.log("Usage: node tools/creator-preview/probe-stage3d-rgba8.mjs [--devtools http://127.0.0.1:9223] [--preview http://127.0.0.1:7457] [--out DIR] [--summary FILE] [--cycles 20]\nRequires an existing actual WebGL1 Chrome and isolated Creator. Explicit float-extension fault injection on one owned fresh page; native support, real engine features, actual RGBA8 GPU joint textures, clips/cross-atlas transitions and 20 cycles are checked. Does not start Chrome, edit vendor/GFX tables, alter existing tabs, or count as low-end/WeChat evidence. Exit 2 leaves genuine visual/device pending items.");
    else {
      const result = await runRgba8FaultProbe(options);
      console.log(JSON.stringify({ kind: FLOAT_FAULT_KIND, executedOk: result.report.executedOk,
        exitCode: result.report.exitCode, report: path.join(result.out, "report.json"), summary: result.summary }));
      process.exitCode = result.report.exitCode;
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
