#!/usr/bin/env python3
"""Author a deterministic Unity 2019.4 serialized file from scratch (no Unity Editor/content).

TypeTree definitions come from pinned UnityPy. The fixture has real Mesh/Renderer/Transform,
Texture2D/Material/Shader and legacy AnimationClip objects; no third-party game assets.
"""
import argparse
import math
from pathlib import Path
import struct
import numpy as np
from UnityPy.helpers.Tpk import get_typetree_node
from UnityPy.helpers.TypeTreeHelper import write_typetree
from UnityPy.helpers.UnityVersion import UnityVersion
from UnityPy.streams import EndianBinaryWriter
from pipeline import atomic_write, sha, write_json

VERSION = '2019.4.40f1'


def default(node):
    if node.m_Type == 'string': return ''
    if node.m_Type == 'TypelessData': return b''
    if node.m_Type == 'bool': return False
    if node.m_Children and node.m_Children[0].m_Type == 'Array': return []
    if node.m_Children: return {c.m_Name:default(c) for c in node.m_Children}
    return 0.0 if node.m_Type in ('float','double') else 0


def tree(cid): return get_typetree_node(cid,UnityVersion.from_str(VERSION))
def pointer(pid=0): return {'m_FileID':0,'m_PathID':pid}
def v3(x=0,y=0,z=0): return dict(x=x,y=y,z=z)
def quat(angle=0): return dict(x=0,y=0,z=math.sin(angle/2),w=math.cos(angle/2))


def geometry(steps=10):
    positions=[]; normals=[]; tangents=[]; uv=[]; uv2=[]; groups=[[],[]]
    # RH outward normal = u cross v. Build Unity LH by reflecting Z + reversing indices.
    faces=[([1,1.5,0],[0,0,-1],[0,3,0]), ([-1,1.5,0],[0,0,1],[0,3,0]),
           ([0,3,0],[2,0,0],[0,0,-1]), ([0,0,0],[2,0,0],[0,0,1]),
           ([0,1.5,.5],[2,0,0],[0,3,0]), ([0,1.5,-.5],[-2,0,0],[0,3,0])]
    for fi,(center,u,v) in enumerate(faces):
        u=np.array(u); v=np.array(v); n=np.cross(u,v); n=n/np.linalg.norm(n); t=u/np.linalg.norm(u)
        offset=len(positions)
        for y in range(steps+1):
            for x in range(steps+1):
                p=np.array(center)+u*(x/steps-.5)+v*(y/steps-.5)
                positions.append((p*[1,1,-1]).tolist()); normals.append((n*[1,1,-1]).tolist())
                tangents.append([*(t*[1,1,-1]),1])
                uv.append([x/steps,1-y/steps]); uv2.append([.01+.98*x/steps,.99-.98*y/steps])
        for y in range(steps):
            for x in range(steps):
                a=offset+y*(steps+1)+x; b=a+1; c=a+steps+1; d=c+1
                groups[fi//3].extend([a,d,b,a,c,d])
    return [positions,normals,tangents,uv,uv2],groups


def fixture_bytes():
    objects=[]
    def add(pid,cid,**updates):
        value=default(tree(cid)); value.update(updates); objects.append((pid,cid,value)); return value
    def go(pid,name,components):
        return add(pid,1,m_Name=name,m_IsActive=True,m_Component=[{'component':pointer(c)} for c in components])
    def transform(pid,gid,parent=0,children=(),position=None):
        return add(pid,4,m_GameObject=pointer(gid),m_Father=pointer(parent),m_Children=[pointer(c) for c in children],
                   m_LocalPosition=position or v3(),m_LocalRotation=quat(),m_LocalScale=v3(1,1,1))
    attrs,indices=geometry()
    for root,skinned in [(1,False),(100,True)]:
        tid=root+1; rid=root+2; meshid=root+10
        go(root,'OfflineSkinned' if skinned else 'OfflineStatic',[tid,rid] if skinned else [tid,rid,root+3])
        transform(tid,root,children=[201] if skinned else [])
        if not skinned: add(root+3,33,m_GameObject=pointer(root),m_Mesh=pointer(meshid))
        renderer=add(rid,137 if skinned else 23,m_GameObject=pointer(root),m_Enabled=True,m_Materials=[pointer(21),pointer(22)],
                     m_LightmapIndex=65535,m_LightmapIndexDynamic=65535)
        if skinned: renderer.update(m_Mesh=pointer(meshid),m_RootBone=pointer(201),m_Bones=[pointer(p) for p in (201,203,205,207)])
        mesh=add(meshid,43,m_Name='MESH_OfflineColumn',m_IsReadable=True,m_KeepVertices=True,m_KeepIndices=True,m_IndexFormat=0)
        values=np.concatenate([np.asarray(a,dtype='<f4') for a in attrs],axis=1)
        channels=[dict(stream=0,offset=0,format=0,dimension=0) for _ in range(14)]
        for i,offset,width in [(0,0,3),(1,12,3),(2,24,4),(4,40,2),(5,48,2)]:
            channels[i]=dict(stream=0,offset=offset,format=0,dimension=width)
        if skinned:
            weights=np.tile([.4,.3,.2,.1],(len(values),1)).astype('<f4')
            joints=np.tile([0,1,2,3],(len(values),1)).astype('<f4')
            values=np.concatenate([values,weights,joints],axis=1)
            channels[12]=dict(stream=0,offset=56,format=0,dimension=4)
            channels[13]=dict(stream=0,offset=72,format=0,dimension=4)
            mesh['m_BindPose']=[{f'e{r}{c}':float((1 if r==c else 0)-i if (r,c)==(1,3) else (1 if r==c else 0)) for r in range(4) for c in range(4)} for i in range(4)]
        mesh['m_VertexData'].update(m_VertexCount=len(values),m_Channels=channels,m_DataSize=values.astype('<f4').tobytes())
        mesh['m_IndexBuffer']=list(np.array(indices[0]+indices[1],dtype='<u2').tobytes())
        mesh['m_SubMeshes']=[dict(firstByte=i*len(indices[0])*2,indexCount=len(group),topology=0,baseVertex=0,firstVertex=0,vertexCount=len(values),
                                  localAABB={'m_Center':v3(0,1.5,0),'m_Extent':v3(1,1.5,.5)}) for i,group in enumerate(indices)]
        mesh['m_LocalAABB']={'m_Center':v3(0,1.5,0),'m_Extent':v3(1,1.5,.5)}
    for i in range(4):
        gid=200+i*2; tid=gid+1
        go(gid,f'Bone{i}',[tid]); transform(tid,gid,101 if i==0 else tid-2,[tid+2] if i<3 else [],v3(0,0 if i==0 else 1,0))
    shader=add(48,48,m_Name='Standard'); shader['m_ParsedForm']['m_Name']='Standard'
    for mid,color in [(21,[1,1,1,1]),(22,[.45,.7,1,1])]:
        material=add(mid,21,m_Name='M_Offline_A' if mid==21 else 'M_Offline_B',m_Shader=pointer(48),m_CustomRenderQueue=-1)
        material['m_SavedProperties']={'m_Floats':[('_Metallic',0.0),('_Glossiness',0.25)],
            'm_Colors':[('_Color',dict(zip('rgba',color)))],
            'm_TexEnvs':[('_MainTex',{'m_Texture':pointer(28),'m_Scale':dict(x=1,y=1),'m_Offset':dict(x=0,y=0)})]}
    y,x=np.indices((512,512)); pixels=np.empty((512,512,4),dtype=np.uint8)
    pixels[:,:,:3]=np.where(((x//32+y//32)%2)[:,:,None]==0,220,70); pixels[:,:,3]=255
    pixels[:64,:64,:3]=[230,60,60]; pixels[:64,-64:,:3]=[60,200,90]
    pixels[-64:,:64,:3]=[65,100,230]; pixels[-64:,-64:,:3]=[230,190,60]
    texture=add(28,28,m_Name='OfflineChecker',m_Width=512,m_Height=512,m_CompleteImageSize=pixels.nbytes,m_TextureFormat=4,
                m_MipCount=1,m_IsReadable=True,m_ImageCount=1,m_TextureDimension=2,m_ColorSpace=1)
    texture['image data']=np.flipud(pixels).tobytes()
    for aid,field,name in [(300,'m_RotationCurves','ANIM_Offline_Sway'),(301,'m_PositionCurves','ANIM_Offline_Lift')]:
        clip=add(aid,74,m_Name=name,m_Legacy=True,m_SampleRate=30)
        keys=[]
        for time,value in [(0,0),(.5,math.pi/6 if aid==300 else .35),(1,0)]:
            val=quat(value) if aid==300 else v3(0,1+value,0)
            zero={k:0.0 for k in val}
            keys.append(dict(time=time,value=val,inSlope=zero,outSlope=zero,weightedMode=0,inWeight=zero,outWeight=zero))
        clip[field]=[{'path':'Bone0/Bone1/Bone2/Bone3','curve':{'m_Curve':keys,'m_PreInfinity':2,'m_PostInfinity':2,'m_RotationOrder':4}}]
    # SerializedFile v17: big-endian fixed header, little-endian type/object metadata and payloads.
    classes=sorted({cid for _,cid,_ in objects})
    metadata=EndianBinaryWriter(endian='<'); metadata.write_string_to_null(VERSION); metadata.write_int(13)
    metadata.write_boolean(False); metadata.write_int(len(classes))
    for cid in classes:
        metadata.write_int(cid); metadata.write_boolean(False); metadata.write_short(-1); metadata.write_bytes(bytes(16))
    metadata.write_int(len(objects)); payload=bytearray()
    for pid,cid,data in objects:
        payload+=b'\0'*(-len(payload)%8)
        writer=EndianBinaryWriter(endian='<'); write_typetree(data,tree(cid),writer)
        encoded=writer.bytes
        metadata.align_stream(); metadata.write_long(pid); metadata.write_u_int(len(payload)); metadata.write_u_int(len(encoded)); metadata.write_int(classes.index(cid))
        payload+=encoded
    metadata.write_int(0); metadata.write_int(0); metadata.write_string_to_null('gono self-authored SC5 fixture')
    meta=metadata.bytes; offset=(20+len(meta)+15)//16*16
    header=struct.pack('>IIII',len(meta),offset+len(payload),17,offset)+b'\0\0\0\0'
    return header+meta+b'\0'*(offset-20-len(meta))+payload


def generate(out):
    atomic_write(out,fixture_bytes())
    return {'file':str(out),'sha256':sha(out),'unityVersion':VERSION,'authoredBy':'unity-fixture.py; no Unity Editor used',
            'staticRoot':1,'skinnedRoot':100,'clips':[300,301],'triangles':1200,'materials':2,'bones':4,'nonzeroWeightsPerVertex':4}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--out',type=Path,required=True); args=parser.parse_args()
    result=generate(args.out); write_json(args.out.with_suffix('.json'),result); print(result)
