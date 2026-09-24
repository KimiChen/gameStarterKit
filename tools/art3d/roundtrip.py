"""Independent post-write checks for the main conversion and both LODs."""
import json
import math
import copy
import tempfile
from pathlib import Path
import numpy as np
from pipeline import Glb, require, sha, validate_model, write_json


def same_rig(source, candidate):
    a,b = source.doc,candidate.doc
    for field in ('nodes','materials','images','textures','samplers'):
        require(a.get(field,[])==b.get(field,[]), f'LOD changed {field} / material slots / bindings')
    require(len(a.get('skins',[]))==len(b.get('skins',[])), 'Lost skeleton')
    for old,new in zip(a.get('skins',[]),b.get('skins',[])):
        require({k:v for k,v in old.items() if k!='inverseBindMatrices'} == {k:v for k,v in new.items() if k!='inverseBindMatrices'}, 'Changed skeleton binding')
        require(np.array_equal(source.array(old['inverseBindMatrices']),candidate.array(new['inverseBindMatrices'])), 'Changed inverse bind matrices')
    require(len(a.get('animations',[]))==len(b.get('animations',[])), 'Lost animation')
    for old,new in zip(a.get('animations',[]),b.get('animations',[])):
        require(old['name']==new['name'] and old['channels']==new['channels'] and len(old['samplers'])==len(new['samplers']), 'Changed animation binding')
        for x,y in zip(old['samplers'],new['samplers']):
            require(x.get('interpolation','LINEAR')==y.get('interpolation','LINEAR'), 'Changed interpolation')
            for field in ('input','output'):
                require(np.array_equal(source.array(x[field]),candidate.array(y[field])), 'Lost animation duration/keyframe/tangent')


def surface_distance(points, triangles):
    """Maximum of sample-to-triangle distances, including projections onto edges."""
    points = np.asarray(points,dtype=np.float64)
    triangles = np.asarray(triangles,dtype=np.float64)
    a,b,c = triangles[:,0],triangles[:,1],triangles[:,2]
    ab,ac=b-a,c-a
    d00=(ab*ab).sum(1); d01=(ab*ac).sum(1); d11=(ac*ac).sum(1)
    denom=d00*d11-d01*d01
    require((denom>1e-15).all(), 'Degenerate triangles in LOD')
    maximum=0.0
    for batch in np.array_split(points,max(1,math.ceil(len(points)/128))):
        ap=batch[:,None,:]-a
        d20=(ap*ab).sum(2); d21=(ap*ac).sum(2)
        v=(d11*d20-d01*d21)/denom; w=(d00*d21-d01*d20)/denom
        projected=a+v[:,:,None]*ab+w[:,:,None]*ac
        distances=np.linalg.norm(batch[:,None,:]-projected,axis=2)
        distances[(v<0)|(w<0)|(v+w>1)]=np.inf
        for start,end in ((a,b),(b,c),(c,a)):
            edge=end-start
            t=np.clip(((batch[:,None,:]-start)*edge).sum(2)/(edge*edge).sum(1),0,1)
            distance=np.linalg.norm(batch[:,None,:]-(start+t[:,:,None]*edge),axis=2)
            distances=np.minimum(distances,distance)
        maximum=max(maximum,float(distances.min(1).max()))
    return maximum


def compare_lod(source,candidate,ratio,policy):
    a=validate_model(source); b=validate_model(candidate)
    same_rig(source,candidate)
    require(len(source.doc['meshes'])==len(candidate.doc['meshes']) and len(a['primitives'])==len(b['primitives']), 'Lost mesh/material primitive')
    for old_mesh,new_mesh in zip(source.doc['meshes'],candidate.doc['meshes']):
        require(len(old_mesh['primitives'])==len(new_mesh['primitives']), 'Lost material primitive')
        for old,new in zip(old_mesh['primitives'],new_mesh['primitives']):
            require(old['material']==new['material'], 'Wrong material slot')
            require(set(old['attributes'])==set(new['attributes']), 'Lost UV/normal/skin attributes')
            for name in ('JOINTS_0','WEIGHTS_0'):
                if name in old['attributes']:
                    values=source.array(old['attributes'][name])[np.unique(source.array(old['indices']).ravel())]
                    require(np.all(values==values[0]), 'Varying skin influences require reviewed manual variants')
            names=sorted(old['attributes'])
            originals={tuple(row) for row in np.concatenate([source.array(old['attributes'][k]) for k in names],axis=1)}
            rows=np.concatenate([candidate.array(new['attributes'][k]) for k in names],axis=1)
            require(all(tuple(row) in originals for row in rows), 'LOD changed retained coordinates/UV/normals/weights')
            old_i=source.array(old['indices']).ravel(); new_i=candidate.array(new['indices']).ravel()
            count=len(new_i)//3; previous=len(old_i)//3
            target=max(1,math.floor(previous*ratio))
            tolerance=max(1,math.ceil(target*policy['ratioTolerance']))
            require(count < previous and abs(count-target)<=tolerance, f'LOD triangle target failed: {count}, expected {target}±{tolerance} (<{previous})')
            old_p=source.array(old['attributes']['POSITION']); new_p=candidate.array(new['attributes']['POSITION'])
            old_used=old_p[np.unique(old_i)]; new_used=new_p[np.unique(new_i)]
            diagonal=float(np.linalg.norm(old_used.max(0)-old_used.min(0)))
            bounds=np.abs(np.array([old_used.min(0),old_used.max(0)])-np.array([new_used.min(0),new_used.max(0)]))
            require(bounds.max()<=policy['boundsTolerance']*diagonal+1e-6, 'LOD bounds exceed tolerance')
            ta=old_p[old_i.reshape(-1,3)]; tb=new_p[new_i.reshape(-1,3)]
            distance=max(surface_distance(np.concatenate([old_used,ta.mean(1)]),tb),
                         surface_distance(np.concatenate([new_used,tb.mean(1)]),ta))
            require(distance<=policy['maxError']*diagonal+1e-6, 'LOD sampled surface error exceeds tolerance')
    return b


def compare_main(extracted,glb):
    """Check LH/RH conversion directly against extracted Unity values, not converter helpers."""
    summary=validate_model(glb)
    d=glb.doc
    require(len(extracted['nodes'])==len(d['nodes']) and len(extracted['meshes'])==len(d['meshes']), 'Lost hierarchy/mesh')
    for old,new in zip(extracted['nodes'],d['nodes']):
        for key in ('name','children','mesh','skin'): require(old.get(key)==new.get(key), 'Changed hierarchy binding')
        require(np.allclose(new['translation'],np.array(old['translation'])*[1,1,-1]), 'Wrong translation space')
        require(np.allclose(new['rotation'],np.array(old['rotation'])*[-1,-1,1,1]), 'Wrong quaternion space')
        require(np.allclose(new['scale'],old['scale']), 'Changed scale')
    require(len(d['materials'])==len(extracted['materials']), 'Material count mismatch')
    for raw,material in zip(extracted['materials'],d['materials']):
        pbr=material['pbrMetallicRoughness']
        rgb=np.asarray(raw['baseColor'][:3],dtype=np.float64)
        linear=np.where(rgb <= 0.04045, rgb/12.92, ((rgb+0.055)/1.055)**2.4)
        require(material['name']==raw['name'] and np.allclose(pbr['baseColorFactor'],[*linear,raw['baseColor'][3]],rtol=0,atol=1e-10)
                and pbr['metallicFactor']==raw['metallic'] and pbr['roughnessFactor']==raw['roughness'], 'PBR mapping changed')
        if 'baseColorImage' in raw: require(pbr['baseColorTexture']=={'index':raw['baseColorImage'],'texCoord':0}, 'Lost texture binding')
    for old_mesh,new_mesh in zip(extracted['meshes'],d['meshes']):
        require(len(old_mesh['primitives'])==len(new_mesh['primitives']), 'Lost source submesh')
        for old,new in zip(old_mesh['primitives'],new_mesh['primitives']):
            require(old['material']==new['material'] and set(old['attributes'])==set(new['attributes']), 'Lost main material/attribute')
            used,remap=np.unique(old['indices'],return_inverse=True)
            require(np.array_equal(glb.array(new['indices']).ravel(),remap.reshape(-1,3)[:,[0,2,1]].ravel()), 'Wrong winding/index conversion')
            for key,array in old['attributes'].items():
                value=np.array(array)[used].astype(np.float32)
                if key in ('POSITION','NORMAL','TANGENT'): value[:,2]*=-1
                if key.startswith('TEXCOORD'): value[:,1]=1-value[:,1]
                require(np.array_equal(value,glb.array(new['attributes'][key])), f'Main {key} changed')
    require(len(extracted['skins'])==len(d.get('skins',[])), 'Lost main skeleton')
    reflect=np.diag([1,1,-1,1])
    for old,new in zip(extracted['skins'],d.get('skins',[])):
        require(old['joints']==new['joints'] and old['skeleton']==new['skeleton'], 'Lost main bone bindings')
        expected=[(reflect@np.array(m)@reflect).T.ravel() for m in old['inverseBindMatrices']]
        require(np.allclose(expected,glb.array(new['inverseBindMatrices']),atol=1e-6), 'Wrong main bind pose')
    require(len(extracted['animations'])==len(d.get('animations',[])), 'Lost main animation')
    for old,new in zip(extracted['animations'],d.get('animations',[])):
        require(old['name']==new['name'] and len(old['channels'])==len(new['channels']), 'Lost main animation tracks')
        for raw,channel in zip(old['channels'],new['channels']):
            require(channel['target']=={'node':raw['node'],'path':raw['path']}, 'Wrong animation target')
            sampler=new['samplers'][channel['sampler']]
            require(sampler['interpolation']=='CUBICSPLINE' and np.array_equal(np.array(raw['times'],dtype='<f4'),glb.array(sampler['input']).ravel()), 'Changed animation time/interpolation')
            expected=np.array([[raw[k][i] for k in ('inSlopes','values','outSlopes')] for i in range(len(raw['times']))],dtype='<f4').reshape(-1,len(raw['values'][0]))
            if raw['path']=='translation': expected[:,2]*=-1
            if raw['path']=='rotation': expected[:,:2]*=-1
            require(np.array_equal(expected,glb.array(sampler['output'])), 'Changed animation values/slopes')
    return summary


def verify(cfg):
    """Re-read output bytes; require main roundtrip, external PNGs and both LOD targets."""
    from textures import png_bytes
    from PIL import Image
    import io
    extracted=json.loads((cfg['workDir']/'extracted.json').read_text())
    require(extracted['sourceSha256']==sha(cfg['source']['path']), 'Stale source extraction')
    # An edited intermediate cannot impersonate a successful source roundtrip.
    from unity_extract import extract
    with tempfile.TemporaryDirectory(prefix='art3d-reextract-') as temporary:
        fresh_cfg=copy.deepcopy(cfg);fresh_cfg['workDir']=Path(temporary)
        extract(fresh_cfg)
        fresh=json.loads((Path(temporary)/'extracted.json').read_text())
        require(fresh==extracted, 'Extracted intermediate differs from read-only Unity source')
    main_path=cfg['outputDir']/(cfg['model']+'.glb'); main=Glb.load(main_path)
    report={'sourceSha256':extracted['sourceSha256'],'main':compare_main(extracted,main),'variants':[],'files':{}}
    validate_model(main,main_path)
    require(len(main.doc.get('images',[]))==len(extracted['images']), 'Lost source image')
    for src,image in zip(extracted['images'],main.doc.get('images',[])):
        original=cfg['workDir']/src['file']; require(sha(original)==src['sha256'],'Extracted image changed')
        expected,_=png_bytes(original.read_bytes(),cfg.get('textureMaxSize',1024))
        image_path=main_path.parent/image['uri']
        with Image.open(io.BytesIO(expected)) as a, Image.open(image_path) as b:
            require(a.size==b.size and a.tobytes()==b.convert('RGBA').tobytes(), 'Texture roundtrip pixels/direction mismatch')
        report['files'][image_path.name]=sha(image_path)
    previous=report['main']['triangles']
    for index,ratio in enumerate(cfg['lod']['ratios'],1):
        path=cfg['outputDir']/f'lod_{index}.glb'; require(path.is_file(), f'Missing LOD {index}')
        variant=Glb.load(path); validate_model(variant,path)
        stats=compare_lod(main,variant,ratio,cfg['lod'])
        require(stats['triangles']<previous, 'LOD triangle counts must strictly decrease')
        previous=stats['triangles']; report['variants'].append(stats); report['files'][path.name]=sha(path)
    report['files'][main_path.name]=sha(main_path)
    report['status']='passed'
    write_json(cfg['workDir']/'roundtrip-report.json',report)
    return report
