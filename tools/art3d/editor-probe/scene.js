'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// Required by Creator 3.8's documented scene-script module environment.
module.paths.push(path.join(Editor.App.path, 'node_modules'));
const {
  director, Node, Scene, Prefab, SceneAsset, CCObject, assetManager, Vec3, Camera, DirectionalLight, Light,
  MeshRenderer, SkinnedMeshRenderer, SkeletalAnimation,
} = require('cc');

const WORKBENCH_ROOT = 'P_Stage3d_Baked';
const BAKED_PREFAB_URL = 'db://assets/resources/stage3d/P_Stage3d_Baked.prefab';
const WORKBENCH_SCENE_URL = 'db://assets/stage3d-bake-workbench.scene';
const WORKBENCH_LIGHTMAP_RELATIVE_PATH = 'assets/resources/stage3d/lightmaps/LightFX';

function configuredProject() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-config.json'), 'utf8'));
  if (!config.expectedProject || !path.isAbsolute(config.expectedProject)
      || fs.realpathSync(Editor.Project.path) !== fs.realpathSync(config.expectedProject)) {
    throw new Error('B5 method requires the explicitly configured isolated project');
  }
  return fs.realpathSync(config.expectedProject);
}

function authoringContext(options) {
  const project = configuredProject();
  const scene = director.getScene();
  if (!scene || !options || options.expectedSceneUuid !== scene.uuid
      || options.expectedSceneName !== scene.name) {
    throw new Error('Pass both expectedSceneUuid and expectedSceneName from inspectScene');
  }
  return { scene, project };
}

function authoringComponents(root, componentType) {
  if (!CCObject || !CCObject.Flags || typeof CCObject.Flags.DontSave !== 'number') {
    throw new Error('Creator DontSave serialization flag is unavailable; refusing to guess editor nodes');
  }
  const result = [];
  function visit(node) {
    // A DontSave parent excludes its complete subtree from authoring content.
    if (node.hideFlags & CCObject.Flags.DontSave) return;
    for (const component of node.getComponents(componentType)) {
      if (!(component.hideFlags & CCObject.Flags.DontSave)) result.push(component);
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  return result;
}

function loadPrefab(uuid) {
  if (typeof uuid !== 'string' || !uuid) throw new Error('Imported prefab UUID is required');
  return new Promise((resolve, reject) => {
    assetManager.loadAny(uuid, (error, asset) => {
      if (error) reject(error);
      else if (!(asset instanceof Prefab)) reject(new Error(`Asset is not a Prefab: ${uuid}`));
      else resolve(asset);
    });
  });
}

function singleMesh(prefab) {
  const renderers = prefab.data.getComponentsInChildren(MeshRenderer);
  if (renderers.length !== 1 || !renderers[0].mesh || renderers[0] instanceof SkinnedMeshRenderer) {
    throw new Error('Workbench needs an imported static prefab containing one MeshRenderer');
  }
  const source = renderers[0];
  const hasUv2 = source.mesh.struct.vertexBundles.some(bundle =>
    bundle.attributes.some(attribute => attribute.name === 'a_texCoord1'));
  if (!hasUv2) throw new Error('Mesh has no a_texCoord1 lightmap UV channel');
  return source;
}

function addStaticMesh(parent, name, source, scale) {
  const node = new Node(name);
  node.setScale(scale, scale, scale);
  node.parent = parent;
  const renderer = node.addComponent(MeshRenderer);
  renderer.mesh = source.mesh;
  renderer.sharedMaterials = [...source.sharedMaterials];
  renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  renderer.bakeSettings.bakeable = true;
  renderer.bakeSettings.castShadow = true;
  renderer.bakeSettings.receiveShadow = true;
  renderer.bakeSettings.lightmapSize = 128;
  renderer.bakeSettings.useLightProbe = false;
  // Fresh nodes avoid inherited Prefab-instance overrides from the glTF wrapper.
  // Mesh/material asset references remain intact; never modify the source assets.
  return node;
}

async function createWorkbench(options) {
  const { scene } = authoringContext(options);
  if (scene.getChildByName(WORKBENCH_ROOT)) throw new Error('Workbench already exists; refusing duplicate');
  if (authoringComponents(scene, MeshRenderer).length || authoringComponents(scene, Light).length) {
    throw new Error('Use a dedicated scene with no existing mesh renderers or lights');
  }
  const [plane, cube] = await Promise.all([
    loadPrefab(options.planePrefabUuid), loadPrefab(options.cubePrefabUuid),
  ]);
  const planeSource = singleMesh(plane), cubeSource = singleMesh(cube);
  // Recheck after async loading so a scene switch cannot mutate another scene.
  authoringContext(options);
  const root = new Node(WORKBENCH_ROOT);
  const lightNode = new Node('Stage3dBake.StaticDirectionalLight');
  let cameraNode;
  try {
    addStaticMesh(root, 'Plane', planeSource, 0.125); // Imported 64 m plane -> 8 m workbench.
    const cubeNode = addStaticMesh(root, 'Cube', cubeSource, 1.5);
    cubeNode.setPosition(-0.6, 0, 0);
    root.parent = scene;
    lightNode.setRotationFromEuler(-55, -35, 0);
    lightNode.parent = scene;
    const light = lightNode.addComponent(DirectionalLight);
    light.illuminance = 20000;
    light.staticSettings.editorOnly = true;
    light.staticSettings.castShadow = true;
    // 'baked' is an output flag owned by the actual baker, not proof of a bake.
    if (authoringComponents(scene, Camera).length === 0) {
      cameraNode = new Node('Stage3dBake.Camera');
      cameraNode.setPosition(7, 7, 7);
      cameraNode.lookAt(new Vec3(0, 0.4, 0));
      cameraNode.parent = scene;
      const camera = cameraNode.addComponent(Camera);
      camera.near = 0.1;
      camera.far = 100;
      // Component setters serialize these values and synchronize the render camera.
      camera.fov = 45;
    }
    return {
      status: 'authoring-workbench-created-not-baked',
      sceneUuid: scene.uuid, sceneName: scene.name, rootUuid: root.uuid,
      lightUuid: lightNode.uuid, cameraUuid: cameraNode ? cameraNode.uuid : null,
      cameraClipping: cameraNode ? {
        componentNear: cameraNode.getComponent(Camera).near,
        componentFar: cameraNode.getComponent(Camera).far,
        renderNearClip: cameraNode.getComponent(Camera).camera ? cameraNode.getComponent(Camera).camera.nearClip : null,
        renderFarClip: cameraNode.getComponent(Camera).camera ? cameraNode.getComponent(Camera).camera.farClip : null,
      } : null,
      next: 'Save this dedicated scene, then use the actual Lightmap panel to bake into assets/resources/stage3d/lightmaps. No bake command is invoked by this method.',
      inspection: await inspectBake(options),
    };
  } catch (error) {
    root.destroy(); lightNode.destroy();
    if (cameraNode) cameraNode.destroy();
    throw error;
  }
}

async function inspectBake(options) {
  const { scene, project } = authoringContext(options);
  const root = scene.getChildByName(WORKBENCH_ROOT);
  if (!root) throw new Error('Workbench root is missing');
  const renderers = authoringComponents(root, MeshRenderer);
  const failures = [];
  if (renderers.length !== 2) failures.push('Expected exactly two workbench MeshRenderers');
  const meshes = [];
  for (const renderer of renderers) {
    const settings = renderer.bakeSettings, texture = settings.texture;
    const uvParam = [settings.uvParam.x, settings.uvParam.y, settings.uvParam.z, settings.uvParam.w];
    const textureUuid = texture ? texture.uuid : null;
    const image = texture && texture.image;
    const imageUuid = image ? image.uuid : null;
    const textureInfo = textureUuid ? await Editor.Message.request('asset-db', 'query-asset-info', textureUuid) : null;
    const imageInfo = imageUuid ? await Editor.Message.request('asset-db', 'query-asset-info', imageUuid) : null;
    const imageUrl = imageInfo && imageInfo.url;
    let pngSha256 = null;
    if (imageInfo && typeof imageUrl === 'string'
        && imageUrl.startsWith('db://assets/resources/stage3d/') && imageUrl.toLowerCase().endsWith('.png')) {
      const expectedPngFile = path.join(project, 'assets', imageUrl.slice('db://assets/'.length));
      if (typeof imageInfo.file !== 'string' || !fs.existsSync(imageInfo.file)
          || fs.realpathSync(imageInfo.file) !== fs.realpathSync(expectedPngFile)) {
        failures.push(`${renderer.node.name}: imported PNG file is missing or outside the declared path`);
      } else {
        const png = fs.readFileSync(imageInfo.file);
        if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
          failures.push(`${renderer.node.name}: lightmap source does not have a PNG signature`);
        } else {
          pngSha256 = crypto.createHash('sha256').update(png).digest('hex');
        }
      }
    }
    const hasUv2 = !!renderer.mesh && renderer.mesh.struct.vertexBundles.some(bundle =>
      bundle.attributes.some(attribute => attribute.name === 'a_texCoord1'));
    if (!hasUv2) failures.push(`${renderer.node.name}: UV2 missing`);
    if (!settings.bakeable) failures.push(`${renderer.node.name}: bakeable is false`);
    if (!textureUuid || !textureInfo) failures.push(`${renderer.node.name}: imported lightmap Texture2D missing`);
    if (!imageUuid || !imageInfo || typeof imageUrl !== 'string'
        || !imageUrl.startsWith('db://assets/resources/stage3d/') || !imageUrl.toLowerCase().endsWith('.png')) {
      failures.push(`${renderer.node.name}: lightmap must resolve to an imported PNG under resources/stage3d`);
    }
    if (!uvParam.every(Number.isFinite) || uvParam[2] <= 0) failures.push(`${renderer.node.name}: baked uvParam is absent/invalid`);
    meshes.push({
      node: renderer.node.name, nodeUuid: renderer.node.uuid,
      meshUuid: renderer.mesh ? renderer.mesh.uuid : null, hasUv2,
      bakeable: settings.bakeable, uvParam, textureUuid,
      textureUrl: textureInfo ? textureInfo.url : null,
      imageUuid, imageUrl: imageUrl || null, pngSha256,
      width: texture ? texture.width : null, height: texture ? texture.height : null,
    });
  }
  return {
    status: failures.length ? 'not-ready-for-prefab-extraction' : 'baked-references-ready',
    sceneUuid: scene.uuid, sceneName: scene.name, rootUuid: root.uuid, meshes, failures,
    scope: 'Reference/UV inspection only; authentic bake logs and rendered appearance are separate evidence.',
  };
}

function prepareBake(options) {
  const { scene, project } = authoringContext(options);
  const root = scene.getChildByName(WORKBENCH_ROOT);
  if (!root || (root.hideFlags & CCObject.Flags.DontSave)) throw new Error('Serializable workbench root is missing');
  const renderers = authoringComponents(root, MeshRenderer);
  const sceneRenderers = authoringComponents(scene, MeshRenderer);
  if (renderers.length !== 2 || sceneRenderers.length !== 2
      || sceneRenderers.some(renderer => !renderers.includes(renderer))) {
    throw new Error('The dedicated bake scene must contain only the two workbench MeshRenderers');
  }
  const meshes = renderers.map(renderer => {
    if (renderer instanceof SkinnedMeshRenderer || !renderer.mesh) throw new Error('Only static workbench meshes may be baked');
    const hasUv2 = renderer.mesh.struct.vertexBundles.some(bundle =>
      bundle.attributes.some(attribute => attribute.name === 'a_texCoord1'));
    if (!hasUv2 || !renderer.bakeSettings.bakeable || !renderer.bakeSettings.castShadow
        || !renderer.bakeSettings.receiveShadow || renderer.enabledInHierarchy === false) {
      throw new Error(`${renderer.node.name}: requires an active bakeable static mesh with UV2 and baked shadows`);
    }
    return { node: renderer.node.name, nodeUuid: renderer.node.uuid, meshUuid: renderer.mesh.uuid, hasUv2,
      bakeable: renderer.bakeSettings.bakeable, lightmapSize: renderer.bakeSettings.lightmapSize };
  });
  const lights = authoringComponents(scene, Light);
  if (lights.length !== 1 || !(lights[0] instanceof DirectionalLight)
      || !lights[0].staticSettings.editorOnly || !lights[0].staticSettings.castShadow
      || lights[0].enabledInHierarchy === false) {
    throw new Error('Exactly one active static editor-only shadow-casting DirectionalLight is required');
  }
  const outputPath = path.join(project, WORKBENCH_LIGHTMAP_RELATIVE_PATH);
  try {
    fs.lstatSync(outputPath);
    throw new Error('LightFX output already exists; refusing overwrite or deletion');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  // Refuse an existing symlink ancestor that could redirect native baker output.
  let ancestor = path.dirname(outputPath);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (fs.realpathSync(ancestor) !== ancestor) throw new Error('LightFX output has a redirected filesystem ancestor');
  return {
    status: 'workbench-prepared-no-bake-invoked', project,
    sceneUuid: scene.uuid, sceneName: scene.name, rootUuid: root.uuid,
    outputPath, outputUrl: 'db://assets/resources/stage3d/lightmaps/LightFX',
    meshes, lightUuid: lights[0].node.uuid,
  };
}

async function createEmptyWorkbenchScene() {
  const project = configuredProject();
  if (typeof EditorExtends === 'undefined' || typeof EditorExtends.serialize !== 'function') {
    throw new Error('Creator 3.8.8 EditorExtends.serialize is unavailable; no scene JSON will be invented');
  }
  const previous = await Editor.Message.request('asset-db', 'query-asset-info', WORKBENCH_SCENE_URL);
  const expectedFile = path.join(project, 'assets/stage3d-bake-workbench.scene');
  if (previous || fs.existsSync(expectedFile)) throw new Error('Workbench scene already exists; refusing overwrite');
  const asset = new SceneAsset('stage3d-bake-workbench');
  asset.scene = new Scene('Stage3dBakeWorkbench');
  // Create an independent asset, never remove or repurpose the current editor scene.
  const serialized = EditorExtends.serialize(asset);
  const text = typeof serialized === 'string' ? serialized : JSON.stringify(serialized);
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data[0].__type__ !== 'cc.SceneAsset'
      || !data.some(value => value.__type__ === 'cc.Scene')) {
    throw new Error('Creator serializer did not return the expected empty SceneAsset graph');
  }
  if (configuredProject() !== project) throw new Error('Project changed while preparing scene');
  await Editor.Message.request('asset-db', 'create-asset', WORKBENCH_SCENE_URL, text);
  const info = await Editor.Message.request('asset-db', 'query-asset-info', WORKBENCH_SCENE_URL);
  if (!info || !info.uuid || !info.file
      || fs.realpathSync(info.file) !== fs.realpathSync(expectedFile)) {
    throw new Error('AssetDB did not import the expected independent workbench scene');
  }
  return {
    status: 'empty-scene-asset-created-current-scene-unchanged',
    url: WORKBENCH_SCENE_URL, uuid: info.uuid, sceneName: 'Stage3dBakeWorkbench',
    apiStability: 'Creator 3.8.8 editor serializer plus public AssetDB create-asset',
    next: 'Open this UUID with scene/open-scene; call inspectScene for current UUID/name, createWorkbench, then scene/save-scene. Exclude the authoring scene from builds.',
  };
}

async function saveWorkbenchScene(options) {
  const { scene, project } = authoringContext(options);
  if (!scene.getChildByName(WORKBENCH_ROOT)) throw new Error('Create the workbench before saving');
  if (typeof EditorExtends === 'undefined' || typeof EditorExtends.serialize !== 'function') {
    throw new Error('Creator 3.8.8 EditorExtends.serialize is unavailable; no scene JSON will be invented');
  }
  const previous = await Editor.Message.request('asset-db', 'query-asset-info', WORKBENCH_SCENE_URL);
  if (previous) throw new Error('Workbench scene already exists; open it and use scene/save-scene instead');
  authoringContext(options);
  const asset = new SceneAsset('stage3d-bake-workbench');
  asset.scene = scene;
  // Version-bound editor serializer declared in engine/@types/editor-extends.d.ts.
  // AssetDB create-asset is public. No hand-authored serialized IDs or .meta files.
  const serialized = EditorExtends.serialize(asset);
  const text = typeof serialized === 'string' ? serialized : JSON.stringify(serialized);
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data[0].__type__ !== 'cc.SceneAsset'
      || !data.some(value => value.__type__ === 'cc.Scene')) {
    throw new Error('Creator serializer did not return the expected SceneAsset graph');
  }
  await Editor.Message.request('asset-db', 'create-asset', WORKBENCH_SCENE_URL, text);
  const info = await Editor.Message.request('asset-db', 'query-asset-info', WORKBENCH_SCENE_URL);
  if (!info || !info.uuid || !info.file) throw new Error('Saved scene was not imported by AssetDB');
  const expectedFile = path.join(project, 'assets/stage3d-bake-workbench.scene');
  if (fs.realpathSync(info.file) !== fs.realpathSync(expectedFile)) throw new Error('Unexpected scene output path');
  return {
    status: 'scene-asset-created-open-and-check-pending', url: WORKBENCH_SCENE_URL, uuid: info.uuid,
    apiStability: 'Creator 3.8.8 editor serializer plus public AssetDB create-asset',
    next: 'Call scene/open-scene with this UUID, then inspectScene and inspectBake. Subsequent saves use scene/save-scene. Exclude this authoring scene from the build.',
  };
}

function expandedUuid(uuid) {
  return typeof EditorExtends !== 'undefined' && EditorExtends.UuidUtils
    ? EditorExtends.UuidUtils.decompressUuid(uuid) : uuid;
}

function inspectLoadedLightmapCache(options) {
  const allowed = new Set([
    'apply', 'getConfig', 'savePicPath', 'unstaging', 'ready',
    'generate', 'generateLightmap', 'start', 'open', 'bake', 'bakeLightmap',
    'bakeLightMap', 'cancel', 'clear', 'finished', 'end',
  ]);
  if (options.cacheMethodName && !allowed.has(options.cacheMethodName)) {
    throw new Error('Requested cache method is outside the read-only source-inspection allowlist');
  }
  const limit = options.cacheMethodName ? 30000 : 8000;
  function inspectExport(value, exportPath, depth, seen) {
    if (value === null || !['object', 'function'].includes(typeof value) || seen.has(value)) return null;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = { exportPath, type: typeof value, ownKeys: Object.keys(descriptors), methods: [], nested: [] };
    for (const [name, descriptor] of Object.entries(descriptors)) {
      // Never read or invoke accessors while discovering module exports.
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
    // Exported singleton instances may expose implementation methods on their prototype.
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
    // Exact installed package roots only; never require or inspect other packages.
    const cached = require.cache[filename];
    const descriptor = Object.getOwnPropertyDescriptor(cached, 'exports');
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    matches.push({
      filename, loaded: cached.loaded === true,
      exports: inspectExport(descriptor.value, 'exports', 3, new Set()),
    });
  }
  return { pathFilters, moduleKeys, status: 'already-loaded-cache-only-no-getter-or-method-invoked', matches };
}

async function extractPrefab(options) {
  const { project } = authoringContext(options);
  const inspection = await inspectBake(options);
  if (inspection.failures.length) throw new Error(`Baked dependencies not ready: ${inspection.failures.join('; ')}`);
  const previous = await Editor.Message.request('asset-db', 'query-asset-info', BAKED_PREFAB_URL);
  if (previous) throw new Error('Baked prefab already exists; this creation method refuses overwrite/apply');
  authoringContext(options);
  // Creator 3.8.8 registers this exact message; facade declaration is
  // createPrefab(nodeUuid: string, url: string). It is NOT marked public in
  // package.json, so this is a version-bound editor integration, not a stable API.
  await Editor.Message.request('scene', 'create-prefab', inspection.rootUuid, BAKED_PREFAB_URL);
  const info = await Editor.Message.request('asset-db', 'query-asset-info', BAKED_PREFAB_URL);
  if (!info || !info.uuid || !info.file) throw new Error('Creator did not produce an imported standalone prefab');
  const expectedFile = path.join(project, 'assets/resources/stage3d/P_Stage3d_Baked.prefab');
  if (fs.realpathSync(info.file) !== fs.realpathSync(expectedFile)) throw new Error('Unexpected exported prefab file');
  const data = JSON.parse(fs.readFileSync(info.file, 'utf8'));
  const serializedTextures = [];
  let containsScene = false;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.__type__ === 'cc.Scene') containsScene = true;
    if (value.__type__ === 'cc.ModelBakeSettings' && value.texture && value.texture.__uuid__) {
      serializedTextures.push(expandedUuid(value.texture.__uuid__));
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(data);
  if (containsScene || serializedTextures.length !== inspection.meshes.length
      || inspection.meshes.some(mesh => !serializedTextures.includes(expandedUuid(mesh.textureUuid)))) {
    throw new Error('Prefab was created but its serialized baked texture references failed verification; retain it for diagnosis');
  }
  return {
    status: 'prefab-created-and-reference-checked-runtime-reload-pending',
    apiStability: 'Creator 3.8.8 built-in scene message; not marked public',
    url: BAKED_PREFAB_URL, uuid: info.uuid,
    resourcesPath: 'stage3d/P_Stage3d_Baked', serializedTextureUuids: serializedTextures,
    textureToPngDependencies: inspection.meshes,
    next: 'Save the authoring scene, close it, clear editor scene state and open a fresh main preview. Load only this Prefab; verify both WebGL paths, lighting, missing-dependency errors and release budgets before accepting B5.',
  };
}

exports.load = function load() {};
exports.unload = function unload() {};
exports.methods = {
  createEmptyWorkbenchScene,
  createWorkbench,
  saveWorkbenchScene,
  inspectBake,
  prepareBake,
  extractPrefab,
  startBake() {
    throw new Error('Start the verified Creator 3.8.8 Lightmap workflow through the main-process bake-workbench operation; scene methods do not issue nested scene requests.');
  },
  inspectLightmapApi(options = {}) {
    configuredProject();
    const loadedCache = inspectLoadedLightmapCache(options);
    // Read already-loaded scene extension exports only. Do not require, load,
    // invoke, or infer any LightFX command from notification names.
    if (typeof cce === 'undefined' || !cce.Plugin || typeof cce.Plugin.getScriptModuleMap !== 'function') {
      throw new Error('Creator 3.8.8 internal scene plugin module map is unavailable');
    }
    const modules = cce.Plugin.getScriptModuleMap();
    const entries = modules instanceof Map ? [...modules.entries()] : Object.entries(modules || {});
    const entry = entries.find(([name]) => name === 'lightmap');
    if (!entry) return { status: 'lightmap-not-in-module-map', moduleNames: entries.map(([name]) => String(name)), loadedCache };
    const module = entry[1];
    const moduleDescriptors = Object.getOwnPropertyDescriptors(module || {});
    const moduleKeys = Reflect.ownKeys(moduleDescriptors).map(String);
    const moduleFunctions = Object.entries(moduleDescriptors).flatMap(([name, descriptor]) => {
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value !== 'function') return [];
      const source = Function.prototype.toString.call(descriptor.value);
      return [{ name, argumentCount: descriptor.value.length, source: source.slice(0, 8000), truncated: source.length > 8000 }];
    });
    const methodsDescriptor = moduleDescriptors.methods;
    const methods = methodsDescriptor && Object.prototype.hasOwnProperty.call(methodsDescriptor, 'value') ? methodsDescriptor.value : null;
    if (!methods || typeof methods !== 'object') {
      return { status: 'module-shape-unverified', moduleKeys, moduleFunctions, loadedCache };
    }
    const methodDescriptors = Object.getOwnPropertyDescriptors(methods);
    const names = Object.keys(methodDescriptors);
    if (options.methodName && !names.includes(options.methodName)) throw new Error('Requested method is absent');
    const selected = options.methodName ? [options.methodName] : names;
    return {
      status: 'exports-inspected-no-method-invoked',
      apiStability: 'Creator 3.8.8 internal cce.Plugin module-map inspection',
      moduleKeys,
      moduleFunctions,
      methodNames: names,
      loadedCache,
      methods: selected.map(name => {
        const descriptor = methodDescriptors[name];
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return { name, type: 'accessor-not-invoked' };
        const method = descriptor.value;
        if (typeof method !== 'function') return { name, type: typeof method };
        const source = Function.prototype.toString.call(method);
        const limit = options.methodName ? 30000 : 3000;
        return { name, argumentCount: method.length, source: source.slice(0, limit), truncated: source.length > limit };
      }),
    };
  },
  inspectScene() {
    const scene = director.getScene();
    if (!scene) return { scene: null, nodes: [] };
    const nodes = [];
    function visit(node, parentPath) {
      const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
      const mesh = node.getComponent(MeshRenderer);
      const skin = node.getComponent(SkinnedMeshRenderer);
      const animation = node.getComponent(SkeletalAnimation);
      nodes.push({
        path: nodePath, uuid: node.uuid, active: node.active,
        mesh: mesh && mesh.mesh ? { name: mesh.mesh.name, allowDataAccess: mesh.mesh.allowDataAccess } : null,
        skeleton: skin && skin.skeleton ? { name: skin.skeleton.name, hash: skin.skeleton.hash, joints: [...skin.skeleton.joints] } : null,
        animation: animation ? { useBakedAnimation: animation.useBakedAnimation, clips: animation.clips.map(clip => clip && ({ name: clip.name, duration: clip.duration, hash: clip.hash })) } : null,
      });
      for (const child of node.children) visit(child, nodePath);
    }
    visit(scene, '');
    // IPC returns plain JSON only; never transfer Node/Asset/GFX objects.
    return { scene: scene.name, uuid: scene.uuid, nodes };
  },
};
