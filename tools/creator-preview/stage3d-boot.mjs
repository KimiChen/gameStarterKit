/** Exact-page provenance for the owned fresh Snake helper; never retroactively labels a warm page cold. */
export const STAGE3D_BOOT_KEY = "__stage3dOwnedSnakeBoot";

function installOwnedBoot(key, tabId, expectedWebgl, preview) {
  if (globalThis[key]) throw new Error("Owned Snake boot marker already exists");
  globalThis[key] = {
    schemaVersion: 1, kind: "owned-snake-cold-boot", tabId, expectedWebgl, preview,
    installedBeforeCocos: typeof globalThis.cc === "undefined", bootStartedAtEpochMs: performance.timeOrigin,
    installedAtEpochMs: performance.timeOrigin + performance.now(), completed: null, fixtureLoadStartedAtEpochMs: null,
  };
}

export function createStage3dOwnedBootSource({ tabId, expectedWebgl, preview }) {
  if (typeof tabId !== "string" || !tabId || ![1, 2].includes(expectedWebgl)) throw new Error("Owned boot requires an exact tab ID and explicit --expect-webgl 1|2");
  const url = new URL(preview);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "http:") throw new Error("Owned boot preview must be loopback HTTP");
  return `(${installOwnedBoot.toString()})(${JSON.stringify(STAGE3D_BOOT_KEY)},${JSON.stringify(tabId)},${expectedWebgl},${JSON.stringify(url.href)})`;
}

function inspectOwnedBoot(key, fixtureUuids, complete) {
  const marker = globalThis[key] ?? null;
  const device = globalThis.cc?.director?.root?.device, pipeline = globalThis.cc?.director?.root?.pipeline;
  const glVersion = device?.gl?.getParameter(device.gl.VERSION) ?? null;
  const webgl = /WebGL 2/u.test(glVersion ?? "") ? 2 : /WebGL 1/u.test(glVersion ?? "") ? 1 : null;
  const entries = typeof globalThis.System?.entries === "function" ? [...System.entries()] : [];
  const sessions = entries.map(([, module]) => module?.spikeSession).filter(Boolean);
  const session = sessions.length === 1 ? sessions[0] : null;
  const observed = { timeOrigin: performance.timeOrigin, atEpochMs: Date.now(), url: location.href,
    webgl, glVersion, device: device?.constructor?.name ?? null, pipeline: pipeline?.constructor?.name ?? null,
    loadedFixtureUuids: fixtureUuids.filter((uuid) => !!globalThis.cc?.assetManager?.assets?.get(uuid)),
    fixtureSessionUntouched: !!session && session.skinning === null && !session.ready && session.businessRefs === 0 && session.nodeCount === 0,
    sceneUuid: globalThis.cc?.director?.getScene()?.uuid ?? null };
  if (complete) {
    if (!marker || marker.completed) throw new Error("Cold boot completion requires an uncompleted preboot marker");
    marker.completed = observed;
  }
  return { marker, observed };
}

export function createStage3dOwnedBootInspectionSource(fixtureUuids, complete = false) {
  if (!Array.isArray(fixtureUuids) || fixtureUuids.length !== 4 || new Set(fixtureUuids).size !== 4 || fixtureUuids.some((uuid) => typeof uuid !== "string" || !uuid)) {
    throw new Error("Four actual imported fixture Prefab UUIDs are required");
  }
  return `(${inspectOwnedBoot.toString()})(${JSON.stringify(STAGE3D_BOOT_KEY)},${JSON.stringify(fixtureUuids)},${complete})`;
}

export function assertStage3dOwnedBoot(evidence, { tabId, expectedWebgl, preview }) {
  const fail = (message) => { throw new Error(`Snake boot provenance: ${message}`); };
  const marker = evidence?.marker, current = evidence?.observed, completed = marker?.completed;
  if (!marker || marker.schemaVersion !== 1 || marker.kind !== "owned-snake-cold-boot" || !completed) fail("missing preboot/completion evidence; old helper pages need a fresh boot");
  if (!tabId || marker.tabId !== tabId || ![1, 2].includes(expectedWebgl) || marker.expectedWebgl !== expectedWebgl) fail("exact tab and explicit expected WebGL must match");
  const origin = new URL(preview), original = new URL(marker.preview), actual = new URL(current.url), booted = new URL(completed.url);
  if ([original, actual, booted].some((url) => url.origin !== origin.origin || url.pathname !== origin.pathname)) fail("preview origin/path changed");
  if (!marker.installedBeforeCocos || !Number.isFinite(marker.bootStartedAtEpochMs)
    || marker.bootStartedAtEpochMs <= 0 || marker.bootStartedAtEpochMs !== current.timeOrigin || current.timeOrigin !== completed.timeOrigin
    || !Number.isFinite(marker.installedAtEpochMs) || marker.installedAtEpochMs < marker.bootStartedAtEpochMs
    || !Number.isFinite(completed.atEpochMs) || completed.atEpochMs <= marker.installedAtEpochMs
    || !Number.isFinite(current.atEpochMs) || current.atEpochMs < completed.atEpochMs) fail("preboot timestamp or same-page time origin is unproven");
  for (const value of [completed, current]) {
    if (value.webgl !== expectedWebgl || value.device !== (expectedWebgl === 1 ? "WebGLDevice" : "WebGL2Device") || value.pipeline !== "WebPipeline") fail("actual engine does not match the requested context");
    if (!Array.isArray(value.loadedFixtureUuids) || value.loadedFixtureUuids.length || value.fixtureSessionUntouched !== true) fail("fixture was loaded/activated or its unloaded state is unavailable");
  }
  if (marker.fixtureLoadStartedAtEpochMs !== null) fail("a fixture load was previously recorded on this page");
  return { coldBoot: true, bootStartedAtEpochMs: marker.bootStartedAtEpochMs,
    bootCompletedAtEpochMs: completed.atEpochMs, firstFixtureLoadStartedAtEpochMs: null,
    provenance: { kind: marker.kind, tabId, expectedWebgl, sceneUuidAtBoot: completed.sceneUuid, fixtureUuidsUnloaded: true } };
}
