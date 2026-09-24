"""SC5 offline GLB primitives and configuration. No engine/runtime dependency."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
from urllib.parse import unquote, urlsplit

import jsonschema
import numpy as np

HERE = Path(__file__).resolve().parent
DTYPES = {5121: '<u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, data):
    atomic_write(path, (json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode())


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.art3d-tmp')
    temporary.write_bytes(data)
    temporary.replace(path)


def read_config(path):
    path = Path(path).resolve()
    value = json.loads(path.read_text())
    jsonschema.Draft202012Validator(json.loads((HERE / 'conversion.schema.json').read_text())).validate(value)
    value = copy.deepcopy(value)
    for key in ('workDir', 'outputDir'):
        value[key] = (path.parent / value[key]).resolve()
    value['source']['path'] = (path.parent / value['source']['path']).resolve()
    source = value['source']['path']
    require(source.is_file(), f'Source missing: {source}')
    require(not source.is_relative_to(value['workDir']) and not source.is_relative_to(value['outputDir']),
            'Source must be outside work/output directories (read-only source boundary)')
    require(value['workDir'] != value['outputDir'], 'workDir and outputDir must differ')
    value['_path'] = path
    return value


def run_cli(step):
    parser = argparse.ArgumentParser(description=step.__doc__)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    try:
        cfg = read_config(args.config)
        before = sha(cfg['source']['path'])
        result = step(cfg)
        require(sha(cfg['source']['path']) == before, 'Read-only source changed during conversion')
        print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    except (ValueError, OSError, KeyError, jsonschema.ValidationError) as error:
        print(f'art3d: {error}', file=sys.stderr)
        raise SystemExit(1) from error


def relative_image(base, uri, owner=None):
    """Only canonical local relative PNGs inside the explicitly supplied asset root."""
    parsed = urlsplit(uri)
    require(not parsed.scheme and not parsed.netloc and not parsed.query and not parsed.fragment,
            f'Nonlocal image URI: {uri}')
    decoded = unquote(uri)
    require(decoded and not Path(decoded).is_absolute() and '\\' not in decoded and '\x00' not in decoded,
            f'Unsafe image URI: {uri}')
    root = Path(owner or base).resolve()
    target = (Path(base) / decoded).resolve()
    require(target.is_relative_to(root), f'Image URI leaves asset root: {uri}')
    require(target.is_file(), f'Missing image: {uri}')
    require(target.suffix.lower() == '.png', f'External image must be PNG: {uri}')
    return target


class Glb:
    def __init__(self, document=None, blob=b''):
        self.doc = document or {'asset': {'version': '2.0', 'generator': 'gono art3d SC5'},
                                'buffers': [{'byteLength': 0}], 'bufferViews': [], 'accessors': []}
        self.blob = bytearray(blob)

    @classmethod
    def load(cls, path):
        data = Path(path).read_bytes()
        require(len(data) >= 28, 'Truncated GLB')
        magic, version, size = struct.unpack_from('<4sII', data)
        require(magic == b'glTF' and version == 2 and size == len(data), 'Invalid GLB header')
        chunks = []
        cursor = 12
        while cursor < len(data):
            require(cursor + 8 <= len(data), 'Truncated GLB chunk')
            length, kind = struct.unpack_from('<I4s', data, cursor)
            cursor += 8
            require(length % 4 == 0 and cursor + length <= len(data), 'GLB chunk bounds/alignment')
            chunks.append((kind, data[cursor:cursor + length]))
            cursor += length
        require(len(chunks) == 2 and chunks[0][0] == b'JSON' and chunks[1][0] == b'BIN\0',
                'Expected GLB JSON + BIN only')
        doc = json.loads(chunks[0][1])
        require(doc.get('asset', {}).get('version') == '2.0', 'Expected glTF 2.0')
        require(len(doc.get('buffers', [])) == 1 and 'uri' not in doc['buffers'][0], 'External/multiple buffers unsupported')
        length = doc['buffers'][0]['byteLength']
        require(0 <= len(chunks[1][1]) - length <= 3, 'BIN byteLength mismatch')
        result = cls(doc, chunks[1][1][:length])
        for index in range(len(doc.get('accessors', []))):
            result.array(index)
        return result

    def array(self, index):
        require(isinstance(index, int) and 0 <= index < len(self.doc['accessors']), 'Invalid accessor index')
        item = self.doc['accessors'][index]
        require(not item.get('sparse') and not item.get('normalized'), 'Sparse/normalized accessors unsupported; export float attributes')
        require(item.get('componentType') in DTYPES and item.get('type') in WIDTHS, 'Unsupported accessor type')
        view_id = item.get('bufferView')
        require(isinstance(view_id, int) and 0 <= view_id < len(self.doc['bufferViews']), 'Invalid bufferView')
        view = self.doc['bufferViews'][view_id]
        require(view.get('buffer') == 0, 'External buffer unsupported')
        dtype = np.dtype(DTYPES[item['componentType']])
        width = WIDTHS[item['type']]
        count = item['count']
        stride = view.get('byteStride', width * dtype.itemsize)
        offset = item.get('byteOffset', 0)
        start, length = view.get('byteOffset', 0), view['byteLength']
        require(isinstance(count, int) and count > 0 and stride >= width * dtype.itemsize
                and stride % dtype.itemsize == 0 and start >= 0 and offset >= 0
                and start + length <= len(self.blob)
                and offset + (count - 1) * stride + width * dtype.itemsize <= length,
                'Accessor out of buffer bounds')
        value = np.ndarray((count, width), dtype=dtype, buffer=self.blob, offset=start + offset,
                           strides=(stride, dtype.itemsize)).copy()
        require(np.isfinite(value).all(), 'Nonfinite accessor values')
        return value

    def add_view(self, data, target=None):
        self.blob += b'\0' * (-len(self.blob) % 4)
        view = {'buffer': 0, 'byteOffset': len(self.blob), 'byteLength': len(data)}
        if target is not None:
            view['target'] = target
        self.doc['bufferViews'].append(view)
        self.blob += data
        return len(self.doc['bufferViews']) - 1

    def add(self, values, shape, component=5126, target=None, bounds=False):
        values = np.asarray(values, dtype=DTYPES[component]).reshape((-1, WIDTHS[shape]))
        require(len(values) > 0 and np.isfinite(values).all(), 'Empty/nonfinite accessor')
        view = self.add_view(values.tobytes(), target)
        item = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': shape}
        if bounds:
            item.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        self.doc['accessors'].append(item)
        return len(self.doc['accessors']) - 1

    def encode(self):
        self.doc['buffers'] = [{'byteLength': len(self.blob)}]
        document = json.dumps(self.doc, separators=(',', ':'), allow_nan=False).encode()
        document += b' ' * (-len(document) % 4)
        binary = bytes(self.blob) + b'\0' * (-len(self.blob) % 4)
        return (struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(binary))
                + struct.pack('<I4s', len(document), b'JSON') + document
                + struct.pack('<I4s', len(binary), b'BIN\0') + binary)

    def save(self, path):
        atomic_write(path, self.encode())

    def packed(self):
        """Drop unreferenced buffers, including externalized image payloads."""
        doc = copy.deepcopy(self.doc)
        doc['bufferViews'], doc['accessors'] = [], []
        out = Glb(doc)
        mapped = {}
        def remap(index):
            if index not in mapped:
                original = self.doc['accessors'][index]
                mapped[index] = out.add(self.array(index), original['type'], original['componentType'],
                                        bounds=bool(original.get('min')))
            return mapped[index]
        for mesh in doc.get('meshes', []):
            for p in mesh['primitives']:
                p['indices'] = remap(p['indices'])
                p['attributes'] = {k: remap(v) for k, v in p['attributes'].items()}
        for skin in doc.get('skins', []):
            skin['inverseBindMatrices'] = remap(skin['inverseBindMatrices'])
        for animation in doc.get('animations', []):
            for sampler in animation['samplers']:
                sampler['input'], sampler['output'] = remap(sampler['input']), remap(sampler['output'])
        for image in doc.get('images', []):
            require('bufferView' not in image, 'Externalize images before repacking')
        return out


def validate_model(glb, path=None):
    """Fail closed on data the offline pipeline cannot preserve."""
    d = glb.doc
    def extensions(value):
        if isinstance(value, dict):
            require(not value.get('extensions'), 'glTF extensions unsupported; use a baked/manual variant')
            for child in value.values(): extensions(child)
        elif isinstance(value, list):
            for child in value: extensions(child)
    extensions(d)
    require(not d.get('extensionsRequired') and not d.get('extensionsUsed'), 'glTF extensions unsupported')
    require(d.get('meshes') and d.get('nodes') and len(d.get('scenes', [])) == 1, 'Expected one nonempty scene')
    visited = set()
    def visit(index):
        require(isinstance(index,int) and 0 <= index < len(d['nodes']) and index not in visited,
                'Invalid/cyclic/shared scene node')
        visited.add(index)
        node = d['nodes'][index]
        require('matrix' not in node, 'Matrix nodes unsupported; export TRS')
        require(np.allclose(np.linalg.norm(node.get('rotation',[0,0,0,1])),1,atol=1e-4), 'Invalid node quaternion')
        require(all(math.isfinite(v) for k in ('translation','rotation','scale') for v in node.get(k,[])), 'Nonfinite node transform')
        if 'mesh' in node: require(0 <= node['mesh'] < len(d['meshes']), 'Invalid mesh binding')
        for child in node.get('children',[]): visit(child)
    for index in d['scenes'][0]['nodes']: visit(index)
    require(len(visited) == len(d['nodes']), 'Orphan hierarchy nodes')
    rows = []
    mesh_skin = {}
    for node in d['nodes']:
        if 'skin' in node:
            require(0 <= node['skin'] < len(d.get('skins', [])), 'Missing skin')
            require('mesh' in node, 'Skinned node lacks mesh')
            mesh_skin.setdefault(node['mesh'], set()).add(node['skin'])
    for mi, mesh in enumerate(d['meshes']):
        require(not mesh.get('weights'), 'Morph weights unsupported; use manual variant')
        for pi, p in enumerate(mesh['primitives']):
            require(p.get('mode', 4) == 4 and not p.get('targets'), 'Only TRIANGLES without morph targets supported')
            attrs = {k: glb.array(v) for k, v in p['attributes'].items()}
            expected = {'POSITION': 3, 'NORMAL': 3, 'TANGENT': 4, 'TEXCOORD_0': 2, 'TEXCOORD_1': 2}
            require(set(expected) <= set(attrs) <= set(expected) | {'JOINTS_0', 'WEIGHTS_0'},
                    'Require POSITION/NORMAL/TANGENT/UV0/UV1; unsupported vertex attributes')
            count = len(attrs['POSITION'])
            require(0 < count <= 65000 and all(len(a) == count for a in attrs.values()), 'Vertex count/budget mismatch')
            for k, w in expected.items():
                require(attrs[k].shape == (count, w), f'{k} shape mismatch')
            indices = glb.array(p['indices']).ravel()
            require(glb.doc['accessors'][p['indices']]['componentType'] in (5121, 5123, 5125)
                    and len(indices) % 3 == 0 and indices.max() < count, 'Invalid triangle indices')
            require(0 <= p.get('material', -1) < len(d.get('materials', [])), 'Missing material slot')
            triangles = indices.reshape(-1,3)
            points = attrs['POSITION'][triangles].astype(np.float64)
            normal = np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0])
            require((np.linalg.norm(normal,axis=1) > 1e-12).all()
                    and ((normal * attrs['NORMAL'][triangles].mean(axis=1)).sum(axis=1) > 0).all(),
                    'Degenerate/reversed triangle winding')
            require(np.allclose(np.linalg.norm(attrs['NORMAL'], axis=1), 1, atol=1e-3), 'Invalid unit normals')
            require(np.allclose(np.linalg.norm(attrs['TANGENT'][:, :3], axis=1), 1, atol=1e-3)
                    and np.allclose(np.abs(attrs['TANGENT'][:, 3]), 1), 'Invalid tangents')
            skin = mesh_skin.get(mi)
            require(('JOINTS_0' in attrs) == ('WEIGHTS_0' in attrs) == bool(skin), 'Lost/orphan skin attributes')
            if skin:
                joints, weights = attrs['JOINTS_0'], attrs['WEIGHTS_0']
                require(joints.shape == weights.shape == (count, 4), 'Skin needs four influence slots')
                require(glb.doc['accessors'][p['attributes']['JOINTS_0']]['componentType'] in (5121, 5123), 'Joints must be integers')
                require((weights >= 0).all() and np.allclose(weights.sum(axis=1), 1, atol=1e-5), 'Invalid bone weights')
                for sid in skin:
                    require(joints.max() < len(d['skins'][sid]['joints']), 'Bone index out of range')
            used = attrs['POSITION'][np.unique(indices)]
            rows.append({'mesh': mi, 'primitive': pi, 'triangles': len(indices) // 3, 'vertices': count,
                         'material': p['material'], 'bounds': [used.min(axis=0).tolist(), used.max(axis=0).tolist()]})
    for skin in d.get('skins', []):
        joints = skin['joints']
        require(joints and len(set(joints)) == len(joints) and all(0 <= j < len(d['nodes']) for j in joints), 'Invalid skeleton nodes')
        require(glb.array(skin['inverseBindMatrices']).shape == (len(joints), 16), 'Lost inverse bind matrices')
    channels = []
    for animation in d.get('animations', []):
        seen = set()
        require(animation.get('channels'), 'Empty animation')
        for channel in animation['channels']:
            target = channel['target']; key = (target['node'], target['path'])
            require(key not in seen and 0 <= key[0] < len(d['nodes']) and key[1] in ('translation', 'rotation', 'scale'), 'Invalid/duplicate animation binding')
            seen.add(key)
            sampler = animation['samplers'][channel['sampler']]
            require(sampler.get('interpolation', 'LINEAR') in ('LINEAR', 'CUBICSPLINE', 'STEP'), 'Unsupported animation interpolation')
            times = glb.array(sampler['input']).ravel()
            require(len(times) >= 2 and times[0] >= 0 and (np.diff(times) > 0).all(), 'Invalid animation times')
            output = glb.array(sampler['output'])
            multiplier = 3 if sampler.get('interpolation') == 'CUBICSPLINE' else 1
            require(output.shape == (len(times) * multiplier, 4 if key[1] == 'rotation' else 3), 'Lost animation samples')
            if key[1] == 'rotation':
                values = output[1::3] if multiplier == 3 else output
                require(np.allclose(np.linalg.norm(values, axis=1), 1, atol=1e-4), 'Invalid rotation keyframes')
            channels.append({'name': animation.get('name'), 'target': target, 'start': float(times[0]), 'duration': float(times[-1] - times[0])})
    if path is not None:
        for image in d.get('images', []):
            require('bufferView' not in image and 'uri' in image, 'Embedded/missing image')
            relative_image(Path(path).parent, image['uri'])
    for texture in d.get('textures',[]):
        require(0 <= texture.get('source',-1) < len(d.get('images',[])), 'Missing texture image')
    for material in d.get('materials',[]):
        texture = material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
        if texture: require(0 <= texture['index'] < len(d.get('textures',[])), 'Missing material texture')
    return {'primitives': rows, 'triangles': sum(p['triangles'] for p in rows),
            'bones': [len(s['joints']) for s in d.get('skins', [])], 'animations': channels,
            'images': [i.get('uri') for i in d.get('images', [])]}
