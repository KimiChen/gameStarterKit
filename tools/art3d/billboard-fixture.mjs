/** Self-authored SC4-B3 far-LOD greybox. Borrow the existing checked checker texture. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.join(root, 'apps/Cocos/assets/resources/stage3d');
const name = 'P_Stage3d_Billboard';
const meta = JSON.parse(fs.readFileSync(path.join(folder, 'T_Greybox_Checker_BC.png.meta'), 'utf8'));
const texture = Object.values(meta.subMetas).find(sub => sub.importer === 'texture');
if (!texture?.uuid) throw new Error('Imported checker texture required');
const prefab = [
  { __type__: 'cc.Prefab', _name: name, data: { __id__: 1 }, optimizationPolicy: 0, persistent: false },
  { __type__: 'cc.Node', _name: name, _parent: null, _children: [], _active: true,
    _components: [{ __id__: 2 }], _prefab: { __id__: 3 },
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _layer: 1 },
  { __type__: 'cc.Billboard', node: { __id__: 1 }, _enabled: true,
    _texture: { __uuid__: texture.uuid, __expectedType__: 'cc.Texture2D' }, _width: 1.5, _height: 2 },
  { __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __id__: 0 }, fileId: 'stage3d-greybox-billboard' },
];
const target = path.join(folder, `${name}.prefab`), bytes = JSON.stringify(prefab, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== bytes) throw new Error('Billboard fixture differs from its generator');
} else fs.writeFileSync(target, bytes);
