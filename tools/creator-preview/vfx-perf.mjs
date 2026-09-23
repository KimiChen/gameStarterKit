/** SC4-B2: actual 100 skinned units + 50 particle prefabs, lifecycle and raw frame evidence. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CdpClient, consoleHookSource, openScene, sceneUuidFromMeta, sleep } from "./lib.mjs";
import { parseStage3dPerfArgs, newPerfTab, capture, captureAfter, FRAME_PROBE, aggregateStage3dPerfEvidence } from "./perf.mjs";
import { STAGE3D_VIEWPORT, STAGE3D_PREVIEW_DEVICE, readScheduledStageQueues } from "./probe-stage3d.mjs";
import { skinnedSceneSource, assertSkinnedDraws } from "./skinned-perf.mjs";
import { classifyStage3dConsole } from "./stage3d-diagnostics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const check = (value, message) => { if (!value) throw new Error(message); };
const component = 'cc.director.getScene().getComponentsInChildren("Stage3dDevScene")[0]';
export function parseVfxPerfArgs(argv) {
  check(argv.includes("--perf"), "--vfx requires --perf");
  const options = parseStage3dPerfArgs(argv.filter((arg) => arg !== "--vfx"));
  if (!options.help) check(options.quality === "high", "100 units + 50 effects requires high developer stress configuration");
  return options;
}
function readVfx(readQueues) {
  const scene = cc.director.getScene(), component = scene?.getComponentsInChildren("Stage3dDevScene")[0], fixture = component?.vfx;
  if (!fixture) return null;
  const camera = scene.getComponentsInChildren("cc.Camera").find((item) => item.node.name === "Stage3DCamera");
  const culling = cc.director.root.pipeline._executor._context.culling;
  const scheduled = new Set(readQueues(culling, camera?.camera).flatMap((queue) => [...queue.models]));
  const ids = globalThis.__sc4VfxIds ??= { nodes: new WeakMap(), next: 0 };
  const id = (node) => { if (!node) return null; if (!ids.nodes.has(node)) ids.nodes.set(node, ++ids.next); return ids.nodes.get(node); };
  return { error: fixture.error, productionMaxEffects: fixture.quality.maxEffects, stressMaxEffects: 50,
    prefabRefs: cc.resources.get("stage3d/FX_Stage3d_Sparks", cc.Prefab)?.refCount ?? 0,
    population: { admitted: fixture.effects.filter((e) => e.state !== "released").length,
      active: fixture.effects.filter((e) => e.state === "active").length,
      pending: fixture.effects.filter((e) => e.state === "pending").length },
    effects: fixture.effects.map((effect) => ({ state: effect.state, node: id(effect.node), position: effect.node?.worldPosition ?? null })),
    particles: scene.getComponentsInChildren("cc.ParticleSystem").map((particle) => ({
      node: id(particle.node), active: particle.enabledInHierarchy, playing: particle.isPlaying,
      count: particle.getParticleCount(), capacity: particle.capacity,
      authored: { size: particle.startSizeX.constant, speed: particle.startSpeed.constant,
        rate: particle.rateOverTime.constant, lifetime: particle.startLifetime.constant },
      scheduled: scheduled.has(particle.processor.getModel()), position: particle.node.worldPosition,
    })) };
}
const sceneSource = `(() => { const skinned = ${skinnedSceneSource};
  if (skinned.status === 'missing') return skinned;
  const vfx = (${readVfx.toString()})(${readScheduledStageQueues.toString()});
  return { ...skinned, vfx, population: { admitted: skinned.population.admitted + (vfx?.population.admitted ?? 0),
    active: skinned.population.active + (vfx?.population.active ?? 0) }, skinPopulation: skinned.population }; })()`;
const enable = (enabled) => `(() => { const c = ${component}; c.setSkinnedEnabled(${enabled}); c.setVfxEnabled(${enabled}); return true; })()`;

function compiledSources() {
  const pack = path.join(ROOT, "apps/Cocos/temp/programming/packer-driver/targets/preview");
  const imports = JSON.parse(fs.readFileSync(path.join(pack, "import-map.json"), "utf8")).imports;
  return ["Vfx.ts", "cocosVfx.ts", "VfxFixture.ts", "Stage3dDevScene.ts"].map((name) => {
    const source = `apps/client/src/view/scene3d/${name}`, mirror = `apps/Cocos/assets/src/view/scene3d/${name}`;
    const content = fs.readFileSync(path.join(ROOT, source), "utf8"), specifier = new URL(`file://${path.join(ROOT, mirror)}`).href;
    check(fs.readFileSync(path.join(ROOT, mirror), "utf8") === content, `Stale client mirror: ${source}`);
    const compiled = imports[specifier]; check(compiled, `Creator has not imported ${source}`);
    const map = JSON.parse(fs.readFileSync(path.join(pack, `${compiled}.map`), "utf8"));
    check(map.sourcesContent.includes(content), `Creator compiled source is stale: ${source}`);
    return { source, sha256: createHash("sha256").update(content).digest("hex"), compiledMap: path.relative(ROOT, path.join(pack, `${compiled}.map`)) };
  });
}

export function assertVfxDraws(state, expected = 50) {
  check(state.vfx && !state.vfx.error, state.vfx?.error || "Vfx fixture missing");
  const { particles, population } = state.vfx;
  check(population.active === expected && population.pending === 0 && particles.length === expected, "Actual Vfx population differs from requested load");
  check(particles.every((p) => p.active && p.playing && p.count > 0 && p.count <= p.capacity && p.scheduled),
    "Every particle system must be playing, populated and submitted to stage color queues");
  check(particles.every((p) => p.capacity === 50 && p.authored?.size === 0.25 && p.authored.speed === 2
    && p.authored.rate === 30 && p.authored.lifetime === 1), "Imported particle settings differ from the author prefab");
  check(state.vfx.productionMaxEffects === 48 && state.vfx.stressMaxEffects === 50, "Production/stress budgets must be explicit");
  check(state.skinPopulation?.active === 100, "100 active skinned units required alongside effects");
  assertSkinnedDraws({ ...state, population: state.skinPopulation });
  return { systems: particles.length, particles: particles.reduce((sum, p) => sum + p.count, 0), gfx: state.gfx };
}

export async function runVfxPerf(options) {
  const out = path.resolve(options.out ?? path.join(ROOT, ".cache/sc4-b2", `webgl${options.expectWebgl ?? 2}`)); fs.mkdirSync(out, { recursive: true });
  const report = { schemaVersion: 1, kind: "sc4-b2-vfx", startedAt: new Date().toISOString(), options, ok: false, phases: {}, perf: {} };
  let client;
  const pause = (frames = 15) => capture(client, { warmupFrames: 0, sampleFrames: frames, timeoutMs: 15000 }, false);
  const wait = async (accept) => {
    const deadline = Date.now() + 45000; let state;
    while (Date.now() < deadline) {
      state = await client.evaluate(sceneSource); check(state.status !== "failed" && !state.vfx?.error, state.error || state.vfx?.error);
      if (accept(state)) return state; await sleep(100);
    }
    throw new Error(`Vfx scene timeout: ${JSON.stringify(state?.population)}`);
  };
  const active = () => wait((s) => s.population?.active === 150);
  try {
    const tab = await newPerfTab(options); report.tab = tab.id; client = await CdpClient.connect(tab.wsUrl);
    await client.send("Page.enable"); await client.send("Emulation.setDeviceMetricsOverride", STAGE3D_VIEWPORT);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource });
    if (options.forceWebgl1) await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type === "webgl2" ? null : get.call(this, type, ...args); }; })()` });
    const sceneUuid = sceneUuidFromMeta(fs.readFileSync(path.join(ROOT, "apps/Cocos/assets/stage3d-dev.scene.meta"), "utf8"));
    await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs, query: { quality: "high", shadows: 0 },
      ready: (walk) => walk.sceneName === "stage3d-dev" });
    report.ready = await wait((s) => s.status === "ready" && s.vfx); report.environment = report.ready.environment;
    report.compiledSources = compiledSources();
    const { viewport } = report.environment;
    check(report.environment.previewDevice === STAGE3D_PREVIEW_DEVICE && viewport.cssWidth === 375 && viewport.cssHeight === 812
      && viewport.backingWidth === 750 && viewport.backingHeight === 1624 && viewport.dpr === 2, "Select WebpageFullScreen / Rotate off in native Creator preview");
    check(options.expectWebgl === null || report.environment.webgl === options.expectWebgl, "Actual WebGL context mismatch");
    report.boot = await client.evaluate('({ started: performance.timeOrigin, completed: Date.now() })');
    await client.evaluate(`globalThis[${JSON.stringify(FRAME_PROBE)}] = () => {
      const c = ${component}, effects = [...c.skinned.entities, ...c.vfx.effects].filter(e => e.state !== 'released');
      return { admitted: effects.length, active: effects.filter(e => e.state === 'active').length,
        skins: c.skinned.entities.filter(e => e.state === 'active').length, vfx: c.vfx.effects.filter(e => e.state === 'active').length }; }`);
    report.perf.activation = await captureAfter(client, () => client.evaluate(enable(true)), { warmupFrames: 0, sampleFrames: 120, timeoutMs: 60000 });
    await active(); await pause(60); report.phases.initial = await client.evaluate(sceneSource); assertVfxDraws(report.phases.initial);
    await client.screenshot(path.join(out, "combined.png"), { format: "png" });
    await client.evaluate(`${component}.vfx.target.setPosition(10, 2, 6)`); await pause();
    report.phases.follow = await client.evaluate(sceneSource); assertVfxDraws(report.phases.follow);
    check(JSON.stringify(report.phases.follow.vfx.effects[0].position) === JSON.stringify({ x: 10, y: 2, z: 6 }), "Follow did not track world position");
    report.phases.reuse = await client.evaluate(`(() => { const f = ${component}.vfx, old = f.effects[49], node = old.node;
      const overflow = f.pool.play('sparks', { at: {x:0,y:1,z:0} }, 1000); old.stop();
      const next = f.pool.play('sparks', { at: {x:0,y:1,z:0} }, 300); f.effects[49] = next;
      globalThis.__sc4VfxReuse = { old, next, node }; return { rejected: overflow === undefined, particlesAfterStop: node.getComponentsInChildren('cc.ParticleSystem')[0].getParticleCount() }; })()`);
    check(report.phases.reuse.rejected && report.phases.reuse.particlesAfterStop === 0, "Cap/particle clearing failed");
    await pause(3);
    report.phases.reuse.active = await client.evaluate(`(() => { const r = globalThis.__sc4VfxReuse; r.old.stop(); return { reused: r.node === r.next.node, state: r.next.state }; })()`);
    check(report.phases.reuse.active.reused && report.phases.reuse.active.state === "active", "Pool reuse or stale handle isolation failed");
    await pause(30); check(await client.evaluate("globalThis.__sc4VfxReuse.next.state") === "released", "Timed effect did not expire");
    await client.evaluate(`${component}.vfx.pool.setLod(2)`); await pause();
    report.phases.far = await client.evaluate(sceneSource);
    check(report.phases.far.vfx.population.active === 0 && report.phases.far.vfx.particles.length === 0, "Far LOD still renders particles");
    check(await client.evaluate(`${component}.vfx.pool.play('sparks', {at:{x:0,y:0,z:0}}, 1000) === undefined`), "Far LOD admitted a new effect");
    await client.evaluate(`${component}.vfx.pool.setLod(0)`); await pause();
    check((await client.evaluate(sceneSource)).vfx.population.active === 0, "LOD return replayed expired effects");
    await client.evaluate(`(() => { const c = ${component}; c.setVfxEnabled(false); c.setVfxEnabled(true); })()`); await active(); await pause(60);
    await client.evaluate(`${component}.vfx.pool.setQuality(${component}.vfx.quality)`); await pause(15);
    report.phases.productionCap = await client.evaluate(sceneSource); assertVfxDraws(report.phases.productionCap, 48);
    await client.evaluate(`(() => { const c = ${component}; c.setVfxEnabled(false); c.setVfxEnabled(true); })()`); await active();
    report.perf.steady = await capture(client, { warmupFrames: 60, sampleFrames: 240, timeoutMs: 60000 });
    report.phases.steady = await client.evaluate(sceneSource); assertVfxDraws(report.phases.steady);
    check(report.perf.steady.raw.frames.filter(f => f.phase === 'sample').every(f => f.extra.skins === 100 && f.extra.vfx === 50), "Combined load missing inside measured window");
    await client.evaluate(enable(false)); await capture(client, { warmupFrames: 60, sampleFrames: 1, timeoutMs: 30000 }, false);
    report.perf.memory = { prewarmedClosed: await client.evaluate(sceneSource), cycles: [] };
    for (let index = 0; index < 20; index++) {
      await client.evaluate(enable(true)); await active(); await pause(60);
      const opened = await client.evaluate(sceneSource); assertVfxDraws(opened);
      await client.evaluate(enable(false)); await capture(client, { warmupFrames: 60, sampleFrames: 1, timeoutMs: 30000 }, false);
      report.perf.memory.cycles.push({ index: index + 1, opened: { population: opened.population, gfx: opened.gfx }, closed: await client.evaluate(sceneSource) });
    }
    check(report.perf.memory.prewarmedClosed.vfx.prefabRefs === 0
      && report.perf.memory.cycles.every(cycle => cycle.closed.vfx.prefabRefs === 0), "Closed Vfx prefab references did not return to zero");
    report.perf.summary = aggregateStage3dPerfEvidence(report.perf);
    report.console = await client.evaluate("window.__creatorPreviewLogs || []");
    report.consoleClassification = classifyStage3dConsole(report.console, { expectedWebgl: options.expectWebgl, actualWebgl: report.environment.webgl,
      device: report.environment.device, pipeline: report.environment.pipeline, coldBoot: true,
      bootStartedAtEpochMs: report.boot.started, bootCompletedAtEpochMs: report.boot.completed });
    check(report.consoleClassification.unexpectedErrors.length === 0, "Unexpected Creator console errors"); report.ok = true;
  } catch (error) { report.error = error.message; if (error.invalidWindow) report.invalidWindow = error.invalidWindow; }
  finally {
    if (client) { report.console ??= await client.evaluate("window.__creatorPreviewLogs || []").catch(() => []);
      await client.evaluate(enable(false)).catch(() => {}); client.close(); }
    report.finishedAt = new Date().toISOString();
    const reportPath = path.join(out, "report.json"), bytes = JSON.stringify(report, null, 2) + "\n"; fs.writeFileSync(reportPath, bytes);
    const summaryPath = path.resolve(options.summary ?? path.join(ROOT, "docs/perf/stage3d", `${report.startedAt.slice(0,10)}-sc4-b2-webgl${report.environment?.webgl ?? 2}.json`));
    if (report.ok) { fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      fs.writeFileSync(summaryPath, JSON.stringify({ schemaVersion: 1, kind: report.kind, environment: report.environment, performance: report.perf.summary,
        load: { skinnedUnits: 100, particleSystems: 50, productionMaxEffects: 48, stressOverride: 50 },
        raw: { path: reportPath, sha256: createHash("sha256").update(bytes).digest("hex") },
        limitations: "Desktop two-bone greybox + 50 particle systems; explicit stress override, not a production budget increase or WeChat evidence. Screenshots require review." }, null, 2) + "\n"); }
    return { ok: report.ok, reportPath, summaryPath: report.ok ? summaryPath : null, error: report.error ?? null };
  }
}
