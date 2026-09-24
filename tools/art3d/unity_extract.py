"""Read a selected hierarchy from one Unity serialized file; never modify source assets."""
import io
from pathlib import Path
import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from pipeline import atomic_write, require, sha, write_json


def vec(value, keys='xyz'):
    return [value[k] for k in keys]


def extract(cfg):
    """Extract Unity Mesh/Transform/Material/Texture2D and explicit legacy TRS curves."""
    source = cfg['source']['path']
    env = UnityPy.load(str(source))
    roots = [o for o in env.objects if o.path_id == cfg['source']['rootGameObject'] and o.type.name == 'GameObject']
    require(len(roots) == 1, 'rootGameObject must uniquely select one serialized file')
    objects = roots[0].assets_file.objects
    cache = {}
    def obj(pid, kind=None):
        require(pid in objects, f'Missing Unity object {pid}')
        if kind: require(objects[pid].type.name == kind, f'Object {pid} must be {kind}')
        if pid not in cache: cache[pid] = objects[pid].read_typetree()
        return cache[pid]
    def ref(pointer, kind=None):
        require(pointer['m_FileID'] == 0, 'External Unity PPtr unsupported; re-export a self-contained asset')
        pid = pointer['m_PathID']
        obj(pid, kind)
        return pid
    def components(go):
        return [ref(c['component']) for c in obj(go, 'GameObject')['m_Component']]
    root = cfg['source']['rootGameObject']
    root_transform = [p for p in components(root) if objects[p].type.name == 'Transform']
    require(len(root_transform) == 1, 'Root requires one Transform')
    nodes, node_ids, paths, renderers = [], {}, {}, []
    supported = {'Transform', 'MeshFilter', 'MeshRenderer', 'SkinnedMeshRenderer', 'Animation'}
    def visit(tid, parent_path):
        require(tid not in node_ids, 'Cyclic/shared transform hierarchy')
        transform = obj(tid, 'Transform')
        go_id = ref(transform['m_GameObject'], 'GameObject')
        go = obj(go_id)
        require(go['m_IsActive'], 'Inactive GameObject unsupported; export the intended static hierarchy')
        path = '/'.join(p for p in (parent_path, go['m_Name']) if p) if parent_path is not None else ''
        require(path not in paths, 'Duplicate animation hierarchy path')
        index = len(nodes); node_ids[tid] = index; paths[path] = index
        scale = vec(transform['m_LocalScale'])
        require(all(v > 0 for v in scale), 'Zero/negative Unity scale unsupported')
        node = {'name': go['m_Name'], 'translation': vec(transform['m_LocalPosition']),
                'rotation': vec(transform['m_LocalRotation'], 'xyzw'), 'scale': scale}
        nodes.append(node)
        parts = components(go_id)
        require(all(objects[p].type.name in supported for p in parts),
                f'Unsupported component on {go["m_Name"]}; scripts/particles/constraints need manual work')
        rs = [p for p in parts if objects[p].type.name in ('MeshRenderer', 'SkinnedMeshRenderer')]
        require(len(rs) <= 1, 'Multiple renderers on a node unsupported')
        if rs: renderers.append((index, rs[0], parts))
        children = []
        for child in transform['m_Children']:
            cid = ref(child, 'Transform')
            require(obj(cid)['m_Father'] == {'m_FileID': 0, 'm_PathID': tid}, 'Transform parent/child mismatch')
            children.append(visit(cid, path))
        if children: node['children'] = children
        return index
    visit(root_transform[0], None)
    materials, material_ids, images, image_ids, meshes, skins = [], {}, [], {}, [], []
    work = cfg['workDir']; work.mkdir(parents=True, exist_ok=True)
    def material(mid):
        if mid in material_ids: return material_ids[mid]
        raw = obj(mid, 'Material')
        shader = obj(ref(raw['m_Shader'], 'Shader'))['m_Name']
        require(not raw['m_ShaderKeywords'] and not raw.get('disabledShaderPasses'), 'Shader keywords/passes unsupported')
        saved = raw['m_SavedProperties']
        floats, colors, textures = dict(saved['m_Floats']), dict(saved['m_Colors']), dict(saved['m_TexEnvs'])
        require(set(floats) <= {'_Metallic', '_Glossiness', '_Mode', '_Cutoff'}, 'Unmapped material float property')
        require(set(colors) <= {'_Color', '_EmissionColor'}, 'Unmapped material color property')
        require(floats.get('_Mode', 0) == 0, 'Only opaque Standard materials supported')
        require(all(v == 0 for v in vec(colors.get('_EmissionColor', dict(r=0,g=0,b=0,a=0)), 'rgb')), 'Emission requires manual mapping')
        require(all(k == '_MainTex' or v['m_Texture']['m_PathID'] == 0 for k,v in textures.items()), 'Unmapped texture channel')
        value = {'name': raw['m_Name'], 'shader': shader, 'baseColor': vec(colors.get('_Color', dict(r=1,g=1,b=1,a=1)), 'rgba'),
                 'metallic': floats.get('_Metallic', 0), 'roughness': 1 - floats.get('_Glossiness', 0.5)}
        tex = textures.get('_MainTex')
        if tex and tex['m_Texture']['m_PathID']:
            require(vec(tex['m_Scale'], 'xy') == [1,1] and vec(tex['m_Offset'], 'xy') == [0,0], 'Texture scale/offset requires baking UVs')
            iid = ref(tex['m_Texture'], 'Texture2D')
            if iid not in image_ids:
                texture = objects[iid].read()
                require(texture.m_TextureDimension == 2 and texture.m_ImageCount == 1, 'Only 2D textures supported')
                require(not texture.m_StreamData or not texture.m_StreamData.path, 'External streamed texture unsupported')
                data = io.BytesIO(); texture.image.convert('RGBA').save(data, format='PNG')
                image_ids[iid] = len(images)
                name = f'texture-{iid}.png'; atomic_write(work / name, data.getvalue())
                images.append({'file': name, 'name': texture.m_Name, 'sourcePathId': iid, 'sha256': sha(work/name)})
            value['baseColorImage'] = image_ids[iid]
        material_ids[mid] = len(materials); materials.append(value)
        return material_ids[mid]
    for node_index, rid, parts in renderers:
        renderer = obj(rid)
        require(renderer['m_Enabled'] and not renderer.get('m_BlendShapeWeights'), 'Disabled renderer/blendshapes unsupported')
        if objects[rid].type.name == 'SkinnedMeshRenderer':
            mid = ref(renderer['m_Mesh'], 'Mesh')
        else:
            filters = [p for p in parts if objects[p].type.name == 'MeshFilter']
            require(len(filters) == 1, 'MeshRenderer needs MeshFilter')
            mid = ref(obj(filters[0])['m_Mesh'], 'Mesh')
        raw = obj(mid, 'Mesh')
        require(not any(raw['m_Shapes'].values()), 'Blendshape mesh unsupported; author manual variants')
        require(not raw.get('m_StreamData', {}).get('path'), 'External streamed mesh unsupported; export self-contained data')
        parsed = objects[mid].read(); handler = MeshHandler(parsed); handler.process()
        require(not handler.m_Colors and not any(getattr(handler, f'm_UV{i}') for i in range(2,8)), 'Extra vertex colors/UV channels unsupported')
        attrs = {'POSITION': handler.m_Vertices, 'NORMAL': handler.m_Normals, 'TANGENT': handler.m_Tangents,
                 'TEXCOORD_0': handler.m_UV0, 'TEXCOORD_1': handler.m_UV1}
        require(all(v for v in attrs.values()), 'Mesh requires positions, normals, tangents and both UV sets')
        attrs = {k: np.asarray(v).tolist() for k,v in attrs.items()}
        attrs['NORMAL'] = [v[:3] for v in attrs['NORMAL']]
        if objects[rid].type.name == 'SkinnedMeshRenderer':
            bone_ids = [ref(b, 'Transform') for b in renderer['m_Bones']]
            require(bone_ids and all(b in node_ids for b in bone_ids), 'Skeleton outside selected hierarchy')
            require(handler.m_BoneIndices and handler.m_BoneWeights, 'Missing skin weights')
            attrs['JOINTS_0'], attrs['WEIGHTS_0'] = handler.m_BoneIndices, handler.m_BoneWeights
            joint_values = np.asarray(handler.m_BoneIndices)
            require(np.isfinite(joint_values).all() and (joint_values >= 0).all()
                    and (joint_values < len(bone_ids)).all() and np.equal(joint_values,np.floor(joint_values)).all(), 'Invalid Unity bone indices')
            binds = [[[m[f'e{r}{c}'] for c in range(4)] for r in range(4)] for m in raw['m_BindPose']]
            require(len(binds) == len(bone_ids), 'Bone/bind-pose count mismatch')
            nodes[node_index]['skin'] = len(skins)
            skins.append({'joints': [node_ids[b] for b in bone_ids], 'inverseBindMatrices': binds,
                          'skeleton': node_ids[ref(renderer['m_RootBone'], 'Transform')]})
        else:
            require(not handler.m_BoneWeights and not raw['m_BindPose'], 'Static renderer has hidden skin data')
        slots = [material(ref(p, 'Material')) for p in renderer['m_Materials']]
        require(len(slots) == len(raw['m_SubMeshes']) > 0, 'Submesh/material slot count mismatch')
        primitives = []
        for si, sub in enumerate(raw['m_SubMeshes']):
            require(sub['topology'] == 0 and sub['indexCount'] % 3 == 0, 'Only Unity triangle topology supported')
            size = 2 if handler.m_Use16BitIndices else 4
            require(sub['firstByte'] % size == 0, 'Misaligned submesh index offset')
            start = sub['firstByte'] // size
            indices = handler.m_IndexBuffer[start:start+sub['indexCount']]
            require(len(indices) == sub['indexCount'], 'Truncated submesh indices')
            indices = [i + sub.get('baseVertex', 0) for i in indices]
            primitives.append({'material': slots[si], 'attributes': attrs, 'indices': indices})
        nodes[node_index]['mesh'] = len(meshes)
        meshes.append({'name': raw['m_Name'], 'primitives': primitives})
    animations = []
    # Explicit clip list prevents accidentally attaching clips from an unrelated hierarchy.
    for aid in cfg['source']['animationClips']:
        raw = obj(aid, 'AnimationClip')
        require(raw['m_Legacy'] and not raw['m_Compressed'], 'Mecanim/compressed animation unsupported; export legacy TRS or manual GLB')
        for field in ('m_CompressedRotationCurves','m_EulerCurves','m_FloatCurves','m_PPtrCurves','m_Events'):
            require(not raw[field], f'Unsupported animation data: {field}')
        channels = []
        for field, target, width in [('m_RotationCurves','rotation',4), ('m_PositionCurves','translation',3), ('m_ScaleCurves','scale',3)]:
            for curve in raw[field]:
                require(curve['path'] in paths, f'Animation target missing: {curve["path"]}')
                keys = curve['curve']['m_Curve']
                require(len(keys) >= 2 and all(k.get('weightedMode',0) == 0 for k in keys), 'Weighted/empty curves unsupported')
                require(curve['curve']['m_PreInfinity'] == curve['curve']['m_PostInfinity'] == 2,
                        'Nonconstant curve extrapolation unsupported; bake explicit keys')
                channels.append({'node': paths[curve['path']], 'path': target,
                    'times': [k['time'] for k in keys], 'values': [vec(k['value'], 'xyzw'[:width]) for k in keys],
                    'inSlopes': [vec(k['inSlope'], 'xyzw'[:width]) for k in keys],
                    'outSlopes': [vec(k['outSlope'], 'xyzw'[:width]) for k in keys]})
        require(channels, 'Clip contains no supported animation tracks')
        animations.append({'name': raw['m_Name'], 'channels': channels})
    require(meshes, 'Selected hierarchy has no meshes')
    result = {'schemaVersion':1, 'sourceSha256':sha(source), 'sourceName':source.name,
              'unityVersion': str(roots[0].assets_file.unity_version), 'space':'unity-left-handed-meters',
              'nodes':nodes, 'meshes':meshes, 'skins':skins, 'animations':animations,
              'materials':materials, 'images':images}
    write_json(work/'extracted.json', result)
    return {'meshes':len(meshes), 'bones':[len(s['joints']) for s in skins], 'animations':len(animations), 'sourceSha256':result['sourceSha256']}
