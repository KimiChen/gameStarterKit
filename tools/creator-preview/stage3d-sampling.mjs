/**
 * SC0 frame evidence only: this sampler does not assert that the 3D fixture passed.
 * Start through CdpClient.evaluate(createStage3dSamplingSource(options)); it resolves
 * with raw evidence. A second evaluate(stopStage3dSamplingSource()) cancels it.
 * The first AFTER_DRAW anchors the clock; then 60 warmup intervals and 240 measured
 * intervals are retained by default. All frame counters include the anchor/warmup,
 * so the caller can keep startup evidence separate from steady-state statistics.
 */
export const STAGE3D_SAMPLER_KEY = "__stage3dFrameSampler";
export const STAGE3D_SAMPLING_DEFAULTS = Object.freeze({ warmupFrames: 60, sampleFrames: 240, timeoutMs: 60_000 });

export function normalizeStage3dSamplingOptions(input = {}) {
  const options = { ...STAGE3D_SAMPLING_DEFAULTS, ...input };
  for (const [key, minimum] of [["warmupFrames", 0], ["sampleFrames", 1], ["timeoutMs", 1]]) {
    if (!Number.isSafeInteger(options[key]) || options[key] < minimum) throw new Error(`${key} must be an integer >= ${minimum}`);
  }
  return { warmupFrames: options.warmupFrames, sampleFrames: options.sampleFrames, timeoutMs: options.timeoutMs };
}

/** Self-contained browser function: all dependencies are browser/Cocos globals. */
function sampleStage3dFrames(options, key) {
  return new Promise((resolve) => {
    const frames = [];
    const reasons = [];
    let director;
    let eventName;
    let root;
    let device;
    let timer;
    let startedAtMs = null;
    let previousAtMs = null;
    let finished = false;
    let seq = 0;
    let visibilityChanges = 0;
    let listening = false;
    let watchingVisibility = false;
    const control = { stop: (reason = "cancelled") => finish("cancelled", String(reason)) };
    const message = (error) => error instanceof Error ? error.message : String(error);
    const addReason = (reason) => { if (reason && !reasons.includes(reason)) reasons.push(reason); };
    const clock = () => {
      const value = performance.now();
      if (!Number.isFinite(value)) throw new Error("performance.now() is not finite");
      return value;
    };
    function finish(status, reason) {
      if (finished) return;
      finished = true;
      addReason(reason);
      // Every cleanup is attempted even when another teardown step fails.
      const cleanups = [
        () => { if (listening) director.off(eventName, onFrame); },
        () => { if (watchingVisibility) document.removeEventListener("visibilitychange", onVisibility); },
        () => { if (timer !== undefined) clearTimeout(timer); },
        () => { if (globalThis[key] === control) delete globalThis[key]; },
      ];
      for (const cleanup of cleanups) {
        try { cleanup(); } catch (error) { addReason(`cleanup-failed: ${message(error)}`); }
      }
      let endedAtMs = null;
      try { endedAtMs = clock(); } catch (error) { addReason(message(error)); }
      resolve({ schemaVersion: 1, status, valid: status === "completed" && reasons.length === 0,
        options, clock: "performance.now", frameEvent: "Director.EVENT_AFTER_DRAW", startedAtMs, endedAtMs,
        visibilityChanges, reasons, frames });
    }
    function onVisibility() {
      visibilityChanges++;
      finish("failed", "visibility-changed");
    }
    function onFrame() {
      if (finished) return;
      try {
        if (document.hidden || document.visibilityState !== "visible") return finish("failed", "document-hidden");
        if (cc.director !== director || director.root !== root || root.device !== device) {
          return finish("failed", "engine-root-or-device-changed");
        }
        const atMs = clock();
        const intervalMs = previousAtMs === null ? null : atMs - previousAtMs;
        if (intervalMs !== null && intervalMs < 0) throw new Error("performance.now() moved backwards");
        const readCounter = (value, label) => {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`missing or invalid GFX counter: ${label}`);
          return value;
        };
        // Cocos 3.8.8 device.present() publishes these before EVENT_AFTER_DRAW.
        const gfx = {
          drawCalls: readCounter(device.numDrawCalls, "numDrawCalls"),
          triangles: readCounter(device.numTris, "numTris"),
          instances: readCounter(device.numInstances, "numInstances"),
          bufferBytes: readCounter(device.memoryStatus?.bufferSize, "memoryStatus.bufferSize"),
          textureBytes: readCounter(device.memoryStatus?.textureSize, "memoryStatus.textureSize"),
        };
        gfx.totalBytes = gfx.bufferBytes + gfx.textureBytes;
        const phase = seq === 0 ? "anchor" : seq <= options.warmupFrames ? "warmup" : "sample";
        // Engine dt is auxiliary only. Never use engine frameCount as sequence.
        const engineDtMs = typeof root.frameTime === "number" && Number.isFinite(root.frameTime) ? root.frameTime * 1000 : null;
        frames.push({ seq: ++seq, phase, atMs, intervalMs, engineDtMs, gfx });
        previousAtMs = atMs;
        if (seq === 1 + options.warmupFrames + options.sampleFrames) finish("completed");
      } catch (error) { finish("failed", message(error)); }
    }
    try {
      startedAtMs = clock();
      if (typeof document === "undefined" || document.hidden || document.visibilityState !== "visible") {
        return finish("failed", "document-hidden-or-unavailable");
      }
      if (typeof cc === "undefined" || !cc.director?.root || !cc.Director?.EVENT_AFTER_DRAW) {
        return finish("failed", "Cocos director/root/AFTER_DRAW is unavailable");
      }
      director = cc.director;
      root = director.root;
      device = root.device;
      if (!device) return finish("failed", "GFX device is unavailable");
      eventName = cc.Director.EVENT_AFTER_DRAW;
      const previous = globalThis[key];
      if (previous !== undefined) {
        if (typeof previous?.stop !== "function") return finish("failed", "sampler global is occupied");
        previous.stop("superseded");
      }
      globalThis[key] = control;
      watchingVisibility = true;
      document.addEventListener("visibilitychange", onVisibility);
      listening = true;
      director.on(eventName, onFrame);
      timer = setTimeout(() => finish("timed-out", "sampling-timeout"), options.timeoutMs);
    } catch (error) { finish("failed", message(error)); }
  });
}

export function createStage3dSamplingSource(options = {}) {
  return `(${sampleStage3dFrames.toString()})(${JSON.stringify(normalizeStage3dSamplingOptions(options))},${JSON.stringify(STAGE3D_SAMPLER_KEY)})`;
}

export function stopStage3dSamplingSource(reason = "cancelled") {
  return `(() => { const active = globalThis[${JSON.stringify(STAGE3D_SAMPLER_KEY)}]; if (!active || typeof active.stop !== "function") return false; active.stop(${JSON.stringify(String(reason))}); return true; })()`;
}

/** Nearest-rank percentiles; no smoothing, clamp, trimming, or long-frame filter. */
export function summarizeStage3dIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new Error("frame intervals must be finite non-negative milliseconds");
  }
  if (intervals.length === 0) return { count: 0, p50Ms: null, p95Ms: null, maxMs: null, meanMs: null };
  const sorted = [...intervals].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
  return { count: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
    maxMs: sorted[sorted.length - 1], meanMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length };
}

/** Validate returned/raw JSON independently before turning it into performance evidence. */
export function aggregateStage3dSampling(report) {
  const reasons = [...(Array.isArray(report?.reasons) ? report.reasons.map(String) : [])];
  const fail = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
  if (report?.schemaVersion !== 1) fail("unsupported-schema");
  if (report?.status !== "completed") fail(`status:${report?.status ?? "missing"}`);
  if (report?.valid !== true) fail("capture-invalid");
  if (report?.clock !== "performance.now" || report?.frameEvent !== "Director.EVENT_AFTER_DRAW") fail("wrong-sampling-source");
  if (report?.visibilityChanges !== 0) fail("visibility-contaminated");
  let options;
  try {
    if (!report?.options || ["warmupFrames", "sampleFrames", "timeoutMs"].some((key) => report.options[key] === undefined)) throw new Error("missing options");
    options = normalizeStage3dSamplingOptions(report.options);
  } catch { fail("invalid-options"); }
  const frames = Array.isArray(report?.frames) ? report.frames : [];
  if (options && frames.length !== options.warmupFrames + options.sampleFrames + 1) fail("incomplete-window");
  const samples = [];
  const peaks = { drawCalls: null, triangles: null, instances: null, bufferBytes: null, textureBytes: null, totalBytes: null };
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (!frame || frame.seq !== index + 1) { fail("invalid-frame-sequence"); continue; }
    const phase = index === 0 ? "anchor" : options && index <= options.warmupFrames ? "warmup" : "sample";
    if (frame.phase !== phase) fail("invalid-frame-phase");
    const previous = frames[index - 1];
    const intervalValid = typeof frame.atMs === "number" && Number.isFinite(frame.atMs)
      && (index === 0 ? frame.intervalMs === null
        : typeof frame.intervalMs === "number" && Number.isFinite(frame.intervalMs) && frame.intervalMs >= 0
          && previous && Math.abs(frame.atMs - previous.atMs - frame.intervalMs) <= 1e-6);
    if (!intervalValid) fail("invalid-frame-interval");
    if (index > 0 && frame.phase === "sample" && intervalValid) samples.push(frame.intervalMs);
    for (const key of Object.keys(peaks)) {
      const value = frame.gfx?.[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`invalid-gfx:${key}`);
      else peaks[key] = peaks[key] === null ? value : Math.max(peaks[key], value);
    }
    if (frame.gfx?.totalBytes !== frame.gfx?.bufferBytes + frame.gfx?.textureBytes) fail("invalid-gfx-total");
  }
  if (options && samples.length !== options.sampleFrames) fail("incomplete-samples");
  return { valid: reasons.length === 0, reasons, rawFrameIntervalsMs: samples, frameIntervals: summarizeStage3dIntervals(samples),
    lastFrame: frames.length ? frames[frames.length - 1] : null, allFramesPeak: peaks };
}
