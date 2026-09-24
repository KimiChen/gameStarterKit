#!/usr/bin/env node
/** O3-B2：复用现有预览，检查错版/缺片/离线与引擎缓存。所有故障钩子在 finally 撤销。 */
import fs from 'node:fs';
import path from 'node:path';
import { CdpClient, sleep } from './lib.mjs';
const [tabId, output] = process.argv.slice(2);
if (!tabId || !output) throw new Error('Usage: node probe-maporiginal-bundle.mjs <existing-tab-id> <output-directory>');
const tab = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(t => t.id === tabId);
if (!tab || !/^http:\/\/(localhost|127\.0\.0\.1):7456\//.test(tab.url)) throw new Error('Expected the selected local Creator preview');
const out = path.resolve(output); fs.mkdirSync(out, { recursive: true });
const client = await CdpClient.connect(tab.webSocketDebuggerUrl);
const report = { ok: false, steps: [], console: [], networkFailures: [] };
let phase = 'setup';
client.on(m => {
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) report.console.push({ phase, type: m.params.type, args: m.params.args.map(a => a.value ?? a.description) });
    if (m.method === 'Runtime.exceptionThrown') report.console.push({ phase, type: 'uncaught', details: m.params.exceptionDetails });
    if (m.method === 'Network.loadingFailed') report.networkFailures.push({ phase, ...m.params });
});
async function until(expression, label, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const value = await client.evaluate(expression); if (value) return value; await sleep(100); }
    throw new Error('Timeout: ' + label);
}
const ready = () => until(`(() => { const m = __mapoBundleProbe.diagnostics().find(m => !m.closed); return m && Object.values(m.groups).filter(g => g.wanted).every(g => g.state === 'ready') ? m : null; })()`, 'map ready');
async function close() {
    await client.evaluate(`__mapoBundleProbe.views.close('MapOriginalWorld')`);
    return until(`__mapoBundleProbe.diagnostics().length === 0`, 'no live map holds');
}
const open = () => client.evaluate(`__mapoBundleProbe.views.open('MapOriginalWorld').then(() => true)`);
const online = () => client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
try {
    await client.send('Page.bringToFront'); await client.send('Runtime.enable'); await client.send('Network.enable');
    await client.evaluate(`(() => {
        const module = key => { const found = [...System.entries()].filter(([,m]) => m?.[key]); if (found.length !== 1) throw Error('Expected one ' + key); return found[0][1]; };
        const manifest = module('mapoValidateManifest');
        globalThis.__mapoBundleProbe = { diagnostics: module('mapoArtDiagnostics').mapoArtDiagnostics,
            views: module('ViewMgr').ViewMgr, lease: module('cocosAssetLoader').assetLease, manifest,
            restore() {}, requests: [] };
    })()`);
    report.identity = (await ready()).identity;
    for (const mode of ['contentVersion', 'atlasLayoutVersion', 'missing']) {
        phase = mode; await close();
        await client.evaluate(`(() => {
            const p = __mapoBundleProbe, proto = Object.getPrototypeOf(cc.resources), original = proto.load;
            p.requests = []; const mode = ${JSON.stringify(mode)};
            const wrapped = function(...args) {
                if (this.name !== p.manifest.MAPO_BUNDLE) return original.apply(this, args);
                p.requests.push(args[0]);
                if (mode === 'missing' && args[0].startsWith('2d/resources/')) return original.apply(this, [args[0] + '-missing', ...args.slice(1)]);
                if (mode !== 'missing' && args[0] === '2d/manifest') {
                    const index = args.length - 1, callback = args[index];
                    args[index] = function(error, asset) {
                        if (asset) asset.json = {...asset.json, [mode]: 'probe-stale-version'};
                        return callback.call(this, error, asset);
                    };
                }
                return original.apply(this, args);
            };
            proto.load = wrapped; p.restore = () => { if (proto.load === wrapped) proto.load = original; };
        })()`);
        try {
            await open();
            const state = await until(`(() => { const m = __mapoBundleProbe.diagnostics().find(m => !m.closed); return m?.groups.${mode === 'missing' ? 'resources' : 'manifest'}.error ? m : null; })()`, mode);
            const requests = await client.evaluate('__mapoBundleProbe.requests');
            if (mode !== 'missing' && requests.some(p => p !== '2d/manifest')) throw Error('Wrong manifest started a layer request');
            const error = state.groups[mode === 'missing' ? 'resources' : 'manifest'].error;
            if (!error.includes(mode === 'missing' ? 'ASSET_MISSING' : 'MAPO_VERSION_MISMATCH')) throw Error('Wrong failure: ' + error);
            await close(); report.steps.push({ mode, ok: true, error, requests, released: true });
        } finally { await client.evaluate('__mapoBundleProbe.restore()'); }
        phase = 'recover-' + mode; await open(); await ready();
    }
    phase = 'offline-warm';
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const warm = await client.evaluate(`(async () => {
        const p = __mapoBundleProbe, asset = p.manifest.MAPO_S1_MANIFEST.assets['overview.png'];
        const batch = await p.lease.acquire([{bundle:p.manifest.MAPO_BUNDLE,path:asset.path+'/texture',type:cc.Texture2D}], {deadlineMs:5000});
        try { const t = batch.assets[0]; return {width:t.width,height:t.height,valid:t.isValid,cache:'Creator live Asset cache'}; }
        finally { batch.release(); }
    })()`);
    if (!warm.valid || warm.width !== 2048 || warm.height !== 1024) throw Error('Warm offline cache did not return the actual overview');
    report.steps.push({ mode: phase, ok: true, ...warm });
    phase = 'offline-cold'; await close(); await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await open();
    const cold = await until(`(() => { const m = __mapoBundleProbe.diagnostics().find(m => !m.closed); return m && Object.values(m.groups).some(g => g.error) ? m : null; })()`, 'offline miss', 22000);
    if (Object.values(cold.groups).some(g => g.state === 'ready' && g !== cold.groups.manifest)) throw Error('Cold offline miss unexpectedly installed a layer');
    await close(); report.steps.push({ mode: phase, ok: true, groups: cold.groups, released: true, cache: 'HTTP cache disabled, assets released' });
    phase = 'final-recovery'; await online(); await client.send('Network.setCacheDisabled', { cacheDisabled: false });
    await open(); report.recovered = await ready();
    await client.screenshot(path.join(out, 'recovered.png'), { format: 'png' });
    if (report.console.some(c => c.type === 'uncaught' || c.phase.startsWith('recover') || c.phase === 'final-recovery')) throw Error('Unexpected recovery errors');
    report.ok = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
    await online(); await client.send('Network.setCacheDisabled', { cacheDisabled: false });
    try { await client.evaluate('__mapoBundleProbe?.restore()'); await close(); await open(); await ready(); } catch (e) { report.cleanupError = String(e); report.ok = false; process.exitCode = 1; }
    try { await client.evaluate('delete globalThis.__mapoBundleProbe'); } catch {}
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    client.close(); console.log(JSON.stringify({ ok: report.ok, steps: report.steps.map(s => s.mode), error: report.error, out }));
}
