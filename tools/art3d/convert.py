"""Unity LH -> glTF RH with explicit winding, UV origin, bind and animation conversion."""
import copy
import json
import numpy as np
from pipeline import Glb, require, sha, validate_model

REFLECT = np.diag([1.,1.,-1.,1.])


def coordinate(values, path):
    result = np.array(values, dtype='<f4', copy=True)
    if path in ('translation','POSITION','NORMAL'): result[...,2] *= -1
    elif path == 'rotation': result[...,:2] *= -1
    elif path == 'TANGENT': result[...,2] *= -1  # reflection and UV-V flip cancel the two handedness changes
    elif path in ('TEXCOORD_0','TEXCOORD_1'): result[...,1] = 1 - result[...,1]
    return result


def convert(cfg):
    """Convert extracted hierarchy, bindings and unweighted Hermite TRS to GLB CUBICSPLINE."""
    src = json.loads((cfg['workDir']/'extracted.json').read_text())
    materials = json.loads((cfg['workDir']/'materials.json').read_text())
    require(src['sourceSha256'] == sha(cfg['source']['path']), 'Stale extraction')
    require(materials['extractedSha256'] == sha(cfg['workDir']/'extracted.json'), 'Stale material mapping')
    out = Glb(); d = out.doc
    d.update(scene=0, scenes=[{'name':cfg['model'], 'nodes':[0]}], nodes=copy.deepcopy(src['nodes']),
             meshes=[], materials=materials['materials'], skins=[], animations=[], images=[], textures=[])
    for node in d['nodes']:
        for key in ('translation','rotation','scale'): node[key] = coordinate(node[key],key).tolist()
    for mesh in src['meshes']:
        primitives = []
        for p in mesh['primitives']:
            used, remap = np.unique(p['indices'], return_inverse=True)
            attrs = {}
            for name, array in p['attributes'].items():
                data = coordinate(np.asarray(array)[used],name)
                attrs[name] = out.add(data, 'VEC'+str(data.shape[1]), 5123 if name == 'JOINTS_0' else 5126, 34962, name=='POSITION')
            indices = remap.reshape((-1,3))[:,[0,2,1]].ravel()
            primitives.append({'attributes':attrs, 'material':p['material'], 'indices':out.add(indices,'SCALAR',5123,34963), 'mode':4})
        d['meshes'].append({'name':mesh['name'], 'primitives':primitives})
    for skin in src['skins']:
        matrices = [REFLECT @ np.asarray(m) @ REFLECT for m in skin['inverseBindMatrices']]
        d['skins'].append({'joints':skin['joints'], 'skeleton':skin['skeleton'],
                          'inverseBindMatrices':out.add([m.T.ravel() for m in matrices],'MAT4')})
    for animation in src['animations']:
        samplers, channels = [], []
        for c in animation['channels']:
            values = []
            for i in range(len(c['times'])):
                for field in ('inSlopes','values','outSlopes'): values.append(coordinate(c[field][i],c['path']))
            channels.append({'sampler':len(samplers), 'target':{'node':c['node'],'path':c['path']}})
            samplers.append({'input':out.add(c['times'],'SCALAR',bounds=True),
                             'output':out.add(values, 'VEC'+str(len(values[0]))), 'interpolation':'CUBICSPLINE'})
        d['animations'].append({'name':animation['name'], 'samplers':samplers, 'channels':channels})
    if src['images']: d['samplers'] = [{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
    for image in src['images']:
        image_path = cfg['workDir']/image['file']
        require(sha(image_path) == image['sha256'], 'Extracted texture changed')
        d['images'].append({'name':image['name'], 'mimeType':'image/png', 'bufferView':out.add_view(image_path.read_bytes())})
        d['textures'].append({'source':len(d['images'])-1, 'sampler':0})
    summary = validate_model(out)
    path = cfg['workDir']/(cfg['model']+'.glb'); out.save(path)
    return {'path':str(path), **summary}
