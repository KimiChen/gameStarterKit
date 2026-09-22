'use strict';
// Explicitly configured, isolated Creator 3.8.8 acceptance project only.
const fs = require('fs');
const path = require('path');
let project, output, timer, busy = false;
function guard() {
  if (fs.realpathSync(Editor.Project.path) !== project) throw new Error('Unexpected Creator project');
}
function write(name, data) {
  const file = path.join(output, name); fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n'); fs.renameSync(file + '.tmp', file);
}
async function run(step) {
  guard();
  if (step.op === 'status') return { project, pid: process.pid, ready: await Editor.Message.request('scene', 'query-is-ready') };
  if (step.op === 'create-chain' || step.op === 'inspect-chain') return Editor.Message.request('scene', 'execute-scene-script', { name: 'bundle-probe', method: step.op === 'create-chain' ? 'createChain' : 'inspectChain', args: [] });
  if (step.op === 'create-graph') return Editor.Message.request('scene', 'execute-scene-script', { name: 'bundle-probe', method: 'createGraph', args: [] });
  if (step.op === 'bundle-settings') {
    const policy = (await Editor.Profile.getProject('builder', 'bundleConfig.custom')).package3d;
    return { policy, roots: await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/bundles/*' }) };
  }
  if (step.op === 'refresh' || step.op === 'reimport') {
    if (!Array.isArray(step.urls)) throw new Error('urls required');
    const results = [];
    for (const url of step.urls) {
      if (typeof url !== 'string' || !url.startsWith('db://assets/') || url.includes('..')) throw new Error('Invalid URL');
      await Editor.Message.request('asset-db', step.op === 'refresh' ? 'refresh-asset' : 'reimport-asset', url);
      results.push(await Editor.Message.request('asset-db', 'query-asset-info', url));
    }
    return results;
  }
  if (step.op === 'configure-bundles') {
    const results = [];
    for (const name of ['kit-bundleFixture', 'kit-bundleFixture-detail', 'kit-bundleFixtureExtra']) {
      const url = 'db://assets/bundles/' + name;
      const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
      const meta = await Editor.Message.request('asset-db', 'query-asset-meta', info.uuid);
      Object.assign(meta.userData, { isBundle: true, bundleName: name, bundleConfigID: 'package3d' });
      await Editor.Message.request('asset-db', 'save-asset-meta', info.uuid, JSON.stringify(meta));
      results.push({ name, uuid: info.uuid });
    }
    return results;
  }
  throw new Error('Unknown bounded probe operation: ' + step.op);
}
exports.load = function () {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-config.json'), 'utf8'));
  project = fs.realpathSync(config.project); output = fs.realpathSync(config.output); guard();
  write('ready.json', { project, pid: process.pid });
  timer = setInterval(async () => {
    const jobPath = path.join(output, 'job.json');
    if (busy || !fs.existsSync(jobPath)) return;
    busy = true;
    let job;
    try {
      job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
      if (!/^[a-zA-Z0-9_-]+$/.test(job.id) || job.project !== project) throw new Error('Wrong job identity/project');
      fs.renameSync(jobPath, path.join(output, 'running-' + job.id + '.json'));
      const results = []; for (const step of job.steps) results.push({ op: step.op, result: await run(step) });
      write('result-' + job.id + '.json', { project, results });
    } catch (error) { write('error-' + (job?.id || 'unknown') + '.json', { message: error.message, stack: error.stack }); }
    finally { busy = false; }
  }, 1000);
};
exports.unload = function () { clearInterval(timer); };
