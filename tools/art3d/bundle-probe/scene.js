'use strict';
const fs = require('fs');
const path = require('path');
const { assetManager, Prefab, Material, MeshRenderer, Scene, SceneAsset, Node, Camera, Vec3, Color, instantiate, AnimationClip, js } = require('cc');
const root = 'db://assets/bundles/kit-bundleFixture/3d/';
const detail = 'db://assets/bundles/kit-bundleFixture-detail/3d/';
function guard() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-config.json'), 'utf8'));
  if (fs.realpathSync(Editor.Project.path) !== fs.realpathSync(config.project)) throw new Error('Unexpected Creator project');
}
function load(uuid) { return new Promise((resolve, reject) => assetManager.loadAny(uuid, (error, asset) => error ? reject(error) : resolve(asset))); }
async function info(url) {
  const result = await Editor.Message.request('asset-db', 'query-asset-info', url);
  if (!result?.uuid) throw new Error('Missing imported asset: ' + url); return result;
}
async function create(url, asset) {
  if (await Editor.Message.request('asset-db', 'query-asset-info', url)) throw new Error('Refusing to overwrite ' + url);
  const serialized = EditorExtends.serialize(asset);
  return Editor.Message.request('asset-db', 'create-asset', url, typeof serialized === 'string' ? serialized : JSON.stringify(serialized), { overwrite: false });
}
async function createChain() {
  guard();
  const modelInfo = await info(root + 'greybox-cube.glb');
  const modelMeta = await Editor.Message.request('asset-db', 'query-asset-meta', modelInfo.uuid);
  const modelPrefab = Object.values(modelMeta.subMetas).find(meta => meta.importer === 'gltf-scene');
  const imageInfo = await info(detail + 'T_Greybox_Checker_BC.png');
  const imageMeta = await Editor.Message.request('asset-db', 'query-asset-meta', imageInfo.uuid);
  const textureInfo = Object.values(imageMeta.subMetas).find(meta => meta.importer === 'texture');
  if (!modelPrefab || !textureInfo) throw new Error('Missing importer-generated subassets');
  const texture = await load(textureInfo.uuid);
  const mat = new Material(); mat.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } }); mat.setProperty('mainTexture', texture);
  const material = await Editor.Message.request('asset-db', 'query-asset-info', detail + 'M_Chain.mtl') || await create(detail + 'M_Chain.mtl', mat);
  const source = await load(modelPrefab.uuid), node = new Node('BundleDependencyCube');
  const sourceRenderers = source.data.getComponentsInChildren(MeshRenderer);
  if (sourceRenderers.length !== 1) throw new Error('Expected exactly one greybox MeshRenderer');
  const renderer = node.addComponent(MeshRenderer);
  renderer.mesh = sourceRenderers[0].mesh;
  renderer.setSharedMaterial(await load(material.uuid), 0);
  const meshUuid = renderer.mesh.uuid;
  const prefab = new Prefab(); prefab.data = node;
  const prefabInfo = await create(root + 'P_Chain.prefab', prefab);
  const clip = new AnimationClip(); clip.name = 'BundleClip'; clip.duration = 1;
  const clipInfo = await create(root + 'Chain.anim', clip);
  const scene = new Scene('BundleCleanInstall'); scene.globals.skybox.enabled = false;
  const cameraNode = new Node('Camera'); scene.addChild(cameraNode);
  const camera = cameraNode.addComponent(Camera); camera.clearColor = new Color(40, 45, 56, 255);
  cameraNode.setPosition(3, 2, 4); cameraNode.lookAt(new Vec3());
  scene.addChild(instantiate(await load(prefabInfo.uuid)));
  const sceneAsset = new SceneAsset(); sceneAsset.scene = scene;
  const sceneInfo = await create('db://assets/scene.scene', sceneAsset);
  node.destroy(); scene.destroy();
  return { prefab: prefabInfo, material, texture: textureInfo.uuid, mesh: meshUuid, clip: clipInfo, scene: sceneInfo };
}
async function createGraph() {
  guard();
  const Graph = js.getClassByName('cc.animation.AnimationGraph');
  const Mask = js.getClassByName('cc.animation.AnimationMask');
  const Motion = js.getClassByName('cc.animation.ClipMotion');
  if (!Graph || !Mask || !Motion) throw new Error('Animation graph engine module is unavailable');
  const maskInfo = await create(detail + 'Chain.animask', new Mask());
  const graph = new Graph();
  const layer = graph.addLayer(); layer.mask = await load(maskInfo.uuid);
  const state = layer.stateMachine.addMotion(); state.name = 'Clip'; state.motion = new Motion();
  state.motion.clip = await load((await info(root + 'Chain.anim')).uuid);
  const graphInfo = await create(root + 'Chain.animgraph', graph);
  return { graph: graphInfo, mask: maskInfo };
}
async function inspectChain() {
  guard();
  const prefabInfo = await info(root + 'P_Chain.prefab');
  const prefab = await load(prefabInfo.uuid);
  if (!(prefab instanceof Prefab)) throw new Error('Not a Prefab');
  const node = instantiate(prefab);
  try {
    const renderer = node.getComponentsInChildren(MeshRenderer)[0];
    const material = renderer?.sharedMaterial, texture = material?.getProperty('mainTexture');
    if (!renderer?.mesh || !material || !texture?.image || texture.width !== 64 || texture.height !== 64) throw new Error('Broken chain or placeholder texture');
    const assets = [];
    for (const asset of [prefab, renderer.mesh, material, texture, texture.image, material.effectAsset]) {
      const imported = await info(asset.uuid); assets.push({ uuid: asset.uuid, url: imported.url, type: asset.constructor.name });
    }
    const clipInfo = await info(root + 'Chain.anim'); const clip = await load(clipInfo.uuid);
    if (!(clip instanceof AnimationClip) || clip.duration !== 1) throw new Error('Animation was not preserved');
    const graphInfo = await info(root + 'Chain.animgraph'); const graph = await load(graphInfo.uuid);
    const layer = graph.layers[0];
    const state = [...layer.stateMachine.states()].find(state => state.name === 'Clip');
    if (!layer.mask || state?.motion?.clip?.uuid !== clip.uuid) throw new Error('Animation graph dependency chain is broken');
    return { graph: { uuid: graph.uuid, mask: layer.mask.uuid, clip: state.motion.clip.uuid }, assets, texture: { width: texture.width, height: texture.height }, vertices: renderer.mesh.struct.vertexBundles[0].view.count, animation: { uuid: clip.uuid, duration: clip.duration } };
  } finally { node.destroy(); }
}
exports.load = function () {};
exports.unload = function () {};
exports.methods = { createChain, createGraph, inspectChain };
