#!/usr/bin/env node
/**
 * SC0 real Creator evidence. This file never starts Creator, Chrome, or a backend.
 * node tools/creator-preview/probe-stage3d.mjs [--mode fixture|snake] [--reuse] [--tab ID]
 *   [--preview http://127.0.0.1:7457] [--devtools http://127.0.0.1:9222]
 *   [--expect-webgl 1|2] [--input-only] [--force-webgl1] [--cycles 20] [--out DIR] [--summary FILE]
 * Creator must select its native WebpageFullScreen preview device, Rotate off,
 * before boot. Metrics alone cannot remove the Default-device toolbar/layout.
 * Snake mode requires --reuse and an already live Snake run; missing prerequisites
 * are pending, never an implicit login/start request. Exit 1 = failed assertions,
 * 2 = evidence still pending, 0 = the requested evidence has no pending items.
 * Camera screenshots/animation review and the remaining SC0 gates are not inferred
 * from successful input or frame measurements. This script never marks SC0 exited.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquireTab, CdpClient, consoleHookSource, openScene, pageWalkSource, sceneUuidFromMeta, selectNodes, sleep,
} from "./lib.mjs";
import { aggregateStage3dSampling, createStage3dSamplingSource, stopStage3dSamplingSource } from "./stage3d-sampling.mjs";
import { classifyStage3dConsole } from "./stage3d-diagnostics.mjs";
import { assertStage3dOwnedBoot, createStage3dOwnedBootInspectionSource, STAGE3D_BOOT_KEY } from "./stage3d-boot.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HARNESS = "__stage3dProbeHarness";
const TOUCH_TRACE = "__stage3dTouchTrace";
export const STAGE3D_VIEWPORT = Object.freeze({ width: 375, height: 812, deviceScaleFactor: 2, mobile: false });
export const STAGE3D_PREVIEW_DEVICE = "WebpageFullScreen";

/** Read actual CSS/backbuffer/engine dimensions without changing the existing page. */
function readViewport() {
  const browserWindow = typeof window === "undefined" ? null : window;
  const canvas = typeof document.getElementById === "function" ? document.getElementById("GameCanvas") : null;
  const rect = canvas?.getBoundingClientRect();
  const toolbar = document.querySelector?.(".toolbar"), toolbarRect = toolbar?.getBoundingClientRect();
  const engineView = typeof cc === "undefined" ? null : cc.view;
  const size = (value) => value ? { width: value.width, height: value.height } : null;
  return { window: browserWindow ? { width: browserWindow.innerWidth, height: browserWindow.innerHeight, dpr: browserWindow.devicePixelRatio,
    visualViewport: browserWindow.visualViewport ? { width: browserWindow.visualViewport.width, height: browserWindow.visualViewport.height,
      scale: browserWindow.visualViewport.scale } : null } : null,
    canvas: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, backingWidth: canvas.width, backingHeight: canvas.height } : null,
    preview: { device: document.getElementById?.("view-select")?.getAttribute("value") ?? null,
      rotated: document.getElementById?.("btn-rotate")?.classList.contains("checked") ?? null,
      toolbar: toolbarRect ? { x: toolbarRect.x, y: toolbarRect.y, width: toolbarRect.width, height: toolbarRect.height,
        hidden: typeof getComputedStyle === "function" ? getComputedStyle(toolbar).display === "none" : null } : null },
    cc: engineView ? { visible: size(engineView.getVisibleSize?.()), design: size(engineView.getDesignResolutionSize?.()),
      screenPixels: size(cc.screen?.windowSize), dpr: cc.screen?.devicePixelRatio ?? null } : null };
}
export function createStage3dViewportSource() { return `(${readViewport.toString()})()`; }
export function assertStage3dViewport(actual) {
  const near = (value, expected, tolerance = 0.5) => Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
  if (actual?.preview?.device !== STAGE3D_PREVIEW_DEVICE || actual.preview.rotated !== false) {
    throw new Error(`Creator preview must use native ${STAGE3D_PREVIEW_DEVICE} with Rotate off before boot; observed ${JSON.stringify(actual?.preview)}`);
  }
  if (!near(actual?.window?.width, STAGE3D_VIEWPORT.width) || !near(actual?.window?.height, STAGE3D_VIEWPORT.height)
    || !near(actual?.window?.dpr, STAGE3D_VIEWPORT.deviceScaleFactor, 0.01)) {
    throw new Error(`Expected 375x812 CSS viewport at DPR 2, observed ${JSON.stringify(actual?.window)}`);
  }
  if (!near(actual.canvas?.x, 0) || !near(actual.canvas?.y, 0)
    || !near(actual.canvas?.width, STAGE3D_VIEWPORT.width) || !near(actual.canvas?.height, STAGE3D_VIEWPORT.height)
    || !near(actual.canvas?.backingWidth, 750) || !near(actual.canvas?.backingHeight, 1624)
    || !near(actual.cc?.visible?.width, 750) || !near(actual.cc?.visible?.height, 1624, 1)) {
    throw new Error(`Portrait canvas / Cocos FIXED_WIDTH layout mismatch: ${JSON.stringify({ canvas: actual.canvas, cc: actual.cc })}`);
  }
  return actual;
}
export async function prepareStage3dViewport(client, reuse = false) {
  if (reuse) {
    const actual = await client.evaluate(createStage3dViewportSource());
    const result = { actual, action: "validated-existing-without-changing-metrics", valid: true, error: null };
    try { assertStage3dViewport(actual); }
    catch (error) { result.valid = false; result.error = error.message; }
    return result;
  }
  await client.send("Emulation.setDeviceMetricsOverride", STAGE3D_VIEWPORT);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  return { actual: null, action: "set-before-fixture-navigation", valid: null, error: null };
}

/** Locked 3.8.8 scene-culling.ts: makeRenderQueueKey persists frustum-light-phase IDs.
 * renderGraph can already be cleared between frames; never dereference its old scene IDs.
 * Only ordinary stage color queues qualify; shadow/reflection queues cannot prove visibility.
 */
function readScheduledStageQueues(culling, camera) {
  if (!camera) return [];
  if (!culling?.renderQueueQueryIndex || typeof culling.renderQueueIndex?.entries !== "function"
    || !Number.isInteger(culling.kFilterMask) || !Number.isInteger(culling.kDrawMask) || !Number.isInteger(culling.numRenderQueues)) {
    throw new Error("Locked Creator 3.8.8 scheduled stage phase diagnostics unavailable");
  }
  const result = [];
  const activeQueues = culling.renderQueues.slice(0, culling.numRenderQueues);
  for (const query of culling.renderQueueQueryIndex.values()) {
    const queue = activeQueues[query.renderQueueTarget];
    if (queue?.camera !== camera || (queue.sceneFlags & culling.kFilterMask) !== 0 || !(queue.sceneFlags & culling.kDrawMask)) continue;
    const keys = [...culling.renderQueueIndex].filter(([, queueId]) => queueId === query.renderQueueTarget).map(([key]) => key);
    if (keys.length !== 1 || typeof keys[0] !== "string") throw new Error("Scheduled stage render queue needs one exact retained queue key");
    const match = /^(0|[1-9]\d*)-(0|[1-9]\d*)-(0|[1-9]\d*)$/u.exec(keys[0]);
    const ids = match?.slice(1).map(Number);
    if (!ids || ids.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffffffff)
      || ids[0] !== query.frustumCulledResultID || ids[1] !== query.lightBoundsCulledResultID) {
      throw new Error("Scheduled stage render queue key does not exactly match its current frustum/light query");
    }
    const phaseId = ids[2];
    const models = query.lightBoundsCulledResultID !== 0xffffffff
      ? culling.lightBoundsCullingResults[query.lightBoundsCulledResultID]?.instances
      : culling.frustumCullingResults[query.frustumCulledResultID];
    if (!Array.isArray(models)) throw new Error("Scheduled stage render queue has no actual culled model list");
    result.push({ queueId: query.renderQueueTarget, queueKey: keys[0], phaseId, models });
  }
  return result;
}

/** Read the last submitted WebPipeline queues and actual model bounds; no culling or camera mutation. */
function readStage3dFraming(readScheduledQueues) {
  const scene = cc.director.getScene(), pipeline = cc.director.root.pipeline;
  const camera = scene.getComponentsInChildren("cc.Camera").find((value) => value.node.name === "Stage3DCamera");
  const culling = pipeline?._executor?._context?.culling;
  if (!camera?.camera || !culling?.renderQueueQueryIndex || !Array.isArray(culling.renderQueues)) {
    return { available: false, reason: "Locked Creator 3.8.8 camera/WebPipeline submitted-queue diagnostics unavailable" };
  }
  const ids = new WeakMap(); let nextId = 0;
  const id = (value) => { if (!value) return null; if (!ids.has(value)) ids.set(value, ++nextId); return ids.get(value); };
  const vec = (value) => value ? { x: value.x, y: value.y, z: value.z } : null;
  const quat = (value) => value ? { ...vec(value), w: value.w } : null;
  const stageCamera = camera.camera, queueIds = new Set(), modelPhases = new Map();
  const scheduled = readScheduledQueues(culling, stageCamera);
  for (const { queueId, phaseId, models } of scheduled) {
    queueIds.add(queueId);
    for (const model of models) { const phases = modelPhases.get(model) ?? new Set(); phases.add(phaseId); modelPhases.set(model, phases); }
  }
  const bindingKey = (pass, ia) => JSON.stringify([id(pass), ia?.indexBuffer?.objectID ?? null, ia?.vertexBuffers?.[0]?.objectID ?? null]);
  const batches = [];
  for (const queueId of queueIds) {
    const queue = culling.renderQueues[queueId];
    for (const kind of ["opaqueInstancingQueue", "transparentInstancingQueue"]) {
      for (const buffer of queue[kind].instanceBuffers) {
        if (!buffer.hasPendingModels) continue;
        for (const instance of buffer.instances) {
          if (!instance.count) continue;
          batches.push({ queueId, kind, key: bindingKey(buffer.pass, instance.ia), count: instance.count,
            uploadedInstanceCount: instance.ia.instanceCount, passId: id(buffer.pass) });
        }
      }
    }
  }
  const nodes = [];
  const visit = (node) => { nodes.push(node); for (const child of node.children) visit(child); }; visit(scene);
  const roots = nodes.filter((node) => /^Stage3dSpike\.Cube\.\d+$/u.test(node.name));
  const cubes = roots.map((node) => ({ name: node.name,
    renderers: node.getComponentsInChildren("cc.MeshRenderer").map((renderer) => {
      const model = renderer.model, bounds = model?.worldBounds, corners = [];
      if (bounds) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const point = new cc.Vec3(bounds.center.x + x * bounds.halfExtents.x,
          bounds.center.y + y * bounds.halfExtents.y, bounds.center.z + z * bounds.halfExtents.z);
        // Camera component API: worldToScreen(worldPos, out?), physical pixels, left-bottom origin.
        corners.push(vec(camera.worldToScreen(point)));
      }
      return { modelId: id(model), node: renderer.node.name, enabled: renderer.enabled, active: renderer.node.activeInHierarchy,
        modelEnabled: model?.enabled ?? false, inStageCulling: modelPhases.has(model),
        worldBounds: bounds ? { center: vec(bounds.center), halfExtents: vec(bounds.halfExtents) } : null, corners,
        bindings: (model?.subModels ?? []).flatMap((subModel) => subModel.passes.filter((pass) => pass.batchingScheme === 1 && modelPhases.get(model)?.has(pass.phaseID))
          .map((pass) => bindingKey(pass, subModel.inputAssembler))) };
    }) }));
  return { available: true, atMs: performance.now(), cubeCount: cubes.length, cubes, batches,
    camera: { node: camera.node.name, enabled: camera.enabled && camera.node.activeInHierarchy,
      position: vec(camera.node.worldPosition), rotation: quat(camera.node.worldRotation), fov: camera.fov, near: camera.near, far: camera.far,
      visibility: camera.visibility, width: stageCamera.width, height: stageCamera.height,
      viewport: { x: stageCamera.viewport.x, y: stageCamera.viewport.y, width: stageCamera.viewport.width, height: stageCamera.viewport.height } },
    stageQueueCount: queueIds.size, stageCulledModelCount: modelPhases.size,
    scheduledPhases: scheduled.map(({ queueId, queueKey, phaseId, models }) => ({ queueId, queueKey, phaseId, culledModels: models.length })),
    gfx: { drawCalls: cc.director.root.device.numDrawCalls, triangles: cc.director.root.device.numTris, instances: cc.director.root.device.numInstances },
    source: "Creator 3.8.8 Camera.worldToScreen, Model.worldBounds, WebPipeline executor culling results and submitted instanced buffer/IA counts. Submission is not a per-pixel occlusion guarantee." };
}
export function createStage3dFramingSource() { return `(${readStage3dFraming.toString()})(${readScheduledStageQueues.toString()})`; }

export function assertStage3dFraming(framing) {
  const require = (condition, message) => { if (!condition) throw new Error(`SC0 framing: ${message}`); };
  require(framing?.available, framing?.reason ?? "diagnostics unavailable");
  require(framing.camera.enabled && framing.camera.width === 750 && framing.camera.height === 1624, "stage camera must render 750x1624 pixels");
  require(framing.stageQueueCount > 0, "no submitted stage-camera render queue");
  require(framing.cubes?.length === 500 && new Set(framing.cubes.map((cube) => cube.name)).size === 500, "exactly 500 distinct cube roots required");
  const requiredBindings = new Map(), projected = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let visibleMeshes = 0;
  for (const cube of framing.cubes) {
    require(cube.renderers.length > 0, `${cube.name} has no real MeshRenderer`);
    for (const renderer of cube.renderers) {
      require(renderer.enabled && renderer.active && renderer.modelEnabled && renderer.inStageCulling, `${cube.name} mesh is disabled or absent from actual stage culling`);
      require(renderer.worldBounds && renderer.corners.length === 8, `${cube.name} needs all 8 actual worldBounds corners`);
      for (const point of renderer.corners) {
        require([point?.x, point?.y, point?.z].every(Number.isFinite) && point.x >= 0 && point.x <= 750 && point.y >= 0 && point.y <= 1624
          && point.z >= 0 && point.z <= 1, `${cube.name} worldBounds corner is outside the stage camera: ${JSON.stringify(point)}`);
        projected.minX = Math.min(projected.minX, point.x); projected.maxX = Math.max(projected.maxX, point.x);
        projected.minY = Math.min(projected.minY, point.y); projected.maxY = Math.max(projected.maxY, point.y);
      }
      require(renderer.bindings.length > 0, `${cube.name} has no instanced pass bindings`);
      for (const key of renderer.bindings) requiredBindings.set(key, (requiredBindings.get(key) ?? 0) + 1);
      visibleMeshes++;
    }
  }
  const submissions = [];
  for (const [key, required] of requiredBindings) {
    const batches = framing.batches.filter((batch) => batch.key === key);
    require(batches.length > 0 && batches.every((batch) => batch.count > 0 && batch.uploadedInstanceCount === batch.count), "cube pass/mesh has no matching uploaded instanced draw");
    const submitted = batches.reduce((total, batch) => total + batch.count, 0);
    require(submitted >= required, `cube instanced batch underdraw: ${submitted} submitted, ${required} required`);
    submissions.push({ key, requiredCubeInstances: required, submittedInstances: submitted, batches: batches.length });
  }
  return { cubeCount: 500, visibleMeshes, fullyProjectedCubes: 500, stageQueueCount: framing.stageQueueCount,
    stageCulledModelCount: framing.stageCulledModelCount, scheduledPhases: framing.scheduledPhases,
    camera: framing.camera, projected, submissions, gfx: framing.gfx, source: framing.source };
}

/** Reopening resets input pan before starting the independent 60+240 frame window. */
export async function resetStage3dPerformanceView(probe) {
  const closed = await probe.invoke("close");
  if (closed.fixtureNodes !== 0 || closed.session.businessRefs !== 0) throw new Error("SC0 fixed-view reset did not close the previous fixture");
  const opened = await probe.invoke("open");
  if (!opened.session.ready || opened.logic.x !== 0 || opened.logic.y !== 0 || opened.logic.activePointers !== 0) {
    throw new Error("SC0 fixed-view reset did not restore the initial input/camera state");
  }
  const raw = await probe.client.evaluate(createStage3dFramingSource());
  const result = { raw, summary: null, reset: { previousClosed: true, initialLogic: opened.logic, openedAtMs: opened.atMs } };
  probe.report.framing = { before: result };
  result.summary = assertStage3dFraming(raw);
  return result;
}

/** Browser capture only: observe actual DOM delivery without changing propagation. */
function installTouchTrace(key) {
  globalThis[key]?.stop();
  let seq = 0;
  const records = [];
  const types = ["touchstart", "touchmove", "touchend", "touchcancel"];
  const listener = (event) => {
    const points = (list) => Array.from(list, (touch) => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY }));
    records.push({ seq: ++seq, type: event.type, atMs: performance.now(), targetId: event.target?.id ?? null,
      trusted: event.isTrusted, changed: points(event.changedTouches), active: points(event.touches) });
  };
  for (const type of types) window.addEventListener(type, listener, { capture: true, passive: true });
  globalThis[key] = { read: (after = 0) => ({ seq, records: records.filter((record) => record.seq > after) }),
    stop: () => { for (const type of types) window.removeEventListener(type, listener, true); delete globalThis[key]; } };
  return { installed: true };
}
export function createStage3dTouchTraceSource() { return `(${installTouchTrace.toString()})(${JSON.stringify(TOUCH_TRACE)})`; }

/** CDP's live Chrome 153 partial-end behavior differs from its local schema text. */
export class Stage3dTouchDriver {
  constructor(client, evidence = [], wait = sleep) { Object.assign(this, { client, evidence, wait }); this.pointers = new Map(); }
  async cancelActive() {
    if (this.pointers.size === 0) return { dispatched: false, reason: "no-active-touch-sequence" };
    return this.dispatch("touchCancel");
  }
  async dispatch(type, id, point) {
    const beforeIds = [...this.pointers.keys()];
    let touchPoints, changedIds;
    if (type === "touchStart" || type === "touchMove") {
      if (type === "touchStart" && this.pointers.has(id)) throw new Error(`Pointer ${id} already started`);
      if (type === "touchMove" && !this.pointers.has(id)) throw new Error(`Pointer ${id} has not started`);
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new Error("Touch coordinates must be finite");
      this.pointers.set(id, { id, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 });
      touchPoints = [...this.pointers.values()];
      changedIds = [id];
    } else if (type === "touchEnd") {
      const ended = this.pointers.get(id);
      if (!ended) throw new Error(`Pointer ${id} has not started`);
      this.pointers.delete(id);
      // Chrome 153 diagnostic: a nonempty touchEnd array names the changed /
      // ended points, not the remaining points. Last-finger end uses []. The
      // local protocol description instead says every touchEnd must be empty;
      // per-command DOM changedTouches assertions below are the actual proof.
      touchPoints = this.pointers.size ? [ended] : [];
      changedIds = [id];
    } else if (type === "touchCancel") {
      this.pointers.clear();
      touchPoints = [];
      changedIds = beforeIds;
    } else throw new Error(`Unsupported touch command ${type}`);
    const command = { type, touchPoints };
    const observation = { command, expectedChangedIds: changedIds, expectedActiveIds: [...this.pointers.keys()], status: "running", events: [] };
    this.evidence.push(observation);
    try {
      const before = await this.client.evaluate(`globalThis[${JSON.stringify(TOUCH_TRACE)}].read()`);
      await this.client.send("Input.dispatchTouchEvent", command);
      await this.wait(70);
      const received = await this.client.evaluate(`globalThis[${JSON.stringify(TOUCH_TRACE)}].read(${before.seq})`);
      observation.events = received.records;
      const expectedType = type.toLowerCase();
      const actualIds = received.records.flatMap((record) => record.changed.map((touch) => touch.id));
      const sameIds = (left, right) => JSON.stringify([...left].sort((a, b) => a - b)) === JSON.stringify([...right].sort((a, b) => a - b));
      if (!sameIds(actualIds, changedIds) || received.records.some((record) => record.type !== expectedType || record.targetId !== "GameCanvas" || !record.trusted)) {
        throw new Error(`${type} DOM delivery mismatch: expected changed IDs ${JSON.stringify(changedIds)}, observed ${JSON.stringify(received.records)}`);
      }
      if (received.records.length && !sameIds(received.records.at(-1).active.map((touch) => touch.id), observation.expectedActiveIds)) {
        throw new Error(`${type} DOM active pointers differ from expected ${JSON.stringify(observation.expectedActiveIds)}`);
      }
      observation.status = "passed";
      return observation;
    } catch (error) { observation.status = "failed"; observation.error = error instanceof Error ? error.message : String(error); throw error; }
  }
}

export function parseStage3dProbeArgs(argv) {
  const options = { mode: "fixture", preview: "http://127.0.0.1:7457", devtools: "http://127.0.0.1:9222",
    cycles: 20, expectWebgl: null, reuse: false, tabId: null, out: null, summary: null, scene: null,
    bootTimeoutMs: 300_000, stepTimeoutMs: 30_000, startupFrames: 600 };
  const strings = { "--mode": "mode", "--preview": "preview", "--devtools": "devtools", "--out": "out", "--summary": "summary", "--scene": "scene", "--tab": "tabId" };
  const integers = { "--cycles": "cycles", "--boot-timeout": "bootTimeoutMs", "--step-timeout": "stepTimeoutMs", "--startup-frames": "startupFrames", "--expect-webgl": "expectWebgl" };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--new-window") { options.newWindow = true; continue; }
    if (arg === "--input-only") { options.inputOnly = true; continue; }
    if (arg === "--force-webgl1") { options.forceWebgl1 = true; continue; }
    if (arg === "--reuse") { options.reuse = true; continue; }
    const key = strings[arg] ?? integers[arg];
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    options[key] = integers[arg] ? Number(value) : value;
    if (integers[arg] && (!Number.isSafeInteger(options[key]) || options[key] <= 0)) throw new Error(`${arg} needs a positive integer`);
  }
  if (!["fixture", "snake"].includes(options.mode)) throw new Error("--mode must be fixture or snake");
  if (options.newWindow && options.reuse) throw new Error("--new-window requires a fresh probe page");
  if (options.tabId && !options.reuse) throw new Error("--tab requires --reuse; fresh fixture runs create their own tab");
  if (options.expectWebgl !== null && ![1, 2].includes(options.expectWebgl)) throw new Error("--expect-webgl must be 1 or 2");
  if (options.forceWebgl1 && (options.reuse || options.expectWebgl !== 1))
    throw new Error("--force-webgl1 requires a fresh run with --expect-webgl 1");
  for (const key of ["preview", "devtools"]) {
    const url = new URL(options[key]);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error(`${key} must use a loopback host`);
    options[key] = url.toString().replace(/\/$/u, "");
  }
  return options;
}

/** Exact reuse selection; a same-prefix port/path or a non-page target is not a match. */
export function selectStage3dReuseTab(tabs, { preview, tabId = null, reuse }) {
  if (!reuse) throw new Error("Existing tab selection requires --reuse");
  const base = new URL(preview);
  const matchesPreview = (tab) => {
    if (tab.type !== "page") return false;
    try {
      const url = new URL(tab.url);
      const prefix = base.pathname.replace(/\/$/u, "");
      return url.origin === base.origin && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
    } catch { return false; }
  };
  let selected;
  if (tabId) {
    selected = tabs.find((tab) => tab.id === tabId);
    if (!selected || !matchesPreview(selected)) throw new Error(`--tab ${tabId} must identify a page at the requested preview origin/path`);
  } else {
    const candidates = tabs.filter(matchesPreview);
    if (candidates.length !== 1) throw new Error(`Expected one existing preview page; found ${candidates.length}. Select an exact page with --reuse --tab ID.`);
    selected = candidates[0];
  }
  if (typeof selected.webSocketDebuggerUrl !== "string" || !selected.webSocketDebuggerUrl) throw new Error("Selected page has no CDP websocket endpoint");
  return { wsUrl: selected.webSocketDebuggerUrl, id: selected.id, created: false };
}

export function validateStage3dPrefabMetadata(metadata, name) {
  if (metadata?.importer !== "gltf" || metadata.imported !== true) throw new Error(`${name} was not imported by Creator's gltf importer`);
  const scenes = [];
  const visit = (entry) => {
    if (entry?.importer === "gltf-scene") scenes.push(entry);
    for (const child of Object.values(entry?.subMetas ?? {})) visit(child);
  };
  visit(metadata);
  const scene = scenes.find((entry) => entry.name === `${name}.prefab` || entry.name === name || entry.displayName === name);
  if (!scene?.uuid || scene.imported !== true) throw new Error(`${name}: no imported, named gltf-scene Prefab subresource`);
  return { name, uuid: metadata.uuid, prefabUuid: scene.uuid, prefabPath: `stage3d/${name}/${name}`, importedName: scene.name };
}

export function assertStage3dClosedBaseline(baseline, samples) {
  if (!samples.length) throw new Error("No closed-cycle evidence");
  for (const [index, sample] of samples.entries()) {
    if (sample.session.businessRefs !== 0 || sample.fixtureNodes !== 0 || sample.input.ownersCount !== 0 || sample.input.active) {
      throw new Error(`Cycle ${index + 1}: fixture nodes/references/input owners did not return to zero`);
    }
    if (sample.sceneNodes !== baseline.sceneNodes) throw new Error(`Cycle ${index + 1}: scene nodes differ from prewarmed baseline`);
    for (const key of ["bufferBytes", "textureBytes"]) {
      if (!Number.isFinite(sample.gfx[key]) || sample.gfx[key] > baseline.gfx[key]) {
        throw new Error(`Cycle ${index + 1}: ${key} exceeds the stable prewarmed baseline`);
      }
    }
  }
  return { cycles: samples.length, baseline: baseline.gfx, closedGfx: samples.map((sample) => sample.gfx),
    criterion: "each closed cycle <= stable prewarmed buffer/texture bytes; exact scene-node count; zero fixture refs/owners" };
}

/** Validate observed state/texture/pass identities, never the layout registration alone. */
export function assertStage3dSkinningPhase(state, group = "main", clipIndex = null) {
  const require = (condition, message) => { if (!condition) throw new Error(`Skinning ${group}: ${message}`); };
  const layout = state.session.skinning;
  require(layout?.mainClips?.length === 2 && layout?.atlasBClips?.length === 2, "missing two main/two alternate clip identities");
  const instances = state.animation.skinningInstances;
  require(instances?.length === 100, "expected 100 observed main-prefab instances");
  require(new Set(instances.map((entry) => entry.id)).size === 100, "duplicate instance identities");
  const main = instances.filter((entry) => /^Stage3dSpike\.Biped\.\d+$/u.test(entry.name));
  const targets = instances.filter((entry) => entry.name === "Stage3dSpike.CrossAtlas");
  require(main.length === 99 && targets.length === 1, "missing 99 common instances and one CrossAtlas instance");
  const target = targets[0];
  const mainClipCounts = new Map();
  const mainTextures = new Set();
  const mainPasses = new Map();
  const bindings = (entry) => entry.renderers.flatMap((renderer) => renderer.subModels.flatMap((subModel) =>
    subModel.passes.map((pass) => ({ key: `${renderer.meshHash}/${subModel.index}/${subModel.instancedStride}/${pass.index}`,
      passId: pass.id, textureId: renderer.texture.id }))));
  for (const entry of instances) {
    const expected = entry === target && group === "atlasB" ? layout.atlasBClips : layout.mainClips;
    require(entry.animations.length === 1 && entry.animations[0].baked && entry.animations[0].enabled, `${entry.name}: missing live baked animation`);
    const playing = entry.animations[0].playing;
    require(playing.length === 1 && !playing[0].paused && Number.isFinite(playing[0].time), `${entry.name}: expected one advancing animation state`);
    require(expected.some((clip) => clip.hash === playing[0].clip.hash && clip.name === playing[0].clip.name), `${entry.name}: wrong actual playing clip`);
    if (entry === target && clipIndex !== null) require(playing[0].clip.hash === expected[clipIndex]?.hash, "target did not enter requested clip");
    require(entry.renderers.length > 0, `${entry.name}: no SkinnedMeshRenderer`);
    for (const renderer of entry.renderers) {
      require(renderer.texture && Number.isInteger(renderer.texture.id), `${entry.name}: missing actual joint texture`);
      require(["RGBA32F", "RGBA8"].includes(renderer.texture.formatName), `${entry.name}: actual joint texture format is unobservable/unexpected`);
      const pixelsPerJoint = renderer.texture.formatName === "RGBA32F" ? 3 : 12;
      require(Number.isInteger(renderer.texture.width) && renderer.texture.width > 0
        && renderer.texture.width % pixelsPerJoint === 0,
      `${entry.name}: joint texture width ${renderer.texture.width} splits ${pixelsPerJoint}-pixel joint records across shader rows`);
      require(Number.isInteger(renderer.jointTexturePixelOffset) && renderer.jointTexturePixelOffset >= 0
        && renderer.jointTexturePixelOffset % pixelsPerJoint === 0,
      `${entry.name}: joint texture pixel offset ${renderer.jointTexturePixelOffset} is missing or not aligned to ${pixelsPerJoint}-pixel joint records`);
      require(renderer.skeletonHash === layout.skeletonHash && Number.isFinite(renderer.meshHash), `${entry.name}: unexpected skeleton/mesh`);
      require(renderer.uploadedClip?.hash === playing[0].clip.hash && renderer.sampledClip?.hash === playing[0].clip.hash,
        `${entry.name}: renderer upload/sample disagrees with the playing clip`);
      require(Number.isFinite(renderer.frame), `${entry.name}: baked frame is unavailable`);
      require(renderer.subModels.length > 0, `${entry.name}: no submitted submodel`);
      for (const subModel of renderer.subModels) {
        require(subModel.boundTextureId === renderer.texture.id, `${entry.name}: descriptor binds another joint texture`);
        require(subModel.instancedStride > 0 && subModel.passes.length > 0 && subModel.passes.every((pass) => pass.batchingScheme === 1),
          `${entry.name}: actual pass/attribute layout is not instanced`);
      }
      if (entry !== target) mainTextures.add(renderer.texture.id);
    }
    if (entry !== target) {
      mainClipCounts.set(playing[0].clip.name, (mainClipCounts.get(playing[0].clip.name) ?? 0) + 1);
      for (const binding of bindings(entry)) {
        const passes = mainPasses.get(binding.key) ?? new Set();
        passes.add(binding.passId);
        mainPasses.set(binding.key, passes);
      }
    }
  }
  require(layout.mainClips.every((clip) => mainClipCounts.has(clip.name)), "the two main clips are not playing concurrently");
  require(mainTextures.size === 1, "main clips do not share one actual GPU texture");
  require([...mainPasses.values()].every((passes) => passes.size === 1), "compatible main instances do not share a material pass");
  const mainTextureId = [...mainTextures][0];
  const targetTextures = new Set(target.renderers.map((renderer) => renderer.texture.id));
  require(targetTextures.size === 1, "target renderers disagree about their texture");
  const targetTextureId = [...targetTextures][0];
  require(group === "atlasB" ? targetTextureId !== mainTextureId : targetTextureId === mainTextureId,
    "target GPU texture did not switch to / return from the alternate atlas");
  const targetBindings = bindings(target);
  for (const binding of targetBindings) {
    const compatible = mainPasses.get(binding.key);
    require(compatible, "CrossAtlas geometry/instance layout differs from the main prefab");
    require(group === "atlasB" ? !compatible.has(binding.passId) : compatible.has(binding.passId),
      "cross-atlas material pass did not split / rejoin (WebPipeline does not split by joint texture)");
  }
  require(state.gfx.drawCalls > 0 && state.gfx.triangles > 0 && state.gfx.instances > 0, "no real instanced rendering counters");
  return { mainTextureId, targetTextureId, targetId: target.id, targetModelIds: target.renderers.map((renderer) => renderer.modelId),
    mainClipCounts: [...mainClipCounts].map(([name, count]) => ({ name, count })), targetBindings,
    textureFormats: [...new Set(instances.flatMap((entry) => entry.renderers.map((renderer) => renderer.texture.format)))],
    textureFormatNames: [...new Set(instances.flatMap((entry) => entry.renderers.map((renderer) => renderer.texture.formatName)))], gfx: state.gfx };
}

export function assertStage3dSkinningTransition(before, alternate0, alternate1, restored) {
  const phases = [assertStage3dSkinningPhase(before), assertStage3dSkinningPhase(alternate0, "atlasB", 0),
    assertStage3dSkinningPhase(alternate1, "atlasB", 1), assertStage3dSkinningPhase(restored, "main", 0)];
  for (const phase of phases.slice(1)) {
    if (phase.targetId !== phases[0].targetId || JSON.stringify(phase.targetModelIds) !== JSON.stringify(phases[0].targetModelIds)) {
      throw new Error("Skinning transition replaced the target instance/model instead of switching its clip");
    }
    if (phase.mainTextureId !== phases[0].mainTextureId) throw new Error("Skinning transition changed the common main texture");
  }
  if (phases[1].targetTextureId !== phases[2].targetTextureId) throw new Error("Alternate clips do not share their second GPU texture");
  if (JSON.stringify(phases[1].targetBindings) !== JSON.stringify(phases[2].targetBindings)) throw new Error("Alternate clips do not share a compatible material pass");
  if (JSON.stringify(phases[0].targetBindings) !== JSON.stringify(phases[3].targetBindings)) throw new Error("Restoring the main clip did not restore its original pass/texture bindings");
  return { phases, criterion: "one unchanged instance/model: shared main texture/pass -> distinct alternate texture/pass -> original shared bindings", visualReview: "pending screenshot review; state and texture identities alone do not prove visual correctness" };
}

export function assertStage3dRealtimePhase(state) {
  const require = (condition, message) => { if (!condition) throw new Error(`Realtime skinning: ${message}`); };
  const instances = state.animation?.skinningInstances ?? [];
  const target = instances.find((entry) => entry.name === "Stage3dSpike.CrossAtlas");
  require(instances.length === 100 && target, "the original 100-instance fixture must remain present");
  const others = instances.filter((entry) => entry !== target);
  require(new Set(instances.map((entry) => entry.id)).size === 100, "duplicate instance identities");
  require(others.length === 99 && others.every((entry) => entry.animations.length === 1 && entry.animations.every((animation) => animation.baked && animation.enabled)
    && entry.renderers.length > 0 && entry.renderers.every((renderer) => renderer.modelType === "BakedSkinningModel" && renderer.modelTypeId === 2 && renderer.texture
      && renderer.subModels.length > 0 && renderer.subModels.every((subModel) => subModel.passes.length > 0 && subModel.passes.every((pass) => pass.batchingScheme === 1)))), "the other 99 instances must stay baked/instanced");
  require(target.animations.length === 1 && target.animations[0].enabled && !target.animations[0].baked, "target is not the live non-baked animation");
  const playing = target.animations[0].playing;
  require(playing.length === 1 && !playing[0].paused && Number.isFinite(playing[0].time)
    && playing[0].clip.hash === state.session.skinning.mainClips[0].hash, "target must actually play the selected main clip");
  require(target.renderers.length > 0, "target has no real renderer");
  for (const renderer of target.renderers) {
    require(renderer.modelType === "SkinningModel" && renderer.modelTypeId === 1 && renderer.texture === null, "expected real SkinningModel without a baked joints texture");
    require(renderer.realtime?.jointCount > 0 && renderer.realtime.textureMode === false && renderer.realtime.buffers.length > 0
      && renderer.realtime.buffers.every((buffer) => Number.isInteger(buffer.id) && buffer.size > 0),
      "two-bone realtime model must expose real joint UBOs");
    require(renderer.realtime.jointMatrices.length > 0 && renderer.realtime.jointMatrices.every((data) => data.length >= 12 && data.every(Number.isFinite)), "joint matrices are not observable");
    require(renderer.subModels.length > 0, "target has no submodels");
    for (const subModel of renderer.subModels) {
      require(subModel.passes.length > 0 && subModel.passes.every((pass) => pass.batchingScheme === 0), "realtime passes still enable instancing");
      require(Number.isInteger(subModel.expectedSkinningBufferId) && subModel.boundSkinningBufferId === subModel.expectedSkinningBufferId, "real joint UBO is not bound to descriptor slot 3");
      require(subModel.scheduledPassIndices?.length > 0 && subModel.scheduledPassIndices.every((index) => subModel.nonInstancedDrawPasses.includes(index)),
        "target submodel was not submitted to the scheduled stage non-instanced draw queue");
    }
  }
  return { targetId: target.id, bakedSiblings: 99, playing: playing[0], gfx: state.gfx,
    renderers: target.renderers.map((renderer) => ({ modelId: renderer.modelId, modelType: renderer.modelType, modelTypeId: renderer.modelTypeId,
      texture: renderer.texture, realtime: renderer.realtime, subModels: renderer.subModels.map((subModel) => ({ index: subModel.index,
        batchingSchemes: subModel.passes.map((pass) => pass.batchingScheme), scheduledPassIndices: subModel.scheduledPassIndices, directDrawPasses: subModel.nonInstancedDrawPasses,
        boundSkinningBufferId: subModel.boundSkinningBufferId })) })) };
}

export function assertStage3dRealtimeAdvancement(before, after) {
  const old = assertStage3dRealtimePhase(before), next = assertStage3dRealtimePhase(after);
  if (old.targetId !== next.targetId || old.playing.clip.hash !== next.playing.clip.hash || old.playing.time === next.playing.time
    || JSON.stringify(old.renderers.map((renderer) => renderer.realtime.jointMatrices)) === JSON.stringify(next.renderers.map((renderer) => renderer.realtime.jointMatrices))) {
    throw new Error("Realtime skinning: both playing time and actual joint matrices must advance on the same instance");
  }
  return { beforeTime: old.playing.time, afterTime: next.playing.time, matricesChanged: true, targetId: next.targetId };
}

export function assertStage3dRealtimeRestored(before, realtime, restored) {
  const first = assertStage3dSkinningPhase(before);
  const sample = assertStage3dRealtimePhase(realtime);
  const last = assertStage3dSkinningPhase(restored, "main", 0);
  if (first.targetId !== sample.targetId || sample.targetId !== last.targetId) throw new Error("Realtime skinning: the target instance changed");
  const stableBindings = (state, siblingsOnly) => state.animation.skinningInstances
    .filter((instance) => !siblingsOnly || instance.name !== "Stage3dSpike.CrossAtlas")
    .map((instance) => ({ id: instance.id, renderers: instance.renderers.map((renderer) => ({
      // Model objects may be returned from Creator's pool after the controlled replacement.
      modelId: siblingsOnly ? renderer.modelId : null, modelType: renderer.modelType, modelTypeId: renderer.modelTypeId,
      textureId: renderer.texture?.id, passes: renderer.subModels.map((subModel) => subModel.passes.map((pass) => [pass.id, pass.batchingScheme])),
    })) }));
  if (JSON.stringify(stableBindings(before, true)) !== JSON.stringify(stableBindings(realtime, true))
    || JSON.stringify(stableBindings(before, true)) !== JSON.stringify(stableBindings(restored, true))) {
    throw new Error("Realtime skinning: another baked instance's model/texture/pass was changed");
  }
  if (JSON.stringify(stableBindings(before, false)) !== JSON.stringify(stableBindings(restored, false))
    || restored.animation.skinningInstances.some((instance) => instance.renderers.some((renderer) => renderer.modelType !== "BakedSkinningModel" || renderer.modelTypeId !== 2))) {
    throw new Error("Realtime skinning: restoring baked did not restore its original shared texture/pass and actual model type");
  }
  return { targetId: sample.targetId, bakedSiblingsUnchanged: 99, restoredModelType: "BakedSkinningModel",
    restoredBatchingScheme: 1, restoredTextureId: last.targetTextureId, originalBindingsRestored: true };
}

/** Pure, reviewable numeric summary. Full snapshots/DOM traces remain in the local report. */
export function createStage3dProbeSummary(report, evidence) {
  if (!evidence?.reportPath || !/^[a-f0-9]{64}$/u.test(evidence.reportSha256 ?? "")) throw new Error("A local report path and exact SHA256 are required");
  const duration = (start, end) => { const value = Date.parse(end) - Date.parse(start); return Number.isFinite(value) && value >= 0 ? value : null; };
  const compactState = (state) => state ? { atMs: state.atMs, visible: state.visible, sceneNodes: state.sceneNodes, fixtureNodes: state.fixtureNodes,
    cubes: state.cubes, bipeds: state.bipeds, particles: state.particles, businessRefs: state.session?.businessRefs,
    ready: state.session?.ready, error: state.session?.error, input: { active: state.input?.active, blocked: state.input?.blocked,
      ownersCount: state.input?.ownersCount }, gfx: state.gfx } : null;
  const compactPerformance = (entry) => {
    if (!entry) return null;
    const value = entry.raw ? aggregateStage3dSampling(entry.raw) : entry.summary;
    if (!value) return null;
    return { valid: value.valid, reasons: value.reasons, clock: entry.raw?.clock, frameEvent: entry.raw?.frameEvent,
      options: entry.raw?.options, startedAtMs: entry.raw?.startedAtMs, endedAtMs: entry.raw?.endedAtMs,
      readyAtMs: entry.readyAtMs ?? null, visibilityChanges: entry.raw?.visibilityChanges,
      rawFrameIntervalsMs: value.rawFrameIntervalsMs, frameIntervals: value.frameIntervals,
      allFramesPeak: value.allFramesPeak, lastFrame: value.lastFrame };
  };
  const compactSkinning = (state) => {
    if (!state) return null;
    const groups = new Map();
    const instances = state.animation?.skinningInstances ?? [];
    for (const instance of instances) {
      const clip = instance.animations[0]?.playing[0]?.clip;
      for (const renderer of instance.renderers) for (const subModel of renderer.subModels) for (const pass of subModel.passes) {
        const key = JSON.stringify([clip?.hash, renderer.texture?.id, renderer.meshHash, subModel.index, subModel.instancedStride, pass.id]);
        const group = groups.get(key) ?? { clip, texture: renderer.texture, meshHash: renderer.meshHash, subModel: subModel.index,
          instancedStride: subModel.instancedStride, passId: pass.id, batchingScheme: pass.batchingScheme, instances: new Set(), renderers: 0 };
        group.instances.add(instance.id); group.renderers++;
        groups.set(key, group);
      }
    }
    const target = instances.find((instance) => instance.name === "Stage3dSpike.CrossAtlas");
    return { atMs: state.atMs, visible: state.visible, instanceCount: instances.length,
      groups: [...groups.values()].map((group) => ({ ...group, instances: group.instances.size })),
      target: target ? { id: target.id, uuid: target.uuid, playing: target.animations[0]?.playing,
        renderers: target.renderers.map((renderer) => ({ modelId: renderer.modelId, textureId: renderer.texture?.id,
          uploadedClip: renderer.uploadedClip, sampledClip: renderer.sampledClip, frame: renderer.frame,
          passIds: renderer.subModels.flatMap((subModel) => subModel.passes.map((pass) => pass.id)) })) } : null,
      gfx: state.gfx };
  };
  const consoleEntries = report.console ?? [];
  const severityCounts = {};
  for (const entry of consoleEntries) severityCounts[entry.level] = (severityCounts[entry.level] ?? 0) + 1;
  const classification = report.consoleClassification;
  const failures = classification ? classification.unexpectedErrors.map((item) => item.entry)
    : consoleEntries.filter((entry) => ["error", "uncaught", "rejection"].includes(entry.level));
  const skinning = report.skinning;
  const phases = skinning?.phases ?? {};
  const cameraStep = report.steps?.find((step) => step.name === "camera-and-layer-configuration");
  const initialStep = report.steps?.find((step) => step.name === "initial-load-and-first-activation");
  const commands = report.touchTransport?.commands ?? [];
  const domCounts = {};
  for (const event of report.touchTransport?.domEvents ?? []) domCounts[event.type] = (domCounts[event.type] ?? 0) + 1;
  return {
    schemaVersion: 2, kind: "stage3d-numeric-summary", scenario: report.scenario, startedAt: report.startedAt, finishedAt: report.finishedAt,
    durationMs: duration(report.startedAt, report.finishedAt), options: report.options,
    executedOk: report.executedOk, ok: report.ok, exitCode: report.exitCode, sc0Exit: report.sc0Exit,
    error: report.error ?? null, cleanupError: report.cleanupError ?? null, pending: report.pending ?? [],
    evidence: { reportPath: evidence.reportPath, reportSha256: evidence.reportSha256, storage: "local-only raw report and screenshots",
      screenshots: skinning?.screenshots ?? {}, realtimeScreenshots: report.realtimeSkinning?.screenshots ?? {},
      note: "Report SHA256 identifies the exact raw JSON bytes; paths do not imply screenshot/visual approval." },
    environment: report.environment ?? report.bootstrap?.baseline?.environment ?? null, viewport: report.viewport ?? null,
    boot: report.boot ?? null, consoleClassification: classification ? { ruleId: classification.ruleId, context: classification.context,
      bootDiagnosticCutoffAtEpochMs: classification.bootDiagnosticCutoffAtEpochMs,
      windowValid: classification.windowValid, expectedBootDiagnostics: classification.expectedBootDiagnostics.length,
      unexpectedErrors: classification.unexpectedErrors.length, nonErrorCount: classification.nonErrorCount } : null,
    cameras: cameraStep?.detail?.cameras ?? null, layers: cameraStep?.detail?.layers ?? null,
    steps: (report.steps ?? []).map((step) => ({ name: step.name, status: step.status, error: step.error ?? null,
      durationMs: duration(step.startedAt, step.finishedAt), screenshot: step.screenshot ?? null })),
    initialState: compactState(initialStep?.detail?.opened), finalState: compactState(report.finalState),
    startupPerformance: compactPerformance(report.startupPerformance), performance: compactPerformance(report.performance),
    framing: report.framing ? { reset: report.framing.before?.reset ?? null,
      before: report.framing.before?.summary ?? null, after: report.framing.after?.summary ?? null,
      cameraUnchanged: report.framing.cameraUnchanged ?? null } : null,
    skinning: skinning ? { observation: skinning.observation, layout: Object.values(phases).find((phase) => phase.session?.skinning)?.session.skinning ?? null,
      phases: Object.fromEntries(Object.entries(phases).map(([name, state]) => [name, compactSkinning(state)])),
      transition: skinning.transition ?? null, mainAdvancingClips: skinning.mainAdvancingClips ?? [], alternateAdvancingClips: skinning.alternateAdvancingClips ?? [],
      drawCallChanges: skinning.drawCallChanges ?? null, visualReview: skinning.visualReview, errors: skinning.errors ?? [],
      restoredAfterFailure: compactSkinning(skinning.restoredAfterFailure) } : null,
    realtimeSkinning: report.realtimeSkinning ? { observation: report.realtimeSkinning.observation,
      proof: report.realtimeSkinning.proof ?? null, advancement: report.realtimeSkinning.advancement ?? null,
      restoration: report.realtimeSkinning.restoration ?? null, errors: report.realtimeSkinning.errors ?? [],
      phases: Object.fromEntries(Object.entries(report.realtimeSkinning.phases ?? {}).map(([name, state]) => [name, compactSkinning(state)])),
      visualReview: report.realtimeSkinning.visualReview, restoredAfterFailure: compactSkinning(report.realtimeSkinning.restoredAfterFailure) } : null,
    resources: { prewarm: report.prewarm ? { note: report.prewarm.note, baseline: compactState(report.prewarm.baseline),
      closes: report.prewarm.closes.map(compactState) } : null,
      cycles: (report.cycles ?? []).map((cycle) => ({ cycle: cycle.cycle, opened: compactState(cycle.opened),
        closeMode: cycle.closeMode ?? null, realtime: cycle.realtimeProof ?? null, restored: cycle.restorationProof ?? null, closed: compactState(cycle.closed) })) },
    input: { browser: report.touchTransport?.browser ?? null, policy: report.touchTransport?.policy ?? null,
      commands: commands.length, passedCommands: commands.filter((command) => command.status === "passed").length,
      failedCommands: commands.filter((command) => command.status !== "passed").map((command) => ({ type: command.command.type,
        expectedChangedIds: command.expectedChangedIds, actualChangedIds: command.events?.flatMap((event) => event.changed.map((touch) => touch.id)) ?? [],
        status: command.status, error: command.error ?? null })), domCounts,
      finalCounters: report.finalState?.input?.counters ?? null },
    console: { total: consoleEntries.length, severityCounts, failures: failures.slice(0, 20).map((entry) => ({ level: entry?.level,
      at: entry?.at, text: entry?.text?.slice(0, 500) })), omittedFailureMessages: Math.max(0, failures.length - 20) },
  };
}

/** Offline regeneration for an already captured local report; never opens Creator/CDP. */
export function writeStage3dProbeSummary(reportPath, summaryPath) {
  const absoluteReport = path.resolve(reportPath);
  const bytes = fs.readFileSync(absoluteReport);
  const summary = createStage3dProbeSummary(JSON.parse(bytes.toString("utf8")), {
    reportPath: absoluteReport, reportSha256: createHash("sha256").update(bytes).digest("hex"),
  });
  fs.mkdirSync(path.dirname(path.resolve(summaryPath)), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

/** Serialized browser code; imports only URLs actually discovered in System.entries(). */
async function installHarness(mode, key, readViewport, readScheduledQueues) {
  if (typeof System === "undefined" || typeof System.entries !== "function") throw new Error("Creator SystemJS registry is unavailable");
  const discover = async (exportName) => {
    const matches = [...System.entries()].filter(([, module]) => module && module[exportName] !== undefined);
    if (matches.length !== 1) throw new Error(`Expected one loaded SystemJS export ${exportName}; found ${matches.length}`);
    const [url] = matches[0];
    return { url, module: await System.import(url) };
  };
  const managerImport = await discover("ViewMgr");
  const sessionImport = await discover("fixtureSession");
  const inputImport = await discover("rawInput");
  const manager = managerImport.module.ViewMgr;
  const session = sessionImport.module.fixtureSession;
  const readInput = () => inputImport.module.rawInput.inspect();
  if (globalThis[key]?.close) await globalThis[key].close();
  let worldHandle = null;
  let hudHandle = null;
  const textureIds = new WeakMap();
  let nextTextureId = 0;
  const objectIds = new WeakMap();
  let nextObjectId = 0;
  const identify = (object) => { if (!object) return null; if (!objectIds.has(object)) objectIds.set(object, ++nextObjectId); return objectIds.get(object); };
  const textureInfo = (texture) => {
    if (!texture) return null;
    if (!textureIds.has(texture)) textureIds.set(texture, ++nextTextureId);
    return { id: textureIds.get(texture), width: texture.width, height: texture.height, format: texture.format,
      formatName: cc.gfx?.Format?.[texture.format] ?? null };
  };
  const clipInfo = (clip) => clip ? { name: clip.name, hash: clip.hash } : null;
  const waitFrames = (count = 3) => new Promise((resolve, reject) => {
    let remaining = count;
    const timer = setTimeout(() => { cc.director.off(cc.Director.EVENT_AFTER_DRAW, tick); reject(new Error("No visible AFTER_DRAW frames")); }, 10_000);
    function tick() { if (--remaining <= 0) { clearTimeout(timer); cc.director.off(cc.Director.EVENT_AFTER_DRAW, tick); resolve(); } }
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, tick);
  });
  const snapshot = () => {
    const scene = cc.director.getScene();
    const device = cc.director.root.device;
    const nodes = [];
    const visit = (node) => { nodes.push(node); for (const child of node.children) visit(child); };
    visit(scene);
    const gl = device.gl;
    const glVersion = gl ? gl.getParameter(gl.VERSION) : null;
    const webgl = typeof glVersion === "string" && /WebGL 2/u.test(glVersion) ? 2
      : typeof glVersion === "string" && /WebGL 1/u.test(glVersion) ? 1 : null;
    const debugRenderer = gl?.getExtension("WEBGL_debug_renderer_info");
    const format = cc.gfx?.Format;
    const sampledBit = cc.gfx?.FormatFeatureBit?.SAMPLED_TEXTURE;
    const formatFeatures = (value) => typeof device.getFormatFeatures === "function" && typeof value === "number" ? device.getFormatFeatures(value) : null;
    const rgba32fFeatures = formatFeatures(format?.RGBA32F);
    const rgba8Features = formatFeatures(format?.RGBA8);
    const hasTouchFeatureApi = typeof cc.sys?.hasFeature === "function";
    const cameras = scene.getComponentsInChildren("cc.Camera").map((camera) => ({
      node: camera.node.name, enabled: camera.enabled && camera.node.activeInHierarchy,
      priority: camera.priority, visibility: camera.visibility, projection: camera.projection,
      clearFlags: camera.clearFlags, rect: { x: camera.rect.x, y: camera.rect.y, width: camera.rect.width, height: camera.rect.height },
    }));
    const stageCamera = scene.getComponentsInChildren("cc.Camera").find((camera) => camera.node.name === "Stage3DCamera")?.camera;
    const culling = cc.director.root.pipeline?._executor?._context?.culling;
    const directDraws = new Map(), modelPhases = new Map();
    for (const { queueId, phaseId, models } of readScheduledQueues(culling, stageCamera)) {
      for (const model of models) { const phases = modelPhases.get(model) ?? new Set(); phases.add(phaseId); modelPhases.set(model, phases); }
      const queue = culling.renderQueues[queueId];
      for (const kind of ["opaqueQueue", "transparentQueue"]) for (const draw of queue[kind]?.instances ?? []) {
        if (draw.subModel?.passes[draw.passIndex]?.phaseID !== phaseId) continue;
        const passes = directDraws.get(draw.subModel) ?? new Set(); passes.add(draw.passIndex); directDraws.set(draw.subModel, passes);
      }
    }
    const groups = new Map();
    const clips = new Map();
    let bakedAnimations = 0, skinnedRenderers = 0, missingJointTexture = 0;
    for (const node of nodes) {
      if (!node.activeInHierarchy) continue;
      const animation = node.getComponent("cc.SkeletalAnimation");
      if (animation) {
        if (animation.useBakedAnimation) bakedAnimations++;
        for (const clip of animation.clips.filter(Boolean)) {
          const state = animation.getState(clip.name);
          if (state?.isPlaying) clips.set(clip.name, (clips.get(clip.name) ?? 0) + 1);
        }
      }
      const renderer = node.getComponent("cc.SkinnedMeshRenderer");
      if (!renderer) continue;
      skinnedRenderers++;
      // Read-only diagnostics of the locked 3.8.8 baked-skinning model; no mutation.
      const model = renderer.model;
      const medium = model?._jointsMedium;
      const texture = medium?.texture?.handle?.texture;
      if (!texture) { missingJointTexture++; continue; }
      const info = textureInfo(texture);
      const id = info.id;
      const entry = groups.get(id) ?? { ...info, renderers: 0, modelType: model.constructor?.name };
      entry.renderers++;
      groups.set(id, entry);
    }
    const bipedRoots = nodes.filter((node) => /^Stage3dSpike\.Biped\.\d+$/u.test(node.name) || node.name === "Stage3dSpike.CrossAtlas");
    const skinningInstances = bipedRoots.map((node) => ({
      name: node.name, id: identify(node), uuid: node.uuid,
      animations: node.getComponentsInChildren("cc.SkeletalAnimation").map((animation) => ({
        id: identify(animation), baked: animation.useBakedAnimation, enabled: animation.enabled && animation.node.activeInHierarchy,
        playing: animation.clips.filter(Boolean).map((clip) => animation.getState(clip.name)).filter((state) => state?.isPlaying)
          .map((state) => ({ clip: clipInfo(state.clip), time: state.time, paused: state.isPaused })),
      })),
      renderers: node.getComponentsInChildren("cc.SkinnedMeshRenderer").map((renderer) => {
        const model = renderer.model, medium = model?._jointsMedium;
        return { id: identify(renderer), modelId: identify(model), skeletonHash: renderer.skeleton?.hash ?? null, meshHash: renderer.mesh?.hash ?? null,
          modelType: model?.constructor?.name ?? null, modelTypeId: model?.type ?? null,
          texture: textureInfo(medium?.texture?.handle?.texture), jointTexturePixelOffset: medium?.texture?.pixelOffset ?? null,
          uploadedClip: clipInfo(model?.uploadedAnim),
          sampledClip: clipInfo(medium?.animInfo?.currentClip), frame: medium?.animInfo?.data?.[0] ?? null,
          realtime: model?.constructor?.name === "SkinningModel" ? {
            jointCount: model._joints?.length ?? null, textureMode: model._realTimeTextureMode ?? null,
            buffers: (model._buffers ?? []).map((buffer) => ({ id: identify(buffer), size: buffer.size })),
            jointMatrices: (model._dataArray ?? []).map((data) => Array.from(data).slice(0, (renderer.skeleton?.joints?.length ?? 0) * 12)),
          } : null,
          subModels: (model?.subModels ?? []).map((subModel, index) => ({ index,
            // Locked Creator 3.8.8 rendering/define.ts ModelLocalBindings.SAMPLER_JOINTS = 7.
            boundTextureId: textureInfo(subModel.descriptorSet?.getTexture(7))?.id ?? null,
            instancedStride: subModel.instancedAttributeBlock?.buffer?.length ?? 0,
            nonInstancedDrawPasses: [...directDraws.get(subModel) ?? []],
            scheduledPassIndices: subModel.passes.flatMap((pass, index) => modelPhases.get(model)?.has(pass.phaseID) ? [index] : []),
            boundSkinningBufferId: identify(subModel.descriptorSet?.getBuffer?.(3)),
            expectedSkinningBufferId: identify(model?._buffers?.[model?._bufferIndices?.[index]]),
            passes: subModel.passes.map((pass, index) => ({ index, id: identify(pass), batchingScheme: pass.batchingScheme })),
          })),
        };
      }),
    }));
    const assets = [];
    cc.assetManager?.assets?.forEach?.((asset, uuid) => {
      if (/greybox|Stage3d_Baked/iu.test(asset?.name ?? "")) assets.push({ uuid, name: asset.name, refCount: asset.refCount, type: asset.constructor?.name });
    });
    return {
      atMs: performance.now(), visible: !document.hidden && document.visibilityState === "visible",
      environment: { userAgent: navigator.userAgent, platform: navigator.platform, webgl, glVersion,
        viewport: readViewport(),
        engineInput: { inputTouchFeature: hasTouchFeatureApi ? cc.sys.hasFeature("INPUT_TOUCH") : null,
          capabilitiesTouches: hasTouchFeatureApi ? null : cc.sys?.capabilities?.touches ?? null },
        skinningCapabilities: {
          supportedGlExtensions: gl?.getSupportedExtensions?.() ?? null,
          oesTextureFloat: gl ? !!gl.getExtension("OES_texture_float") : null,
          oesTextureFloatLinear: gl ? !!gl.getExtension("OES_texture_float_linear") : null,
          vertexTextureUnits: gl ? gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) : null,
          rgba32fFormat: format?.RGBA32F ?? null, rgba32fFeatures,
          rgba32fSampled: rgba32fFeatures !== null && typeof sampledBit === "number" ? (rgba32fFeatures & sampledBit) !== 0 : null,
          rgba8Format: format?.RGBA8 ?? null, rgba8Features,
          rgba8Sampled: rgba8Features !== null && typeof sampledBit === "number" ? (rgba8Features & sampledBit) !== 0 : null,
          scope: "This browser/context only. Extension-restricted Chrome runs do not establish general device float/RGBA8 support or sampling performance.",
        },
        gpu: debugRenderer ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : null,
        gfxAPI: device.gfxAPI, device: device.constructor?.name, pipeline: cc.director.root.pipeline?.constructor?.name,
        quality: mode === "fixture" ? appPorts().stage3d.quality : null,
        loadPolicy: "Fixed acceptance fixture; population does not follow quality tier capacity" },
      session: { ready: session.ready, error: session.error, businessRefs: session.businessRefs, nodeCount: session.nodeCount, skinning: session.skinning ?? null },
      logic: { starts: session.logic.starts, moves: session.logic.moves, ends: session.logic.ends, cancels: session.logic.cancels,
        wheels: session.logic.wheels, hudClicks: session.logic.hudClicks, x: session.logic.x, y: session.logic.y, activePointers: session.logic.activePointers },
      input: readInput(), sceneNodes: nodes.length,
      fixtureNodes: nodes.filter((node) => (node.name.startsWith("Stage3dSpike.") || node.name.startsWith("Stage3dFixture.") || ["Stage3DRoot", "Stage3DCamera", "Stage3DLight"].includes(node.name))).length,
      cubes: nodes.filter((node) => /^Stage3dSpike\.Cube\.\d+$/u.test(node.name)).length,
      bipeds: bipedRoots.length,
      particles: nodes.filter((node) => node.name === "Stage3dSpike.Particle").length,
      billboards: nodes.filter((node) => node.name === "Stage3dFixture.Billboard").map((node) => {
        const component = node.getComponent("cc.Billboard");
        return { active: node.activeInHierarchy && component?.enabledInHierarchy,
          width: component?.width, height: component?.height,
          modelAttached: !!component?._model?.scene, passes: component?._model?.subModels?.[0]?.passes?.length ?? 0 };
      }),
      snake: { present: nodes.some((node) => node.name === "SnakeWorld" && node.activeInHierarchy),
        controls: nodes.some((node) => node.name === "SnakeWorld.Controls" && node.activeInHierarchy),
        overlays: nodes.filter((node) => /^SnakeWorld\.(Relive|Confirm|Result|Reconnect|ResourceFailure)$/u.test(node.name) && node.activeInHierarchy).map((node) => node.name) },
      baked: nodes.filter((node) => node.name === "Stage3dFixture.Baked").map((node) => ({
        name: node.name, renderers: node.getComponentsInChildren("cc.MeshRenderer").map((renderer) => {
          const texture = renderer.bakeSettings?.texture, model = renderer.model;
          const gfxTexture = texture?.getGFXTexture();
          return { node: renderer.node.name, texture: texture?.uuid ?? null, model: !!model,
            modelLightmap: model?._lightmap?.uuid ?? null,
            // Creator 3.8.8 ModelLocalBindings.SAMPLER_LIGHTMAP = 11; same proof as the B5 probe.
            lightmapBound: !!gfxTexture && model?.subModels.length > 0
              && model.subModels.every((subModel) => subModel.descriptorSet?.getTexture(11) === gfxTexture),
          };
        }),
      })),
      cameras, layers: { DEFAULT: cc.Layers.Enum.DEFAULT, UI_2D: cc.Layers.Enum.UI_2D },
      animation: { bakedAnimations, skinnedRenderers, missingJointTexture, playingClips: [...clips].map(([name, count]) => ({ name, count })), jointTextures: [...groups.values()], skinningInstances },
      gfx: { drawCalls: device.numDrawCalls, triangles: device.numTris, instances: device.numInstances,
        bufferBytes: device.memoryStatus.bufferSize, textureBytes: device.memoryStatus.textureSize }, assets,
    };
  };
  const closeHud = async () => { const previous = hudHandle; hudHandle = null; previous?.close(); await waitFrames(); };
  const close = async () => {
    const hud = hudHandle, world = worldHandle;
    hudHandle = null; worldHandle = null;
    hud?.close(); world?.close();
    await waitFrames();
    return snapshot();
  };
  const rebuildRoot = async () => {
    if (mode !== "fixture") throw new Error("Root reconstruction belongs to the fixture carrier");
    manager.disposeViewRoot();
    hudHandle = null; worldHandle = null;
    await waitFrames();
    return snapshot();
  };
  const openHud = async () => {
    if (hudHandle) throw new Error("Probe HUD is already open");
    hudHandle = await manager.open("Stage3dSpikeHud");
    await waitFrames();
    return snapshot();
  };
  // Read the existing host only for DEV probe injection; the View receives ports
  // explicitly and has no service locator or second Stage3D instance.
  const appPorts = () => {
    const nodes = [cc.director.getScene()];
    const runtimes = [];
    for (const node of nodes) {
      nodes.push(...node.children);
      for (const component of node.components) if (component.constructor.name === "Main" && component.runtime) runtimes.push(component.runtime);
    }
    if (runtimes.length !== 1) throw new Error("Fixture requires exactly one real application runtime");
    const runtime = runtimes[0];
    if (runtime.ports.stage3d !== runtime.gameplayServices.stage3d) throw new Error("Stage3D ports disagree");
    return runtime.ports;
  };
  const open = async () => {
    if (mode !== "fixture") throw new Error("Snake mode does not launch or replace gameplay");
    if (worldHandle || hudHandle) throw new Error("Probe fixture is already open");
    worldHandle = await manager.open("Stage3dFixture", (view, context) => view.setup(appPorts(), context));
    session.current.close = () => { void close(); };
    await openHud();
    return snapshot();
  };
  const loadingFault = async (kind) => {
    if (worldHandle || hudHandle || !["failure", "early-close"].includes(kind)) throw new Error("Loading fault requires a closed fixture");
    const original = cc.resources.load;
    const delayed = [];
    const received = [];
    const failure = "SC1-B4 injected Prefab load failure";
    const before = snapshot();
    let opened = null, openError = null;
    cc.resources.load = function(path, ...args) {
      const callback = args[args.length - 1];
      if (!path.startsWith("stage3d/")) return original.call(this, path, ...args);
      args[args.length - 1] = (error, asset) => {
        received.push({ path, loaded: !!asset, error: error?.message ?? null });
        if (kind === "early-close") delayed.push(() => callback(error, asset));
        else callback(path.includes("greybox-cube/") ? new Error(failure) : error, asset);
      };
      return original.call(this, path, ...args);
    };
    try {
      const opening = manager.open("Stage3dFixture", (view, context) => view.setup(appPorts(), context))
        .then((handle) => { opened = handle; }, (error) => { openError = error.message; });
      const deadline = Date.now() + 15000;
      while (received.length < 5 && Date.now() < deadline) await waitFrames(1);
      if (received.length !== 5 || received.some((load) => !load.loaded || load.error)) throw new Error("Fault requires five real successful resource loads");
      if (kind === "early-close") {
        manager.close("Stage3dFixture");
        await waitFrames();
        for (const deliver of delayed.splice(0)) deliver();
      }
      await opening;
      await waitFrames(5);
      if (opened || !openError || (kind === "failure" && !openError.includes(failure))) throw new Error("Expected fixture open rejection");
      const after = snapshot();
      if (after.session.businessRefs || after.fixtureNodes || after.input.active || appPorts().stage3d.active) throw new Error("Loading fault leaked owner resources");
      return { kind, before, received, openError, after };
    } finally {
      cc.resources.load = original;
      for (const deliver of delayed.splice(0)) deliver();
      opened?.close();
      manager.close("Stage3dFixture");
    }
  };
  const switchSkinning = async (group, index) => {
    if (!["main", "atlasB"].includes(group) || ![0, 1].includes(index)) throw new Error("Invalid SC0 skinning clip selection");
    if (typeof session.switchSkinningClip !== "function") throw new Error("SC0 skinning switch callback is unavailable");
    session.switchSkinningClip(group, index);
    // onPlay uploads the clip synchronously; wait through actual render/present
    // before reading texture descriptors, counters and the next sampled pose.
    await waitFrames();
    return snapshot();
  };
  const switchRealtime = async (enabled) => {
    if (typeof enabled !== "boolean" || typeof session.switchRealtimeSkinning !== "function") throw new Error("SC0 realtime switch callback is unavailable");
    session.switchRealtimeSkinning(enabled);
    await waitFrames();
    return snapshot();
  };
  if (mode === "fixture") {
    // Fresh isolated preview starts at Login; the fixture has no backend dependency.
    for (const name of ["Login", "Home", "PromoHome", "Settings", "EntryGroup"]) manager.close(name);
    await waitFrames();
  }
  session.current.close = () => { void close(); };
  globalThis[key] = { snapshot, open, openHud, closeHud, close, rebuildRoot, waitFrames, switchSkinning, switchRealtime, loadingFault };
  return { moduleUrls: { ViewMgr: managerImport.url, fixtureSession: sessionImport.url, rawInput: inputImport.url }, baseline: snapshot() };
}

export function createStage3dHarnessSource(mode) { return `(${installHarness.toString()})(${JSON.stringify(mode)},${JSON.stringify(HARNESS)},${readViewport.toString()},${readScheduledStageQueues.toString()})`; }

class PendingEvidence extends Error {}
const assert = (condition, message) => { if (!condition) throw new Error(message); };

class Probe {
  constructor(client, options, report, out) {
    Object.assign(this, { client, options, report, out });
    this.touchDriver = new Stage3dTouchDriver(client, report.touchTransport.commands);
    this.shotIndex = 0;
  }
  async invoke(method, ...args) { return this.client.evaluate(`globalThis[${JSON.stringify(HARNESS)}].${method}(...${JSON.stringify(args)})`); }
  async snapshot() { return this.invoke("snapshot"); }
  async walk() { return this.client.evaluate(pageWalkSource); }
  async step(name, action) {
    const step = { name, status: "running", startedAt: new Date().toISOString() };
    this.report.steps.push(step);
    try { step.detail = await action(); step.status = "passed"; }
    catch (error) {
      step.status = error instanceof PendingEvidence ? "pending" : "failed";
      step.error = error instanceof Error ? error.message : String(error);
      if (step.status === "pending") this.report.pending.push({ name, reason: step.error });
      try { step.screenshot = await this.shot(`failed-${name}`); } catch {}
      throw error;
    } finally { step.finishedAt = new Date().toISOString(); }
    return step.detail;
  }
  async until(label, predicate, timeout = this.options.stepTimeoutMs) {
    const deadline = Date.now() + timeout;
    let last;
    do {
      last = await this.snapshot();
      if (last.session.error) throw new Error(`Fixture: ${last.session.error}`);
      if (!last.visible) throw new Error("Preview became hidden; input/performance evidence is invalid");
      if (predicate(last)) return last;
      await sleep(100);
    } while (Date.now() < deadline);
    throw new Error(`${label} timed out; last state ${JSON.stringify(last)}`);
  }
  async node(name) {
    const node = selectNodes(await this.walk(), { name })[0];
    assert(node?.center, `Missing visible node ${name}`);
    return { x: node.center.x, y: node.center.y };
  }
  async points() {
    const walk = await this.walk();
    assert(walk?.canvas, "GameCanvas is unavailable");
    const hud = await this.node("Stage3dSpike.HudButton");
    const modal = await this.node("Stage3dSpike.ModalButton");
    let world = { x: walk.canvas.x + walk.canvas.width * 0.5, y: walk.canvas.y + walk.canvas.height * 0.62 };
    if (this.options.mode === "snake") {
      world = await this.node("SnakeWorld.JoystickBase");
      world.x += walk.canvas.width / walk.visible.width * 45;
    }
    return { hud, modal, world, moved: { x: world.x + walk.canvas.width * 0.04, y: world.y - walk.canvas.height * 0.025 } };
  }
  async touch(type, id, point) {
    return this.touchDriver.dispatch(type, id, point);
  }
  async tap(point, id = 903) { await this.touch("touchStart", id, point); await this.touch("touchEnd", id); }
  async shot(label) {
    const file = path.join(this.out, `${String(++this.shotIndex).padStart(3, "0")}-${label.replace(/[^a-z0-9-]/giu, "-")}.png`);
    const walk = await this.walk();
    await this.client.screenshot(file, { format: "png", clip: walk?.canvas ? { ...walk.canvas, scale: 1 } : undefined });
    return path.relative(this.out, file);
  }
  async stableClosed() {
    let previous = null, stableSince = 0;
    return this.until("closed resources stabilize", (state) => {
      if (state.session.businessRefs !== 0 || state.fixtureNodes !== 0 || state.input.active || state.input.ownersCount !== 0) { stableSince = 0; return false; }
      const signature = JSON.stringify([state.sceneNodes, state.gfx.bufferBytes, state.gfx.textureBytes]);
      if (signature !== previous) { previous = signature; stableSince = Date.now(); }
      return Date.now() - stableSince >= 800;
    });
  }
  async requireSnake() {
    const state = await this.snapshot();
    if (!state.snake.present || !state.snake.controls || state.snake.overlays.length || state.input.worldState?.kind !== "snake") {
      throw new PendingEvidence(`An active, controllable Snake run is required; observed ${JSON.stringify({ snake: state.snake, worldState: state.input.worldState })}`);
    }
    return state;
  }
  async closeModal() {
    const deadline = Date.now() + this.options.stepTimeoutMs;
    let target;
    do {
      const walk = await this.walk();
      target = selectNodes(walk, { text: "确定", pathIncludes: "Confirm" })[0];
      if (target) break;
      await sleep(100);
    } while (Date.now() < deadline);
    assert(target?.center, "The real Confirm modal has no visible 确定 control");
    await this.tap(target.center, 904);
    return this.until("modal closes and routing restores", (state) => !state.input.blocked && state.input.active);
  }
}

async function inputScenarios(probe) {
  const p = await probe.points();
  await probe.step("hud-click", async () => {
    const before = await probe.snapshot();
    await probe.tap(p.hud);
    const after = await probe.snapshot();
    assert(after.logic.hudClicks === before.logic.hudClicks + 1, "HUD click was not delivered exactly once");
    assert(after.input.counters.worldStarts === before.input.counters.worldStarts, "HUD pointer entered the world router");
    return { before, after, screenshot: await probe.shot("hud-click") };
  });
  if (probe.options.mode === "fixture") await probe.step("footer-hud-click", async () => {
    const before = await probe.snapshot();
    await probe.tap(await probe.node("Stage3dFixture.FooterButton"));
    const after = await probe.snapshot();
    assert(after.logic.hudClicks === before.logic.hudClicks + 1 && after.input.counters.worldStarts === before.input.counters.worldStarts,
      "Footer HUD was blocked or leaked into the world");
    return { before, after };
  });
  await probe.step("world-drag-across-hud", async () => {
    const before = await probe.snapshot();
    await probe.touch("touchStart", 901, p.world);
    await probe.touch("touchMove", 901, p.hud);
    await probe.touch("touchEnd", 901);
    const after = await probe.snapshot();
    assert(after.input.counters.worldStarts === before.input.counters.worldStarts + 1, "World start was lost/duplicated");
    assert(after.input.counters.worldMoves > before.input.counters.worldMoves, "World drag was lost at the HUD boundary");
    assert(after.input.counters.worldEnds === before.input.counters.worldEnds + 1 && after.input.ownersCount === 0, "World end was lost at the HUD boundary");
    assert(after.logic.hudClicks === before.logic.hudClicks, "World gesture generated a HUD click");
    return { before, after };
  });
  await probe.step("hud-drag-across-world", async () => {
    const before = await probe.snapshot();
    await probe.touch("touchStart", 901, p.hud);
    await probe.touch("touchMove", 901, p.world);
    await probe.touch("touchEnd", 901);
    const after = await probe.snapshot();
    assert(after.input.counters.worldStarts === before.input.counters.worldStarts && after.input.counters.worldMoves === before.input.counters.worldMoves,
      "HUD gesture leaked into the world router");
    assert(after.logic.hudClicks === before.logic.hudClicks && after.input.ownersCount === 0, "Dragged HUD gesture clicked or retained ownership");
    return { before, after };
  });
  await probe.step("simultaneous-hud-and-world", async () => {
    const before = await probe.snapshot();
    await probe.touch("touchStart", 901, p.hud);
    await probe.touch("touchStart", 902, p.world);
    await probe.touch("touchMove", 902, p.moved);
    const held = await probe.snapshot();
    assert(held.input.ownersCount === 2, "Both HUD and world pointer ownership must remain active");
    if (probe.options.mode === "snake") assert(held.input.worldState?.routerOwnersCount === 1, "Snake joystick did not acquire the world pointer");
    await probe.touch("touchEnd", 902);
    await probe.touch("touchEnd", 901);
    const after = await probe.snapshot();
    assert(after.logic.hudClicks === before.logic.hudClicks + 1, "HUD finger did not complete exactly one click");
    assert(after.input.counters.worldStarts === before.input.counters.worldStarts + 1 && after.input.counters.worldMoves > before.input.counters.worldMoves,
      "World finger did not keep moving independently");
    assert(after.input.ownersCount === 0, "Parallel pointers retained ownership");
    return { before, held, after, screenshot: await probe.shot("parallel-pointers") };
  });
  if (probe.options.mode === "fixture") await probe.step("wheel-current-hit", async () => {
    const before = await probe.snapshot();
    await probe.client.send("Input.dispatchMouseEvent", { type: "mouseWheel", ...p.hud, deltaX: 0, deltaY: 80 });
    await sleep(100);
    const hud = await probe.snapshot();
    assert(hud.logic.wheels === before.logic.wheels, "HUD wheel reached the world");
    await probe.client.send("Input.dispatchMouseEvent", { type: "mouseWheel", ...p.world, deltaX: 0, deltaY: 80 });
    await sleep(100);
    const world = await probe.snapshot();
    assert(world.logic.wheels === before.logic.wheels + 1, "World wheel was lost or duplicated");
    return { before, hud, world };
  });
  await probe.step("modal-cancels-held-world-and-restores-fresh-only", async () => {
    if (probe.options.mode === "snake") await probe.requireSnake();
    await probe.touch("touchStart", 901, p.world);
    await probe.touch("touchMove", 901, p.moved);
    let boostPoint = null;
    if (probe.options.mode === "snake") {
      const walk = await probe.walk();
      const boost = ["SnakeWorld.S4", "SnakeWorld.S1"].map((name) => selectNodes(walk, { name })[0]).find(Boolean);
      assert(boost?.center, "No active Snake boost control is visible");
      boostPoint = boost.center;
      await probe.touch("touchStart", 902, boostPoint);
      assert((await probe.snapshot()).input.worldState?.boosting === true, "Snake boost did not become active before the modal");
    }
    await probe.tap(p.modal, 903);
    const blocked = await probe.until("modal blocks world", (state) => state.input.blocked);
    assert(blocked.input.ownersCount === 0, "Modal retained pointer ownership");
    if (probe.options.mode === "snake") {
      assert(blocked.input.worldState?.boosting === false && blocked.input.worldState?.routerOwnersCount === 0
        && blocked.input.worldState?.joystickX === 0 && blocked.input.worldState?.joystickY === 0,
      "Modal did not reset local Snake boost/joystick/router state");
    } else assert(blocked.logic.activePointers === 0, "Modal did not cancel the map gesture");
    const restored = await probe.closeModal();
    await probe.touch("touchMove", 901, p.world);
    const staleMove = await probe.snapshot();
    assert(staleMove.input.counters.worldMoves === restored.input.counters.worldMoves, "Modal close resumed an old gesture");
    await probe.touch("touchEnd", 901);
    if (boostPoint) await probe.touch("touchEnd", 902);
    await probe.touch("touchStart", 901, p.world);
    await probe.touch("touchMove", 901, p.moved);
    await probe.touch("touchEnd", 901);
    const fresh = await probe.snapshot();
    assert(fresh.input.counters.worldMoves > staleMove.input.counters.worldMoves, "Fresh gesture was not restored");
    return { blocked, restored, staleMove, fresh, screenshot: await probe.shot("modal-restored") };
  });
  await probe.step("hud-close-remount-cancels-old-pointer", async () => {
    await probe.touch("touchStart", 901, p.world);
    await probe.touch("touchMove", 901, p.moved);
    await probe.invoke("closeHud");
    const closed = await probe.snapshot();
    assert(!closed.input.active && closed.input.ownersCount === 0, "Closing HUD retained the raw-input adapter or pointers");
    await probe.invoke("openHud");
    const reopened = await probe.snapshot();
    assert(reopened.input.active && !reopened.input.blocked, "Reopened HUD did not restore routing");
    await probe.touch("touchMove", 901, p.world);
    await probe.touch("touchEnd", 901);
    const after = await probe.snapshot();
    assert(after.input.counters.worldMoves === reopened.input.counters.worldMoves, "HUD remount resumed an old pointer");
    await probe.tap(await probe.node("Stage3dSpike.HudButton"));
    const clicked = await probe.snapshot();
    assert(clicked.logic.hudClicks === reopened.logic.hudClicks + 1, "Reopened HUD click was lost/duplicated");
    return { closed, reopened, after, clicked };
  });
  if (probe.options.inputOnly && probe.options.mode === "fixture") await probe.step("root-rebuild-cancels-and-requires-fresh-pointer", async () => {
    await probe.touch("touchStart", 901, p.world);
    await probe.touch("touchMove", 901, p.moved);
    const destroyed = await probe.invoke("rebuildRoot");
    assert(!destroyed.input.active && destroyed.input.ownersCount === 0 && destroyed.input.worldState === null,
      "Root teardown retained an adapter, pointer, or world subscription");
    const reopened = await probe.invoke("open");
    await probe.touch("touchMove", 901, p.world);
    await probe.touch("touchEnd", 901);
    const stale = await probe.snapshot();
    assert(stale.input.counters.worldMoves === reopened.input.counters.worldMoves, "Root reconstruction resumed an old pointer");
    await probe.touch("touchStart", 901, p.world);
    await probe.touch("touchMove", 901, p.moved);
    await probe.touch("touchEnd", 901);
    const fresh = await probe.snapshot();
    assert(fresh.input.counters.worldMoves > stale.input.counters.worldMoves && fresh.input.ownersCount === 0,
      "Rebuilt root did not route a fresh complete world gesture");
    return { destroyed, reopened, stale, fresh, screenshot: await probe.shot("root-rebuilt") };
  });
}

async function skinningScenarios(probe) {
  await probe.step("actual-skinning-textures-and-cross-atlas-switch", async () => {
    const evidence = { phases: {}, screenshots: {}, errors: [], visualReview: "pending",
      observation: "Creator 3.8.8 BakedSkinningModel joints texture, bound descriptor slot 7, uploaded/sampled clips, material Pass identities; snapshots taken after AFTER_DRAW" };
    probe.report.skinning = evidence;
    const consoleStart = await probe.client.evaluate("(window.__creatorPreviewLogs || []).length");
    let switched = false;
    const record = async (name, state) => {
      evidence.phases[name] = state;
      evidence.screenshots[name] = await probe.shot(`skinning-${name}`);
      return state;
    };
    const requireAdvancement = (before, after, targetOnly = false) => {
      const earlier = new Map(before.animation.skinningInstances.map((instance) => [instance.id, instance]));
      const advancedClips = new Set();
      for (const instance of after.animation.skinningInstances) {
        if (targetOnly && instance.name !== "Stage3dSpike.CrossAtlas") continue;
        const old = earlier.get(instance.id);
        const previous = old?.animations[0]?.playing[0], current = instance.animations[0]?.playing[0];
        if (previous?.clip.hash === current?.clip.hash && current.time !== previous.time
          && instance.renderers.some((renderer, index) => renderer.frame !== old.renderers[index]?.frame)) advancedClips.add(current.clip.hash);
      }
      const expected = targetOnly ? [after.animation.skinningInstances.find((instance) => instance.name === "Stage3dSpike.CrossAtlas").animations[0].playing[0].clip]
        : after.session.skinning.mainClips;
      assert(expected.every((clip) => advancedClips.has(clip.hash)), "Playing clip time and baked frame did not both advance across real rendered frames");
      return [...advancedClips];
    };
    try {
      await probe.invoke("waitFrames", 3);
      const before = await record("main-shared", await probe.snapshot());
      evidence.mainProof = assertStage3dSkinningPhase(before);
      await probe.invoke("waitFrames", 12);
      const mainLater = await record("main-shared-later", await probe.snapshot());
      evidence.mainAdvancingClips = requireAdvancement(before, mainLater);
      switched = true;
      const alternate0 = await record("alternate-0", await probe.invoke("switchSkinning", "atlasB", 0));
      evidence.alternate0Proof = assertStage3dSkinningPhase(alternate0, "atlasB", 0);
      await probe.invoke("waitFrames", 12);
      const alternateLater = await record("alternate-0-later", await probe.snapshot());
      evidence.alternateAdvancingClips = requireAdvancement(alternate0, alternateLater, true);
      const alternate1 = await record("alternate-1", await probe.invoke("switchSkinning", "atlasB", 1));
      evidence.alternate1Proof = assertStage3dSkinningPhase(alternate1, "atlasB", 1);
      const restored = await record("main-restored", await probe.invoke("switchSkinning", "main", 0));
      switched = false;
      evidence.transition = assertStage3dSkinningTransition(before, alternate0, alternate1, restored);
      evidence.drawCallChanges = { alternate0: alternate0.gfx.drawCalls - before.gfx.drawCalls,
        alternate1: alternate1.gfx.drawCalls - before.gfx.drawCalls, restored: restored.gfx.drawCalls - before.gfx.drawCalls };
      evidence.console = await probe.client.evaluate(`(window.__creatorPreviewLogs || []).slice(${consoleStart})`);
      assert(!evidence.console.some((entry) => ["error", "uncaught", "rejection"].includes(entry.level)), "Skinning switch emitted engine/runtime errors");
      return { transition: evidence.transition, drawCallChanges: evidence.drawCallChanges, screenshots: evidence.screenshots, visualReview: evidence.visualReview };
    } catch (error) {
      evidence.errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (switched) {
        try { evidence.restoredAfterFailure = await probe.invoke("switchSkinning", "main", 0); }
        catch (error) { evidence.errors.push(`Restoration failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
      evidence.console = await probe.client.evaluate(`(window.__creatorPreviewLogs || []).slice(${consoleStart})`).catch(() => []);
    }
  });
}

async function realtimeSkinningScenario(probe) {
  await probe.step("actual-realtime-skinning-without-instancing", async () => {
    const evidence = { phases: {}, screenshots: {}, errors: [], visualReview: "pending",
      observation: "One unchanged CrossAtlas node: actual SkinningModel type 1, Pass batchingScheme 0, stage direct-draw queue, bound descriptor slot 3 and changing joint matrices; other 99 remain baked. Controlled SC0 sample, not the SC4 fallback API." };
    probe.report.realtimeSkinning = evidence;
    const consoleStart = await probe.client.evaluate("(window.__creatorPreviewLogs || []).length");
    let realtime = false;
    const record = async (name, state) => {
      evidence.phases[name] = state;
      evidence.screenshots[name] = await probe.shot(`realtime-${name}`);
      return state;
    };
    try {
      const before = await record("baked-before", await probe.snapshot());
      realtime = true;
      const first = await record("realtime", await probe.invoke("switchRealtime", true));
      evidence.proof = assertStage3dRealtimePhase(first);
      await probe.invoke("waitFrames", 12);
      const later = await record("realtime-later", await probe.snapshot());
      evidence.advancement = assertStage3dRealtimeAdvancement(first, later);
      const restored = await record("baked-restored", await probe.invoke("switchRealtime", false));
      realtime = false;
      evidence.restoration = assertStage3dRealtimeRestored(before, later, restored);
      evidence.console = await probe.client.evaluate(`(window.__creatorPreviewLogs || []).slice(${consoleStart})`);
      assert(!evidence.console.some((entry) => ["error", "uncaught", "rejection"].includes(entry.level)
        || (entry.level === "warn" && /3936|instancing/iu.test(entry.text))), "Realtime skinning emitted runtime errors or an instancing warning");
      return { proof: evidence.proof, advancement: evidence.advancement, restoration: evidence.restoration,
        screenshots: evidence.screenshots, visualReview: evidence.visualReview };
    } catch (error) {
      evidence.errors.push(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (realtime) {
        try { evidence.restoredAfterFailure = await probe.invoke("switchRealtime", false); }
        catch (error) { evidence.errors.push(`Restoration failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
      evidence.console = await probe.client.evaluate(`(window.__creatorPreviewLogs || []).slice(${consoleStart})`).catch(() => []);
    }
  });
}

async function fixtureScenarios(probe) {
  await probe.step("imported-prefab-paths", async () => ["greybox-plane", "greybox-cube", "greybox-biped", "greybox-biped-atlas-b"].map((name) =>
    validateStage3dPrefabMetadata(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "apps/Cocos/assets/resources/stage3d", `${name}.glb.meta`), "utf8")), name)));
  await probe.step("initial-load-and-first-activation", async () => {
    probe.report.boot.firstFixtureLoadStartedAtEpochMs = await probe.client.evaluate(`(() => { const at = Date.now();
      if (globalThis[${JSON.stringify(STAGE3D_BOOT_KEY)}]) globalThis[${JSON.stringify(STAGE3D_BOOT_KEY)}].fixtureLoadStartedAtEpochMs = at; return at; })()`);
    const sampling = probe.client.evaluate(createStage3dSamplingSource({ warmupFrames: 0, sampleFrames: probe.options.startupFrames, timeoutMs: 120_000 }));
    let opened;
    try { opened = await probe.invoke("open"); }
    catch (error) { await probe.client.evaluate(stopStage3dSamplingSource("fixture-open-failed")).catch(() => {}); await sampling.catch(() => {}); throw error; }
    const raw = await sampling;
    const summary = aggregateStage3dSampling(raw);
    probe.report.startupPerformance = { raw, summary, readyAtMs: opened.atMs };
    assert(summary.valid, `Startup sample invalid: ${summary.reasons.join(", ")}`);
    assert(summary.lastFrame.atMs >= opened.atMs, "Startup window ended before fixture activation; rerun with larger --startup-frames");
    assert(opened.session.ready && opened.cubes === 500 && opened.bipeds === 100 && opened.particles === 1, "The required 500 cubes/100 bipeds/one particle fixture is incomplete");
    assert(opened.billboards.length === 1 && opened.billboards[0].active && opened.billboards[0].modelAttached
      && opened.billboards[0].width === 4 && opened.billboards[0].height === 4 && opened.billboards[0].passes > 0,
    "The independent Billboard must have an active model and material pass");
    assert(opened.input.active && !opened.input.blocked, "Fixture raw-input adapter is inactive or blocked");
    return { opened, screenshot: await probe.shot("initial-fixture") };
  });
  await probe.step("independent-baked-prefab", async () => {
    const state = await probe.snapshot();
    assert(state.baked.length === 1 && state.baked[0].renderers.length === 2, "Expected the independent two-mesh baked Prefab");
    assert(state.baked[0].renderers.every((renderer) => renderer.texture && renderer.model
      && renderer.modelLightmap === renderer.texture && renderer.lightmapBound), "Baked Prefab is missing its model lightmap/GFX binding");
    return { baked: state.baked, refs: state.session.businessRefs, screenshot: await probe.shot("baked-prefab") };
  });
  await probe.step("camera-and-layer-configuration", async () => {
    const state = await probe.snapshot();
    const stage = state.cameras.find((camera) => camera.node === "Stage3DCamera" && camera.enabled);
    const ui = state.cameras.filter((camera) => camera.enabled && camera.node !== "Stage3DCamera" && (camera.visibility & state.layers.UI_2D) !== 0);
    assert(stage && ui.length, "Active 3D and UI cameras are both required");
    assert((stage.visibility & state.layers.DEFAULT) !== 0 && (stage.visibility & state.layers.UI_2D) === 0, "3D camera has the wrong world/UI visibility mask");
    assert(ui.every((camera) => camera.priority > stage.priority), "UI camera must render after the stage camera");
    assert(state.environment.pipeline === "WebPipeline", `Expected built-in custom WebPipeline, observed ${state.environment.pipeline}`);
    if (probe.options.expectWebgl !== null) assert(state.environment.webgl === probe.options.expectWebgl, "Actual WebGL context does not match --expect-webgl");
    assert(state.environment.webgl === 1 || state.environment.webgl === 2, "Actual WebGL version is not observable");
    probe.report.environment = state.environment;
    return { cameras: state.cameras, layers: state.layers, environment: state.environment, screenshot: await probe.shot("camera-layer-evidence") };
  });
  await skinningScenarios(probe);
  await realtimeSkinningScenario(probe);
  await inputScenarios(probe);
  await probe.step("reset-fixed-framing-before-performance", () => resetStage3dPerformanceView(probe));
  await probe.step("steady-state-frame-window", async () => {
    const raw = await probe.client.evaluate(createStage3dSamplingSource());
    const summary = aggregateStage3dSampling(raw);
    probe.report.performance = { raw, summary };
    assert(summary.valid, `Steady-state sample invalid: ${summary.reasons.join(", ")}`);
    assert(summary.lastFrame.gfx.drawCalls > 0 && summary.lastFrame.gfx.triangles > 0, "No rendered geometry was observed at frame end");
    const framing = { raw: await probe.client.evaluate(createStage3dFramingSource()), summary: null };
    probe.report.framing.after = framing;
    framing.summary = assertStage3dFraming(framing.raw);
    probe.report.framing.cameraUnchanged = JSON.stringify(framing.raw.camera) === JSON.stringify(probe.report.framing.before.raw.camera);
    assert(probe.report.framing.cameraUnchanged, "Stage camera changed during the fixed-view performance window");
    const state = await probe.snapshot();
    return { summary, framing: framing.summary, animation: state.animation, screenshot: await probe.shot("steady-state") };
  });
  await probe.step("prewarm-closed-resource-baseline", async () => {
    assertStage3dRealtimePhase(await probe.invoke("switchRealtime", true));
    await probe.invoke("close");
    const closes = [await probe.stableClosed()];
    for (let attempt = 0; attempt < 6; attempt++) {
      await probe.invoke("open");
      assertStage3dRealtimePhase(await probe.invoke("switchRealtime", true));
      await probe.invoke("close");
      const next = await probe.stableClosed();
      const previous = closes.at(-1);
      closes.push(next);
      if (next.sceneNodes === previous.sceneNodes && next.gfx.bufferBytes === previous.gfx.bufferBytes && next.gfx.textureBytes === previous.gfx.textureBytes) {
        probe.report.prewarm = { closes, baseline: next, note: "Each prewarm activates one realtime sample before close. Engine-retained high-water marks are recorded, not equated to business references." };
        return probe.report.prewarm;
      }
    }
    probe.report.prewarm = { closes, baseline: null };
    throw new Error("Closed node/GFX baseline did not stabilize across seven prewarm closes");
  });
  await probe.step("failed-load-and-early-close", async () => {
    const failed = await probe.invoke("loadingFault", "failure");
    const cancelled = await probe.invoke("loadingFault", "early-close");
    return { failed, cancelled };
  });
  await probe.step("repeated-open-close-resource-evidence", async () => {
    const cycles = [];
    probe.report.cycles = cycles;
    for (let cycle = 1; cycle <= probe.options.cycles; cycle++) {
      const opened = await probe.invoke("open");
      assert(opened.session.ready && opened.session.businessRefs === 5, `Cycle ${cycle}: loaded fixture did not hold its five Prefabs`);
      const entry = { cycle, opened, realtime: null, realtimeProof: null, restored: null, restorationProof: null,
        closeMode: cycle % 2 ? "realtime" : "restored-baked", closed: null };
      cycles.push(entry);
      entry.realtime = await probe.invoke("switchRealtime", true);
      entry.realtimeProof = assertStage3dRealtimePhase(entry.realtime);
      if (entry.closeMode === "restored-baked") {
        entry.restored = await probe.invoke("switchRealtime", false);
        entry.restorationProof = assertStage3dRealtimeRestored(opened, entry.realtime, entry.restored);
      }
      await probe.invoke("close");
      entry.closed = await probe.stableClosed();
      assertStage3dClosedBaseline(probe.report.prewarm.baseline, cycles.map((entry) => entry.closed));
    }
    if (probe.options.cycles < 20) probe.report.pending.push({ name: "twenty-cycles", reason: `Only ${probe.options.cycles} cycles requested; SC0 requires 20.` });
    return assertStage3dClosedBaseline(probe.report.prewarm.baseline, cycles.map((entry) => entry.closed));
  });
}

export async function runStage3dProbe(options) {
  const date = new Date().toISOString().slice(0, 10);
  const out = path.resolve(options.out ?? path.join(REPO_ROOT, "docs/evidence", `creator-${date}`, `stage3d-${options.mode}`));
  fs.mkdirSync(out, { recursive: true });
  const report = { schemaVersion: 1, scenario: `stage3d-${options.mode}`, startedAt: new Date().toISOString(), options,
    viewport: { requested: STAGE3D_VIEWPORT, requiredPreview: { device: STAGE3D_PREVIEW_DEVICE, rotated: false,
      setup: "Select Creator native WebpageFullScreen before boot; no harness CSS, DOM layout, or engine size override." }, actual: null, action: null,
      scope: "375x812 CSS canvas / 750x1624 backbuffer via Creator native WebpageFullScreen, desktop UA, desktop GPU and wheel; CSS/DPR emulation is not mobile hardware evidence." },
    steps: [], pending: [], sc0Exit: false, console: [], touchTransport: {
      policy: "Chrome 153 live diagnostics: partial touchEnd carries ended points; final touchEnd is empty. This conflicts with the local CDP schema description that touchEnd must be empty. Every command validates actual window-capture DOM changedTouches and remaining touches; another runtime failing that check is a failed probe.",
      commands: [],
    } };
  let client, probe, scriptId, forceWebgl1ScriptId;
  try {
    if (options.mode === "snake" && !options.reuse) throw new PendingEvidence("Snake mode requires --reuse and an already running, controllable Snake session. No backend/gameplay was started.");
    let tab;
    if (options.reuse) {
      const tabs = await (await fetch(`${options.devtools}/json`)).json();
      tab = selectStage3dReuseTab(tabs, options);
    } else if (options.newWindow) {
      // Use the existing local Chrome/CDP process, but keep this acceptance page
      // in its own visible window so another task changing tabs cannot hide it.
      const browser = await (await fetch(`${options.devtools}/json/version`)).json();
      const control = await CdpClient.connect(browser.webSocketDebuggerUrl);
      let targetId;
      try { ({ targetId } = await control.send("Target.createTarget", { url: "about:blank", newWindow: true })); }
      finally { control.close(); }
      const target = (await (await fetch(`${options.devtools}/json`)).json()).find((entry) => entry.id === targetId);
      if (!target?.webSocketDebuggerUrl) throw new Error("New acceptance window has no CDP page endpoint");
      tab = { id: targetId, wsUrl: target.webSocketDebuggerUrl, created: true };
    } else tab = await acquireTab(options);
    client = await CdpClient.connect(tab.wsUrl);
    report.touchTransport.browser = await client.send("Browser.getVersion");
    report.tab = { id: tab.id, created: tab.created };
    // Both overrides precede a fresh boot. Reused Snake pages are only observed;
    // resizing after their boot would not reproduce the original layout.
    Object.assign(report.viewport, await prepareStage3dViewport(client, options.reuse));
    if (report.viewport.valid === false) throw new PendingEvidence(`Existing preview layout cannot be changed after boot for this evidence: ${report.viewport.error}. Boot with fixed metrics before running --reuse.`);
    const hook = await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource });
    scriptId = hook.identifier;
    if (options.forceWebgl1) {
      const fallback = await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          return type === "webgl2" ? null : original.call(this, type, ...args);
        };
      })()` });
      forceWebgl1ScriptId = fallback.identifier;
      report.contextSelection = "Owned page rejects webgl2 context creation before Cocos boot; actual WebGLDevice and WebGL 1.0 are asserted. No extension/texture capability masking.";
    }
    await client.send("Page.bringToFront");
    if (options.mode !== "snake" && !options.reuse) {
      const sceneUuid = options.scene ?? sceneUuidFromMeta(fs.readFileSync(path.join(REPO_ROOT, "apps/Cocos/assets/scene.scene.meta"), "utf8"));
      await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs });
    }
    const faultBefore = options.capabilityFaultInjection?.before;
    const currentTimeOrigin = await client.evaluate("performance.timeOrigin");
    report.boot = { bootStartedAtEpochMs: options.reuse && faultBefore ? faultBefore.bootStartedAtEpochMs : currentTimeOrigin, firstFixtureLoadStartedAtEpochMs: null,
      bootCompletedAtEpochMs: options.reuse ? null : await client.evaluate("Date.now()"),
      coldBoot: !options.reuse || (options.mode === "fixture" && faultBefore?.installedBeforeCocos === true
        && faultBefore.bootStartedAtEpochMs === currentTimeOrigin && Number.isFinite(currentTimeOrigin)
        && Array.isArray(faultBefore.alreadyLoadedFixturePrefabs) && faultBefore.alreadyLoadedFixturePrefabs.length === 0) };
    if (options.mode === "snake") {
      const fixtureUuids = ["greybox-plane", "greybox-cube", "greybox-biped", "greybox-biped-atlas-b"].map((name) => validateStage3dPrefabMetadata(
        JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "apps/Cocos/assets/resources/stage3d", `${name}.glb.meta`), "utf8")), name).prefabUuid);
      report.bootProvenance = await client.evaluate(createStage3dOwnedBootInspectionSource(fixtureUuids));
      if (report.bootProvenance.marker || report.bootProvenance.observed.webgl === 1) {
        try { report.boot = assertStage3dOwnedBoot(report.bootProvenance, { tabId: options.tabId, expectedWebgl: options.expectWebgl, preview: options.preview }); }
        catch (error) { report.boot.provenanceError = error.message; throw new PendingEvidence(error.message); }
      }
    }
    report.viewport.actual = await client.evaluate(createStage3dViewportSource());
    assertStage3dViewport(report.viewport.actual);
    report.viewport.valid = true;
    await client.evaluate(consoleHookSource);
    // Keep startup/import errors too: a warm/reused page cannot hide failed imports.
    const oldLogs = await client.evaluate("(window.__creatorPreviewLogs || []).length");
    report.consoleStartIndex = oldLogs;
    probe = new Probe(client, options, report, out);
    report.bootstrap = await probe.step("systemjs-runtime-and-real-viewmgr", () => client.evaluate(createStage3dHarnessSource(options.mode)));
    await probe.step("engine-touch-source-and-dom-capture", async () => {
      const capability = report.bootstrap.baseline.environment.engineInput;
      assert((capability.inputTouchFeature ?? capability.capabilitiesTouches) === true,
        `Cocos boot did not register touch input: ${JSON.stringify(capability)}; touch emulation must be enabled before navigation`);
      return { capability, capture: await client.evaluate(createStage3dTouchTraceSource()) };
    });
    if (options.mode === "fixture" && options.inputOnly) {
      await probe.step("open-real-world-page-and-overlay", async () => {
        const state = await probe.invoke("open");
        report.environment = state.environment;
        assert(options.expectWebgl === null || state.environment.webgl === options.expectWebgl, "Actual WebGL context mismatch");
        return state;
      });
      await inputScenarios(probe);
    } else if (options.mode === "fixture") await fixtureScenarios(probe);
    else {
      await probe.step("existing-snake-prerequisite", async () => {
        const state = await probe.requireSnake();
        report.environment = state.environment;
        assert(options.expectWebgl === null || state.environment.webgl === options.expectWebgl, "Actual WebGL context mismatch");
        return state;
      });
      await probe.step("attach-real-fgui-hud-to-snake", () => probe.invoke("openHud"));
      await inputScenarios(probe);
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (error instanceof PendingEvidence) {
      if (!report.pending.some((entry) => entry.reason === text)) report.pending.push({ name: "prerequisite", reason: text });
    } else report.error = text;
  } finally {
    if (client) {
      if (probe) {
        await client.evaluate(stopStage3dSamplingSource("probe-cleanup")).catch(() => {});
        report.touchCleanup = await probe.touchDriver.cancelActive().catch((error) => ({ dispatched: true, error: error instanceof Error ? error.message : String(error) }));
        try { report.finalState = await probe.invoke("close"); }
        catch (error) { report.cleanupError = error instanceof Error ? error.message : String(error); }
      }
      if (probe) try {
        report.touchTransport.domEvents = await client.evaluate(`globalThis[${JSON.stringify(TOUCH_TRACE)}]?.read().records ?? []`);
        await client.evaluate(`globalThis[${JSON.stringify(TOUCH_TRACE)}]?.stop()`);
      } catch (error) { report.cleanupError ??= error instanceof Error ? error.message : String(error); }
      try { report.console = await client.evaluate("(window.__creatorPreviewLogs || []).slice()"); } catch {}
      if (scriptId) await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId }).catch(() => {});
      if (forceWebgl1ScriptId) await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: forceWebgl1ScriptId }).catch(() => {});
      client.close();
    }
    if (options.mode === "fixture" && !options.inputOnly) {
      report.pending.push({ name: "snake-carrier", reason: "Run --mode snake --reuse against an already live Snake session; fixture results do not substitute for gameplay evidence." });
      report.pending.push({ name: "visual-and-skinning-review", reason: "Review the skinning phase screenshots and actual animation. Successful clip/texture/pass assertions do not establish visual correctness or cover both float and RGBA8 texture paths." });
      report.pending.push({ name: "other-sc0-gates", reason: "Independent baked-Prefab reload, the second WebGL context and SC0-B4 budget freeze / prototype handoff remain separate exit gates. Real WeChat low-tier / remote-load / cache acceptance belongs to SC4." });
    }
    report.finishedAt = new Date().toISOString();
    const observedEnvironment = report.environment ?? report.bootstrap?.baseline?.environment;
    report.consoleClassification = classifyStage3dConsole(report.console, { ...report.boot,
      expectedWebgl: options.expectWebgl, actualWebgl: observedEnvironment?.webgl,
      device: observedEnvironment?.device, pipeline: observedEnvironment?.pipeline });
    report.executedOk = !report.error && !report.cleanupError && report.steps.every((step) => step.status !== "failed")
      && report.touchTransport.commands.every((command) => command.status === "passed")
      && report.consoleClassification.unexpectedErrors.length === 0;
    report.ok = report.executedOk && report.pending.length === 0;
    report.exitCode = report.executedOk ? report.pending.length ? 2 : 0 : 1;
    const summaryName = options.inputOnly ? `sc1-b9-${options.mode}-input` : options.mode === "fixture" ? "spike" : "snake-input";
    const summary = path.resolve(options.summary ?? path.join(REPO_ROOT, "docs/perf/stage3d", `${date}-${summaryName}${report.environment?.webgl === 1 ? "-webgl1" : ""}.json`));
    fs.mkdirSync(path.dirname(summary), { recursive: true });
    const reportPath = path.join(out, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    writeStage3dProbeSummary(reportPath, summary);
    return { report, out, summary };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseStage3dProbeArgs(process.argv.slice(2));
    if (options.help) console.log("Usage: node tools/creator-preview/probe-stage3d.mjs [--mode fixture|snake] [--reuse] [--tab ID] [--expect-webgl 1|2] [--input-only] [--force-webgl1] [--cycles 20] [--out DIR] [--summary FILE]\nDefaults: Creator 127.0.0.1:7457, existing Chrome CDP 127.0.0.1:9222. --tab requires --reuse; ambiguous existing pages are rejected. Snake requires a live session; no backend is started. --input-only validates SC1-B9 input; it does not claim SC0/SC1-B4 rendering, performance, or asset lifecycle gates. --new-window uses a separate visible window in the existing Chrome process. --force-webgl1 rejects webgl2 context creation before a fresh boot; actual WebGL 1.0 is asserted.");
    else {
      const result = await runStage3dProbe(options);
      console.log(JSON.stringify({ executedOk: result.report.executedOk, pending: result.report.pending.length,
        exitCode: result.report.exitCode, report: path.join(result.out, "report.json"), summary: result.summary }));
      process.exitCode = result.report.exitCode;
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
