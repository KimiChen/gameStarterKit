'use strict';
const fs = require('node:fs');
const path = require('node:path');

const excluded = ['stage3d-dev.scene', 'stage3d-bake-workbench.scene'];
exports.throwError = true;
// Creator 3.8.8 BuildHook.onBeforeBuild; runs for editor and CLI tasks on all platforms.
exports.excludeDevScenes = function excludeDevScenes(options, project) {
  const uuids = new Set(excluded.map(name => JSON.parse(fs.readFileSync(path.join(project, 'assets', name + '.meta'), 'utf8')).uuid));
  const urls = new Set(excluded.map(name => 'db://assets/' + name));
  if (uuids.has(options.startScene) || urls.has(options.startScene)) {
    throw new Error('Stage3D developer scenes cannot be build entry scenes; select scene.scene.');
  }
  options.scenes = options.scenes.filter(scene => !uuids.has(scene.uuid) && !urls.has(scene.url));
};
exports.onBeforeBuild = function onBeforeBuild(options) {
  exports.excludeDevScenes(options, Editor.Project.path);
};
