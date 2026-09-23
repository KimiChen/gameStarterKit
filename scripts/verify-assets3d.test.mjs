import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { verifyAssets3d } from './verify-assets3d.mjs';
import { crc32 } from './assets3d/formats.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const FRAME = 'apps/Cocos/assets/resources/stage3d';
const CONFIG = 'scripts/assets3d.config.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = key => { const h = hash(key); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function write(root, file, bytes) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes); }
function read(root, file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
function edit(root, file, fn) { const value = read(root, file); fn(value); write(root, file, json(value)); }
function chunk(type, bytes) {
  const out = Buffer.alloc(bytes.length + 12); out.writeUInt32BE(bytes.length); out.write(type, 4); bytes.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4); return out;
}
function png(width = 256, height = width, srgb = false) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...(srgb ? [chunk('sRGB', Buffer.from([0]))] : []), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
function hdr() {
  const row = Buffer.from([2, 2, 1, 0, 255, 100, 255, 100, 130, 100, 255, 100, 255, 100, 130, 100, 255, 100, 255, 100, 130, 100, 255, 128, 255, 128, 130, 128]);
  return Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 256 +X 256\n'), ...Array.from({ length: 256 }, () => row)]);
}
function changeGlb(bytes, fn) {
  const n = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + n)); fn(gltf);
  const encoded = Buffer.from(JSON.stringify(gltf)), padded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)]);
  const header = Buffer.from(bytes.subarray(0, 20)), tail = bytes.subarray(20 + n);
  header.writeUInt32LE(20 + padded.length + tail.length, 8); header.writeUInt32LE(padded.length, 12);
  return Buffer.concat([header, padded, tail]);
}
function mutateGlb(root, file, fn) { write(root, file, changeGlb(fs.readFileSync(path.join(root, file)), fn)); }
function meta(root, file, importer, userData = {}, subs = {}) {
  const value = { ver: '1.0.0', importer, imported: true, uuid: uuid(file), files: [], subMetas: subs, userData };
  write(root, file + '.meta', json(value)); return value;
}
function directory(root, dir, data = {}) { fs.mkdirSync(path.join(root, dir), { recursive: true }); meta(root, dir, 'directory', data); }
function textureMeta(root, file, cube = false) {
  const imageUuid = uuid(file), id = cube ? 'b47c0' : '6c48a';
  const sub = { ver: '1.0.22', imported: true, uuid: `${imageUuid}@${id}`, id, importer: cube ? 'erp-texture-cube' : 'texture', userData: { wrapModeS: 'repeat', wrapModeT: 'repeat', minfilter: 'linear', magfilter: 'linear', mipfilter: 'linear', anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: imageUuid }, subMetas: {} };
  if (cube) {
    sub.userData.isRGBE = true;
    for (const [i, name] of ['right', 'left', 'top', 'bottom', 'front', 'back'].entries()) {
      const faceId = `f${i}`;
      sub.subMetas[faceId] = { ver: '1.0.0', imported: true, uuid: `${sub.uuid}@${faceId}`, id: faceId, name, importer: 'texture-cube-face', userData: {}, subMetas: {} };
    }
  }
  return meta(root, file, 'image', { type: cube ? 'texture cube' : 'texture', ...(cube ? { isRGBE: true } : { compressSettings: { useCompressTexture: true, presetId: '3d-default' } }) }, { [id]: sub });
}

function fixture(root, cls = 'kit', id = 'foo') {
  const policy = JSON.parse(fs.readFileSync(path.join(REPO, CONFIG)));
  policy.framework = { schemaVersion: 1, creatorVersion: '3.8.8', budgets: { ...policy.limits }, textures: {}, models: {}, exceptions: [] };
  write(root, CONFIG, json(policy));
  for (const file of ['apps/Cocos/package.json', 'apps/Cocos/settings/v2/packages/builder.json']) write(root, file, fs.readFileSync(path.join(REPO, file)));
  const author = `apps/${cls === 'kit' ? 'kits' : 'plugins'}/${id}/art/3d`;
  const base = `apps/Cocos/assets/bundles/${cls}-${id}`, detail = `${base}-detail`;
  const model = `${base}/3d/models/SM_Test/SM_Test.glb`, texture = `${detail}/3d/textures/T_Test_BC.png`, sky = `${detail}/3d/textures/T_Sky.hdr`;
  const material = `${detail}/3d/materials/M_Test.mtl`, prefab = `${base}/3d/prefabs/P_Test_Thing.prefab`;
  const graph = `${base}/3d/anims/ANIG_Test.animgraph`, clip = `${detail}/3d/anims/ANIM_Test_Idle.anim`, mask = `${detail}/3d/anims/MASK_Test_Upper.animask`;
  const configPath = `${author}/art3d.config.json`, source = `${author}/T_Source_BC.png`;
  write(root, `apps/${cls === 'kit' ? 'kits' : 'plugins'}/${id}/${cls}.json`, json({ id, requires: { kits: { other: { content: 1 } } } }));
  for (const bundle of [base, detail]) directory(root, bundle, { isBundle: true, bundleConfigID: 'package3d' });
  const runtime = [model, texture, sky, material, prefab, graph, clip, mask];
  for (const file of runtime) for (let dir = path.posix.dirname(file); dir !== base && dir !== detail; dir = path.posix.dirname(dir)) directory(root, dir);
  write(root, model, changeGlb(fs.readFileSync(path.join(REPO, FRAME, 'greybox-cube.glb')), g => { g.images[0].uri = `../../../../${cls}-${id}-detail/3d/textures/T_Test_BC.png`; }));
  let modelMeta = JSON.parse(fs.readFileSync(path.join(REPO, FRAME, 'greybox-cube.glb.meta')));
  modelMeta = JSON.parse(JSON.stringify(modelMeta).replaceAll(modelMeta.uuid, uuid(model)).replaceAll('db://assets/resources/stage3d/T_Greybox_Checker_BC.png', `db://assets/${texture.slice('apps/Cocos/assets/'.length)}`));
  write(root, model + '.meta', json(modelMeta));
  write(root, texture, png()); textureMeta(root, texture);
  write(root, sky, hdr()); textureMeta(root, sky, true);
  const serialized = [
    [material, 'material', { __type__: 'cc.Material', _effectAsset: { __uuid__: 'c8f66d17-351a-48da-a12c-0212d28575c4' }, _props: [{ mainTexture: { __uuid__: uuid(texture) + '@6c48a' } }] }],
    [prefab, 'prefab', [{ __type__: 'cc.Prefab', data: { __id__: 1 } }, { __type__: 'cc.Node', material: { __uuid__: uuid(material) }, mesh: { __uuid__: uuid(model) + '@b5d26' }, skyFace: { __uuid__: uuid(sky) + '@b47c0@f0' } }]],
    [graph, 'animation-graph', { __type__: 'cc.animation.AnimationGraph', clip: { __uuid__: uuid(clip) }, mask: { __uuid__: uuid(mask) } }],
    [clip, 'animation-clip', { __type__: 'cc.AnimationClip' }], [mask, 'animation-mask', { __type__: 'cc.animation.AnimationMask' }],
  ];
  for (const [file, importer, value] of serialized) { write(root, file, json(value)); meta(root, file, importer); }
  const config = { schemaVersion: 1, creatorVersion: '3.8.8', budgets: { ...policy.limits }, textures: { [texture]: { usage: 'surface', sampling: 'tiling', colorSpace: 'srgb' }, [sky]: { usage: 'sky', sampling: 'tiling', colorSpace: 'linear' } }, models: { [model]: { category: 'world' } }, exceptions: [], provenance: [] };
  write(root, source, png());
  for (const file of [...runtime, source]) config.provenance.push({ path: file, sources: file === texture ? [source] : [], origin: 'Self-authored synthetic fixture', license: 'self-authored', transform: 'Generated for asset gate tests' });
  write(root, configPath, json(config));
  const ledger = () => write(root, `${author}/LICENSES.md`, Buffer.from('## self-authored\nSource: procedural. License: CC0. Uses: testing.\n' + read(root, configPath).provenance.map(entry => `- \`${entry.path}\``).join('\n')));
  ledger();
  return { root, base, detail, author, configPath, source, model, texture, sky, material, prefab, graph, clip, mask, ledger };
}
function withFixture(fn, cls) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assets3d-test-'));
  try { return fn(fixture(root, cls)); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function imageEdit(f, fn) { edit(f.root, f.texture + '.meta', value => fn(value.subMetas['6c48a'].userData, value.userData)); }
function modelEdit(f, fn) { edit(f.root, f.model + '.meta', value => fn(value.userData, value)); }
function addSkinned(f) {
  const file = `${f.base}/3d/models/SK_Test/SK_Test.glb`;
  directory(f.root, path.posix.dirname(file));
  write(f.root, file, fs.readFileSync(path.join(REPO, FRAME, 'greybox-biped.glb')));
  const value = JSON.parse(fs.readFileSync(path.join(REPO, FRAME, 'greybox-biped.glb.meta')));
  write(f.root, file + '.meta', Buffer.from(JSON.stringify(value).replaceAll(value.uuid, uuid(file))));
  edit(f.root, f.configPath, c => { c.models[file] = { category: 'world', cpuDataBudgetBytes: 32768 }; c.provenance.push({ path: file, sources: [], origin: 'Procedural biped', license: 'self-authored', transform: 'Generated' }); });
  f.ledger(); return file;
}

test('real repository assets satisfy migrated SC0 exceptions and actual source budgets', () => {
  const result = verifyAssets3d(REPO);
  assert.equal(result.creatorVersion, '3.8.8'); assert.equal(result.exceptions.length, 6);
  assert.equal(result.owners.find(owner => owner.owner === 'framework').models.filter(model => model.skinned).length, 2);
});
for (const cls of ['kit', 'plugin']) test(`${cls}: multi-bundle GLB/material/PNG, HDR nested faces and animation closure pass`, () => withFixture(f => {
  const result = verifyAssets3d(f.root);
  assert.equal(result.owners[0].owner, `${cls}:foo`); assert.ok(result.references >= 10);
  assert.equal(result.owners[0].textures.length, 2);
  const runtimeBytes = [...read(f.root, f.configPath).provenance].reduce((sum, entry) => sum + fs.statSync(path.join(f.root, entry.path)).size, 0);
  assert.equal(result.owners[0].totalBytes, runtimeBytes, 'physical source/output paths counted once, repeated references do not multiply budgets');
}, cls));

const cases = [
  ['PNG renamed JPG', f => { fs.renameSync(path.join(f.root, f.texture), path.join(f.root, f.texture.replace('.png', '.jpg'))); }, /missing|缺少|orphan/u],
  ['JPEG bytes disguised as PNG', f => write(f.root, f.texture, Buffer.from([255, 216, 255, 217])), /actual PNG/u],
  ['PNG CRC', f => { const b = fs.readFileSync(path.join(f.root, f.texture)); b[b.length - 1] ^= 1; write(f.root, f.texture, b); }, /CRC/u],
  ['PNG non-POT', f => write(f.root, f.texture, png(300)), /non-POT/u],
  ['PNG unregistered 64 tier', f => write(f.root, f.texture, png(64)), /size tier/u],
  ['PNG 2048 registration', f => write(f.root, f.texture, png(2048)), /size tier/u],
  ['missing meta', f => fs.unlinkSync(path.join(f.root, f.texture + '.meta')), /悬空|JSON/u],
  ['wrong importer', f => edit(f.root, f.texture + '.meta', m => { m.importer = 'text'; }), /expected importer/u],
  ['failed import', f => edit(f.root, f.texture + '.meta', m => { m.imported = false; }), /imported/u],
  ['missing texture subMeta', f => edit(f.root, f.texture + '.meta', m => { m.subMetas = {}; }), /悬空|subMeta/u],
  ['missing model mesh subMeta', f => modelEdit(f, (d, m) => { delete m.subMetas.b5d26; }), /悬空|subMeta/u],
  ['model texture sampler is also checked', f => modelEdit(f, (d, m) => { m.subMetas['78a7d'].userData.mipfilter = 'none'; }), /mipfilter/u],
  ['foreign subMeta importer', f => modelEdit(f, (d, m) => { m.subMetas.extra = { ...m.subMetas.b5d26, id: 'extra', uuid: m.uuid + '@extra', importer: 'sprite-frame' }; }), /unexpected subMeta importer/u],
  ['missing model texture subMeta without assetFinder', f => modelEdit(f, (d, m) => { delete m.subMetas['78a7d']; delete d.assetFinder; }), /texture subMeta/u],
  ['nested HDR missing face', f => edit(f.root, f.sky + '.meta', m => { delete m.subMetas.b47c0.subMetas.f0; }), /悬空|six actual/u],
  ['nested HDR forged parent', f => edit(f.root, f.sky + '.meta', m => { m.subMetas.b47c0.subMetas.f0.uuid = uuid(f.sky) + '@other@f0'; }), /父资产/u],
  ['HDR bad bytes', f => write(f.root, f.sky, png()), /HDR header/u],
  ['image type sprite', f => imageEdit(f, (s, d) => { d.type = 'sprite-frame'; }), /type must be texture/u],
  ['mip disabled', f => imageEdit(f, s => { s.mipfilter = 'none'; }), /mipfilter/u],
  ['wrap policy', f => imageEdit(f, s => { s.wrapModeS = 'clamp-to-edge'; }), /wrapModeS/u],
  ['minfilter', f => imageEdit(f, s => { s.minfilter = 'nearest'; }), /minfilter/u],
  ['magfilter', f => imageEdit(f, s => { s.magfilter = 'nearest'; }), /magfilter/u],
  ['anisotropy', f => imageEdit(f, s => { s.anisotropy = 4; }), /anisotropy/u],
  ['unknown compression preset', f => imageEdit(f, (s, d) => { d.compressSettings.presetId = 'missing'; }), /compression preset/u],
  ['missing builder preset', f => edit(f.root, 'apps/Cocos/settings/v2/packages/builder.json', b => { delete b.textureCompressConfig.userPreset['3d-default']; }), /Unknown texture preset/u],
  ['no PNG fallback', f => edit(f.root, 'apps/Cocos/settings/v2/packages/builder.json', b => { delete b.textureCompressConfig.userPreset['3d-default'].options.miniGame.png; }), /fallback/u],
  ['compressed mip generation disabled', f => edit(f.root, 'apps/Cocos/settings/v2/packages/builder.json', b => { b.textureCompressConfig.genMipmaps = false; }), /mipmaps/u],
  ['compressed mip generation missing', f => edit(f.root, 'apps/Cocos/settings/v2/packages/builder.json', b => { delete b.textureCompressConfig.genMipmaps; }), /mipmaps/u],
  ['sky compression', f => edit(f.root, f.sky + '.meta', m => { m.userData.compressSettings = { useCompressTexture: true, presetId: '3d-default' }; }), /uncompressed/u],
  ['unregistered texture usage', f => edit(f.root, f.configPath, c => { delete c.textures[f.texture]; }), /registration required/u],
  ['GLB header length', f => { const b = fs.readFileSync(path.join(f.root, f.model)); b.writeUInt32LE(b.length - 4, 8); write(f.root, f.model, b); }, /declared length/u],
  ['GLB chunk bounds', f => { const b = fs.readFileSync(path.join(f.root, f.model)); b.writeUInt32LE(b.length, 12); write(f.root, f.model, b); }, /chunk length/u],
  ['GLB bufferView bounds', f => mutateGlb(f.root, f.model, g => { g.bufferViews[0].byteLength = 999999; }), /bufferView out of bounds/u],
  ['GLB accessor bounds', f => mutateGlb(f.root, f.model, g => { g.accessors[0].count = 999999; }), /accessor out of bounds/u],
  ['GLB embedded bufferView image', f => mutateGlb(f.root, f.model, g => { g.images[0] = { bufferView: 0, mimeType: 'image/png' }; }), /embedded images/u],
  ['GLB embedded data PNG', f => mutateGlb(f.root, f.model, g => { g.images[0].uri = 'data:image/png;base64,AAAA'; }), /embedded images/u],
  ['GLB embedded data JPEG', f => mutateGlb(f.root, f.model, g => { g.images[0].uri = 'data:image/jpeg;base64,AAAA'; }), /embedded images/u],
  ['GLB external buffer', f => mutateGlb(f.root, f.model, g => { g.buffers[0].uri = 'geometry.bin'; }), /external buffers/u],
  ['GLB remote image', f => mutateGlb(f.root, f.model, g => { g.images[0].uri = 'https://example.invalid/T_Test_BC.png'; }), /URI must be relative/u],
  ['GLB URI traversal', f => mutateGlb(f.root, f.model, g => { g.images[0].uri = '../../../../../../../outside.png'; }), /outside owner/u],
  ['GLB encoded URI traversal', f => mutateGlb(f.root, f.model, g => { g.images[0].uri = '%2fetc%2fimage.png'; }), /decoded image URI/u],
  ['GLB missing image', f => mutateGlb(f.root, f.model, g => { g.images[0].uri = 'T_Missing_BC.png'; }), /outside owner/u],
  ['normal material using sRGB source', f => mutateGlb(f.root, f.model, g => { g.materials[0].normalTexture = { index: 0 }; }), /requires linear/u],
  ['serialized normal material using sRGB source', f => edit(f.root, f.material, m => { m._props[0].normalMap = m._props[0].mainTexture; }), /normalMap requires linear/u],
  ['CPU data kept on static', f => modelEdit(f, d => { d.allowMeshDataAccess = true; }), /allowMeshDataAccess/u],
  ['CPU data omitted on static uses engine true default', f => modelEdit(f, d => { delete d.allowMeshDataAccess; }), /allowMeshDataAccess/u],
  ['LOD importer enabled', f => modelEdit(f, d => { d.lods.enable = true; }), /lods.enable/u],
  ['mount animations disabled', f => modelEdit(f, d => { d.mountAllAnimationsOnPrefab = false; }), /mountAllAnimations/u],
  ['meshOptimize enabled', f => modelEdit(f, d => { d.meshOptimize = { enable: true }; }), /meshOptimize/u],
  ['meshSimplify enabled', f => modelEdit(f, d => { d.meshSimplify = { enable: true }; }), /meshSimplify/u],
  ['vertex color enabled', f => modelEdit(f, d => { d.addVertexColor = true; }), /addVertexColor/u],
  ['scale changed', f => modelEdit(f, d => { d.scale = 2; }), /scale/u],
  ['generate UV enabled', f => modelEdit(f, d => { d.generateLightmapUVNode = true; }), /generateLightmapUV/u],
  ['normals override', f => modelEdit(f, d => { d.normals = 3; }), /normals/u],
  ['tangents override', f => modelEdit(f, d => { d.tangents = 0; }), /tangents/u],
  ['unknown UUID', f => edit(f.root, f.material, m => { m._props[0].mainTexture.__uuid__ = uuid('missing'); }), /悬空/u],
  ['compressed missing UUID', f => edit(f.root, f.material, m => { m._props[0].mainTexture.__uuid__ = 'fcmR3XADNLgJ1ByKhqcC5Z@abcde'; }), /悬空/u],
  ['fake builtin', f => edit(f.root, f.material, m => { m._effectAsset.__uuid__ = '00000000-0000-0000-0000-000000000001'; }), /悬空/u],
  ['unregistered host scene', f => { const host = 'apps/Cocos/assets/stage3d-dev.scene'; write(f.root, host, json({})); meta(f.root, host, 'scene'); edit(f.root, f.material, m => { m._props[0].mainTexture.__uuid__ = uuid(host); }); }, /悬空/u],
  ['budget single GLB', f => edit(f.root, f.configPath, c => { c.budgets.maxGlbBytes = 1; }), /single GLB/u],
  ['budget single PNG', f => edit(f.root, f.configPath, c => { c.budgets.maxPngBytes = 1; }), /single PNG/u],
  ['budget all textures', f => edit(f.root, f.configPath, c => { c.budgets.texturesBytes = 1; }), /texturesBytes budget/u],
  ['budget package aggregate', f => edit(f.root, f.configPath, c => { c.budgets.totalBytes = 1; }), /totalBytes budget/u],
  ['package raises frozen limit', f => edit(f.root, f.configPath, c => { c.budgets.totalBytes = 64000001; }), /frozen ceiling/u],
  ['missing config', f => fs.unlinkSync(path.join(f.root, f.configPath)), /missing file/u],
  ['missing licenses', f => fs.unlinkSync(path.join(f.root, f.author, 'LICENSES.md')), /missing file/u],
  ['missing extracted image license row', f => write(f.root, `${f.author}/LICENSES.md`, fs.readFileSync(path.join(f.root, f.author, 'LICENSES.md'), 'utf8').replace('`' + f.texture + '`', 'removed')), /LICENSES.md must cover/u],
  ['missing provenance entry', f => edit(f.root, f.configPath, c => { c.provenance = c.provenance.filter(p => p.path !== f.texture); }), /missing provenance/u],
  ['dangling source mapping', f => edit(f.root, f.configPath, c => { c.provenance[0].sources = ['missing-source.glb']; }), /dangling provenance/u],
  ['cyclic source mapping', f => edit(f.root, f.configPath, c => { c.provenance[0].sources = [c.provenance[0].path]; }), /cyclic provenance/u],
  ['unlicensed author input', f => write(f.root, `${f.author}/T_New_BC.png`, png()), /missing provenance/u],
  ['directory meta deleted', f => fs.unlinkSync(path.join(f.root, `${f.base}/3d/models.meta`)), /invalid JSON/u],
  ['bundle root meta deleted', f => fs.unlinkSync(path.join(f.root, f.base + '.meta')), /missing file/u],
  ['orphan meta', f => meta(f.root, `${f.base}/3d/models/missing.glb`, 'gltf'), /orphan/u],
  ['meta masquerading as source', f => meta(f.root, f.texture + '.meta', 'image'), /companion/u],
  ['asset symlink', f => { fs.unlinkSync(path.join(f.root, f.texture)); fs.symlinkSync(path.join(f.root, f.source), path.join(f.root, f.texture)); }, /symlinks/u],
  ['malformed bundle owner', f => directory(f.root, 'apps/Cocos/assets/bundles/kit-foo-'), /unowned/u],
  ['unknown bundle owner', f => directory(f.root, 'apps/Cocos/assets/bundles/kit-missing'), /missing file/u],
  ['bundle source outside 3d', f => { const file = `${f.base}/extra.json`; write(f.root, file, json({})); meta(f.root, file, 'json'); }, /under 3d/u],
  ['heavy package asset under resources', f => { const file = 'apps/Cocos/assets/resources/kits/foo/3d/models/SM_Test.glb'; write(f.root, file, fs.readFileSync(path.join(f.root, f.model))); meta(f.root, file, 'gltf'); }, /heavy assets/u],
  ['bundle root name alias', f => edit(f.root, f.base + '.meta', m => { m.userData.bundleName = 'kit-foobar'; }), /bundleName/u],
  ['unregistered extension', f => { const file = `${f.base}/3d/data/source.blend`; directory(f.root, path.posix.dirname(file)); write(f.root, file, Buffer.from('BLENDER')); meta(f.root, file, 'unknown'); }, /format not allowed/u],
  ['unknown exception policy', f => edit(f.root, f.configPath, c => { c.exceptions.push({ path: f.texture, uuid: uuid(f.texture), sha256: hash(fs.readFileSync(path.join(f.root, f.texture))), reason: 'bad', rules: { allTextures: true } }); }), /unknown exception rule/u],
];
for (const [name, mutate, expected] of cases) test(`reject ${name}`, () => withFixture(f => { mutate(f); assert.throws(() => verifyAssets3d(f.root), expected); }));

test('actual skinned JOINTS/WEIGHTS require CPU retention regardless of filename', () => withFixture(f => {
  const file = addSkinned(f);
  assert.doesNotThrow(() => verifyAssets3d(f.root));
  edit(f.root, file + '.meta', m => { m.userData.allowMeshDataAccess = false; });
  assert.throws(() => verifyAssets3d(f.root), /allowMeshDataAccess/u);
}));
test('skinned data cannot be hidden behind a static filename; CPU budget is enforced', () => withFixture(f => {
  const file = addSkinned(f);
  edit(f.root, f.configPath, c => { c.models[file].cpuDataBudgetBytes = 1; });
  assert.throws(() => verifyAssets3d(f.root), /CPU mesh data/u);
  edit(f.root, f.configPath, c => { c.models[file].cpuDataBudgetBytes = 32768; });
  const rename = file.replaceAll('SK_Test', 'SM_Skinned');
  directory(f.root, path.posix.dirname(rename));
  write(f.root, rename, fs.readFileSync(path.join(f.root, file))); write(f.root, rename + '.meta', fs.readFileSync(path.join(f.root, file + '.meta')));
  fs.unlinkSync(path.join(f.root, file)); fs.unlinkSync(path.join(f.root, file + '.meta'));
  edit(f.root, f.configPath, c => { c.models[rename] = c.models[file]; delete c.models[file]; c.provenance.find(p => p.path === file).path = rename; }); f.ledger();
  assert.throws(() => verifyAssets3d(f.root), /actual static\/skinned/u);
}));
test('exact static CPU tool exception needs matching bytes, identity, reason and CPU allocation', () => withFixture(f => {
  modelEdit(f, d => { d.allowMeshDataAccess = true; });
  edit(f.root, f.configPath, c => {
    c.exceptions.push({ path: f.model, uuid: uuid(f.model), sha256: hash(fs.readFileSync(path.join(f.root, f.model))), reason: 'CPU readback tool fixture', rules: { staticCpuAccess: true } });
    Object.assign(c.models[f.model], { cpuDataBudgetBytes: 2048, cpuReason: 'CPU readback tooling only' });
  });
  assert.doesNotThrow(() => verifyAssets3d(f.root));
  mutateGlb(f.root, f.model, g => { g.asset.generator = 'changed'; });
  assert.throws(() => verifyAssets3d(f.root), /identity changed/u);
}));
test('same-owner exact sampler exception does not spread to GLB sampler or changed meta', () => withFixture(f => {
  imageEdit(f, s => { s.mipfilter = 'none'; });
  edit(f.root, f.configPath, c => { c.exceptions.push({ path: f.texture, uuid: uuid(f.texture), textureUuid: uuid(f.texture) + '@6c48a', sha256: hash(fs.readFileSync(path.join(f.root, f.texture))), metaSha256: hash(fs.readFileSync(path.join(f.root, f.texture + '.meta'))), reason: 'fixed-distance test', usage: 'surface', rules: { sampler: { mipfilter: 'none' } } }); });
  assert.doesNotThrow(() => verifyAssets3d(f.root));
  modelEdit(f, (d, m) => { m.subMetas['78a7d'].userData.mipfilter = 'none'; });
  assert.throws(() => verifyAssets3d(f.root), /mipfilter/u);
}));
test('foo and foobar are separate owners for UUID and URI dependencies even with requires.kits', () => withFixture(f => {
  const other = fixture(f.root, 'plugin', 'foobar');
  edit(f.root, 'apps/plugins/foobar/plugin.json', m => { m.requires.kits = { foo: { content: 1 } }; });
  assert.equal(verifyAssets3d(f.root).owners.length, 2);
  edit(f.root, other.prefab, p => { p[1].material.__uuid__ = uuid(f.material); });
  assert.throws(() => verifyAssets3d(f.root), /跨包/u);
  edit(f.root, other.prefab, p => { p[1].material.__uuid__ = uuid(other.material); });
  edit(f.root, f.prefab, p => { p[1].material.__uuid__ = uuid(other.material); });
  assert.throws(() => verifyAssets3d(f.root), /跨包/u);
  edit(f.root, f.prefab, p => { p[1].material.__uuid__ = uuid(f.material); });
  mutateGlb(f.root, f.model, g => { g.images[0].uri = '../../../../plugin-foobar-detail/3d/textures/T_Test_BC.png'; });
  assert.throws(() => verifyAssets3d(f.root), /outside owner/u);
}));
test('framework exceptions reject changed PNG/metadata, and lightmaps count against their own budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assets3d-sc0-'));
  try {
    for (const file of [CONFIG, 'apps/Cocos/package.json', 'apps/Cocos/settings/v2/packages/builder.json', FRAME + '.meta']) write(root, file, fs.readFileSync(path.join(REPO, file)));
    fs.cpSync(path.join(REPO, FRAME), path.join(root, FRAME), { recursive: true });
    assert.doesNotThrow(() => verifyAssets3d(root));
    edit(root, CONFIG, c => { c.framework.budgets.lightmapsBytes = 1; });
    assert.throws(() => verifyAssets3d(root), /lightmapsBytes budget/u);
    write(root, CONFIG, fs.readFileSync(path.join(REPO, CONFIG)));
    const lightmap = `${FRAME}/lightmaps/LightFX/output/LFX_Mesh_0000.png`, original = fs.readFileSync(path.join(root, lightmap + '.meta'));
    edit(root, lightmap + '.meta', m => { m.userData.newSetting = true; });
    assert.throws(() => verifyAssets3d(root), /meta SHA identity/u); write(root, lightmap + '.meta', original);
    write(root, lightmap, png(1024)); assert.throws(() => verifyAssets3d(root), /identity changed/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('linear ORM metadata and shader slot policy reject sRGB image encoding', () => withFixture(f => {
  const texture = f.texture.replace('_BC.png', '_ORM.png');
  write(f.root, texture, png()); textureMeta(f.root, texture);
  edit(f.root, f.configPath, c => {
    c.textures[texture] = { usage: 'surface', sampling: 'tiling', colorSpace: 'linear' };
    c.provenance.push({ path: texture, sources: [], origin: 'Procedural', license: 'self-authored', transform: 'Generated' });
  }); f.ledger();
  edit(f.root, f.material, m => { m._props[0].pbrMap = { __uuid__: uuid(texture) + '@6c48a' }; });
  assert.doesNotThrow(() => verifyAssets3d(f.root));
  write(f.root, texture, png(256, 256, true));
  assert.throws(() => verifyAssets3d(f.root), /sRGB\/gamma/u);
}));
test('FBX exception pins actual binary identity and both FBX-only import options', () => withFixture(f => {
  const file = `${f.base}/3d/models/SM_Fbx/SM_Fbx.fbx`;
  directory(f.root, path.posix.dirname(file));
  const header = Buffer.concat([Buffer.from('Kaydara FBX Binary  \0\x1a\0', 'binary'), Buffer.alloc(80)]);
  header.writeUInt32LE(7400, 23); write(f.root, file, header);
  const subs = {};
  for (const [id, importer] of [['aaa', 'gltf-mesh'], ['bbb', 'gltf-scene']]) subs[id] = { ver: '1.0.0', imported: true, uuid: uuid(file) + '@' + id, id, importer, userData: { gltfIndex: 0, triangleCount: 12 }, subMetas: {} };
  meta(f.root, file, 'fbx', { allowMeshDataAccess: false, legacyFbxImporter: false, smartMaterialEnabled: true }, subs);
  edit(f.root, f.configPath, c => {
    c.models[file] = { category: 'world' }; c.provenance.push({ path: file, sources: [], origin: 'Synthetic metadata fixture only', license: 'self-authored', transform: 'Generated; not a Creator load claim' });
  }); f.ledger();
  assert.throws(() => verifyAssets3d(f.root), /FBX requires exact exception/u);
  edit(f.root, f.configPath, c => { c.exceptions.push({ path: file, uuid: uuid(file), sha256: hash(fs.readFileSync(path.join(f.root, file))), reason: 'Synthetic policy fixture', rules: { fbx: true } }); });
  assert.doesNotThrow(() => verifyAssets3d(f.root));
  for (const [option, value] of [['legacyFbxImporter', true], ['smartMaterialEnabled', false]]) {
    const original = fs.readFileSync(path.join(f.root, file + '.meta'));
    edit(f.root, file + '.meta', m => { m.userData[option] = value; });
    assert.throws(() => verifyAssets3d(f.root), new RegExp(option)); write(f.root, file + '.meta', original);
  }
}));
test('CLI fails closed and succeeds on the same independent fixture', () => withFixture(f => {
  const script = path.join(REPO, 'scripts/verify-assets3d.mjs');
  const run = () => spawnSync(process.execPath, [script, '--root', f.root, '--json'], { encoding: 'utf8' });
  const good = run(); assert.equal(good.status, 0, good.stderr); assert.ok(JSON.parse(good.stdout).assets > 0);
  fs.unlinkSync(path.join(f.root, f.model + '.meta')); const bad = run(); assert.equal(bad.status, 1); assert.match(bad.stderr, /悬空|JSON/u);
}));
