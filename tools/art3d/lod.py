#!/usr/bin/env python3
"""Per-material meshopt simplification. Preserve exact retained vertex and rig data."""
import copy
import json
import math
import subprocess
import numpy as np
from pipeline import Glb, HERE, require, run_cli, sha, validate_model, write_json


def make_lod(source, ratio, max_error):
    validate_model(source)
    requests, pairs = [], []
    for mi,mesh in enumerate(source.doc['meshes']):
        for pi,p in enumerate(mesh['primitives']):
            attrs = {k:source.array(v) for k,v in p['attributes'].items()}
            idx = source.array(p['indices']).ravel(); pos = attrs['POSITION']
            if 'JOINTS_0' in attrs:
                # With constant influences the skin matrix is identical across the primitive.
                # Nonconstant weights can deform a newly spanning triangle differently: fail closed.
                used = np.unique(idx)
                require(np.all(attrs['JOINTS_0'][used] == attrs['JOINTS_0'][used[0]])
                        and np.all(attrs['WEIGHTS_0'][used] == attrs['WEIGHTS_0'][used[0]]),
                        'LOD cannot guarantee varying skin influences; supply reviewed manual variants')
            weighted = np.concatenate([attrs[k] for k in ('NORMAL','TEXCOORD_0','TEXCOORD_1')],axis=1)
            target = max(1,math.floor(len(idx)//3*ratio))*3
            requests.append({'indices':idx.tolist(), 'positions':pos.ravel().tolist(),
                'attributes':weighted.ravel().tolist(), 'stride':7, 'weights':[1,1,1,1,1,1,1],
                'lock':[0]*len(pos), 'target':target, 'maxError':max_error})
            pairs.append((mi,pi))
    result = subprocess.run(['node',str(HERE/'meshopt-run.mjs')],input=json.dumps(requests),text=True,capture_output=True,timeout=120)
    require(result.returncode == 0, f'meshoptimizer failed: {result.stderr[-2000:]}')
    answers = json.loads(result.stdout)
    require(len(answers)==len(pairs), 'meshoptimizer response count mismatch')
    out = Glb(copy.deepcopy(source.doc),bytes(source.blob))
    errors = []
    for (mi,pi),answer in zip(pairs,answers):
        old = source.doc['meshes'][mi]['primitives'][pi]
        p = out.doc['meshes'][mi]['primitives'][pi]
        indices = np.asarray(answer['indices'],dtype=np.uint32)
        require(len(indices)>=3 and len(indices)%3==0 and indices.max()<len(source.array(old['attributes']['POSITION'])), 'Invalid simplifier result')
        positions = source.array(old['attributes']['POSITION']).astype(np.float64)
        triangles = indices.reshape(-1,3)
        points = positions[triangles]
        area = np.linalg.norm(np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]),axis=1)
        scale2 = float(np.sum((positions.max(0)-positions.min(0))**2))
        # Float32 coplanar input can leave near-collinear numerical slivers. Remove only
        # zero-area geometry; target and sampled surface checks still apply afterwards.
        indices = triangles[area > max(1e-15,scale2*1e-8)].ravel()
        require(len(indices)>=3, 'Simplifier produced only degenerate triangles')
        used,remapped = np.unique(indices,return_inverse=True)
        p['attributes'] = {}
        for name,accessor in old['attributes'].items():
            desc=source.doc['accessors'][accessor]
            p['attributes'][name] = out.add(source.array(accessor)[used],desc['type'],desc['componentType'],34962,name=='POSITION')
        p['indices'] = out.add(remapped,'SCALAR',5123,34963)
        errors.append({'relativeError':answer['error'],'removedDegenerateTriangles':len(triangles)-len(indices)//3})
    return out.packed(),errors


def lod(cfg):
    """Produce lod_1.glb/lod_2.glb or reject targets that cannot meet fidelity and reduction."""
    from roundtrip import compare_lod
    main = cfg['outputDir']/(cfg['model']+'.glb')
    source = Glb.load(main); validate_model(source,main)
    products = []
    # Validate BOTH variants in memory before publishing either variant.
    for index,ratio in enumerate(cfg['lod']['ratios'],1):
        variant,errors = make_lod(source,ratio,cfg['lod']['maxError'])
        variant.doc['scenes'][0]['name'] = f'lod_{index}'
        stats = compare_lod(source,variant,ratio,cfg['lod'])
        products.append((index,variant,stats,errors))
    report = {'sourceSha256':sha(main),'meshoptimizer':'0.25.0','variants':[]}
    for index,variant,stats,errors in products:
        target = cfg['outputDir']/f'lod_{index}.glb'; variant.save(target)
        report['variants'].append({'file':target.name,'sha256':sha(target),'meshoptErrors':errors,**stats})
    write_json(cfg['workDir']/'lod-report.json',report)
    return report


if __name__ == '__main__': run_cli(lod)
