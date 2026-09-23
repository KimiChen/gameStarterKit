#!/usr/bin/env node
/** SC1-B5 authoring gate. See tools/art3d/assets3d.md for the configuration contract. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tsImport } from 'tsx/esm/api';
import { verifyQualityPresets } from '../tools/art3d/quality-assets.mjs';
import { inspectGlb, inspectPng, inspectHdr, parseJson, isObject, requireAsset } from './assets3d/formats.mjs';

// Exactly the same UUID/ownership implementations as pack/install/check, including clean hosts.
const { assertAssetReferences, assertBundleLayout, createAssetIndex, normalizeAssetUuid, CREATOR_BUILTINS } = await tsImport('../apps/server/tools/plugin/assetReferences.ts', import.meta.url);
const { BUNDLES, parsePackageBundleName } = await tsImport('../apps/server/tools/plugin/ownership.ts', import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ASSETS = 'apps/Cocos/assets/';
const FRAMEWORK = `${ASSETS}resources/stage3d`;
const CONFIG = 'scripts/assets3d.config.json';
const IMPORTERS = {
  '.glb': 'gltf', '.fbx': 'fbx', '.png': 'image', '.hdr': 'image', '.effect': 'effect',
  '.mtl': 'material', '.prefab': 'prefab', '.anim': 'animation-clip', '.animgraph': 'animation-graph',
  '.animask': 'animation-mask', '.json': 'json', '.atlas': 'spine-atlas', '.skel': 'spine-data',
};
const SERIALIZED = { '.mtl': 'cc.Material', '.prefab': 'cc.Prefab', '.anim': 'cc.AnimationClip', '.animgraph': 'cc.animation.AnimationGraph', '.animask': 'cc.animation.AnimationMask' };
const SAMPLERS = new Set(['texture', 'texture-cube', 'erp-texture-cube']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (file, dir) => file.startsWith(`${dir}/`);
const positive = value => Number.isSafeInteger(value) && value > 0;
const fail = (label, message) => requireAsset(false, label, message);
const check = requireAsset;

function relativePath(value, label) {
  check(typeof value === 'string' && value.length > 0 && !/[\\%?#*\u0000-\u001f]/u.test(value) && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..'), label, 'requires an exact repository-relative path');
  return value;
}
function regular(root, relative, directory = false) {
  relativePath(relative, relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    check(fs.existsSync(current), relative, 'missing file/directory');
    check(!fs.lstatSync(current).isSymbolicLink(), relative, 'symlinks are forbidden in asset namespaces');
  }
  check(directory ? fs.statSync(current).isDirectory() : fs.statSync(current).isFile(), relative, directory ? 'expected directory' : 'expected regular file');
  return current;
}
function jsonFile(root, relative) { return parseJson(fs.readFileSync(regular(root, relative)), relative); }
function walk(root, relative, directories, files, readBytes = true) {
  regular(root, relative, true); directories.add(relative);
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${relative}/${entry.name}`;
    check(!entry.isSymbolicLink(), child, 'symlinks are forbidden in asset namespaces');
    if (entry.isDirectory()) walk(root, child, directories, files, readBytes);
    else { regular(root, child); files.set(child, readBytes ? fs.readFileSync(path.join(root, child)) : Buffer.alloc(0)); }
  }
}
function subMetas(meta) {
  return Object.values(meta.subMetas ?? {}).flatMap(sub => [sub, ...subMetas(sub)]);
}
function at(object, field, fallback) {
  let value = object;
  for (const key of field.split('.')) {
    if (value === undefined) return fallback;
    check(isObject(value), field, 'invalid importer option object'); value = value[key];
  }
  return value === undefined ? fallback : value;
}
function budgets(config, limits, label) {
  check(isObject(config), label, 'budgets required');
  for (const [key, ceiling] of Object.entries(limits)) check(positive(config[key]) && config[key] <= ceiling, label, `${key} must be positive and <= frozen ceiling ${ceiling}`);
  for (const key of Object.keys(config)) check(Object.hasOwn(limits, key), label, `unknown budget ${key}`);
}
function validateConfig(config, label, limits) {
  check(config?.schemaVersion === 1 && config.creatorVersion === '3.8.8', label, 'schemaVersion:1 and creatorVersion:3.8.8 required');
  budgets(config.budgets, limits, label);
  for (const field of ['textures', 'models']) check(isObject(config[field]), label, `${field} map required`);
  check(Array.isArray(config.exceptions), label, 'exceptions array required');
  for (const field of ['textures', 'models']) for (const file of Object.keys(config[field])) relativePath(file, label);
}
function prepareExceptions(config, files, ownerOf, owner) {
  const exceptions = new Map();
  for (const entry of config.exceptions) {
    relativePath(entry.path, 'exception');
    check(!exceptions.has(entry.path) && ownerOf(entry.path) === owner && files.has(entry.path), entry.path, 'duplicate, missing or foreign exception asset');
    check(typeof entry.reason === 'string' && entry.reason.trim().length > 0 && isObject(entry.rules), entry.path, 'exception reason/rules required');
    const meta = parseJson(files.get(entry.path + '.meta') ?? Buffer.alloc(0), entry.path + '.meta');
    check(meta.uuid === entry.uuid && sha256(files.get(entry.path)) === entry.sha256, entry.path, 'exception path/UUID/SHA identity changed');
    if (entry.metaSha256 !== undefined) check(sha256(files.get(entry.path + '.meta')) === entry.metaSha256, entry.path, 'exception meta SHA identity changed');
    for (const key of Object.keys(entry.rules)) check(['naming', 'dimensions', 'sampler', 'model', 'fbx', 'staticCpuAccess'].includes(key), entry.path, `unknown exception rule ${key}`);
    if (entry.rules.sampler) {
      check(entry.metaSha256 && entry.textureUuid && entry.usage === config.textures[entry.path]?.usage && subMetas(meta).some(sub => sub.uuid === entry.textureUuid), entry.path, 'sampler exception needs exact meta SHA, texture UUID and usage');
      for (const key of Object.keys(entry.rules.sampler)) check(['wrapModeS', 'wrapModeT', 'minfilter', 'magfilter', 'mipfilter', 'anisotropy'].includes(key), entry.path, `unknown sampler override ${key}`);
    }
    exceptions.set(entry.path, entry);
  }
  return exceptions;
}
function imageTarget(meta, index, files, label) {
  const raw = meta.userData?.imageUuidOrDatabaseUri ?? meta.userData?.imageDatabaseUri;
  check(typeof raw === 'string', label, 'texture subMeta missing image dependency');
  const target = raw.startsWith('db://assets/') ? `${ASSETS}${raw.slice('db://assets/'.length)}` : index.get(normalizeAssetUuid(raw))?.path;
  check(target && files.has(target) && ['.png', '.hdr'].includes(path.posix.extname(target)), label, 'texture image must resolve to a checked external PNG/HDR');
  return target;
}
function checkSampler(meta, texture, exception, label) {
  const expected = { wrapModeS: texture.sampling === 'atlas' ? 'clamp-to-edge' : 'repeat', wrapModeT: texture.sampling === 'atlas' ? 'clamp-to-edge' : 'repeat', minfilter: 'linear', magfilter: 'linear', mipfilter: 'linear', anisotropy: 0 };
  const overrides = exception?.textureUuid === meta.uuid ? exception.rules.sampler : {};
  for (const [key, value] of Object.entries({ ...expected, ...overrides })) check(meta.userData?.[key] === value, label, `${meta.uuid} ${key} must be ${value}`);
}
function checkImage(file, bytes, meta, texture, exception) {
  check(isObject(texture), file, 'texture usage/sampling/colorSpace registration required');
  check(['surface', 'ui', 'vfx', 'lightmap', 'sky', 'reflection'].includes(texture.usage) && ['tiling', 'atlas'].includes(texture.sampling) && ['linear', 'srgb'].includes(texture.colorSpace), file, 'invalid texture registration');
  const hdr = file.endsWith('.hdr');
  const dimensions = hdr ? inspectHdr(bytes, file) : inspectPng(bytes, file);
  const { width, height } = dimensions, allowed = exception?.rules.dimensions;
  const pot = value => (value & (value - 1)) === 0;
  check((pot(width) && pot(height)) || (texture.usage === 'ui' && allowed), file, 'non-POT texture requires an exact UI exception');
  const ordinary = [256, 512, 1024].includes(width) && [256, 512, 1024].includes(height);
  const registered2048 = [256, 512, 1024, 2048].includes(width) && [256, 512, 1024, 2048].includes(height) && texture.allow2048 === true && typeof texture.reason === 'string' && texture.reason.trim();
  check(ordinary || registered2048 || (Array.isArray(allowed) && allowed[0] === width && allowed[1] === height), file, 'unregistered texture size tier');
  const channel = /_(BC|N|ORM|E|M)\.(png|hdr)$/u.exec(file)?.[1];
  const color = ['N', 'ORM', 'M'].includes(channel) || hdr || texture.usage === 'lightmap' ? 'linear' : ['BC', 'E'].includes(channel) ? 'srgb' : texture.colorSpace;
  check(texture.colorSpace === color, file, `channel requires ${color} colorSpace`);
  if (color === 'linear') check(!dimensions.srgb && (dimensions.gamma === undefined || dimensions.gamma === 100000), file, 'linear texture carries sRGB/gamma encoding');
  const cube = hdr && meta.userData?.type === 'texture cube';
  check(meta.userData?.type === 'texture' || cube, file, 'image type must be texture (HDR may be texture cube)');
  const samplers = subMetas(meta).filter(sub => SAMPLERS.has(sub.importer));
  check(samplers.length > 0, file, 'missing texture subMeta');
  if (meta.userData.redirect !== undefined) check(samplers.some(sub => sub.uuid === meta.userData.redirect), file, 'image redirect must name its own texture subMeta');
  check(!subMetas(meta).some(sub => sub.importer === 'sprite-frame'), file, '3D image may not import sprite-frame');
  if (cube) {
    const faces = subMetas(meta).filter(sub => sub.importer === 'texture-cube-face');
    check(faces.length === 6 && new Set(faces.map(face => face.name)).size === 6 && faces.every(face => ['right', 'left', 'top', 'bottom', 'front', 'back'].includes(face.name)), file, 'HDR cube requires six actual face subMetas');
    check(meta.userData.isRGBE === true && samplers.every(sub => sub.userData?.isRGBE === true), file, 'HDR cube requires RGBE');
  }
  const uncompressed = ['lightmap', 'sky', 'reflection'].includes(texture.usage) || (['ui', 'vfx'].includes(texture.usage) && texture.uncompressed === true && typeof texture.reason === 'string' && texture.reason.trim());
  const compression = meta.userData?.compressSettings;
  if (uncompressed) check(compression?.useCompressTexture !== true && !compression?.presetId, file, 'this texture usage must be uncompressed');
  else check(compression?.useCompressTexture === true && ['3d-default', '3d-alpha'].includes(compression.presetId), file, 'missing 3d-default/3d-alpha compression preset');
  return dimensions;
}

function relativeImage(source, uri, files, ownerOf) {
  check(typeof uri === 'string' && uri.length > 0 && !/^[a-z][a-z0-9+.-]*:/iu.test(uri) && !/[\\?#\u0000-\u001f]/u.test(uri) && !uri.startsWith('/'), source, 'GLB image URI must be relative');
  let decoded;
  try { decoded = decodeURIComponent(uri); } catch { fail(source, 'malformed image URI encoding'); }
  check(!/[\\%?#\u0000-\u001f]/u.test(decoded) && !decoded.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/iu.test(decoded), source, 'invalid decoded image URI');
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded));
  check(ownerOf(source) !== null && ownerOf(target) === ownerOf(source) && files.has(target) && target.endsWith('.png'), source, `image URI missing/outside owner PNG: ${uri}`);
  return target;
}

function modelOptions(file, meta, info, model, exception) {
  check(isObject(model) && ['world', 'building', 'hero'].includes(model.category), file, 'model category registration required');
  // Omitted fields use 3.8.8 inspector defaults, not policy defaults. CPU access defaults true.
  const options = {
    mountAllAnimationsOnPrefab: [true, true], 'lods.enable': [false, false], scale: [1, 1],
    allowMeshDataAccess: [info.skinned, true], generateLightmapUVNode: [false, false],
    normals: [2, 2], tangents: [2, 2], addVertexColor: [false, false],
    'meshOptimize.enable': [false, false], 'meshSimplify.enable': [false, false],
  };
  if (file.endsWith('.fbx')) Object.assign(options, { legacyFbxImporter: [false, false], smartMaterialEnabled: [true, true] });
  const overrides = exception?.rules.model ?? {};
  check(isObject(overrides) && Object.keys(overrides).every(key => Object.hasOwn(options, key) && key !== 'allowMeshDataAccess'), file, 'invalid model option exception');
  for (const [key, [expected, defaultValue]] of Object.entries(options)) {
    const value = at(meta.userData, key, defaultValue);
    if (key === 'allowMeshDataAccess' && !info.skinned && value === true && exception?.rules.staticCpuAccess === true) continue;
    check(value === (overrides[key] ?? expected), file, `${key} must be ${overrides[key] ?? expected}`);
  }
  if (meta.userData.meshOptimizer !== undefined) check(meta.userData.meshOptimizer === false || meta.userData.meshOptimizer?.enable === false, file, 'legacy meshOptimizer must be disabled');
  const retained = at(meta.userData, 'allowMeshDataAccess', true);
  if (retained) {
    check(positive(model.cpuDataBudgetBytes) && model.cpuDataBudgetBytes >= info.binBytes, file, 'retained CPU mesh data requires a budget >= source BIN payload');
    if (info.mixed || !info.skinned) check(typeof model.cpuReason === 'string' && model.cpuReason.trim().length > 0, file, 'mixed/static retained CPU data requires a reason');
  }
  const lod = /\/lod_[12]\.glb$/u.test(file), maxTriangles = lod ? 300 : { world: 3000, building: 10000, hero: 20000 }[model.category];
  check(info.triangles <= maxTriangles, file, `triangle budget ${maxTriangles} exceeded`);
  if (info.gltf) for (const skin of info.gltf.skins ?? []) check(skin.joints.length <= (model.category === 'hero' ? 80 : 30), file, 'bone budget exceeded');
}
function naming(file, info, exception, framework, packageId) {
  if (exception?.rules.naming === true) return;
  const base = path.posix.basename(file), ext = path.posix.extname(file), stem = path.posix.basename(file, ext);
  const word = '[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*';
  const patterns = { '.png': new RegExp(`^T_${word}_(BC|N|ORM|E|M)$`, 'u'), '.hdr': new RegExp(`^T_${word}(?:_(BC|E))?$`, 'u'), '.mtl': new RegExp(`^M_${word}$`, 'u'), '.prefab': new RegExp(`^(P|FX|SM|SK)_${word}$`, 'u'), '.anim': new RegExp(`^ANIM_${word}$`, 'u'), '.animgraph': new RegExp(`^ANIG_${word}$`, 'u'), '.animask': new RegExp(`^MASK_${word}$`, 'u') };
  if (ext === '.glb' || ext === '.fbx') {
    const prefix = info.skinned ? 'SK' : 'SM';
    const lod = ['lod_1.glb', 'lod_2.glb'].includes(base), dir = path.posix.basename(path.posix.dirname(file));
    check(lod ? new RegExp(`^${prefix}_${word}$`, 'u').test(dir) : new RegExp(`^${prefix}_${word}$`, 'u').test(stem), file, 'model naming must match actual static/skinned data');
    if (!framework) check(path.posix.dirname(file).includes('/3d/models/') && (lod || dir === stem), file, 'model requires models/<SM_|SK_Asset>/ directory');
  } else if (patterns[ext]) check(patterns[ext].test(stem), file, 'invalid asset prefix/channel naming');
  else if (ext === '.effect') check(stem.startsWith(`${packageId}-`) && /^[a-z][A-Za-z0-9]*-[a-z][A-Za-z0-9-]*$/u.test(stem), file, 'effect must use its package prefix');
  if (!framework) {
    const categories = { '.png': ['textures', 'lightmaps', 'vfx', 'spine'], '.hdr': ['textures'], '.mtl': ['materials', 'vfx'], '.prefab': ['prefabs', 'vfx'], '.anim': ['anims'], '.animgraph': ['anims'], '.animask': ['anims'], '.effect': ['effects'], '.json': ['data', 'spine'], '.atlas': ['spine'], '.skel': ['spine'] };
    const category = file.split('/3d/')[1]?.split('/')[0];
    if (categories[ext]) check(categories[ext].includes(category), file, 'asset in incorrect 3d category directory');
    if (category === 'vfx') check(file.split('/vfx/')[1].startsWith('FX_') && file.split('/vfx/')[1].includes('/'), file, 'vfx requires FX_<name>/ directory');
  }
}

function checkProvenance(root, owner, config, runtime, authorFiles) {
  const ledgerPath = `${owner.author}/LICENSES.md`;
  const ledger = fs.readFileSync(regular(root, ledgerPath), 'utf8');
  check(Array.isArray(config.provenance), owner.configPath, 'provenance array required');
  const expected = new Set([...runtime.keys()].filter(file => !file.endsWith('.meta')).concat([...authorFiles.keys()].filter(file => ![owner.configPath, ledgerPath].includes(file))));
  const entries = new Map();
  for (const entry of config.provenance) {
    relativePath(entry.path, owner.configPath);
    check(expected.has(entry.path) && !entries.has(entry.path), entry.path, 'missing/foreign/duplicate provenance asset');
    check(typeof entry.license === 'string' && /^[a-z][a-z0-9-]*$/u.test(entry.license) && ledger.split(/\r?\n/u).includes(`## ${entry.license}`) && ledger.includes('`' + entry.path + '`'), entry.path, 'LICENSES.md must cover exact asset and license heading');
    check(Array.isArray(entry.sources) && entry.sources.every(source => typeof source === 'string') && typeof entry.transform === 'string' && entry.transform.trim(), entry.path, 'source mapping/transform required');
    check(entry.sources.length > 0 || (typeof entry.origin === 'string' && entry.origin.trim()), entry.path, 'origin or source assets required');
    entries.set(entry.path, entry);
  }
  for (const file of expected) check(entries.has(file), file, 'missing provenance/license coverage');
  const done = new Set(), active = new Set();
  const visit = file => {
    check(entries.has(file), file, 'dangling provenance source');
    check(!active.has(file), file, 'cyclic provenance'); if (done.has(file)) return;
    active.add(file); for (const source of entries.get(file).sources) visit(source); active.delete(file); done.add(file);
  };
  for (const file of entries.keys()) visit(file);
  return [...expected].filter(file => authorFiles.has(file));
}

export function verifyAssets3d(root = ROOT) {
  root = path.resolve(root);
  const policy = jsonFile(root, CONFIG);
  check(policy.schemaVersion === 1 && policy.creatorVersion === CREATOR_BUILTINS.version, CONFIG, 'unsupported framework schema/Creator version');
  // Policy ceilings are frozen by SC0, not configurable upwards by a content package.
  const frozen = { totalBytes: 64000000, maxGlbBytes: 8000000, maxPngBytes: 4000000, texturesBytes: 32000000, lightmapsBytes: 32000000 };
  check(JSON.stringify(Object.entries(policy.limits ?? {}).sort()) === JSON.stringify(Object.entries(frozen).sort()), CONFIG, 'frozen policy limits changed; design decision required');
  check(jsonFile(root, 'apps/Cocos/package.json').creator?.version === policy.creatorVersion, CONFIG, 'Creator version mismatch');
  verifyQualityPresets(jsonFile(root, 'apps/Cocos/settings/v2/packages/builder.json'));
  validateConfig(policy.framework, CONFIG, policy.limits);
  if (!fs.existsSync(path.join(root, FRAMEWORK))) check(Object.keys(policy.framework.textures).length === 0 && Object.keys(policy.framework.models).length === 0 && policy.framework.exceptions.length === 0, FRAMEWORK, 'configured framework assets are missing');
  const owners = new Map(), files = new Map(), directories = new Set(), bundleOwners = new Map();
  const addOwner = (cls, id) => {
    const key = `${cls}:${id}`;
    if (owners.has(key)) return key;
    const plural = cls === 'kit' ? 'kits' : 'plugins', base = `apps/${plural}/${id}`;
    const manifest = jsonFile(root, `${base}/${cls}.json`);
    check(manifest.id === id, base, 'manifest/bundle owner mismatch');
    const author = `${base}/art/3d`, configPath = `${author}/art3d.config.json`;
    owners.set(key, { key, cls, id, author, configPath, config: jsonFile(root, configPath) });
    return key;
  };
  const addRoot = dir => {
    walk(root, dir, directories, files);
    files.set(dir + '.meta', fs.readFileSync(regular(root, dir + '.meta')));
  };
  if (fs.existsSync(path.join(root, FRAMEWORK))) {
    owners.set('framework', { key: 'framework', id: 'stage3d', configPath: CONFIG, config: policy.framework }); addRoot(FRAMEWORK);
  }
  if (fs.existsSync(path.join(root, BUNDLES))) {
    regular(root, BUNDLES, true);
    for (const name of new Set(fs.readdirSync(path.join(root, BUNDLES)).map(name => name.replace(/\.meta$/u, '')))) {
      const parsed = parsePackageBundleName(name);
      check(parsed, `${BUNDLES}/${name}`, 'unowned or invalid bundle');
      const key = addOwner(parsed.class, parsed.id); bundleOwners.set(name, key);
      addRoot(`${BUNDLES}/${name}`);
    }
  }
  for (const [plural, cls] of [['kits', 'kit'], ['plugins', 'plugin']]) {
    const base = `${ASSETS}resources/${plural}`;
    if (fs.existsSync(path.join(root, base))) {
      regular(root, base, true);
      for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
        if (entry.name.endsWith('.meta')) continue;
        const dir = `${base}/${entry.name}`; regular(root, dir, true);
        // Existing 2D PNG/effect resources remain legal. 3D models must never hide beside /3d.
        const legacyFiles = new Map(); walk(root, dir, new Set(), legacyFiles, false);
        for (const file of legacyFiles.keys()) check(!['.glb', '.fbx', '.hdr', '.mtl'].includes(path.posix.extname(file)), file, 'package heavy assets must live in a bundle');
        if (fs.existsSync(path.join(root, `${dir}/3d`))) { addOwner(cls, entry.name); addRoot(`${dir}/3d`); }
      }
    }
    // Author inputs without deployed outputs are still governed and licensed.
    const packages = `apps/${plural}`;
    if (fs.existsSync(path.join(root, packages))) for (const entry of fs.readdirSync(path.join(root, packages), { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(root, packages, entry.name, 'art/3d'))) addOwner(cls, entry.name);
    }
  }
  const ownerOf = file => {
    if (file === FRAMEWORK + '.meta' || inside(file, FRAMEWORK)) return 'framework';
    if (inside(file, BUNDLES)) return bundleOwners.get(file.slice(BUNDLES.length + 1).split('/')[0].replace(/\.meta$/u, '')) ?? null;
    const resource = /^apps\/Cocos\/assets\/resources\/(kits|plugins)\/([^/]+)\/3d(?:\/|\.meta$)/u.exec(file);
    return resource ? `${resource[1] === 'kits' ? 'kit' : 'plugin'}:${resource[2]}` : null;
  };
  assertBundleLayout(files);
  for (const dir of directories) {
    const meta = parseJson(files.get(dir + '.meta') ?? Buffer.alloc(0), dir + '.meta');
    check(meta.importer === 'directory', dir, 'directory .meta required');
  }
  for (const [file, bytes] of files) if (file.endsWith('.meta')) {
    const source = file.slice(0, -5), meta = parseJson(bytes, file);
    check(!source.endsWith('.meta'), file, '.meta is a companion, not a source asset');
    check(files.has(source) || directories.has(source), file, 'orphan .meta');
    check(isObject(meta.subMetas) && typeof meta.ver === 'string' && meta.imported === true, file, 'Creator ver/imported/subMetas required');
  }
  const allowedExternal = policy.allowedExternal ?? [];
  check(Array.isArray(allowedExternal), CONFIG, 'allowedExternal array required');
  for (const entry of allowedExternal) {
    relativePath(entry.path, CONFIG);
    check(entry.path.startsWith(ASSETS) && entry.reason?.trim(), CONFIG, 'external allowlist needs an asset path and reason');
    for (const suffix of ['', '.meta']) files.set(entry.path + suffix, fs.readFileSync(regular(root, entry.path + suffix)));
    check(sha256(files.get(entry.path)) === entry.sha256 && sha256(files.get(entry.path + '.meta')) === entry.metaSha256, entry.path, 'external allowlist identity changed');
  }
  const closure = assertAssetReferences(files, { ownerOf, allowedExternal });
  const index = createAssetIndex(files), report = { creatorVersion: policy.creatorVersion, ...closure, owners: [], exceptions: [] };
  for (const owner of owners.values()) {
    const config = owner.config;
    validateConfig(config, owner.configPath, policy.limits);
    const ownFiles = new Map([...files].filter(([file]) => ownerOf(file) === owner.key));
    const exceptions = prepareExceptions(config, files, ownerOf, owner.key);
    report.exceptions.push(...[...exceptions.values()].map(entry => ({ owner: owner.key, path: entry.path, rules: Object.keys(entry.rules) })));
    for (const field of ['textures', 'models']) for (const file of Object.keys(config[field])) check(ownFiles.has(file), file, `stale/foreign ${field} registration`);
    for (const file of ownFiles.keys()) if (['.png', '.hdr'].includes(path.posix.extname(file))) check(isObject(config.textures[file]), file, 'texture usage/sampling/colorSpace registration required');
    const textures = new Map(), models = [];
    const totals = { totalBytes: 0, texturesBytes: 0, lightmapsBytes: 0, metaBytes: 0, retainedSourceBinBytes: 0 };
    const count = (file, bytes, usage) => {
      if (file.endsWith('.meta')) { totals.metaBytes += bytes.length; return; }
      totals.totalBytes += bytes.length;
      if (['.png', '.hdr'].includes(path.posix.extname(file))) totals.texturesBytes += bytes.length;
      if (usage === 'lightmap') totals.lightmapsBytes += bytes.length;
      if (file.endsWith('.glb')) check(bytes.length <= config.budgets.maxGlbBytes, file, 'single GLB budget exceeded');
      if (file.endsWith('.png')) check(bytes.length <= config.budgets.maxPngBytes, file, 'single PNG budget exceeded');
    };
    for (const [file, bytes] of ownFiles) {
      count(file, bytes, config.textures[file]?.usage);
      if (file.endsWith('.meta')) continue;
      const ext = path.posix.extname(file), importer = IMPORTERS[ext];
      check(importer, file, 'format not allowed');
      if (inside(file, BUNDLES)) check(file.slice(BUNDLES.length + 1).split('/')[1] === '3d', file, 'all bundle assets must live under 3d/');
      if (owner.key !== 'framework' && !inside(file, BUNDLES)) check(file.includes('/3d/data/') && ext === '.json', file, 'resources package 3d only allows data JSON');
      const meta = parseJson(ownFiles.get(file + '.meta') ?? Buffer.alloc(0), file + '.meta');
      check(meta.importer === importer || (ext === '.json' && file.includes('/spine/') && meta.importer === 'spine-data'), file, `expected importer ${importer}`);
      const exception = exceptions.get(file);
      let info = {};
      if (ext === '.glb') info = inspectGlb(bytes, file);
      if (ext === '.fbx') {
        check(exception?.rules.fbx === true, file, 'FBX requires exact exception');
        const binary = bytes.length >= 27 && bytes.subarray(0, 23).equals(Buffer.from('Kaydara FBX Binary  \0\x1a\0', 'binary'));
        check(binary ? bytes.readUInt32LE(23) >= 7100 && bytes.readUInt32LE(23) <= 7700 : /^; FBX [\d.]+ project file/u.test(bytes.subarray(0, 100).toString()), file, 'expected actual FBX header/version');
        const subs = subMetas(meta);
        check(subs.some(sub => sub.importer === 'gltf-mesh') && subs.some(sub => sub.importer === 'gltf-scene'), file, 'FBX missing imported mesh/scene');
        info = { skinned: subs.some(sub => sub.importer === 'gltf-skeleton'), triangles: subs.filter(sub => sub.importer === 'gltf-mesh').reduce((sum, sub) => sum + (sub.userData?.triangleCount ?? Infinity), 0), binBytes: bytes.length };
      }
      if (ext === '.glb' || ext === '.fbx') {
        modelOptions(file, meta, info, config.models[file], exception);
        if (info.gltf) {
          const subs = subMetas(meta);
          for (const [field, kind] of [['meshes', 'gltf-mesh'], ['scenes', 'gltf-scene'], ['materials', 'gltf-material'], ['skins', 'gltf-skeleton'], ['animations', 'gltf-animation']]) {
            for (let i = 0; i < (info.gltf[field]?.length ?? 0); i++) check(subs.some(sub => sub.importer === kind && sub.userData?.gltfIndex === i), file, `missing ${kind} subMeta for glTF index ${i}`);
          }
          for (const sub of subs.filter(sub => sub.importer === 'gltf-animation')) check(/^ANIM_[A-Za-z][A-Za-z0-9_]*\.animation$/u.test(sub.name), file, 'animation clip naming requires ANIM_');
          check(subs.filter(sub => sub.importer === 'texture').length >= (info.gltf.textures?.length ?? 0), file, 'missing model texture subMeta');
          for (const image of info.gltf.images ?? []) relativeImage(file, image.uri, files, ownerOf);
          for (const [i, texture] of (info.gltf.textures ?? []).entries()) {
            const image = info.gltf.images?.[texture.source];
            check(image, file, 'missing GLB texture image');
            const target = relativeImage(file, image.uri, files, ownerOf);
            const textureUuid = meta.userData.assetFinder?.textures?.[i];
            const imported = subs.find(sub => sub.uuid === textureUuid && sub.importer === 'texture');
            check(imported && imageTarget(imported, index, files, file) === target, file, 'GLB imported texture/image does not match source URI');
          }
          const linearSlots = [];
          for (const material of info.gltf.materials ?? []) linearSlots.push(material.normalTexture?.index, material.occlusionTexture?.index, material.pbrMetallicRoughness?.metallicRoughnessTexture?.index);
          for (const textureIndex of linearSlots.filter(value => value !== undefined)) {
            const image = info.gltf.images?.[info.gltf.textures?.[textureIndex]?.source];
            check(image, file, 'missing GLB material texture');
            check(config.textures[relativeImage(file, image.uri, files, ownerOf)]?.colorSpace === 'linear', file, 'normal/ORM material slot requires linear texture');
          }
        }
        if (at(meta.userData, 'allowMeshDataAccess', true)) totals.retainedSourceBinBytes += info.binBytes;
        models.push({ path: file, triangles: info.triangles, skinned: info.skinned, sourceBinBytes: info.binBytes });
      } else if (ext === '.png' || ext === '.hdr') textures.set(file, checkImage(file, bytes, meta, config.textures[file], exception));
      else if (SERIALIZED[ext]) {
        const parsed = parseJson(bytes, file), objects = Array.isArray(parsed) ? parsed : [parsed];
        check(objects.some(object => object?.__type__ === SERIALIZED[ext]), file, `expected serialized ${SERIALIZED[ext]}`);
        // 3.8.8 does channel conversion in shader slots, not an invented image-meta sRGB flag.
        if (ext === '.mtl') for (const object of objects) for (const props of object?._props ?? []) {
          for (const [slot, color] of [['normalMap', 'linear'], ['pbrMap', 'linear'], ['mainTexture', 'srgb'], ['emissiveMap', 'srgb']]) {
            const raw = props[slot]?.__uuid__; if (!raw) continue;
            const target = index.get(normalizeAssetUuid(raw));
            check(target, file, 'material texture missing');
            const targetMeta = parseJson(files.get(target.metaPath), target.metaPath);
            const sub = subMetas(targetMeta).find(item => item.uuid === normalizeAssetUuid(raw));
            const image = sub && SAMPLERS.has(sub.importer) ? imageTarget(sub, index, files, file) : target.path;
            check(config.textures[image]?.colorSpace === color, file, `${slot} requires ${color} texture`);
          }
        }
      } else if (ext === '.json') parseJson(bytes, file);
      else if (ext === '.effect') check(/CCEffect\s*%\{/u.test(bytes.toString()) && /CCProgram\s+/u.test(bytes.toString()), file, 'expected Creator effect source');
      else check(bytes.length > 0 && !bytes.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])), file, 'empty or disguised asset');
      naming(file, info, exception, owner.key === 'framework', owner.id);
    }
    // All imported texture subassets, including those owned by GLB/FBX, use the image policy.
    for (const [file, bytes] of ownFiles) if (file.endsWith('.meta')) {
      for (const sub of subMetas(parseJson(bytes, file))) {
        check(sub.imported === true && typeof sub.ver === 'string' && isObject(sub.subMetas), file, 'subMeta ver/imported/subMetas required');
        const allowed = /\.(glb|fbx)\.meta$/u.test(file)
          ? ['gltf-mesh', 'gltf-animation', 'gltf-original-animation', 'gltf-skeleton', 'gltf-material', 'gltf-scene', 'texture']
          : /\.(png|hdr)\.meta$/u.test(file) ? ['texture', 'texture-cube', 'erp-texture-cube', 'texture-cube-face'] : null;
        if (allowed) check(allowed.includes(sub.importer), file, `unexpected subMeta importer ${sub.importer}`);
        if (['image', 'gltf-image'].includes(sub.importer)) fail(file, 'embedded model image subMeta must be extracted to a standalone PNG');
        if (SAMPLERS.has(sub.importer)) {
          const target = imageTarget(sub, index, files, file), texture = config.textures[target];
          check(texture && textures.has(target), file, 'model texture must use a registered checked image');
          if (/\.(png|hdr)\.meta$/u.test(file)) check(target === file.slice(0, -5), file, 'image texture subMeta must reference its own image');
          checkSampler(sub, texture, exceptions.get(target), file);
        }
      }
    }
    if (owner.author) {
      const authorFiles = new Map(); walk(root, owner.author, new Set(), authorFiles);
      const sourcePaths = checkProvenance(root, owner, config, ownFiles, authorFiles);
      for (const file of sourcePaths) {
        const bytes = authorFiles.get(file), ext = path.posix.extname(file);
        check(IMPORTERS[ext], file, 'author format not allowed'); count(file, bytes);
        if (ext === '.glb') inspectGlb(bytes, file);
        if (ext === '.png') inspectPng(bytes, file);
        if (ext === '.hdr') inspectHdr(bytes, file);
      }
    }
    for (const key of ['totalBytes', 'texturesBytes', 'lightmapsBytes']) check(totals[key] <= config.budgets[key], owner.key, `${key} budget exceeded: ${totals[key]} > ${config.budgets[key]}`);
    report.owners.push({ owner: owner.key, ...totals, models, textures: [...textures].map(([file, dimensions]) => ({ path: file, ...dimensions })) });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let root = ROOT, json = false;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--root' && args[i + 1]) root = args[++i];
      else if (args[i] === '--json') json = true;
      else throw new Error(`Usage: node scripts/verify-assets3d.mjs [--root <repository>] [--json]; unknown ${args[i]}`);
    }
    const report = verifyAssets3d(root);
    if (json) console.log(JSON.stringify(report, null, 2));
    else console.log(`[assets3d] ✔ ${report.owners.length} owners, ${report.assets} UUIDs, ${report.references} references, ${report.exceptions.length} exact exceptions`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
