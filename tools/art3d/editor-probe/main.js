'use strict';

// This is a template. The parent task installs it in the isolated project.
const fs = require('fs');
const path = require('path');
let expectedProject;
let cacheDirectory;
let timer;
let busy = false;
let lastSceneReady = null;
let activeBake = null;

function assertProject() {
  if (!expectedProject) throw new Error('stage3d-probe has no explicit local configuration');
  const actual = fs.realpathSync(Editor.Project.path);
  if (actual !== expectedProject) {
    throw new Error(`stage3d-probe refuses another project: ${actual}`);
  }
  return actual;
}

function writeJson(name, value) {
  const output = path.join(cacheDirectory, name);
  const temporary = output + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, output);
}

function assetUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('db://assets/') || value.includes('..')) {
    throw new Error('Expected a project-local db://assets/ URL');
  }
  return value;
}

function inspectLightmapBrowser(options = {}) {
  const project = assertProject();
  const allowed = new Set([
    'apply', 'getConfig', 'savePicPath', 'unstaging', 'ready', 'load', 'unload',
    'generate', 'generateLightmap', 'start', 'open', 'bake', 'bakeLightmap',
    'bakeLightMap', 'cancel', 'clear', 'finished', 'end', 'onSceneReady',
  ]);
  if (options.cacheMethodName && !allowed.has(options.cacheMethodName)) {
    throw new Error('Requested cache method is outside the read-only source-inspection allowlist');
  }
  const limit = options.cacheMethodName ? 30000 : 8000;
  function inspectExport(value, exportPath, depth, seen) {
    if (value === null || !['object', 'function'].includes(typeof value) || seen.has(value)) return null;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = { exportPath, type: typeof value, ownKeys: Reflect.ownKeys(descriptors).map(String), methods: [], nested: [] };
    for (const [name, descriptor] of Object.entries(descriptors)) {
      // Discovery must not run a module accessor or a LightFX method.
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
      const member = descriptor.value;
      if (typeof member === 'function' && allowed.has(name)
          && (!options.cacheMethodName || options.cacheMethodName === name)) {
        const source = Function.prototype.toString.call(member);
        result.methods.push({ name, argumentCount: member.length, source: source.slice(0, limit), truncated: source.length > limit });
      }
      if (depth > 0 && name !== 'constructor' && (exportPath === 'exports' || name === 'default' || name === 'methods'
          || name === 'prototype' || (typeof member === 'function' && /^[A-Z]/.test(name)))) {
        const nested = inspectExport(member, `${exportPath}.${name}`, depth - 1, seen);
        if (nested) result.nested.push(nested);
      }
    }
    const prototype = Object.getPrototypeOf(value);
    if (depth > 0 && prototype && prototype !== Object.prototype && prototype !== Function.prototype) {
      const nested = inspectExport(prototype, `${exportPath}.[[Prototype]]`, depth - 1, seen);
      if (nested) result.nested.push(nested);
    }
    return result;
  }
  const matches = [];
  if (!Editor.App || typeof Editor.App.path !== 'string' || !path.isAbsolute(Editor.App.path)) {
    throw new Error('Cannot anchor the Lightmap package cache filter to the installed editor');
  }
  const pathFilters = ['builtin/lightmap', 'modules/editor-extensions/extensions/lightmap']
    .map(relative => path.resolve(Editor.App.path, relative).replace(/\\/g, '/') + '/');
  const moduleKeys = Object.keys(require.cache || {}).filter(filename => {
    const normalized = path.resolve(filename).replace(/\\/g, '/');
    return pathFilters.some(prefix => normalized.startsWith(prefix));
  });
  for (const filename of moduleKeys) {
    const cached = require.cache[filename];
    const descriptor = Object.getOwnPropertyDescriptor(cached, 'exports');
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    matches.push({ filename, loaded: cached.loaded === true, exports: inspectExport(descriptor.value, 'exports', 3, new Set()) });
  }
  return {
    project, pid: process.pid, pathFilters,
    status: 'already-loaded-browser-cache-only-no-getter-or-method-invoked',
    moduleKeys, matches,
  };
}

function bakeRecordName(attemptId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(attemptId || '')) throw new Error('Safe unique bake attemptId is required');
  return `bake-${attemptId}.json`;
}

function stopBakeListeners(state) {
  for (const [event, listener] of state.listeners) state.messageApi.removeBroadcastListener(event, listener);
  state.listeners = [];
  if (activeBake === state) activeBake = null;
}

function logBakeEvent(state, event, args) {
  const at = new Date().toISOString();
  fs.appendFileSync(state.logPath, JSON.stringify({ at, event, args }) + '\n');
  state.record.eventCount++;
  state.record.lastEventAt = at;
  if (event === 'lightmap:start') {
    state.record.startObservedAt = at;
    state.record.status = 'bake-start-observed';
  } else if (event === 'lightmap:finished') {
    state.record.finishedObservedAt = at;
    state.record.status = 'bake-finished-event-observed-result-pending';
  } else if (event === 'lightmap:end' || event === 'lightmap:cancel') {
    state.record.terminalEvent = event;
    state.record.terminalObservedAt = at;
    state.record.status = event === 'lightmap:end' ? 'bake-end-observed-result-verification-pending' : 'bake-cancel-observed';
  }
  writeJson(state.recordName, state.record);
  if (state.record.terminalEvent) stopBakeListeners(state);
}

async function bakeWorkbench(options) {
  const project = assertProject();
  if (activeBake) throw new Error('A bake is already being observed by this probe');
  const recordName = bakeRecordName(options.attemptId);
  if (fs.existsSync(path.join(cacheDirectory, recordName))) throw new Error('Bake attemptId already has a record');
  const preparation = await Editor.Message.request('scene', 'execute-scene-script', {
    name: 'stage3d-probe', method: 'prepareBake', args: [options],
  });
  assertProject();
  const config = await Editor.Message.request('lightmap', 'getConfig');
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Lightmap getConfig did not return an object');
  const data = { ...JSON.parse(JSON.stringify(config)), path: preparation.outputPath, sceneUUID: preparation.sceneUuid, highp: false };
  if (![512, 1024].includes(data.size) || data.msaa !== 4) throw new Error('Workbench expects official 512/1024 size and MSAA 4 defaults');
  // These listeners are declared in the installed 3.8.8 protected.d.ts. They
  // observe broadcasts confirmed in Lightmap.init; none are sent as commands.
  const messageApi = Editor.Message.__protected__;
  if (!messageApi || typeof messageApi.addBroadcastListener !== 'function'
      || typeof messageApi.removeBroadcastListener !== 'function') {
    throw new Error('Creator 3.8.8 broadcast observation API unavailable; refusing an unlogged bake');
  }
  if (!Editor.App || typeof Editor.App.path !== 'string' || !path.isAbsolute(Editor.App.path)) throw new Error('Absolute editor App.path required');
  assertProject();
  const rechecked = await Editor.Message.request('scene', 'execute-scene-script', {
    name: 'stage3d-probe', method: 'prepareBake', args: [options],
  });
  if (rechecked.project !== project || rechecked.outputPath !== preparation.outputPath
      || rechecked.rootUuid !== preparation.rootUuid || rechecked.sceneUuid !== preparation.sceneUuid) {
    throw new Error('Workbench identity changed during bake preparation');
  }
  const logPath = path.join(cacheDirectory, `bake-${options.attemptId}.events.jsonl`);
  fs.writeFileSync(logPath, '', { flag: 'wx' });
  const record = {
    attemptId: options.attemptId, project, pid: process.pid, preparedAt: new Date().toISOString(),
    status: 'prepared-no-apply-request-yet', preparation, originalConfig: config, appliedData: data,
    appPath: Editor.App.path, logPath, eventCount: 0, applyInvoked: false, applyPromiseState: 'not-requested',
    verification: 'No bake success claim: require end event, imported texture/PNG references, then fresh runtime rendering.',
    apiStability: 'Creator 3.8.8 version-bound Lightmap panel/scene implementation and protected broadcast listeners',
  };
  const state = { record, recordName, logPath, messageApi, listeners: [] };
  activeBake = state;
  writeJson(recordName, record);
  try {
    for (const event of ['lightmap:start', 'lightmap:log', 'lightmap:progress', 'lightmap:finished', 'lightmap:end', 'lightmap:cancel']) {
      const listener = (...args) => {
        try { logBakeEvent(state, event, args); }
        catch (error) {
          record.logError = String(error && error.stack || error);
          console.error('[stage3d-probe] bake event persistence failed', error);
        }
      };
      messageApi.addBroadcastListener(event, listener);
      state.listeners.push([event, listener]);
    }
    // Lightmap.apply creates the final directory non-recursively. Prepare only
    // its parent, preserving the refusal to delete or overwrite any LightFX run.
    fs.mkdirSync(path.dirname(data.path), { recursive: true });
    assertProject();
    await Editor.Message.request('lightmap', 'savePicPath', data.path);
    assertProject();
    // Recheck exact scene and output immediately before asking the native baker.
    await Editor.Message.request('scene', 'execute-scene-script', {
      name: 'stage3d-probe', method: 'prepareBake', args: [options],
    });
    record.applyInvoked = true;
    record.applyPromiseState = 'pending';
    record.status = 'bake-request-dispatched';
    logBakeEvent(state, 'probe:apply-requested', [{ name: 'lightmap', method: 'apply', data, appPath: Editor.App.path }]);
    const pendingApply = Editor.Message.request('scene', 'execute-scene-script', {
      name: 'lightmap', method: 'apply', args: [data, Editor.App.path],
    });
    // apply may resolve before the native process ends. Keep observing events
    // after Promise resolution and return promptly so the parent can poll.
    Promise.resolve(pendingApply).then(result => {
      record.applyPromiseState = 'resolved';
      logBakeEvent(state, 'probe:apply-resolved', [result === undefined ? null : result]);
    }, error => {
      record.applyPromiseState = 'rejected';
      record.status = 'apply-request-rejected';
      logBakeEvent(state, 'probe:apply-rejected', [String(error && error.stack || error)]);
      stopBakeListeners(state);
    }).catch(error => console.error('[stage3d-probe] bake request persistence failed', error));
    return { status: record.status, attemptId: options.attemptId, recordPath: path.join(cacheDirectory, recordName), logPath, preparation, completed: false };
  } catch (error) {
    record.status = 'bake-request-setup-failed';
    record.error = String(error && error.stack || error);
    writeJson(recordName, record);
    stopBakeListeners(state);
    throw error;
  }
}

async function inspectWorkbenchBake(options) {
  const project = assertProject();
  const recordName = bakeRecordName(options.attemptId);
  const record = JSON.parse(fs.readFileSync(path.join(cacheDirectory, recordName), 'utf8'));
  if (record.project !== project || record.preparation.sceneUuid !== options.expectedSceneUuid
      || record.preparation.sceneName !== options.expectedSceneName) throw new Error('Bake record does not match the exact project/scene');
  if (record.terminalEvent !== 'lightmap:end' || record.applyPromiseState === 'rejected' || record.logError) {
    return { status: record.status, record, inspection: null, completed: false };
  }
  const inspection = await Editor.Message.request('scene', 'execute-scene-script', {
    name: 'stage3d-probe', method: 'inspectBake', args: [options],
  });
  return {
    status: inspection.failures.length ? 'end-observed-dependencies-pending' : 'end-observed-dependencies-ready-runtime-render-pending',
    record, inspection, completed: false,
  };
}

async function runStep(step) {
  switch (step.op) {
    case 'bake-workbench':
      return bakeWorkbench(step.options || {});
    case 'inspect-workbench-bake':
      return inspectWorkbenchBake(step.options || {});
    case 'inspect-lightmap-browser':
      return inspectLightmapBrowser(step.options || {});
    case 'status':
      return {
        project: assertProject(),
        pid: process.pid,
        sceneReady: await Editor.Message.request('scene', 'query-is-ready'),
        lastSceneReady,
      };
    case 'refresh':
    case 'reimport': {
      if (!Array.isArray(step.urls) || step.urls.length === 0) throw new Error('urls required');
      const message = step.op === 'refresh' ? 'refresh-asset' : 'reimport-asset';
      const results = [];
      for (const value of step.urls) {
        const url = assetUrl(value);
        await Editor.Message.request('asset-db', message, url);
        results.push({ url, info: await Editor.Message.request('asset-db', 'query-asset-info', url) });
      }
      return results;
    }
    case 'open-scene': {
      const url = assetUrl(step.url);
      if (!url.endsWith('.scene')) throw new Error('open-scene requires a .scene URL');
      const info = await Editor.Message.request('asset-db', 'query-asset-info', url);
      if (!info || !info.uuid) throw new Error(`Scene is not imported: ${url}`);
      await Editor.Message.request('scene', 'open-scene', info.uuid);
      return { url, uuid: info.uuid };
    }
    case 'soft-reload':
      await Editor.Message.request('scene', 'soft-reload');
      return null;
    case 'save-scene':
      return await Editor.Message.request('scene', 'save-scene');
    case 'quality-settings':
      return {
        presets: await Editor.Profile.getProject('builder', 'textureCompressConfig.userPreset'),
        mipmaps: await Editor.Profile.getProject('builder', 'textureCompressConfig.genMipmaps'),
        compression: await Editor.Message.request('builder', 'query-compress-config'),
      };
    case 'quality-build-scenes': {
      const project = assertProject();
      const names = ['scene.scene', 'stage3d-dev.scene', 'stage3d-bake-workbench.scene'];
      const scenes = names.map(name => ({ url: 'db://assets/' + name,
        uuid: JSON.parse(fs.readFileSync(path.join(project, 'assets', name + '.meta'), 'utf8')).uuid }));
      const builderFile = path.join(project, 'extensions/stage3d-build/builder.js');
      const config = require(builderFile).configs['*'];
      const hook = require(path.resolve(path.dirname(builderFile), config.hooks));
      const options = { startScene: scenes[0].uuid, scenes: [...scenes] };
      hook.onBeforeBuild(options);
      if (options.scenes.length !== 1 || options.scenes[0].uuid !== scenes[0].uuid) throw new Error('Developer scene build exclusion failed');
      return { before: scenes, after: options.scenes, registration: config,
        scope: 'Registered hook invoked in Creator with project metadata; not a completed platform build.' };
    }
    case 'scene-call':
      // Extend this list and scene.js together for concrete authoring operations.
      if (!['inspectScene', 'inspectLightmapApi', 'createEmptyWorkbenchScene', 'createWorkbench', 'createDevScene',
        'saveWorkbenchScene', 'inspectBake', 'prepareBake', 'extractPrefab', 'startBake'].includes(step.method)) {
        throw new Error('Scene method is not allowed');
      }
      return await Editor.Message.request('scene', 'execute-scene-script', {
        name: 'stage3d-probe', method: step.method, args: step.args || [],
      });
    default:
      throw new Error(`Unknown probe operation: ${step.op}`);
  }
}

async function runPending() {
  if (busy) return;
  assertProject();
  const input = path.join(cacheDirectory, 'job.json');
  if (!fs.existsSync(input)) return;
  busy = true;
  let job;
  const startedAt = new Date().toISOString();
  const steps = [];
  try {
    job = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (!job || !/^[a-zA-Z0-9_-]+$/.test(job.id || '')) throw new Error('Safe unique job id required');
    if (job.project !== expectedProject) throw new Error('Job project does not match configured project');
    if (!Array.isArray(job.steps) || job.steps.length === 0) throw new Error('Job steps required');
    if (fs.existsSync(path.join(cacheDirectory, `result-${job.id}.json`))) {
      throw new Error('Job id already has a result; use a new id');
    }
    // Claim atomically before mutations. A crash leaves running-<id>.json for review.
    fs.renameSync(input, path.join(cacheDirectory, `running-${job.id}.json`));
    for (const step of job.steps) {
      assertProject();
      steps.push({ op: step.op, result: await runStep(step) });
    }
    writeJson(`result-${job.id}.json`, {
      id: job.id, project: expectedProject, pid: process.pid,
      startedAt, finishedAt: new Date().toISOString(), status: 'passed', steps,
    });
    fs.renameSync(path.join(cacheDirectory, `running-${job.id}.json`), path.join(cacheDirectory, `done-${job.id}.json`));
  } catch (error) {
    const id = job && /^[a-zA-Z0-9_-]+$/.test(job.id || '') ? job.id : 'invalid';
    writeJson(`error-${id}.json`, {
      id, project: expectedProject, pid: process.pid, startedAt,
      finishedAt: new Date().toISOString(), status: 'failed', steps,
      error: String(error && error.stack || error),
    });
    // Leave a claimed running file intact. Invalid/unclaimed input is quarantined.
    if (fs.existsSync(input)) fs.renameSync(input, path.join(cacheDirectory, `rejected-${Date.now()}.json`));
  } finally {
    busy = false;
  }
}

exports.methods = {
  runPending,
  onSceneReady() { lastSceneReady = new Date().toISOString(); },
};

exports.load = function load() {
  // Installation must provide this file explicitly. Never infer the active project.
  const configFile = path.join(__dirname, 'local-config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!config || typeof config.expectedProject !== 'string' || !path.isAbsolute(config.expectedProject)
      || typeof config.cacheDirectory !== 'string' || !path.isAbsolute(config.cacheDirectory)) {
    throw new Error('local-config.json requires absolute expectedProject and cacheDirectory');
  }
  expectedProject = fs.realpathSync(config.expectedProject);
  cacheDirectory = path.resolve(config.cacheDirectory);
  assertProject();
  fs.mkdirSync(cacheDirectory, { recursive: true });
  writeJson('ready.json', { project: expectedProject, cacheDirectory, pid: process.pid, loadedAt: new Date().toISOString() });
  timer = setInterval(() => runPending().catch(error => console.error('[stage3d-probe]', error)), 1000);
};

exports.unload = function unload() {
  if (activeBake) {
    const state = activeBake;
    state.record.status = 'probe-unloaded-native-bake-state-unknown';
    logBakeEvent(state, 'probe:unload', []);
    stopBakeListeners(state);
  }
  if (timer) clearInterval(timer);
  timer = undefined;
};
