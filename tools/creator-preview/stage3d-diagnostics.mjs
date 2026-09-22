/** One version-bound boot diagnostic; this module never filters or modifies raw console evidence.
 * Creator 3.8.8: webgl2-device.ts:160-162 emits errorID(16405), returns false;
 * device-manager.ts:132-140/174-178 then attempts WebGLDevice initialization.
 * DebugInfos.json 16405 is exactly the message below. A successful GL1 WebPipeline
 * and measured cold-boot boundaries are required before classifying it as expected.
 */
export const WEBGL2_UNAVAILABLE_BOOT_MESSAGE = "This device does not support WebGL2";
export const STAGE3D_BOOT_DIAGNOSTIC_RULE = "creator-3.8.8-controlled-webgl2-to-webgl1-boot-fallback";

export function classifyStage3dConsole(entries, context = {}) {
  if (!Array.isArray(entries)) throw new Error("Console evidence must be an array");
  const { expectedWebgl, actualWebgl, device, pipeline, coldBoot, bootStartedAtEpochMs,
    bootCompletedAtEpochMs, firstFixtureLoadStartedAtEpochMs } = context;
  // Snake has no fixture load. A separately proven boot completion can bound
  // its diagnostic window; if both boundaries are supplied, neither may widen it.
  // Invalid supplied evidence must not disappear behind the other valid boundary.
  const upperBounds = [bootCompletedAtEpochMs, firstFixtureLoadStartedAtEpochMs].filter((value) => value != null);
  const windowValid = Number.isFinite(bootStartedAtEpochMs) && bootStartedAtEpochMs > 0 && upperBounds.length > 0
    && upperBounds.every((value) => Number.isFinite(value) && value > bootStartedAtEpochMs);
  const bootDiagnosticCutoffAtEpochMs = windowValid ? Math.min(...upperBounds) : null;
  const successfulControlledFallback = expectedWebgl === 1 && actualWebgl === 1 && device === "WebGLDevice"
    && pipeline === "WebPipeline" && coldBoot === true && windowValid;
  const expectedBootDiagnostics = [], unexpectedErrors = [];
  let nonErrorCount = 0;
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry.level !== "string" || typeof entry.text !== "string") {
      unexpectedErrors.push({ index, entry, reason: "Malformed console entry cannot be classified as an expected diagnostic" });
      continue;
    }
    if (!["error", "uncaught", "rejection"].includes(entry.level)) { nonErrorCount++; continue; }
    const isExpected = successfulControlledFallback && entry.level === "error"
      && entry.text === WEBGL2_UNAVAILABLE_BOOT_MESSAGE && Number.isFinite(entry.at)
      && entry.at >= bootStartedAtEpochMs && entry.at < bootDiagnosticCutoffAtEpochMs;
    if (isExpected) expectedBootDiagnostics.push({ index, entry,
      reason: "Exact Creator 3.8.8 WebGL2 initialization diagnostic occurred within the verified cold-boot window; requested WebGL1 subsequently initialized as WebGLDevice with WebPipeline" });
    else unexpectedErrors.push({ index, entry, reason: "Error does not meet the exact controlled cold-boot fallback rule" });
  }
  return { ruleId: STAGE3D_BOOT_DIAGNOSTIC_RULE,
    context: { expectedWebgl, actualWebgl, device, pipeline, coldBoot, bootStartedAtEpochMs,
      bootCompletedAtEpochMs, firstFixtureLoadStartedAtEpochMs },
    windowValid, bootDiagnosticCutoffAtEpochMs, expectedBootDiagnostics, unexpectedErrors, nonErrorCount };
}
