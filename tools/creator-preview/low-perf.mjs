/** SC4-B3 desktop capability fault matrix. Never represents a real WeChat/cache run. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CdpClient, consoleHookSource, openScene, sceneUuidFromMeta, sleep } from './lib.mjs';
import { parseStage3dPerfArgs, newPerfTab, capture, captureAfter, FRAME_PROBE, aggregateStage3dPerfEvidence } from './perf.mjs';
import { skinnedSceneSource } from './skinned-perf.mjs';
import { STAGE3D_VIEWPORT, STAGE3D_PREVIEW_DEVICE, readScheduledStageQueues } from './probe-stage3d.mjs';
import { createFloatFaultSource, createFloatFaultInspectionSource, assertFloatFaultBoot } from './probe-stage3d-rgba8.mjs';
import { classifyStage3dConsole } from './stage3d-diagnostics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const component = 'cc.director.getScene().getComponentsInChildren("Stage3dDevScene")[0]';
const check = (value, message) => { if (!value) throw new Error(message); };
const CASES = ['baked', 'rgba8', 'no-instancing', 'realtime'];
export function parseLowPerfArgs(argv) {
  const args = [...argv], index = args.indexOf('--low-case'), kind = args[index + 1];
  check(index >= 0 && CASES.includes(kind), '--low-case requires baked|rgba8|no-instancing|realtime'); args.splice(index, 2);
  check(args.includes('--perf'), '--low-case requires --perf');
  const options = { ...parseStage3dPerfArgs(['--quality', 'low', ...args]), kind };
  if (!options.help) check(options.quality === 'low' && options.forceWebgl1 && options.expectWebgl === 1, 'Low evidence requires low / actual WebGL1 / fresh page');
  return options;
}

/** Only owned fresh page's native capability queries are masked, before Cocos boots. */
function installLowFault(kind) {
  const prototype = WebGLRenderingContext.prototype, extension = prototype.getExtension,
    supported = prototype.getSupportedExtensions, parameter = prototype.getParameter;
  const queries = [], beforeCocos = typeof cc === 'undefined';
  const masked = (name) => /^(?:(?:WEBKIT|MOZ)_)?WEBGL_compressed_texture_astc$/i.test(name)
    || kind === 'no-instancing' && name === 'ANGLE_instanced_arrays';
  prototype.getExtension = function(name) { const result = extension.call(this, name);
    if (masked(name)) queries.push({ name, native: !!result, effective: false }); return masked(name) ? null : result; };
  prototype.getSupportedExtensions = function() { return supported.call(this)?.filter(name => !masked(name)) ?? null; };
  prototype.getParameter = function(name) { const result = parameter.call(this, name);
    if (kind === 'realtime' && name === this.MAX_VERTEX_TEXTURE_IMAGE_UNITS) {
      queries.push({ name: 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', native: result, effective: 0 }); return 0;
    }
    return result;
  };
  globalThis.__sc4LowFault = { kind, beforeCocos, queries, artificial: true };
}
export const lowFaultSource = kind => `(${installLowFault.toString()})(${JSON.stringify(kind)})`;

function readLow(readQueues, checkerUuid) {
  const scene = cc.director.getScene(), c = scene.getComponentsInChildren('Stage3dDevScene')[0];
  if (!c?.skinned) return null;
  const camera = scene.getComponentsInChildren('cc.Camera').find(item => item.node.name === 'Stage3DCamera');
  const scheduled = new Set(readQueues(cc.director.root.pipeline._executor._context.culling, camera.camera).flatMap(queue => [...queue.models]));
  return { policy: c.skinned.pool?.policy ?? null, fault: globalThis.__sc4LowFault,
    refs: ['greybox-biped/greybox-biped', 'greybox-biped-atlas-b/greybox-biped-atlas-b', 'P_Stage3d_Billboard', 'FX_Stage3d_Sparks']
      .map(path => ({ path, refs: cc.resources.get(`stage3d/${path}`, cc.Prefab)?.refCount ?? 0 })),
    effects: c.vfx.effects.filter(effect => effect.state === 'active').length,
    vfxError: c.vfx.error,
    particles: scene.getComponentsInChildren('cc.ParticleSystem').map(p => ({ playing: p.isPlaying,
      count: p.getParticleCount(), scheduled: scheduled.has(p.processor.getModel()) })),
    png: cc.assetManager.assets.get(checkerUuid)?.nativeUrl ?? null };
}
const checkerUuid = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/Cocos/assets/resources/stage3d/T_Greybox_Checker_BC.png.meta'), 'utf8')).uuid;
const sceneSource = `(() => { const base = ${skinnedSceneSource}; if (base.status === 'missing' || base.status === 'failed') return base;
  return { ...base, low: (${readLow.toString()})(${readScheduledStageQueues.toString()}, ${JSON.stringify(checkerUuid)}) }; })()`;
const enable = enabled => `(() => { const c = ${component}; c.setSkinnedEnabled(${enabled}); c.vfx.setEnabled(${enabled}, false); return true; })()`;

export function assertLowDraws(state, kind, far = false) {
  const count = ['no-instancing', 'realtime'].includes(kind) ? 25 : 50;
  check(state.quality.tier === 'low' && state.quality.maxEffects === 8 && state.quality.shadows === 'off'
    && !state.quality.details && state.quality.textureFormat === 'png', 'Low policy / PNG fallback missing');
  check(state.population.active === count && state.population.pending === 0 && state.population.failed === 0
    && state.units.length === count, 'Wrong low unit population');
  check(!state.low.vfxError && state.low.effects === (far ? 0 : 8), 'Wrong low Vfx budget/LOD');
  check(state.low.particles.length === (far ? 0 : 8) && state.low.particles.every(p => p.playing && p.count > 0 && p.scheduled), 'Low particles not submitted');
  check(/\.png(?:$|\?)/u.test(state.low.png ?? ''), 'Actual image did not load PNG');
  if (far && kind === 'realtime') {
    check(state.units.every(u => u.presentation === 'billboard' && u.billboards?.length === 1
      && u.billboards.every(b => b.enabled && b.scheduled && b.passes?.length && b.passes.every(p => !p.instancing && p.direct)
        && b.width === 1.5 && b.height === 2)), 'Far fallback must submit real billboards');
    return;
  }
  const expected = new Map();
  for (const unit of state.units) {
    check(unit.playing && unit.renderers?.length, 'Low animation missing');
    check(unit.baked === (kind !== 'realtime'), 'Wrong low skinning mode');
    for (const renderer of unit.renderers) {
      check(renderer.subModels.length && renderer.subModels.every(s => s.passes.length), 'Low renderer not submitted');
      if (kind === 'realtime') check(renderer.type === 1 && renderer.matrices?.length, 'Realtime matrices missing');
      else check(renderer.type === 2 && renderer.texture && renderer.textureFormat === (kind === 'rgba8' ? 35 : 44)
        && renderer.uploadedClip === unit.clip, 'Actual baked joint texture/clip differs from selected capability');
      for (const sub of renderer.subModels) for (const pass of sub.passes) {
        if (['no-instancing', 'realtime'].includes(kind)) check(!pass.instancing && pass.direct, 'Direct fallback material missing');
        else {
          check(pass.instancing && sub.texture === renderer.texture, 'Baked batch texture mismatch');
          const key = JSON.stringify([pass.id, sub.indexBuffer, renderer.texture]); expected.set(key, (expected.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const actual = new Map();
  for (const batch of state.batches) {
    const key = JSON.stringify([batch.pass, batch.indexBuffer, batch.texture]);
    if (expected.has(key)) { check(batch.count === batch.uploaded, 'Low instance upload missing'); actual.set(key, (actual.get(key) ?? 0) + batch.count); }
  }
  check(expected.size === actual.size && [...expected].every(([key, count]) => actual.get(key) === count), 'Low draw batches differ from real submissions');
}

function compiledSources() {
  const dir = path.join(ROOT, 'apps/Cocos/temp/programming/packer-driver/targets/preview');
  const imports = JSON.parse(fs.readFileSync(path.join(dir, 'import-map.json'), 'utf8')).imports;
  return ['logic/scene3d/skinningPolicy.ts', ...['SkinnedUnits.ts','cocosSkinnedUnits.ts','cocosEntityPool.ts','SkinnedUnitsFixture.ts','VfxFixture.ts','ownedRendering.ts','Stage3dDevScene.ts'].map(f => `view/scene3d/${f}`)].map(file => {
    const source = fs.readFileSync(path.join(ROOT, 'apps/client/src', file), 'utf8'), mirror = path.join(ROOT, 'apps/Cocos/assets/src', file);
    check(fs.readFileSync(mirror, 'utf8') === source, `Stale mirror: ${file}`);
    const compiled = imports[new URL(`file://${mirror}`).href]; check(compiled, `Missing compiled module: ${file}`);
    check(JSON.parse(fs.readFileSync(path.join(dir, `${compiled}.map`), 'utf8')).sourcesContent.includes(source), `Stale compiled source: ${file}`);
    return { file, compiled, sha256: createHash('sha256').update(source).digest('hex') };
  });
}

export async function runLowPerf(options) {
  const out = path.resolve(options.out ?? `.cache/sc4-b3/${options.kind}`); fs.mkdirSync(out, { recursive: true });
  const report = { kind: 'sc4-b3-low-desktop', startedAt: new Date().toISOString(), options, ok: false,
    realWeChatEvidence: false, phases: {}, perf: {}, limitation: 'Desktop WebGL1 and explicit pre-boot capability fault injection; no real WeChat/cache claim.' };
  let client, tab;
  const pause = (frames = 7) => capture(client, { warmupFrames: 0, sampleFrames: frames, timeoutMs: 15000 }, false);
  const count = ['no-instancing', 'realtime'].includes(options.kind) ? 25 : 50;
  const wait = async (predicate) => {
    const deadline = Date.now() + 45000; let state;
    while (Date.now() < deadline) {
      state = await client.evaluate(sceneSource); check(state.status !== 'failed', state.error);
      if (predicate(state)) return state; await sleep(100);
    }
    throw new Error(`Low scene timeout: ${JSON.stringify(state?.population)}`);
  };
  try {
    report.sources = compiledSources(); tab = await newPerfTab(options); report.tab = tab.id;
    client = await CdpClient.connect(tab.wsUrl); await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', STAGE3D_VIEWPORT);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: consoleHookSource });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : get.call(this, type, ...args); }; })()` });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: lowFaultSource(options.kind) });
    if (options.kind === 'rgba8') await client.send('Page.addScriptToEvaluateOnNewDocument', { source: createFloatFaultSource() });
    const sceneUuid = sceneUuidFromMeta(fs.readFileSync(path.join(ROOT, 'apps/Cocos/assets/stage3d-dev.scene.meta'), 'utf8'));
    await openScene(client, { preview: options.preview, sceneUuid, timeoutMs: options.bootTimeoutMs,
      query: { quality: 'low', shadows: 0 }, ready: walk => walk.sceneName === 'stage3d-dev' });
    report.ready = await wait(s => s.status === 'ready'); report.environment = report.ready.environment;
    const v = report.environment.viewport;
    check(report.environment.webgl === 1 && report.environment.previewDevice === STAGE3D_PREVIEW_DEVICE
      && v.cssWidth === 375 && v.cssHeight === 812 && v.backingWidth === 750 && v.backingHeight === 1624 && v.dpr === 2, 'Actual WebGL1 / native preview viewport required');
    report.boot = await client.evaluate('({ started: performance.timeOrigin, completed: Date.now() })');
    if (options.kind === 'rgba8') { report.floatFault = await client.evaluate(createFloatFaultInspectionSource()); assertFloatFaultBoot(report.floatFault); }
    check(report.ready.low.fault.beforeCocos, 'Fault installed after engine boot');
    if (options.kind === 'no-instancing') check(!report.ready.quality.instancing && report.ready.low.fault.queries.some(q => q.name === 'ANGLE_instanced_arrays' && q.native), 'Instancing capability was not actually masked');
    if (options.kind === 'realtime') check(report.ready.quality.jointTexture === 'unavailable' && report.ready.low.fault.queries.some(q => q.name === 'MAX_VERTEX_TEXTURE_IMAGE_UNITS' && q.native > 0), 'Vertex texture capability was not actually masked');
    await client.evaluate(`globalThis[${JSON.stringify(FRAME_PROBE)}] = () => { const c = ${component};
      return { admitted:c.skinned.entities.length, active:c.skinned.entities.filter(e=>e.state==='active').length,
        effects:c.vfx.effects.filter(e=>e.state==='active').length }; }`);
    report.perf.activation = await captureAfter(client, () => client.evaluate(enable(true)), { warmupFrames: 0, sampleFrames: 120, timeoutMs: 60000 });
    await wait(s => s.population.active === count); await pause();
    report.phases.near = await client.evaluate(sceneSource); assertLowDraws(report.phases.near, options.kind);
    await pause(); report.phases.advanced = await client.evaluate(sceneSource);
    check(report.phases.near.units.every((u,i) => u.time !== report.phases.advanced.units[i].time), 'Low animation did not advance');
    if (options.kind === 'realtime') check(JSON.stringify(report.phases.near.units[0].renderers[0].matrices) !== JSON.stringify(report.phases.advanced.units[0].renderers[0].matrices), 'Realtime transforms did not advance');
    else check(report.phases.near.units.every((u,i) => u.renderers[0].frame !== report.phases.advanced.units[i].renderers[0].frame), 'Actual joint texture animation frames did not advance');
    await client.screenshot(path.join(out,'near.png'), { format:'png' });
    report.perf.steady = await capture(client, { warmupFrames:60, sampleFrames:240, timeoutMs:60000 });
    check(report.perf.steady.raw.frames.filter(f=>f.phase==='sample').every(f=>f.extra.active===count && f.extra.effects===8), 'Measured low load differs from declared population');
    await client.evaluate(`${component}.skinned.pool.setLod(2); ${component}.vfx.pool.setLod(2)`);
    await wait(s => s.population.active === count && s.low.effects === 0); await pause();
    report.phases.far = await client.evaluate(sceneSource); assertLowDraws(report.phases.far, options.kind, true);
    await client.screenshot(path.join(out,'far.png'), { format:'png' });
    await client.evaluate(`${component}.skinned.pool.setLod(0)`); await wait(s=>s.population.active===count); await pause();
    report.phases.restored = await client.evaluate(sceneSource);
    check(report.phases.restored.units.every(u => u.baked === (options.kind !== 'realtime') && u.playing), 'Near skinning did not recover');
    await client.evaluate(enable(false)); await pause(61);
    report.perf.memory = { prewarmedClosed: await client.evaluate(sceneSource), cycles: [] };
    for (let index=0;index<20;index++) {
      await client.evaluate(enable(true)); await wait(s=>s.population.active===count); await pause();
      const opened = await client.evaluate(sceneSource); assertLowDraws(opened,options.kind);
      if (index%2) { await client.evaluate(`${component}.skinned.pool.setLod(2); ${component}.vfx.pool.setLod(2)`);
        await wait(s=>s.population.active===count && s.low.effects===0); await pause(); assertLowDraws(await client.evaluate(sceneSource),options.kind,true); }
      await client.evaluate(enable(false)); await pause(61);
      const closed = await client.evaluate(sceneSource);
      check(closed.low.effects===0 && closed.low.refs.every(r=>r.refs===0),'Closed low fixture kept business references');
      report.perf.memory.cycles.push({ index:index+1, opened:{population:opened.population,gfx:opened.gfx}, closed });
    }
    report.perf.summary = aggregateStage3dPerfEvidence(report.perf);
    report.console = await client.evaluate('window.__creatorPreviewLogs || []');
    report.consoleClassification = classifyStage3dConsole(report.console, { expectedWebgl:1, actualWebgl:1,
      device:report.environment.device, pipeline:report.environment.pipeline, coldBoot:true,
      bootStartedAtEpochMs:report.boot.started, bootCompletedAtEpochMs:report.boot.completed });
    check(!report.consoleClassification.unexpectedErrors.length,'Unexpected low Creator console errors'); report.ok=true;
  } catch(error) { report.error=error.message; if(error.invalidWindow) report.invalidWindow=error.invalidWindow; }
  finally {
    if(client) { report.console ??= await client.evaluate('window.__creatorPreviewLogs || []').catch(()=>[]);
      await client.evaluate(enable(false)).catch(()=>{}); client.close(); }
    if(tab) { const result=await fetch(`${options.devtools}/json/close/${tab.id}`).catch(()=>null); report.ownedPageClosed=result?.ok ?? false; if(!report.ownedPageClosed) report.ok=false; }
    report.finishedAt=new Date().toISOString();
    const reportPath=path.join(out,'report.json'), bytes=JSON.stringify(report,null,2)+'\n'; fs.writeFileSync(reportPath,bytes);
    return { ok:report.ok, reportPath, sha256:createHash('sha256').update(bytes).digest('hex'), error:report.error??null };
  }
}
