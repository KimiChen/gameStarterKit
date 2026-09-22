import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  FLOAT_FAULT_KEY, FLOAT_FAULT_KIND, createFloatFaultSource, createFloatFaultInspectionSource, assertFloatFaultBoot,
  parseRgba8FaultArgs, validateRgba8FaultRun, writeRgba8FaultReport,
} from "./probe-stage3d-rgba8.mjs";

function installMockHook({ late = false, nativeList = ["OES_texture_float", "OES_texture_float_linear", "WEBKIT_OES_texture_float", "MOZ_OES_texture_float_linear", "WEBGL_color_buffer_float", "EXT_color_buffer_float", "WEBKIT_WEBGL_color_buffer_float", "MOZ_EXT_color_buffer_float", "OES_texture_half_float", "WEBGL_debug_renderer_info"] } = {}) {
  const nativeCalls = [];
  class WebGL1 {
    getExtension(...args) { nativeCalls.push({ receiver: this, args }); return { extension: args[0] }; }
    getSupportedExtensions() { return nativeList === null ? null : [...nativeList]; }
  }
  class WebGL2 {
    getExtension(name) { return { nativeWebgl2: name }; }
    getSupportedExtensions() { return ["OES_texture_float"]; }
  }
  const originalExtension = WebGL1.prototype.getExtension;
  const originalSupported = WebGL1.prototype.getSupportedExtensions;
  const originalWebgl2Extension = WebGL2.prototype.getExtension;
  const context = { WebGLRenderingContext: WebGL1, WebGL2RenderingContext: WebGL2, performance: { now: () => 12.5 } };
  if (late) context.cc = Object.freeze({ untouched: true });
  vm.createContext(context);
  vm.runInContext(createFloatFaultSource(), context);
  return { context, hook: context[FLOAT_FAULT_KEY], gl: new WebGL1(), WebGL1, WebGL2, nativeCalls,
    originalExtension, originalSupported, originalWebgl2Extension };
}

test("pre-boot mask blocks float and vendor aliases while preserving native support facts and unrelated methods", () => {
  const { hook, gl, nativeCalls, WebGL2, originalWebgl2Extension } = installMockHook();
  for (const name of ["OES_texture_float", "OES_texture_float_linear", "WEBKIT_OES_texture_float", "MOZ_OES_texture_float_linear", "webkit_oes_texture_float_linear",
    "WEBGL_color_buffer_float", "EXT_color_buffer_float", "WEBKIT_WEBGL_color_buffer_float", "MOZ_EXT_color_buffer_float", "webkit_ext_color_buffer_float"]) assert.equal(gl.getExtension(name), null);
  assert.equal(nativeCalls.length, 0, "masked queries must not enable the native extension");
  assert.deepEqual(gl.getExtension("OES_texture_half_float", "untouched"), { extension: "OES_texture_half_float" });
  assert.equal(nativeCalls[0].receiver, gl);
  assert.deepEqual(nativeCalls[0].args, ["OES_texture_half_float", "untouched"]);
  assert.deepEqual(Array.from(gl.getSupportedExtensions()), ["OES_texture_half_float", "WEBGL_debug_renderer_info"]);
  const evidence = hook.inspect(gl);
  assert.equal(evidence.kind, FLOAT_FAULT_KIND);
  assert.equal(evidence.installedBeforeCocos, true);
  assert.equal(evidence.nativeFloatSupported, true);
  assert.equal(evidence.nativeFloatLinearSupported, true);
  assert.equal(evidence.nativeFloatRenderTargetSupported, true);
  assert.equal(evidence.effectiveFloatSupported, false);
  assert.equal(evidence.effectiveFloatRenderTargetSupported, false);
  assert.deepEqual(gl.getExtension("EXT_color_buffer_half_float"), { extension: "EXT_color_buffer_half_float" });
  assert.equal(evidence.maskActive, true);
  assert(evidence.nativeSupportedExtensions.includes("OES_texture_float"));
  assert.equal(WebGL2.prototype.getExtension, originalWebgl2Extension, "WebGL2 prototype must remain untouched");
  assert.throws(() => hook.inspect(new WebGL2()), /WebGL2 is refused/u);
});

test("restoration reinstates exact method identities and null extension lists remain null", () => {
  const { hook, gl, WebGL1, originalExtension, originalSupported } = installMockHook();
  assert.equal(hook.restore().restored, true);
  assert.equal(WebGL1.prototype.getExtension, originalExtension);
  assert.equal(WebGL1.prototype.getSupportedExtensions, originalSupported);
  assert.deepEqual(gl.getExtension("OES_texture_float"), { extension: "OES_texture_float" });
  const unavailable = installMockHook({ nativeList: null });
  assert.equal(unavailable.gl.getSupportedExtensions(), null);
  assert.equal(unavailable.hook.inspect(unavailable.gl).nativeFloatSupported, false);
});

function boot(overrides = {}) {
  return { webgl: 1, glVersion: "WebGL 1.0 unit mock", installedBeforeCocos: true, maskActive: true,
    nativeFloatSupported: true, nativeFloatLinearSupported: true, nativeFloatRenderTargetSupported: true,
    effectiveFloatSupported: false, effectiveFloatRenderTargetSupported: false,
    extensionQueries: [{ method: "getExtension", name: "OES_texture_float", returned: null }],
    engine: { rgba32fSampled: false, rgba32fRenderTarget: false, pipelineFloatTextureMacro: 0, rgba8Sampled: true }, page: { visible: true }, alreadyLoadedFixturePrefabs: [], ...overrides };
}

test("boot validation refuses GL2, late hooks, naturally absent float, ineffective masking, and preloaded fixtures", () => {
  assertFloatFaultBoot(boot());
  assert.throws(() => assertFloatFaultBoot(boot({ webgl: 2, glVersion: "WebGL 2.0" })), /WebGL1/u);
  const late = installMockHook({ late: true });
  assert.equal(late.hook.inspect(late.gl).installedBeforeCocos, false);
  assert.throws(() => assertFloatFaultBoot(boot({ installedBeforeCocos: false })), /before Cocos/u);
  assert.throws(() => assertFloatFaultBoot(boot({ nativeFloatSupported: false })), /naturally limited/u);
  assert.throws(() => assertFloatFaultBoot(boot({ effectiveFloatSupported: true })), /remain visible/u);
  assert.throws(() => assertFloatFaultBoot(boot({ effectiveFloatRenderTargetSupported: true })), /color-buffer/u);
  assert.throws(() => assertFloatFaultBoot(boot({ engine: { rgba32fSampled: true, rgba8Sampled: true } })), /Actual engine/u);
  assert.throws(() => assertFloatFaultBoot(boot({ alreadyLoadedFixturePrefabs: ["prefab"] })), /before the first/u);
});

test("observed engine render-target feature and pipeline macro must agree with RGBA8 selection", () => {
  const { context, gl } = installMockHook();
  gl.VERSION = 7938;
  gl.getParameter = () => "WebGL 1.0 unit mock";
  gl.getExtension("OES_texture_float");
  let floatFeatures = 16; // VERTEX_ATTRIBUTE alone is allowed; no texture feature override.
  const pipeline = { constantMacros: "#define CC_DEVICE_SUPPORT_FLOAT_TEXTURE 0\n" };
  context.cc = { gfx: { Format: { RGBA32F: 44, RGBA8: 35 }, FormatFeatureBit: { RENDER_TARGET: 1, SAMPLED_TEXTURE: 2 } },
    director: { root: { device: { gl, getFormatFeatures: (format) => format === 44 ? floatFeatures : 3 }, pipeline }, getScene: () => ({ uuid: "unit-main" }) },
    assetManager: { assets: { get: () => null } } };
  context.location = { href: "http://unit.invalid/main" };
  context.document = { hidden: false, visibilityState: "visible" };
  context.performance.timeOrigin = 1000;
  const inspect = () => vm.runInContext(createFloatFaultInspectionSource(["unit-prefab"]), context);
  const valid = inspect();
  assert.equal(valid.engine.rgba32fFeatures, 16);
  assert.equal(valid.engine.rgba32fRenderTarget, false);
  assert.equal(valid.engine.pipelineFloatTextureMacro, 0);
  assertFloatFaultBoot(valid);
  // Reproduce the actual old injection mismatch: OES sampling absent, while
  // WEBGL_color_buffer_float independently leaves RENDER_TARGET enabled.
  floatFeatures = 17;
  pipeline.constantMacros = "#define CC_DEVICE_SUPPORT_FLOAT_TEXTURE 1\n";
  const mismatched = inspect();
  assert.equal(mismatched.engine.rgba32fSampled, false);
  assert.equal(mismatched.engine.rgba32fRenderTarget, true);
  assert.equal(mismatched.engine.pipelineFloatTextureMacro, 1);
  assert.throws(() => assertFloatFaultBoot(mismatched), /render-target.*macro/u);
  floatFeatures = 16;
  assert.throws(() => assertFloatFaultBoot(inspect()), /render-target.*macro/u, "stale pipeline macro alone must fail");
  pipeline.constantMacros = "";
  assert.throws(() => assertFloatFaultBoot(inspect()), /render-target.*macro/u, "unobserved macro must not be guessed as zero");
});

function passingUnitReport() {
  // Pure assertion vectors only; these are never written as real Creator evidence.
  const opened = () => ({ animation: { skinningInstances: Array.from({ length: 100 }, () => ({ renderers: [{ texture: { formatName: "RGBA8" } }] })) } });
  const closed = () => ({ session: { businessRefs: 0 }, fixtureNodes: 0, input: { ownersCount: 0, active: false },
    sceneNodes: 12, gfx: { bufferBytes: 512, textureBytes: 1024 } });
  const realtime = (time = 0.1) => ({ session: { skinning: { mainClips: [{ hash: 1 }] } }, animation: {
    skinningInstances: Array.from({ length: 100 }, (_, index) => ({ id: index, name: index === 99 ? "Stage3dSpike.CrossAtlas" : `Stage3dSpike.Biped.${index}`,
      animations: [{ enabled: true, baked: index !== 99, playing: [{ paused: false, time, clip: { hash: 1 } }] }],
      renderers: [{ modelType: index === 99 ? "SkinningModel" : "BakedSkinningModel", modelTypeId: index === 99 ? 1 : 2,
        texture: index === 99 ? null : { formatName: "RGBA8" },
        realtime: index === 99 ? { jointCount: 2, textureMode: false, buffers: [{ id: 3, size: 192 }], jointMatrices: [Array(24).fill(time)] } : null,
        subModels: [{ index: 0, expectedSkinningBufferId: 3, boundSkinningBufferId: 3, nonInstancedDrawPasses: [0], scheduledPassIndices: [0],
          passes: [{ index: 0, batchingScheme: index === 99 ? 0 : 1 }] }] }] })) } });
  return { schemaVersion: 1, scenario: "unit-vector", startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:00:01Z",
    options: {}, console: [], pending: [], executedOk: true, ok: false, exitCode: 2,
    environment: { webgl: 1, skinningCapabilities: { rgba32fSampled: false } },
    steps: ["initial-load-and-first-activation", "actual-skinning-textures-and-cross-atlas-switch", "actual-realtime-skinning-without-instancing", "steady-state-frame-window", "repeated-open-close-resource-evidence"]
      .map((name) => ({ name, status: "passed" })),
    skinning: { mainAdvancingClips: [1, 2], alternateAdvancingClips: [3], transition: { unitVector: true },
      phases: Object.fromEntries(["main-shared", "main-shared-later", "alternate-0", "alternate-0-later", "alternate-1", "main-restored"].map((name) => [name, opened()])) },
    realtimeSkinning: { phases: { "baked-before": opened(), realtime: realtime(), "realtime-later": realtime(0.3), "baked-restored": opened() },
      restoration: { originalBindingsRestored: true } },
    prewarm: { baseline: closed(), closes: [] }, cycles: Array.from({ length: 20 }, (_, index) => ({ cycle: index + 1, opened: opened(),
      realtime: realtime(), closeMode: index % 2 ? "restored-baked" : "realtime", restored: index % 2 ? opened() : null,
      restorationProof: index % 2 ? { originalBindingsRestored: true } : null, closed: closed() })) };
}

test("actual GPU format, advancement evidence, 20 cycles, reference zero and GFX baseline are all required", () => {
  const valid = passingUnitReport();
  const result = validateRgba8FaultRun(valid, boot(), boot());
  assert.equal(result.actualTextureObservations, 5978);
  assert.equal(result.realtimeObservations, 22);
  const stillInstanced = structuredClone(valid);
  stillInstanced.realtimeSkinning.phases.realtime.animation.skinningInstances[99].renderers[0].subModels[0].passes[0].batchingScheme = 1;
  assert.throws(() => validateRgba8FaultRun(stillInstanced, boot(), boot()), /still enable instancing/u);
  const missingSiblingTexture = structuredClone(valid);
  missingSiblingTexture.cycles[0].realtime.animation.skinningInstances[0].renderers[0].texture = null;
  assert.throws(() => validateRgba8FaultRun(missingSiblingTexture, boot(), boot()), /other 99/u);
  const wrongFormat = structuredClone(valid);
  wrongFormat.skinning.phases["alternate-1"].animation.skinningInstances[99].renderers[0].texture.formatName = "RGBA32F";
  assert.throws(() => validateRgba8FaultRun(wrongFormat, boot(), boot()), /actual GPU joint texture/u);
  const stopped = structuredClone(valid); stopped.skinning.mainAdvancingClips = [];
  assert.throws(() => validateRgba8FaultRun(stopped, boot(), boot()), /Animation advancement/u);
  const short = structuredClone(valid); short.cycles.pop();
  assert.throws(() => validateRgba8FaultRun(short, boot(), boot()), /20 complete/u);
  const leaked = structuredClone(valid); leaked.cycles[19].closed.session.businessRefs = 1;
  assert.throws(() => validateRgba8FaultRun(leaked, boot(), boot()), /references/u);
  const growth = structuredClone(valid); growth.cycles[19].closed.gfx.textureBytes++;
  assert.throws(() => validateRgba8FaultRun(growth, boot(), boot()), /stable prewarmed/u);
});

test("runner never accepts an existing tab or a shortened/GL2 fixture", () => {
  assert.throws(() => parseRgba8FaultArgs(["--reuse"]), /fresh fixture/u);
  assert.throws(() => parseRgba8FaultArgs(["--tab", "existing"]), /fresh fixture/u);
  assert.throws(() => parseRgba8FaultArgs(["--expect-webgl", "2"]), /requires WebGL1/u);
  assert.throws(() => parseRgba8FaultArgs(["--cycles", "19"]), /at least 20/u);
  const args = parseRgba8FaultArgs([]);
  assert.equal(args.mode, "fixture"); assert.equal(args.expectWebgl, 1); assert.equal(args.reuse, false);
  assert.match(args.out, /rgba8-fault-injection/u);
});

test("rewritten raw report and numeric summary both disclose injection with a matching raw SHA", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "stage3d-rgba8-summary-test-"));
  try {
    const report = { schemaVersion: 1, scenario: "unit", startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:00:01Z",
      options: {}, steps: [], console: [], pending: [], executedOk: false, ok: false, exitCode: 1,
      capabilityFaultInjection: { kind: FLOAT_FAULT_KIND, artificial: true, before: boot(), after: boot() } };
    const summaryFile = path.join(temporary, "summary.json");
    const written = writeRgba8FaultReport(report, temporary, summaryFile);
    const raw = fs.readFileSync(written.reportPath), parsed = JSON.parse(raw.toString("utf8"));
    const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
    assert.equal(parsed.scenario, "stage3d-webgl1-rgba8-fault-injection");
    assert.equal(parsed.sc0Exit, false);
    assert.deepEqual(summary.capabilityFaultInjection, parsed.capabilityFaultInjection);
    assert.equal(summary.evidence.reportSha256, createHash("sha256").update(raw).digest("hex"));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
