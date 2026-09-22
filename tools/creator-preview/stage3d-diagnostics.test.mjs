import test from "node:test";
import assert from "node:assert/strict";
import { classifyStage3dConsole, WEBGL2_UNAVAILABLE_BOOT_MESSAGE } from "./stage3d-diagnostics.mjs";

const context = () => ({ expectedWebgl: 1, actualWebgl: 1, device: "WebGLDevice", pipeline: "WebPipeline",
  coldBoot: true, bootStartedAtEpochMs: 1000, firstFixtureLoadStartedAtEpochMs: 2000 });
const diagnostic = (overrides = {}) => ({ level: "error", at: 1500, text: WEBGL2_UNAVAILABLE_BOOT_MESSAGE, ...overrides });

test("exact cold-boot fallback diagnostic is explicitly recorded without changing raw console", () => {
  const entry = Object.freeze(diagnostic()), raw = Object.freeze([entry]);
  const result = classifyStage3dConsole(raw, context());
  assert.equal(result.expectedBootDiagnostics.length, 1);
  assert.equal(result.expectedBootDiagnostics[0].entry, entry);
  assert.equal(result.unexpectedErrors.length, 0);
  assert.equal(result.bootDiagnosticCutoffAtEpochMs, 2000);
  assert.deepEqual(raw, [diagnostic()]);
});

test("diagnostic classification requires every requested and observed GL1 fallback condition", () => {
  for (const change of [{ expectedWebgl: 2 }, { expectedWebgl: null }, { actualWebgl: 2 }, { device: "WebGL2Device" },
    { pipeline: "LegacyPipeline" }, { coldBoot: false }, { coldBoot: undefined }, { bootStartedAtEpochMs: null },
    { firstFixtureLoadStartedAtEpochMs: undefined }, { firstFixtureLoadStartedAtEpochMs: 1000 }]) {
    const result = classifyStage3dConsole([diagnostic()], { ...context(), ...change });
    assert.equal(result.expectedBootDiagnostics.length, 0, JSON.stringify(change));
    assert.equal(result.unexpectedErrors.length, 1, JSON.stringify(change));
  }
});

test("same message before navigation, at/after load, or without a finite timestamp remains an error", () => {
  for (const at of [999, 2000, 2001, NaN, undefined, "1500"]) {
    assert.equal(classifyStage3dConsole([diagnostic({ at })], context()).unexpectedErrors.length, 1);
  }
  assert.equal(classifyStage3dConsole([diagnostic({ at: 1000 })], context()).expectedBootDiagnostics.length, 1);
});

test("independent boot completion bounds a cold Snake run without inventing a fixture load", () => {
  const boot = { ...context(), bootCompletedAtEpochMs: 1600 };
  delete boot.firstFixtureLoadStartedAtEpochMs;
  const result = classifyStage3dConsole([diagnostic(), diagnostic({ at: 1600 }), diagnostic({ at: 1700 })], Object.freeze(boot));
  assert.equal(result.windowValid, true);
  assert.equal(result.bootDiagnosticCutoffAtEpochMs, 1600);
  assert.equal(result.expectedBootDiagnostics.length, 1);
  assert.equal(result.unexpectedErrors.length, 2);
  assert.equal(result.context.bootCompletedAtEpochMs, 1600);
  assert.equal(result.context.firstFixtureLoadStartedAtEpochMs, undefined);
  assert.doesNotMatch(result.expectedBootDiagnostics[0].reason, /fixture load/u);
  assert.equal(classifyStage3dConsole([diagnostic()], { ...boot, firstFixtureLoadStartedAtEpochMs: null }).expectedBootDiagnostics.length, 1);
});

test("two supplied boundaries use the earlier strict upper limit in either order", () => {
  for (const boundaries of [
    { bootCompletedAtEpochMs: 1600, firstFixtureLoadStartedAtEpochMs: 2000 },
    { bootCompletedAtEpochMs: 2000, firstFixtureLoadStartedAtEpochMs: 1600 },
    { bootCompletedAtEpochMs: 1600, firstFixtureLoadStartedAtEpochMs: 1600 },
  ]) {
    const result = classifyStage3dConsole([diagnostic({ at: 1599 }), diagnostic({ at: 1600 }), diagnostic({ at: 1800 })], { ...context(), ...boundaries });
    assert.equal(result.windowValid, true);
    assert.equal(result.bootDiagnosticCutoffAtEpochMs, 1600);
    assert.equal(result.expectedBootDiagnostics.length, 1);
    assert.equal(result.unexpectedErrors.length, 2);
    assert.equal(result.context.bootCompletedAtEpochMs, boundaries.bootCompletedAtEpochMs);
    assert.equal(result.context.firstFixtureLoadStartedAtEpochMs, boundaries.firstFixtureLoadStartedAtEpochMs);
  }
});

test("an invalid supplied boundary fails closed even when the other boundary is valid", () => {
  for (const field of ["bootCompletedAtEpochMs", "firstFixtureLoadStartedAtEpochMs"]) {
    for (const value of [NaN, Infinity, 0, 999, 1000, "1600"]) {
      const result = classifyStage3dConsole([diagnostic()], { ...context(), bootCompletedAtEpochMs: 1800, [field]: value });
      assert.equal(result.windowValid, false, `${field}=${String(value)}`);
      assert.equal(result.bootDiagnosticCutoffAtEpochMs, null);
      assert.equal(result.expectedBootDiagnostics.length, 0);
      assert.equal(result.unexpectedErrors.length, 1);
    }
  }
  const missing = classifyStage3dConsole([diagnostic()], { ...context(), bootCompletedAtEpochMs: null, firstFixtureLoadStartedAtEpochMs: null });
  assert.equal(missing.windowValid, false);
  assert.equal(missing.bootDiagnosticCutoffAtEpochMs, null);
  assert.equal(missing.unexpectedErrors.length, 1);
});

test("prefixes, suffixes, whitespace, uncaught errors, rejections, and other failures are never excused", () => {
  const raw = [diagnostic(), diagnostic({ text: `Warning: ${WEBGL2_UNAVAILABLE_BOOT_MESSAGE}` }),
    diagnostic({ text: `${WEBGL2_UNAVAILABLE_BOOT_MESSAGE}\n` }), diagnostic({ text: "This device does not support WebGL" }),
    diagnostic({ level: "uncaught" }), diagnostic({ level: "rejection" }), diagnostic({ text: "Missing lightmap PNG" })];
  const result = classifyStage3dConsole(raw, context());
  assert.equal(result.expectedBootDiagnostics.length, 1);
  assert.equal(result.unexpectedErrors.length, 6);
  assert.equal(raw.length, 7);
});

test("ordinary warnings preserve existing behavior; malformed entries fail closed", () => {
  const result = classifyStage3dConsole([{ level: "warn", at: 1500, text: "ordinary warning" }, null], context());
  assert.equal(result.nonErrorCount, 1);
  assert.equal(result.expectedBootDiagnostics.length, 0);
  assert.equal(result.unexpectedErrors.length, 1);
  assert.throws(() => classifyStage3dConsole(null, context()), /array/u);
});
