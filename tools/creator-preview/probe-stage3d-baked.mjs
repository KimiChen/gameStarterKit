#!/usr/bin/env node
/** SC0-B5 independent Prefab evidence; never starts Creator/Chrome or opens an authoring scene.
 * --export-report FILE is the successful editor-probe extractPrefab job report.
 * --expect-webgl 1|2 checks the actual context; prepare a GL1 browser separately.
 * Exit 1 = failed check; 2 = automated checks passed but visual/other-context evidence pending.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CdpClient, consoleHookSource, openScene, sceneUuidFromMeta, sleep } from "./lib.mjs";
import { aggregateStage3dSampling, createStage3dSamplingSource, stopStage3dSamplingSource } from "./stage3d-sampling.mjs";
import { classifyStage3dConsole } from "./stage3d-diagnostics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KEY = "__stage3dBakedPrefabProbe";
const RESOURCE_PATH = "stage3d/P_Stage3d_Baked";
const PREFAB_URL = `db://assets/resources/${RESOURCE_PATH}.prefab`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function parseBakedProbeArgs(argv) {
  const options = { preview: "http://127.0.0.1:7457", devtools: "http://127.0.0.1:9222",
    editorReady: path.join(ROOT, ".cache/stage3d/editor-probe/ready.json"), exportReport: null,
    authoringShot: null, expectWebgl: null, out: null, startupFrames: 600, cycles: 20, bootTimeoutMs: 300_000 };
  const fields = { "--preview": "preview", "--devtools": "devtools", "--editor-ready": "editorReady",
    "--export-report": "exportReport", "--authoring-shot": "authoringShot", "--expect-webgl": "expectWebgl",
    "--out": "out", "--startup-frames": "startupFrames", "--cycles": "cycles", "--boot-timeout": "bootTimeoutMs" };
  const numbers = new Set(["expectWebgl", "startupFrames", "cycles", "bootTimeoutMs"]);
  for (let index = 0; index < argv.length; index++) {
    if (["--help", "-h"].includes(argv[index])) return { help: true };
    const field = fields[argv[index]];
    if (!field || !argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    options[field] = numbers.has(field) ? Number(argv[++index]) : argv[++index];
    if (numbers.has(field) && (!Number.isSafeInteger(options[field]) || options[field] <= 0)) throw new Error(`${field} must be a positive integer`);
  }
  assert(options.exportReport, "--export-report is required; no exported Prefab evidence will be invented");
  assert([1, 2].includes(options.expectWebgl), "--expect-webgl 1|2 is required");
  for (const field of ["preview", "devtools"]) {
    const url = new URL(options[field]);
    assert(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash, `${field} must be a plain loopback HTTP URL`);
    options[field] = url.toString().replace(/\/$/u, "");
  }
  return options;
}

/** Cocos UUID compression retains the first two hex digits, then base64 pairs encode three hex digits. */
export function normalizeBakedUuid(input) {
  if (typeof input !== "string" || !input) throw new Error("Missing Cocos asset UUID");
  const [base, ...suffix] = input.split("@");
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(base)) return input.toLowerCase();
  if (base.length !== 22 || !/^[0-9a-f]{2}/iu.test(base)) throw new Error(`Unsupported Cocos UUID: ${input}`);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const hex = "0123456789abcdef";
  const encoded = base.replaceAll("-", "+").replaceAll("_", "/");
  let compact = encoded.slice(0, 2).toLowerCase();
  for (let index = 2; index < encoded.length; index += 2) {
    const left = alphabet.indexOf(encoded[index]), right = alphabet.indexOf(encoded[index + 1]);
    if (left < 0 || right < 0) throw new Error(`Invalid Cocos UUID: ${input}`);
    compact += hex[left >> 2] + hex[((left & 3) << 2) | (right >> 4)] + hex[right & 15];
  }
  const uuid = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  return suffix.length ? `${uuid}@${suffix.join("@").toLowerCase()}` : uuid;
}

/** Local artifact verification is deliberately separate from runtime/visual evidence. */
export function readBakedExportEvidence(reportFile, project) {
  project = fs.realpathSync(project);
  const reportBytes = fs.readFileSync(reportFile), report = JSON.parse(reportBytes.toString("utf8"));
  assert(report.status === "passed" && fs.realpathSync(report.project) === project, "Export job must have passed in the exact isolated project");
  const candidates = report.steps?.map((step) => step.result).filter((result) => result?.url === PREFAB_URL) ?? [];
  assert(candidates.length === 1, "Export report must contain exactly one standalone baked Prefab result");
  const exported = candidates[0];
  assert(exported.status === "prefab-created-and-reference-checked-runtime-reload-pending" && exported.resourcesPath === RESOURCE_PATH,
    "Expected the verified standalone extractPrefab result");
  const prefabFile = path.join(project, `assets/resources/${RESOURCE_PATH}.prefab`);
  const prefabBytes = fs.readFileSync(prefabFile), data = JSON.parse(prefabBytes.toString("utf8"));
  const metaBytes = fs.readFileSync(`${prefabFile}.meta`), meta = JSON.parse(metaBytes.toString("utf8"));
  assert(meta.importer === "prefab" && meta.imported === true && normalizeBakedUuid(meta.uuid) === normalizeBakedUuid(exported.uuid), "Actual imported Prefab UUID differs from the export report");
  assert(Array.isArray(data) && data[0]?.__type__ === "cc.Prefab", "Expected an independent serialized cc.Prefab graph");
  assert(!data.some((item) => item?.__type__ === "cc.Scene" || /(?:Light|Camera)$/u.test(item?.__type__ ?? "")), "Prefab must not contain a scene, camera, or runtime light");
  const renderers = data.filter((item) => item?.__type__ === "cc.MeshRenderer");
  const dependencies = exported.textureToPngDependencies;
  assert(renderers.length === 2 && Array.isArray(dependencies) && dependencies.length === 2, "Expected exactly two exported mesh/lightmap dependencies");
  assert(new Set(dependencies.map((item) => item.node)).size === 2, "Exported mesh node names must be unambiguous");
  const pngs = new Map();
  const meshes = dependencies.map((dependency) => {
    const renderer = renderers.find((item) => data[item.node?.__id__]?._name === dependency.node);
    const settings = data[renderer?.bakeSettings?.__id__];
    assert(renderer && settings?.__type__ === "cc.ModelBakeSettings", `Missing serialized renderer/bake settings: ${dependency.node}`);
    assert(normalizeBakedUuid(renderer._mesh?.__uuid__) === normalizeBakedUuid(dependency.meshUuid), `${dependency.node}: exported mesh UUID changed`);
    assert(normalizeBakedUuid(settings.texture?.__uuid__) === normalizeBakedUuid(dependency.textureUuid), `${dependency.node}: serialized lightmap UUID changed`);
    const uvParam = [settings.uvParam?.x, settings.uvParam?.y, settings.uvParam?.z, settings.uvParam?.w];
    assert(uvParam.every(Number.isFinite) && uvParam[2] > 0 && JSON.stringify(uvParam) === JSON.stringify(dependency.uvParam), `${dependency.node}: UV transform differs from the export inspection`);
    const materialUuids = renderer._materials?.map((item) => normalizeBakedUuid(item.__uuid__));
    assert(materialUuids?.length > 0, `${dependency.node}: missing serialized material references`);
    assert(dependency.hasUv2 === true && dependency.bakeable === true, `${dependency.node}: export did not verify UV2/bakeability`);
    assert(typeof dependency.imageUrl === "string" && dependency.imageUrl.startsWith("db://assets/resources/stage3d/")
      && dependency.imageUrl.endsWith(".png") && !dependency.imageUrl.includes(".."), `${dependency.node}: invalid local lightmap PNG URL`);
    const pngFile = path.join(project, "assets", dependency.imageUrl.slice("db://assets/".length));
    assert(fs.realpathSync(pngFile) === pngFile, "Lightmap PNG path must not redirect through a symlink");
    const bytes = fs.readFileSync(pngFile);
    assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${dependency.node}: missing PNG signature`);
    assert(sha256(bytes) === dependency.pngSha256, `${dependency.node}: PNG bytes changed since export`);
    assert(bytes.readUInt32BE(16) === dependency.width && bytes.readUInt32BE(20) === dependency.height, `${dependency.node}: PNG dimensions changed`);
    const pngMetaBytes = fs.readFileSync(`${pngFile}.meta`), pngMeta = JSON.parse(pngMetaBytes.toString("utf8"));
    assert(pngMeta.importer === "image" && pngMeta.imported === true && normalizeBakedUuid(pngMeta.uuid) === normalizeBakedUuid(dependency.imageUuid), `${dependency.node}: PNG ImageAsset metadata mismatch`);
    const textureMeta = Object.values(pngMeta.subMetas ?? {}).find((child) => child.importer === "texture" && normalizeBakedUuid(child.uuid) === normalizeBakedUuid(dependency.textureUuid));
    assert(textureMeta?.imported === true && normalizeBakedUuid(textureMeta.userData?.imageUuidOrDatabaseUri) === normalizeBakedUuid(dependency.imageUuid), `${dependency.node}: Texture2D -> ImageAsset metadata mismatch`);
    pngs.set(pngFile, { file: pngFile, sha256: sha256(bytes), bytes: bytes.length, metaSha256: sha256(pngMetaBytes),
      imageUuid: normalizeBakedUuid(dependency.imageUuid), textureUuid: normalizeBakedUuid(dependency.textureUuid),
      width: dependency.width, height: dependency.height, mipfilter: textureMeta.userData.mipfilter });
    return { ...dependency, meshUuid: normalizeBakedUuid(dependency.meshUuid), textureUuid: normalizeBakedUuid(dependency.textureUuid),
      imageUuid: normalizeBakedUuid(dependency.imageUuid), materialUuids };
  });
  const sceneFile = path.join(project, "assets/scene.scene");
  const mainSceneUuid = sceneUuidFromMeta(fs.readFileSync(`${sceneFile}.meta`, "utf8"));
  return { project, sourceReport: path.resolve(reportFile), sourceReportSha256: sha256(reportBytes), exportedAt: report.finishedAt,
    prefab: { file: prefabFile, uuid: normalizeBakedUuid(meta.uuid), resourcesPath: RESOURCE_PATH, sha256: sha256(prefabBytes), metaSha256: sha256(metaBytes) },
    mainScene: { file: sceneFile, uuid: mainSceneUuid, sha256: sha256(fs.readFileSync(sceneFile)) }, meshes, pngs: [...pngs.values()] };
}

function verifyPreviewProject(options, project) {
  const readyBytes = fs.readFileSync(options.editorReady), ready = JSON.parse(readyBytes.toString("utf8"));
  assert(fs.realpathSync(ready.project) === project && Number.isSafeInteger(ready.pid) && ready.pid > 0, "Editor ready record must name this exact project and PID");
  const port = new URL(options.preview).port || "80";
  const listing = execFileSync("lsof", ["-nP", "-a", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"], { encoding: "utf8" });
  const pids = [...new Set(listing.split(/\r?\n/u).filter((line) => /^p\d+$/u.test(line)).map((line) => Number(line.slice(1))))];
  assert(pids.length === 1 && pids[0] === ready.pid, `Preview port ${port} is not owned exclusively by the configured Creator PID`);
  const command = execFileSync("ps", ["-p", String(ready.pid), "-o", "command="], { encoding: "utf8" }).trim();
  assert(command.includes("CocosCreator") && command.includes(project), "Live preview process command must name the exact isolated project");
  return { project, pid: ready.pid, previewPort: Number(port), command, readyFile: path.resolve(options.editorReady), readySha256: sha256(readyBytes) };
}

/** Self-contained runtime fixture; no authoring scene/LightFX globals are loaded or copied. */
async function installBakedHarness(expected, key, normalizeUuid) {
  if (globalThis[key]) throw new Error("Baked probe already installed; a fresh page is required");
  if (typeof cc === "undefined" || !cc.director?.root?.device) throw new Error("Cocos runtime unavailable");
  const scene = cc.director.getScene();
  if (!scene || normalizeUuid(scene.uuid) !== expected.mainScene.uuid) throw new Error("The fresh preview is not the real main scene");
  if (cc.assetManager.assets.get(expected.prefab.uuid)) throw new Error("Baked Prefab was already loaded before the cold runtime probe");
  if (typeof System === "undefined" || typeof System.entries !== "function") throw new Error("Creator's loaded SystemJS registry is unavailable");
  const cameraCandidates = [...System.entries()].filter(([, namespace]) => typeof namespace?.Camera === "function"
    && (typeof cc.Camera === "function" ? namespace.Camera === cc.Camera
      : typeof cc.js?.getClassName === "function" && cc.js.getClassName(namespace.Camera) === "cc.Camera"));
  if (new Set(cameraCandidates.map(([, namespace]) => namespace.Camera)).size !== 1) throw new Error("Exactly one loaded cc.Camera constructor identity is required");
  const cameraModuleUrl = cameraCandidates[0][0];
  const { Camera } = await System.import(cameraModuleUrl);
  if (typeof Camera !== "function" || cc.director.getScene() !== scene) throw new Error("Camera module or main scene changed during constructor discovery");
  const runtimeModules = { Camera: cameraModuleUrl,
    legacyComponentExports: { Light: typeof cc.Light, MeshRenderer: typeof cc.MeshRenderer, SkinnedMeshRenderer: typeof cc.SkinnedMeshRenderer, Camera: typeof cc.Camera } };
  const walk = (root) => { const nodes = []; const visit = (node) => { nodes.push(node); for (const child of node.children) visit(child); }; visit(root); return nodes; };
  // Engine registration names work even when the legacy global cc omits a class.
  const activeLights = () => scene.getComponentsInChildren("cc.Light").filter((light) => light.enabledInHierarchy);
  if (activeLights().length) throw new Error("The main scene has active runtime lights; refusing to mask missing baked illumination");
  const mainGlobalsBefore = JSON.stringify({ disableLightmap: scene.globals.disableLightmap,
    bakedWithStationaryMainLight: scene.globals.bakedWithStationaryMainLight, bakedWithHighpLightmap: scene.globals.bakedWithHighpLightmap });
  if (scene.globals.disableLightmap || scene.globals.bakedWithStationaryMainLight || scene.globals.bakedWithHighpLightmap) throw new Error("Main scene lightmap globals do not match the static low-precision Prefab contract");
  const cameraNode = new cc.Node("Stage3dBakedProbe.Camera");
  cameraNode.setPosition(7, 7, 7); cameraNode.lookAt(new cc.Vec3(0, 0.4, 0)); cameraNode.parent = scene;
  const camera = cameraNode.addComponent(Camera);
  camera.near = 0.1; camera.far = 100; camera.fov = 45;
  camera.visibility = cc.Layers.Enum.DEFAULT;
  // The evidence camera clears after existing UI cameras; no UI nodes or application state are removed.
  camera.priority = Math.max(...scene.getComponentsInChildren("cc.Camera").filter((item) => item !== camera).map((item) => item.priority), 0) + 1;
  camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = new cc.Color(40, 44, 52, 255);
  let owned = null, instance = null, businessRefs = 0, opening = false, disposed = false;
  const lifecycle = [];
  const waitFrames = (count = 3) => new Promise((resolve, reject) => {
    let remaining = count;
    const timer = setTimeout(() => { cc.director.off(cc.Director.EVENT_AFTER_DRAW, tick); reject(new Error("Visible frame wait timed out")); }, 15_000);
    function tick() { if (--remaining <= 0) { clearTimeout(timer); cc.director.off(cc.Director.EVENT_AFTER_DRAW, tick); resolve(); } }
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, tick);
  });
  const guard = () => {
    if (cc.director.getScene() !== scene || normalizeUuid(scene.uuid) !== expected.mainScene.uuid) throw new Error("Main scene changed while probing");
    if (document.hidden || document.visibilityState !== "visible") throw new Error("Preview visibility changed");
    if (activeLights().length) throw new Error("Unexpected runtime light appeared");
    if (mainGlobalsBefore !== JSON.stringify({ disableLightmap: scene.globals.disableLightmap,
      bakedWithStationaryMainLight: scene.globals.bakedWithStationaryMainLight, bakedWithHighpLightmap: scene.globals.bakedWithHighpLightmap })) throw new Error("Main scene lightmap globals changed");
  };
  const snapshot = () => {
    guard();
    const device = cc.director.root.device, gl = device.gl;
    const version = gl?.getParameter(gl.VERSION);
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const meshes = (instance ? instance.getComponentsInChildren("cc.MeshRenderer") : []).map((renderer) => {
      const texture = renderer.bakeSettings.texture, model = renderer.model;
      const gfxTexture = texture?.getGFXTexture();
      const uv = renderer.bakeSettings.uvParam;
      return { node: renderer.node.name, nodeUuid: renderer.node.uuid, meshUuid: renderer.mesh?.uuid ?? null,
        static: !renderer.node.getComponent("cc.SkinnedMeshRenderer"), active: renderer.enabledInHierarchy,
        hasUv2: renderer.mesh?.struct.vertexBundles.some((bundle) => bundle.attributes.some((attribute) => attribute.name === "a_texCoord1")) ?? false,
        materials: renderer.sharedMaterials.map((material) => ({ uuid: material?.uuid ?? null, name: material?.name ?? null,
          effectName: material?.effectAsset?.name ?? null, effectUuid: material?.effectAsset?.uuid ?? null, passes: material?.passes.length ?? 0 })),
        bakeable: renderer.bakeSettings.bakeable, uvParam: [uv.x, uv.y, uv.z, uv.w], textureUuid: texture?.uuid ?? null,
        imageUuid: texture?.image?.uuid ?? null, imageNativeUrl: texture?.image?.nativeUrl ?? null, width: texture?.width ?? null, height: texture?.height ?? null,
        modelLightmapUuid: model?._lightmap?.uuid ?? null,
        subModels: (model?.subModels ?? []).map((subModel, index) => ({
          // Locked Creator 3.8.8 rendering/define.ts: ModelLocalBindings.SAMPLER_LIGHTMAP = 11.
          lightmapBound: !!gfxTexture && subModel.descriptorSet?.getTexture(11) === gfxTexture,
          macroPatches: model.getMacroPatches(index), passes: subModel.passes.length,
        })),
      };
    });
    const nodes = walk(scene), canvas = document.getElementById("GameCanvas"), rect = canvas?.getBoundingClientRect();
    const assets = [];
    cc.assetManager.assets.forEach((asset, uuid) => { if ([expected.prefab.uuid, ...expected.meshes.flatMap((mesh) => [mesh.meshUuid, mesh.textureUuid, mesh.imageUuid, ...mesh.materialUuids])].includes(uuid)) assets.push({ uuid, name: asset.name, refCount: asset.refCount, valid: cc.isValid(asset) }); });
    return { atMs: performance.now(), sceneUuid: scene.uuid, sceneName: scene.name, businessRefs, instanceNodes: instance ? walk(instance).length : 0,
      sceneNodes: nodes.length, cameraNodes: nodes.filter((node) => node.name === "Stage3dBakedProbe.Camera").length,
      runtimeLights: activeLights().length, lightmapGlobals: JSON.parse(mainGlobalsBefore), runtimeModules, meshes, assets,
      camera: { near: camera.near, far: camera.far, fov: camera.fov, priority: camera.priority, visibility: camera.visibility, clearFlags: camera.clearFlags },
      environment: { userAgent: navigator.userAgent, platform: navigator.platform, glVersion: version,
        bootStartedAtEpochMs: performance.timeOrigin,
        webgl: /WebGL 2/u.test(version ?? "") ? 2 : /WebGL 1/u.test(version ?? "") ? 1 : null,
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, device: device.constructor.name,
        pipeline: cc.director.root.pipeline?.constructor?.name ?? null, width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        canvas: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, backingWidth: canvas.width, backingHeight: canvas.height } : null },
      gfx: { bufferBytes: device.memoryStatus.bufferSize, textureBytes: device.memoryStatus.textureSize,
        drawCalls: device.numDrawCalls, triangles: device.numTris, instances: device.numInstances }, lifecycle: lifecycle.slice() };
  };
  const close = async () => {
    const previous = instance; instance = null;
    if (previous) { previous.destroy(); await waitFrames(3); if (cc.isValid(previous)) throw new Error("Prefab instance remained valid after deferred destruction"); }
    if (owned) {
      const asset = owned, before = asset.refCount;
      asset.decRef(); owned = null; businessRefs--;
      lifecycle.push({ event: "decRef-after-node-destruction", atMs: performance.now(), uuid: asset.uuid, before, after: asset.refCount, businessRefs });
    }
    await waitFrames(6);
    return snapshot();
  };
  const open = async () => {
    guard();
    if (disposed || opening || instance || owned) throw new Error("Open requires a closed, live probe");
    opening = true;
    const startedAtMs = performance.now();
    const startedAtEpochMs = Date.now();
    try {
      // Own the asset synchronously inside the load callback, before resolving the Promise.
      await new Promise((resolve, reject) => cc.resources.load(expected.prefab.resourcesPath, cc.Prefab, (error, asset) => {
        if (error) return reject(error);
        try {
          const before = asset.refCount; asset.addRef(); owned = asset; businessRefs++;
          lifecycle.push({ event: "addRef-in-load-callback", atMs: performance.now(), uuid: asset.uuid, before, after: asset.refCount, businessRefs });
          if (disposed) return reject(new Error("Probe was disposed during load"));
          resolve();
        } catch (failure) { reject(failure); }
      }));
      guard();
      if (normalizeUuid(owned.uuid) !== expected.prefab.uuid) throw new Error("Runtime loaded a different Prefab UUID");
      instance = cc.instantiate(owned); instance.parent = scene;
      await waitFrames(6);
      return { ...snapshot(), loadStartedAtMs: startedAtMs, loadStartedAtEpochMs: startedAtEpochMs };
    } catch (error) {
      try { await close(); } catch (cleanup) { throw new Error(`${error.message}; close also failed: ${cleanup.message}`); }
      throw error;
    }
    finally { opening = false; }
  };
  const dispose = async () => {
    disposed = true;
    let closed;
    try { closed = await close(); }
    finally { cameraNode.destroy(); await waitFrames(3); delete globalThis[key]; }
    return { closed, cameraDestroyed: !cc.isValid(cameraNode), remainingNodes: walk(scene).length };
  };
  globalThis[key] = { snapshot, open, close, waitFrames, dispose };
  return snapshot();
}

export function createBakedHarnessSource(evidence) {
  return `(${installBakedHarness.toString()})(${JSON.stringify(evidence)},${JSON.stringify(KEY)},${normalizeBakedUuid.toString()})`;
}

export function assertBakedRuntime(state, evidence) {
  assert(state.businessRefs === 1 && state.instanceNodes > 0 && state.meshes.length === 2, "Expected one owned Prefab instance with two meshes");
  assert(state.runtimeLights === 0 && state.environment.pipeline === "WebPipeline", "Runtime must use the built-in pipeline with no added lights");
  for (const expected of evidence.meshes) {
    const mesh = state.meshes.find((item) => item.node === expected.node);
    assert(mesh?.static && mesh.active && mesh.hasUv2 && mesh.bakeable, `${expected.node}: inactive/non-static mesh or missing UV2/bake settings`);
    for (const key of ["meshUuid", "textureUuid", "imageUuid"]) assert(normalizeBakedUuid(mesh[key]) === expected[key], `${expected.node}: runtime ${key} differs from the exported dependency`);
    assert(normalizeBakedUuid(mesh.modelLightmapUuid) === expected.textureUuid, `${expected.node}: runtime model has no matching lightmap`);
    assert(JSON.stringify(mesh.uvParam) === JSON.stringify(expected.uvParam), `${expected.node}: runtime lightmap UV transform changed: expected ${JSON.stringify(expected.uvParam)}, observed ${JSON.stringify(mesh.uvParam)}`);
    assert(mesh.width === expected.width && mesh.height === expected.height,
      `${expected.node}: lightmap texture dimensions changed; imageUuid=${expected.imageUuid}; imageNativeUrl=${JSON.stringify(mesh.imageNativeUrl)}; expected=${expected.width}x${expected.height}; observed=${mesh.width}x${mesh.height}`);
    assert(JSON.stringify(mesh.materials.map((material) => normalizeBakedUuid(material.uuid))) === JSON.stringify(expected.materialUuids)
      && mesh.materials.every((material) => material.passes > 0 && material.effectName), `${expected.node}: imported materials are missing or changed`);
    assert(mesh.subModels.length > 0 && mesh.subModels.every((subModel) => subModel.lightmapBound && subModel.passes > 0
      && subModel.macroPatches?.some((macro) => macro.name === "CC_USE_LIGHTMAP" && macro.value === 1)), `${expected.node}: actual GFX lightmap binding/static shader macro is absent`);
  }
  return { meshes: state.meshes, businessRefs: state.businessRefs, runtimeLights: state.runtimeLights };
}

export function assertBakedClosedBaseline(baseline, sample) {
  assert(sample.businessRefs === 0 && sample.instanceNodes === 0, "Closed cycle still owns a Prefab or instance nodes");
  assert(sample.sceneNodes === baseline.sceneNodes && sample.cameraNodes === 1, "Closed cycle did not restore the prewarmed node baseline");
  for (const field of ["bufferBytes", "textureBytes"]) assert(Number.isFinite(sample.gfx[field]) && sample.gfx[field] <= baseline.gfx[field], `${field} grew beyond the stable prewarmed closed baseline`);
}

export async function runBakedProbe(options) {
  const out = path.resolve(options.out ?? path.join(ROOT, "docs/evidence", `creator-${new Date().toISOString().slice(0, 10)}`, `stage3d-baked-webgl${options.expectWebgl}`));
  fs.mkdirSync(out, { recursive: true });
  const report = { schemaVersion: 1, scenario: "stage3d-independent-baked-prefab", startedAt: new Date().toISOString(), options,
    sc0Exit: false, b5Complete: false, steps: [], pending: [], console: [], cycles: [],
    scope: "Direct addRef/decRef is an SC0 tool fixture, not a kit loading API. Desktop GL1/GL2 evidence is not WeChat device evidence." };
  let client, installed = false, scriptId, shotIndex = 0;
  const invoke = (method, ...args) => client.evaluate(`globalThis[${JSON.stringify(KEY)}].${method}(...${JSON.stringify(args)})`);
  const shot = async (label) => {
    const filename = path.join(out, `${String(++shotIndex).padStart(3, "0")}-${label}.png`);
    await client.screenshot(filename, { format: "png" });
    return { file: filename, sha256: sha256(fs.readFileSync(filename)) };
  };
  const step = async (name, operation) => {
    const item = { name, status: "running", startedAt: new Date().toISOString() }; report.steps.push(item);
    try { item.detail = await operation(); item.status = "passed"; return item.detail; }
    catch (error) { item.status = "failed"; item.error = error.message; throw error; }
    finally { item.finishedAt = new Date().toISOString(); }
  };
  const stableClosed = async () => {
    const deadline = Date.now() + 30_000; let last = null, same = 0;
    while (Date.now() < deadline) {
      await invoke("waitFrames", 12); const state = await invoke("snapshot");
      assert(state.businessRefs === 0 && state.instanceNodes === 0, "Prewarm close still holds business references or nodes");
      const signature = JSON.stringify([state.sceneNodes, state.gfx.bufferBytes, state.gfx.textureBytes]);
      same = signature === last ? same + 1 : 0; last = signature;
      if (same >= 4) return state;
    }
    throw new Error("Closed GFX/node state did not stabilize across five consecutive frame windows");
  };
  try {
    const project = fs.realpathSync(path.join(ROOT, "apps/Cocos"));
    report.artifacts = await step("exported-prefab-and-png-prerequisites", () => readBakedExportEvidence(options.exportReport, project));
    report.previewBinding = await step("exact-preview-project-and-live-pid", () => verifyPreviewProject(options, project));
    if (options.authoringShot) {
      const source = path.resolve(options.authoringShot), bytes = fs.readFileSync(source);
      const destination = path.join(out, `authoring-reference${path.extname(source)}`); fs.writeFileSync(destination, bytes);
      report.authoringReference = { source, file: destination, sha256: sha256(bytes), visualReview: "pending" };
    }
    // Start blank so the editor's current authoring scene cannot execute before the main-scene rewrite.
    const response = await fetch(`${options.devtools}/json/new?about:blank`, { method: "PUT" });
    assert(response.ok, `Cannot create a fresh tab in the existing browser: HTTP ${response.status}`);
    const tab = await response.json(); report.tab = { id: tab.id, created: true, initialUrl: "about:blank" };
    client = await CdpClient.connect(tab.webSocketDebuggerUrl);
    report.browser = await client.send("Browser.getVersion");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: false });
    scriptId = (await client.send("Page.addScriptToEvaluateOnNewDocument", { source: consoleHookSource })).identifier;
    await step("fresh-real-main-scene", () => openScene(client, { preview: options.preview, sceneUuid: report.artifacts.mainScene.uuid, timeoutMs: options.bootTimeoutMs }));
    report.bootstrap = await step("independent-camera-no-authoring-state", async () => {
      const state = await client.evaluate(createBakedHarnessSource(report.artifacts));
      installed = true;
      assert(state.environment.webgl === options.expectWebgl, `Expected real WebGL ${options.expectWebgl}; observed ${state.environment.glVersion}`);
      assert(state.environment.width === 375 && state.environment.height === 812 && state.environment.dpr === 2, "Viewport is not 375x812 CSS at DPR2");
      assert(Math.abs(state.environment.canvas?.width - 375) < 1 && Math.abs(state.environment.canvas?.height - 812) < 1,
        "Creator native preview canvas does not fill the requested viewport; select WebpageFullScreen before boot");
      report.environment = state.environment;
      return state;
    });
    report.firstLoad = await step("cold-load-and-first-activation-peak", async () => {
      const sampling = client.evaluate(createStage3dSamplingSource({ warmupFrames: 0, sampleFrames: options.startupFrames, timeoutMs: 120_000 }));
      let opened;
      try { await invoke("waitFrames", 2); opened = await invoke("open"); }
      catch (error) {
        await client.evaluate(stopStage3dSamplingSource("baked-prefab-open-failed"));
        report.firstLoad = { loadError: error.message, raw: await sampling.catch(() => null) };
        throw error;
      }
      const raw = await sampling, summary = aggregateStage3dSampling(raw);
      const capture = { raw, summary, opened }; report.firstLoad = capture;
      assert(summary.valid, `Invalid initial-load frame evidence: ${summary.reasons.join(", ")}`);
      assert(raw.frames[0].atMs <= opened.loadStartedAtMs && summary.lastFrame.atMs >= opened.atMs, "Initial-load sample does not span the complete load/activation; increase --startup-frames");
      assertBakedRuntime(opened, report.artifacts);
      capture.screenshot = await shot("independent-first-load");
      return capture;
    });
    report.performance = await step("sixty-warmup-plus-240-raw-frame-intervals", async () => {
      const raw = await client.evaluate(createStage3dSamplingSource()), summary = aggregateStage3dSampling(raw);
      const capture = { raw, summary }; report.performance = capture;
      assert(summary.valid && summary.frameIntervals.count === 240, `Invalid steady-state evidence: ${summary.reasons.join(", ")}`);
      const state = await invoke("snapshot"); capture.state = state; assertBakedRuntime(state, report.artifacts);
      assert(summary.lastFrame.gfx.drawCalls > 0 && summary.lastFrame.gfx.triangles > 0, "No rendered geometry reported by the actual device");
      capture.screenshot = await shot("independent-steady-state");
      return capture;
    });
    report.prewarm = await step("prewarmed-closed-node-reference-and-gfx-baseline", async () => {
      await invoke("close"); const closes = [await stableClosed()];
      for (let index = 0; index < 6; index++) {
        assertBakedRuntime(await invoke("open"), report.artifacts); await invoke("close"); const next = await stableClosed(), previous = closes.at(-1); closes.push(next);
        if (next.sceneNodes === previous.sceneNodes && next.gfx.bufferBytes === previous.gfx.bufferBytes && next.gfx.textureBytes === previous.gfx.textureBytes) {
          return { closes, baseline: next, cachePolicy: "Record stable engine high-water marks; no cache flushing or releaseAll is performed. The probe owns zero assets while closed." };
        }
      }
      throw new Error("Closed resource baseline did not stabilize across seven prewarm cycles");
    });
    await step("twenty-prefab-reference-and-node-lifecycles", async () => {
      for (let cycle = 1; cycle <= options.cycles; cycle++) {
        const opened = await invoke("open"); assertBakedRuntime(opened, report.artifacts);
        await invoke("close"); const closed = await stableClosed(); report.cycles.push({ cycle, opened, closed });
        assertBakedClosedBaseline(report.prewarm.baseline, closed);
      }
      if (options.cycles < 20) report.pending.push(`Only ${options.cycles} cycles captured; 20 are required.`);
      return { cycles: report.cycles.length, baseline: report.prewarm.baseline.gfx,
        closedGfx: report.cycles.map((cycle) => cycle.closed.gfx), criterion: "Every closed buffer/texture value <= stable prewarmed baseline; exact node count; own references zero." };
    });
    report.finalScreenshot = await shot("closed-prefab-reference-zero");
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    if (client) try { report.failureScreenshot = await shot("failure"); } catch {}
  } finally {
    if (client) {
      await client.evaluate(stopStage3dSamplingSource("baked-probe-cleanup")).catch(() => {});
      const hasHarness = installed || await client.evaluate(`Boolean(globalThis[${JSON.stringify(KEY)}])`).catch(() => false);
      if (hasHarness) try { report.cleanup = await invoke("dispose"); } catch (error) { report.cleanupError = error.message; }
      try { report.console = await client.evaluate("(window.__creatorPreviewLogs || []).slice()"); } catch (error) { report.consoleReadError = error.message; }
      if (scriptId) await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId }).catch(() => {});
      client.close();
    }
    report.pending.push(report.authoringReference ? "Review the authored/reference and independent-runtime screenshots for preserved baked lighting and shadow appearance." : "Supply an authoring screenshot and compare it with the independent-runtime screenshots; appearance is not machine-verified.");
    report.pending.push(`The other WebGL context requires its own fresh run; this report only requests WebGL ${options.expectWebgl}.`);
    report.consoleDiagnostics = classifyStage3dConsole(report.console, {
      expectedWebgl: options.expectWebgl, actualWebgl: report.environment?.webgl, device: report.environment?.device,
      pipeline: report.environment?.pipeline, coldBoot: report.tab?.created === true && report.tab.initialUrl === "about:blank",
      bootStartedAtEpochMs: report.bootstrap?.environment?.bootStartedAtEpochMs,
      firstFixtureLoadStartedAtEpochMs: report.firstLoad?.opened?.loadStartedAtEpochMs,
    });
    report.expectedBootDiagnostics = report.consoleDiagnostics.expectedBootDiagnostics;
    report.finishedAt = new Date().toISOString();
    report.executedOk = !report.error && !report.cleanupError && !report.consoleReadError && report.steps.every((item) => item.status === "passed")
      && report.consoleDiagnostics.unexpectedErrors.length === 0;
    report.ok = report.executedOk && report.pending.length === 0;
    report.exitCode = report.executedOk ? 2 : 1;
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  return { report, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseBakedProbeArgs(process.argv.slice(2));
    if (options.help) console.log("Usage: node tools/creator-preview/probe-stage3d-baked.mjs --export-report FILE --expect-webgl 1|2 [--editor-ready FILE] [--authoring-shot FILE] [--preview http://127.0.0.1:7457] [--devtools http://127.0.0.1:9222] [--cycles 20] [--startup-frames 600] [--out DIR]\nRequires the exact isolated Creator process and an existing Chrome CDP endpoint. Always creates a blank tab and boots the real main scene. Does not start tools, apply bakes, load an authoring scene, add lights, or declare visual/B5 completion.");
    else {
      const result = await runBakedProbe(options);
      console.log(JSON.stringify({ executedOk: result.report.executedOk, exitCode: result.report.exitCode, report: path.join(result.out, "report.json") }));
      process.exitCode = result.report.exitCode;
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
