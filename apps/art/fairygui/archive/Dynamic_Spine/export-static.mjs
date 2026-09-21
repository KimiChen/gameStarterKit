#!/usr/bin/env node
/** Re-export this archived 3.8.99 asset's idle t=0 pose. Never rewrites its skeleton. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../../..');
const output=path.join(root,'apps/art/fairygui/assets/View_AreaList_Login/RGBA/login_animals_static.png');
const app=process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const runtime=path.join(app,'Contents/Resources/resources/3d/engine/native/external/emscripten/spine/3.8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const factory=(await import('data:text/javascript;base64,'+fs.readFileSync(runtime+'/spine.wasm.js').toString('base64'))).default;
const wasm=await factory({wasmBinary:fs.readFileSync(runtime+'/spine.wasm')});
const util=wasm.SpineWasmUtil;
util.spineWasmInit();
const source=path.join(here,'Login/1/');
const bytes=fs.readFileSync(source+'loading_animals.skel');
const ptr=util.createStoreMemory(bytes.length);
wasm.HEAPU8.set(bytes,ptr);
const data=util.createSpineSkeletonDataWithBinary(bytes.length,fs.readFileSync(source+'loading_animals.atlas.txt','utf8'),['loading_animals.png'],['loading_animals']);
util.freeStoreMemory();
if (!data || data.version !== '3.8.99') throw new Error('Expected original Spine 3.8.99 skeleton');
const instance=new wasm.SkeletonInstance();
instance.initSkeleton(data);
instance.setPremultipliedAlpha(false);
instance.setUseTint(false);
instance.setColor(1,1,1,1);
if (!instance.setAnimation(0,'idle',true)) throw new Error('Original idle animation missing');
instance.updateAnimation(0);
const model=instance.updateRenderData();
const vector=v=>Array.from({length:v.size()},(_,i)=>v.get(i));
const draws=vector(model.getData()),textures=vector(model.getTextures());
if (draws.length!==5 || draws[4]!==0 || textures.length!==1 || textures[0]!=='loading_animals') {
  throw new Error('This archival exporter only supports this original single-texture normal-blend pose');
}
// Same 24-byte position/UV/RGBA layout consumed by Cocos spine/assembler/simple.ts.
const vbuf=wasm.HEAPU8.slice(model.vPtr,model.vPtr+model.vCount*24);
const view=new DataView(vbuf.buffer);
const vertices=Array.from({length:model.vCount},(_,i)=>({
  x:view.getFloat32(i*24,true),y:view.getFloat32(i*24+4,true),
  u:view.getFloat32(i*24+12,true),v:view.getFloat32(i*24+16,true),
  color:Array.from(vbuf.slice(i*24+20,i*24+24)),
}));
if (vertices.some(v=>v.color.some(c=>c!==255))) throw new Error('Unexpected vertex tint');
const indices=Array.from(new Uint16Array(wasm.HEAPU8.buffer,model.iPtr,model.iCount));
if (vertices.length!==433 || indices.length!==1185) throw new Error('Original pose geometry changed');
const pose={vertices,indices};
const {data:tex,info}=await sharp(path.join(source,'loading_animals.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const width=882,height=1305,origin=[432,729],scale=2,W=width*scale,H=height*scale;
const out=new Float32Array(W*H*4);
const vs=pose.vertices.map(v=>({x:(v.x+origin[0])*scale,y:(origin[1]-v.y)*scale,u:v.u,v:v.v}));
function edge(a,b,x,y){return (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)}
function inclusive(a,b){const dy=b.y-a.y,dx=b.x-a.x;return dy<0||(dy===0&&dx>0)}
for(let ti=0;ti<pose.indices.length;ti+=3){
 let a=vs[pose.indices[ti]],b=vs[pose.indices[ti+1]],c=vs[pose.indices[ti+2]];
 let area=edge(a,b,c.x,c.y);if(Math.abs(area)<1e-8)continue;if(area<0){[b,c]=[c,b];area=-area;}
 const minX=Math.max(0,Math.ceil(Math.min(a.x,b.x,c.x)-0.5)),maxX=Math.min(W-1,Math.floor(Math.max(a.x,b.x,c.x)-0.5));
 const minY=Math.max(0,Math.ceil(Math.min(a.y,b.y,c.y)-0.5)),maxY=Math.min(H-1,Math.floor(Math.max(a.y,b.y,c.y)-0.5));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const px=x+0.5,py=y+0.5,wa=edge(b,c,px,py),wb=edge(c,a,px,py),wc=edge(a,b,px,py);
  if(wa<0||wb<0||wc<0||(wa===0&&!inclusive(b,c))||(wb===0&&!inclusive(c,a))||(wc===0&&!inclusive(a,b)))continue;
  const u=(a.u*wa+b.u*wb+c.u*wc)/area,v=(a.v*wa+b.v*wb+c.v*wc)/area;
  const sx=Math.max(0,Math.min(info.width-1,u*info.width-0.5)),sy=Math.max(0,Math.min(info.height-1,v*info.height-0.5));
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  const offsets=[(iy*info.width+ix)*4,(iy*info.width+Math.min(info.width-1,ix+1))*4,(Math.min(info.height-1,iy+1)*info.width+ix)*4,(Math.min(info.height-1,iy+1)*info.width+Math.min(info.width-1,ix+1))*4];
  const weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
  const rgba=[0,0,0,0];for(let p=0;p<4;p++)for(let k=0;k<4;k++)rgba[k]+=tex[offsets[p]+k]*weights[p]/255;
  const dest=(y*W+x)*4,alpha=rgba[3],inv=1-alpha;
  for(let k=0;k<3;k++)out[dest+k]=rgba[k]*alpha+out[dest+k]*inv;
  out[dest+3]=alpha+out[dest+3]*inv;
 }
}
const raw=Buffer.alloc(W*H*4);
for(let p=0;p<W*H;p++){const off=p*4,a=out[off+3];for(let k=0;k<3;k++)raw[off+k]=a?Math.round(out[off+k]/a*255):0;raw[off+3]=Math.round(a*255);}
const png=await sharp(raw,{raw:{width:W,height:H,channels:4}}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
const metadata={
  source:'Spine 3.8.99 / idle / t=0', runtime:'Cocos Creator 3.8.8 Spine 3.8 WASM',
  renderer:'original runtime mesh/UV; normal alpha blend; 2x top-left-rule triangle raster; Lanczos3 downsample',
  vertices:vertices.length,triangles:indices.length/3,width,height,origin,
  designPosition:[375-origin[0],811-origin[1]],
  originalLoader:{position:[-66,106],itemSize:[872,1283],skeletonAnchor:[441,705]},
  hashes:Object.fromEntries(['loading_animals.skel','loading_animals.atlas.txt','loading_animals.png'].map(name=>[name,hash(fs.readFileSync(path.join(source,name)))])),
  runtimeWasmSha256:hash(fs.readFileSync(path.join(runtime,'spine.wasm'))),
  outputSha256:hash(png),
};
const record=JSON.stringify(metadata,null,2)+'\n';
const recordPath=path.join(here,'static-pose.json');
if (process.argv.includes('--check')) {
  if (!fs.readFileSync(output).equals(png) || fs.readFileSync(recordPath,'utf8')!==record) throw new Error('Static pose is stale; rerun export-static.mjs');
  console.log('Original skeleton idle t=0 static export is byte-identical.');
} else {
  fs.writeFileSync(output,png);
  fs.writeFileSync(recordPath,record);
  console.log(`Wrote ${output}`);
}
