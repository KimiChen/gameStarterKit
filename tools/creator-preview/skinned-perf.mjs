/** SC4-B1 production SkinnedUnits evidence. Uses the existing visible Chrome/Creator preview. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CdpClient, consoleHookSource, openScene, sceneUuidFromMeta, sleep } from "./lib.mjs";
import { parseStage3dPerfArgs, newPerfTab, capture, captureAfter, FRAME_PROBE, aggregateStage3dPerfEvidence } from "./perf.mjs";
import { STAGE3D_VIEWPORT, STAGE3D_PREVIEW_DEVICE, readScheduledStageQueues } from "./probe-stage3d.mjs";
import { createFloatFaultSource, createFloatFaultInspectionSource, assertFloatFaultBoot } from "./probe-stage3d-rgba8.mjs";
import { classifyStage3dConsole } from "./stage3d-diagnostics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const check = (value, message) => { if (!value) throw new Error(message); };
export function parseSkinnedPerfArgs(argv) {
  check(argv.includes("--perf"), "--skinned requires --perf");
  const options = { ...parseStage3dPerfArgs(argv.filter((arg) => !["--skinned", "--rgba8"].includes(arg))), rgba8: argv.includes("--rgba8") };
  if (options.help) return options;
  check(options.quality === "high", "SC4-B1 100-unit fixture requires --quality high; low capacity is SC4-B3");
  check(!options.rgba8 || options.forceWebgl1, "--rgba8 requires --force-webgl1 --expect-webgl 1");
  return options;
}

function readScene(readQueues) {
  const scene = typeof cc === "undefined" ? null : cc.director.getScene();
  const component = scene?.getComponentsInChildren("Stage3dDevScene")?.[0], fixture = component?.skinned;
  if (!component || !fixture) return { status: "missing" };
  const device = cc.director.root.device, gl = device.gl, glVersion = gl.getParameter(gl.VERSION);
  const canvas = document.getElementById("GameCanvas"), rect = canvas.getBoundingClientRect();
  const camera = scene.getComponentsInChildren("cc.Camera").find((item) => item.node.name === "Stage3DCamera");
  const culling = cc.director.root.pipeline._executor._context.culling;
  const scheduled = readQueues(culling, camera?.camera);
  const ids = globalThis.__sc4ObjectIds ??= { objects: new WeakMap(), next: 0 };
  const id = (object) => { if (!object) return null; if (!ids.objects.has(object)) ids.objects.set(object, ++ids.next); return ids.objects.get(object); };
  const modelPhases = new Map(), batches = [], direct = new Set(), visitedQueues = new Set();
  for (const { queueId, phaseId, models } of scheduled) {
    for (const model of models) { const phases = modelPhases.get(model) ?? new Set(); phases.add(phaseId); modelPhases.set(model, phases); }
    const queueKey = `${queueId}:${phaseId}`;
    if (visitedQueues.has(queueKey)) continue; visitedQueues.add(queueKey);
    const queue = culling.renderQueues[queueId];
    for (const kind of ["opaqueInstancingQueue", "transparentInstancingQueue"]) for (const buffer of queue[kind].instanceBuffers) {
      if (buffer.pass.phaseID !== phaseId) continue;
      for (const item of buffer.instances) if (item.count) batches.push({ pass: id(buffer.pass), texture: id(item.descriptorSet.getTexture(7)),
        indexBuffer: id(item.ia.indexBuffer), count: item.count, uploaded: item.ia.instanceCount, stride: item.stride });
    }
    for (const kind of ["opaqueQueue", "transparentQueue"]) for (const draw of queue[kind].instances) {
      if (draw.subModel.passes[draw.passIndex].phaseID === phaseId) direct.add(`${id(draw.subModel)}:${draw.passIndex}`);
    }
  }
  const population = { admitted: fixture.entities.length, active: 0, pending: 0, hidden: 0, failed: 0 };
  const units = fixture.entities.map((entity) => {
    if (Object.hasOwn(population, entity.state)) population[entity.state]++;
    const node = entity.node;
    if (!node) return { state: entity.state };
    const animation = node.getComponentsInChildren("cc.SkeletalAnimation")[0], animationState = animation.getState(entity.clip);
    return { id: id(node), state: entity.state, clip: entity.clip, mode: entity.mode, baked: animation.useBakedAnimation,
      playing: animationState.isPlaying, time: animationState.time,
      sockets: animation.sockets.map((socket) => ({ id: id(socket.target), path: socket.path,
        position: { x: socket.target.position.x, y: socket.target.position.y, z: socket.target.position.z },
        rotation: { x: socket.target.rotation.x, y: socket.target.rotation.y, z: socket.target.rotation.z, w: socket.target.rotation.w } })),
      renderers: node.getComponentsInChildren("cc.SkinnedMeshRenderer").map((renderer) => {
        const model = renderer.model, texture = model?._jointsMedium?.texture?.handle.texture;
        return { type: model.type, texture: id(texture), textureFormat: texture?.format ?? null,
          frame: model._jointsMedium?.animInfo?.data[0] ?? null, uploadedClip: model.uploadedAnim?.name ?? null,
          matrices: model.type === 1 ? model._dataArray.map((data) => Array.from(data)) : null,
          subModels: model.subModels.map((subModel) => ({ indexBuffer: id(subModel.inputAssembler.indexBuffer),
            texture: id(subModel.descriptorSet.getTexture(7)),
            passes: subModel.passes.flatMap((pass, index) => modelPhases.get(model)?.has(pass.phaseID)
              ? [{ id: id(pass), instancing: pass.batchingScheme === 1, direct: direct.has(`${id(subModel)}:${index}`) }] : []) })),
        };
      }),
    };
  });
  let sceneNodes = 0; const visit = (node) => { sceneNodes++; for (const child of node.children) visit(child); }; visit(scene);
  return { status: component.status === "failed" || fixture.status === "failed" ? "failed" : component.status,
    fixtureStatus: fixture.status, error: component.error || fixture.error, population, units, batches, sceneNodes,
    quality: component.stage.quality,
    environment: { webgl: /WebGL 2/.test(glVersion) ? 2 : 1, glVersion, gpu: device.renderer, device: device.constructor.name,
      pipeline: cc.director.root.pipeline.constructor.name, userAgent: navigator.userAgent,
      previewDevice: document.getElementById("view-select")?.getAttribute("value"),
      viewport: { cssWidth: rect.width, cssHeight: rect.height, backingWidth: canvas.width, backingHeight: canvas.height, dpr: devicePixelRatio } },
    gfx: { drawCalls: device.numDrawCalls, triangles: device.numTris, instances: device.numInstances,
      bufferBytes: device.memoryStatus.bufferSize, textureBytes: device.memoryStatus.textureSize } };
}
const sceneSource = `(${readScene.toString()})(${readScheduledStageQueues.toString()})`;
const component = 'cc.director.getScene().getComponentsInChildren("Stage3dDevScene")[0]';
const enable = (enabled) => `${component}.setSkinnedEnabled(${enabled})`;

/** Compare each visible renderer's required Pass/mesh/texture to actual submitted/uploaded batches. */
export function assertSkinnedDraws(state, { realtime = 0, textures = 2, rgba8 = false } = {}) {
  check(state.population.active === 100 && state.population.failed === 0 && state.units.length === 100, "100 active skinned units required");
  check(state.units.every((unit) => unit.playing && unit.renderers.length), "Every unit must play an animation and render");
  check(state.units.filter((unit) => !unit.baked).length === realtime, "Unexpected realtime population");
  const textureIds = new Set(), expected = new Map();
  for (const unit of state.units) for (const renderer of unit.renderers) {
    check(renderer.subModels.length && renderer.subModels.every((sub) => sub.passes.length), "Unit missing from actual stage color draw queues");
    if (!unit.baked) {
      check(renderer.type === 1 && renderer.matrices?.length, "Realtime model/matrices missing");
      check(renderer.subModels.every((sub) => sub.passes.every((pass) => !pass.instancing && pass.direct)), "Realtime must use actual non-instanced draws");
      continue;
    }
    check(renderer.type === 2 && renderer.texture && renderer.uploadedClip === unit.clip, "Baked model or uploaded clip differs from request");
    check(renderer.textureFormat === (rgba8 ? 35 : 44), "Actual joint texture format does not match the tested path");
    textureIds.add(renderer.texture);
    for (const sub of renderer.subModels) for (const pass of sub.passes) {
      check(pass.instancing && sub.texture === renderer.texture, "Baked pass or bound joint texture is incompatible");
      const key = JSON.stringify([pass.id, sub.indexBuffer, renderer.texture]); expected.set(key, (expected.get(key) ?? 0) + 1);
    }
  }
  check(textureIds.size === textures, `Expected ${textures} actual joint textures`);
  const actual = new Map();
  for (const batch of state.batches) {
    const key = JSON.stringify([batch.pass, batch.indexBuffer, batch.texture]);
    if (!expected.has(key)) continue;
    check(batch.count === batch.uploaded && batch.stride > 0, "Instance count was not uploaded");
    actual.set(key, (actual.get(key) ?? 0) + batch.count);
  }
  check(expected.size === actual.size && [...expected].every(([key, count]) => actual.get(key) === count), "Draw instances disagree with actual mesh/material/joint-texture grouping");
  return { groups: [...expected].map(([key, count]) => ({ key: JSON.parse(key), count })), realtime, textures: textureIds.size, gfx: state.gfx };
}

export async function runSkinnedPerf(options) {
  const label = options.rgba8 ? "rgba8" : `webgl${options.expectWebgl ?? 2}`;
  const out = path.resolve(options.out ?? path.join(ROOT, ".cache/sc4-b1", label)); fs.mkdirSync(out, { recursive: true });
  const report = { schemaVersion: 1, kind: "sc4-b1-skinned", startedAt: new Date().toISOString(), options, ok: false, phases: {}, perf: {} };
  let client;
  const wait = async (accept) => {
    const deadline = Date.now() + 45000; let state;
    while (Date.now() < deadline) {
      state = await client.evaluate(sceneSource);
      check(state.status !== "failed", state.error);
      if (accept(state)) return state;
      await sleep(100);
    }
    throw new Error(`Skinned scene timeout: ${JSON.stringify(state?.population)}`);
  };
  const pause = () => capture(client, { warmupFrames: 0, sampleFrames: 7, timeoutMs: 10000 }, false);
  const phase = async (name, criteria = {}) => {
    await pause(); const state = await client.evaluate(sceneSource);
    report.phases[name] = state; return assertSkinnedDraws(state, { rgba8: options.rgba8, ...criteria });
  };
  const play = (index, clipExpression, mode = "baked") => client.evaluate(`${component}.skinned.play(${index}, ${component}.skinned.${clipExpression}, ${JSON.stringify(mode)})`);
  try {
    const tab = await newPerfTab(options); report.tab = tab.id; client = await CdpClient.connect(tab.wsUrl);
    await client.send("Page.enable"); await client.send("Emulation.setDeviceMetricsOverride", STAGE3D_VIEWPORT);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource });
    if (options.forceWebgl1) await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === "webgl2" ? null : get.call(this, type, ...args); }; })()` });
    if (options.rgba8) await client.send("Page.addScriptToEvaluateOnNewDocument", { source: createFloatFaultSource() });
    const sceneUuid = sceneUuidFromMeta(fs.readFileSync(path.join(ROOT, "apps/Cocos/assets/stage3d-dev.scene.meta"), "utf8"));
    await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs, query: { quality: "high", shadows: 0 },
      ready: (walk) => walk.sceneName === "stage3d-dev" });
    report.ready = await wait((state) => state.status === "ready"); report.environment = report.ready.environment;
    const { viewport } = report.environment;
    check(report.environment.previewDevice === STAGE3D_PREVIEW_DEVICE && viewport.cssWidth === 375 && viewport.cssHeight === 812
      && viewport.backingWidth === 750 && viewport.backingHeight === 1624 && viewport.dpr === 2, "Select WebpageFullScreen / Rotate off in the native Creator preview menu");
    check(options.expectWebgl === null || report.environment.webgl === options.expectWebgl, "Actual WebGL context mismatch");
    report.boot = await client.evaluate('({ started: performance.timeOrigin, completed: Date.now() })');
    if (options.rgba8) { report.floatFault = await client.evaluate(createFloatFaultInspectionSource()); assertFloatFaultBoot(report.floatFault); }
    await client.evaluate(`globalThis[${JSON.stringify(FRAME_PROBE)}] = () => {
      const entities = ${component}.skinned.entities; return { admitted: entities.length, active: entities.filter(e => e.state === 'active').length }; }`);
    report.perf.activation = await captureAfter(client, () => client.evaluate(enable(true)), { warmupFrames: 0, sampleFrames: 120, timeoutMs: 60000 });
    await wait((state) => state.population.active === 100 && state.population.pending === 0);
    await client.evaluate(`(() => { ${component}.skinned.socket(99); return true; })()`);
    report.initialGroups = await phase("initial"); await phase("advanced");
    const before = report.phases.initial, after = report.phases.advanced;
    check(new Set(before.units.map((unit) => unit.clip)).size === 3, "Two main clips and an alternate clip must play together");
    check(before.units.every((unit, i) => unit.time !== after.units[i].time && unit.renderers[0].frame !== after.units[i].renderers[0].frame), "Baked animation frames did not advance");
    check(JSON.stringify(before.units[99].sockets[0]) !== JSON.stringify(after.units[99].sockets[0]), "Baked socket transform did not advance");
    await client.screenshot(path.join(out, "baked.png"), { format: "png" });
    await play(99, "mainClips[0]"); await phase("sameAtlas", { textures: 1 });
    await play(99, "alternateClips[1]"); await phase("alternateClip");
    check(report.phases.alternateClip.units[99].id === before.units[99].id
      && report.phases.alternateClip.units[99].sockets[0].id === before.units[99].sockets[0].id, "Clip switch replaced node/socket");
    await play(99, "mainClips[0]", "realtime"); await phase("realtime", { realtime: 1, textures: 1 });
    await phase("realtimeAdvanced", { realtime: 1, textures: 1 });
    check(JSON.stringify(report.phases.realtime.units[99].renderers[0].matrices) !== JSON.stringify(report.phases.realtimeAdvanced.units[99].renderers[0].matrices), "Realtime joint matrices did not advance");
    check(JSON.stringify(report.phases.realtime.units[99].sockets[0]) !== JSON.stringify(report.phases.realtimeAdvanced.units[99].sockets[0]), "Realtime socket did not follow animation");
    await client.screenshot(path.join(out, "realtime.png"), { format: "png" });
    await play(99, "alternateClips[0]"); await phase("restored");
    report.perf.steady = await capture(client, { warmupFrames: 60, sampleFrames: 240, timeoutMs: 60000 });
    await client.evaluate(enable(false)); await capture(client, { warmupFrames: 60, sampleFrames: 1, timeoutMs: 30000 }, false);
    report.perf.memory = { prewarmedClosed: await client.evaluate(sceneSource), cycles: [] };
    for (let index = 0; index < 20; index++) {
      await client.evaluate(enable(true)); await wait((state) => state.population.active === 100 && state.population.pending === 0);
      if (index % 2) await play(99, "mainClips[0]", "realtime");
      await pause(); const opened = await client.evaluate(sceneSource);
      assertSkinnedDraws(opened, { rgba8: options.rgba8, realtime: index % 2, textures: index % 2 ? 1 : 2 });
      await client.evaluate(enable(false)); await capture(client, { warmupFrames: 60, sampleFrames: 1, timeoutMs: 30000 }, false);
      report.perf.memory.cycles.push({ index: index + 1, opened: { population: opened.population, gfx: opened.gfx }, closed: await client.evaluate(sceneSource) });
    }
    report.perf.summary = aggregateStage3dPerfEvidence(report.perf);
    report.console = await client.evaluate("window.__creatorPreviewLogs || []");
    report.consoleClassification = classifyStage3dConsole(report.console, { expectedWebgl: options.expectWebgl,
      actualWebgl: report.environment.webgl, device: report.environment.device, pipeline: report.environment.pipeline,
      coldBoot: true, bootStartedAtEpochMs: report.boot.started, bootCompletedAtEpochMs: report.boot.completed });
    check(report.consoleClassification.unexpectedErrors.length === 0, "Unexpected Creator console errors"); report.ok = true;
  } catch (error) { report.error = error.message; if (error.invalidWindow) report.invalidWindow = error.invalidWindow; }
  finally {
    if (client) {
      report.console ??= await client.evaluate("window.__creatorPreviewLogs || []").catch(() => []);
      await client.evaluate(enable(false)).catch(() => {}); client.close();
    }
    report.finishedAt = new Date().toISOString();
    const reportPath = path.join(out, "report.json"), bytes = JSON.stringify(report, null, 2) + "\n"; fs.writeFileSync(reportPath, bytes);
    const date = report.startedAt.slice(0, 10), actualLabel = options.rgba8 ? "rgba8" : `webgl${report.environment?.webgl ?? options.expectWebgl ?? 2}`;
    const summaryPath = path.resolve(options.summary ?? path.join(ROOT, "docs/perf/stage3d", `${date}-sc4-b1-${actualLabel}.json`));
    if (report.ok) {
      fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      fs.writeFileSync(summaryPath, JSON.stringify({ schemaVersion: 1, kind: report.kind, environment: report.environment,
        initialGroups: report.initialGroups, performance: report.perf.summary, rgba8FaultInjection: options.rgba8,
        raw: { path: reportPath, sha256: createHash("sha256").update(bytes).digest("hex") },
        limitations: "Desktop two-bone greybox; not complex rig, mobile or WeChat cache evidence. Screenshots require review." }, null, 2) + "\n");
    }
    return { ok: report.ok, reportPath, summaryPath: report.ok ? summaryPath : null, error: report.error ?? null };
  }
}
