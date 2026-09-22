#!/usr/bin/env node
/** SC1-B7: load the installed package by bundle name + path in a fresh real-engine preview. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CdpClient, sleep, rewriteSceneQuery } from './lib.mjs';
const [directory, label = 'preview'] = process.argv.slice(2);
if (!directory || !/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Usage: node probe-bundle-install.mjs <fixture-directory> [label]');
const base = path.resolve(directory), project = path.join(base, 'clean/apps/Cocos');
const ready = JSON.parse(fs.readFileSync(path.join(base, 'clean-probe/ready.json')));
if (fs.realpathSync(ready.project) !== fs.realpathSync(project)) throw new Error('Wrong Creator project');
const listeners = execFileSync('lsof', ['-nP', '-a', '-p', String(ready.pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
const port = listeners.match(/:(745\d) \(LISTEN\)/)?.[1];
if (!port) throw new Error('Cannot identify the exact isolated preview listener');
if (fs.existsSync(path.join(base, 'author'))) throw new Error('Author source path must be unavailable before clean preview');
const preview = 'http://127.0.0.1:' + port;
const uuid = JSON.parse(fs.readFileSync(path.join(project, 'assets/scene.scene.meta'))).uuid;
const tab = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const client = await CdpClient.connect(tab.webSocketDebuggerUrl);
const report = { project, editorPid: ready.pid, preview, sceneUuid: uuid, label, console: [], failures: [] };
const save = () => fs.writeFileSync(path.join(base, label + '.json'), JSON.stringify(report, null, 2) + '\n');
try {
  client.on(message => {
    if (message.method === 'Fetch.requestPaused') client.send('Fetch.continueRequest', { requestId: message.params.requestId, url: rewriteSceneQuery(message.params.request.url, uuid) }).catch(() => {});
    if (message.method === 'Runtime.exceptionThrown') report.console.push({ type: 'exception', details: message.params.exceptionDetails });
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) report.console.push({ type: message.params.type, args: message.params.args.map(arg => arg.value ?? arg.description) });
  });
  await client.send('Runtime.enable'); await client.send('Page.enable');
  await client.send('Fetch.enable', { patterns: [{ urlPattern: '*settings.js*', requestStage: 'Request' }] });
  await client.send('Page.bringToFront');
  await client.send('Page.navigate', { url: preview + '/?scene=' + uuid });
  const deadline = Date.now() + 180000;
  let loaded = false;
  while (Date.now() < deadline) {
    try { loaded = await client.evaluate(`globalThis.cc?.director?.getScene()?.uuid === ${JSON.stringify(uuid)}`); } catch {}
    if (loaded) break;
    await sleep(1000);
  }
  if (!loaded) throw new Error('Clean scene did not boot');
  report.runtime = await client.evaluate(`(async () => {
    const cc = await System.import('cc');
    const main = await new Promise((resolve, reject) => cc.assetManager.loadBundle('kit-bundleFixture', (e, b) => e ? reject(e) : resolve(b)));
    const asset = await new Promise((resolve, reject) => main.load('3d/P_Chain', cc.Prefab, (e, a) => e ? reject(e) : resolve(a)));
    const node = cc.instantiate(asset); const renderer = node.getComponentsInChildren(cc.MeshRenderer)[0];
    const material = renderer.sharedMaterial, texture = material.getProperty('mainTexture');
    if (!renderer.mesh || !material.effectAsset || texture.width !== 64 || !texture.image || texture.height !== 64) throw new Error('Broken runtime dependency or placeholder texture');
    const Graph = cc.js.getClassByName('cc.animation.AnimationGraph');
    const graph = await new Promise((resolve, reject) => main.load('3d/Chain', Graph, (e, a) => e ? reject(e) : resolve(a)));
    const layer = graph.layers[0], state = [...layer.stateMachine.states()].find(s => s.name === 'Clip');
    if (!layer.mask || state.motion.clip.duration !== 1) throw new Error('Broken animation graph');
    const result = { address: { bundle: main.name, path: '3d/P_Chain' }, prefab: asset.uuid, mesh: renderer.mesh.uuid, material: material.uuid, texture: texture.uuid, image: texture.image.uuid, effect: material.effectAsset.uuid, width: texture.width, height: texture.height, graph: graph.uuid, mask: layer.mask.uuid, clip: state.motion.clip.uuid, clipDuration: state.motion.clip.duration, device: cc.director.root.device.constructor.name, scene: cc.director.getScene().name };
    node.destroy(); return result;
  })()`);
  await sleep(800);
  await client.screenshot(path.join(base, label + '.png'), { format: 'png' });
  report.failures = report.console.filter(entry => entry.type === 'exception' || entry.type === 'error');
  report.ok = report.failures.length === 0;
  if (!report.ok) throw new Error('Unexpected browser errors; inspect raw console');
  console.log(JSON.stringify(report.runtime));
} catch (error) { report.ok = false; report.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { save(); client.close(); }
