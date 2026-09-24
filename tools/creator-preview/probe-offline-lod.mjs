#!/usr/bin/env node
/** SC5-B1: self-authored Unity -> GLB/PNG/LOD assets through real Stage3D/EntityPool/SkinnedUnits.
 * Requires the existing Creator 3.8.8 project and loopback Chrome CDP. Outside verify:all.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CdpClient, openScene, sleep } from './lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const options = { webgl: 2, preview: 'http://127.0.0.1:7456', devtools: 'http://127.0.0.1:9222', out: '.cache/sc5-b1/creator-webgl2' };
for (let i=0;i<args.length;i++) {
  const key = { '--webgl':'webgl','--preview':'preview','--devtools':'devtools','--out':'out' }[args[i]];
  if (!key || !args[i+1]) throw new Error('Usage: probe-offline-lod.mjs --webgl 1|2 --out DIR [--preview URL --devtools URL]');
  options[key] = key === 'webgl' ? Number(args[++i]) : args[++i];
}
if (![1,2].includes(options.webgl)) throw new Error('--webgl must be 1 or 2');
for (const url of [options.preview,options.devtools]) if (!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('Loopback URLs only');
const out = path.resolve(ROOT, options.out); fs.mkdirSync(out,{recursive:true});
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fixtures = ['SM_OfflineColumn','SK_OfflineColumn'].map(name => [name,'lod_1','lod_2'].map(stem => {
  const file = `apps/Cocos/assets/resources/stage3d/offline/${name}/${stem}.glb`;
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT,file+'.meta')));
  const sub = Object.values(meta.subMetas).filter(s=>s.importer==='gltf-scene');
  if (sub.length!==1) throw new Error('Expected one real imported prefab per GLB');
  const mesh = Object.values(meta.subMetas).find(s=>s.importer==='gltf-mesh');
  const bytes=fs.readFileSync(path.join(ROOT,file));
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  return { file, sha256:hash(path.join(ROOT,file)), metaSha256:hash(path.join(ROOT,file+'.meta')),
    colors:gltf.materials.map(m=>m.pbrMetallicRoughness.baseColorFactor.slice(0,3)),
    prefabUuid:sub[0].uuid, meshUuid:mesh.uuid, triangles:mesh.userData.triangleCount,
    address:{bundle:'resources',path:`stage3d/offline/${name}/${stem}/${sub[0].name.replace(/\.prefab$/u,'')}`} };
}));
const listener = execFileSync('lsof',['-nP',`-iTCP:${new URL(options.preview).port}`,'-sTCP:LISTEN'],{encoding:'utf8'});
const pid = listener.split('\n')[1]?.trim().split(/\s+/u)[1];
const command = execFileSync('ps',['-p',pid,'-o','command='],{encoding:'utf8'});
if (!command.includes(`--project ${ROOT}/apps/Cocos`)) throw new Error('Preview listener is not this project');
const report = {schemaVersion:1, batch:'SC5-B1', options, creator:{pid:Number(pid),project:`${ROOT}/apps/Cocos`},fixtures,console:[],lods:[],cycles:[],ok:false};
const save = () => fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');

async function install(fixtures) {
  const cc = await System.import('cc');
  const entries = [...System.entries()].map(([,module])=>module);
  const exported = name => { const found=entries.filter(m=>typeof m[name]==='function'); if (found.length!==1) throw new Error(`Ambiguous ${name}`); return found[0][name]; };
  const dev = cc.director.getScene().getComponentsInChildren(exported('Stage3dDevScene'))[0];
  if (dev.status!=='ready') throw new Error(`Developer scene status: ${dev.status}`);
  dev.enabled=false; dev.close();
  const frames = count => new Promise(resolve=>{ let n=0; const step=()=>{if(++n>=count){cc.director.off(cc.Director.EVENT_AFTER_DRAW,step);resolve();}};cc.director.on(cc.Director.EVENT_AFTER_DRAW,step);});
  await frames(5);
  const Stage=exported('Stage3D'),Engine=exported('CocosStage3DEngine'),quality=exported('readStage3DQuality')();
  const qualityData = await new Promise((resolve,reject)=>cc.resources.load('stage3d/data/quality',cc.JsonAsset,(e,a)=>e?reject(e):resolve(a.json)));
  const catalog = kind => ({quality:qualityData,
    pool:{version:1,maxActivationsPerFrame:{low:4,medium:4,high:4},entries:[{id:'offline',prefab:fixtures[kind][0].address,capacity:{low:2,medium:2,high:2}}]},
    layers:{version:1,layers:[{id:'base',prefabs:[],pools:['offline'],textures:[]}]},
    prefabLods:[{prefab:fixtures[kind][0].address,lods:fixtures[kind].map(f=>f.address)}]});
  const state = {stage:null,lease:null,pool:null,skin:null,entities:[],errors:[],frames};
  const countNodes = node => 1+node.children.reduce((n,c)=>n+countNodes(c),0);
  const snapshot = () => ({nodes:countNodes(cc.director.getScene()),gfx:{...cc.director.root.device.memoryStatus},
    refs:fixtures.flat().map(f=>({uuid:f.prefabUuid,refs:cc.assetManager.assets.get(f.prefabUuid)?.refCount??0}))});
  state.open=async()=>{
    state.stage=new Stage(new Engine(),undefined,()=>quality);
    const owner=new AbortController();state.owner=owner;
    state.lease=state.stage.acquire({signal:owner.signal,isActive:()=>!owner.signal.aborted},{clearColor:{r:34,g:39,b:46,a:255}});
    state.lease.camera.setPose({x:7,y:6,z:25},{x:0,y:1.3,z:0});state.lease.light.setDirection({x:-1,y:-2,z:-1});
    const options={quality,signal:state.lease.signal,onError:e=>state.errors.push(String(e))};
    state.pool=exported('createCocosEntityPool')(catalog(0),state.lease.root,options);
    state.skin=exported('createCocosSkinnedUnits')(catalog(1),state.lease.root,options);
    state.entities=[state.pool.spawn('offline',n=>n.setPosition(-3,0,0)),
      state.skin.spawn('offline','ANIM_Offline_Sway',n=>n.setPosition(0,0,0)),
      state.skin.spawn('offline','ANIM_Offline_Lift',n=>n.setPosition(3,0,0))];
    await state.ready();
  };
  state.ready=async()=>{
    for(let i=0;i<600;i++){
      if(state.errors.length)throw new Error(state.errors.join('; '));
      if(state.entities.every(e=>e?.state==='active')){await frames(4);return;}
      await frames(1);
    }
    throw new Error('LOD activation timed out');
  };
  state.setLod=async lod=>{state.pool.setLod(lod);state.skin.setLod(lod);await state.ready();return state.inspect(lod);};
  state.inspect=lod=>{
    const models=state.entities.map((e,index)=>{
      const renderers=e.node.getComponentsInChildren(cc.MeshRenderer);
      const expected=fixtures[index===0?0:1][lod];
      if(renderers.length!==1 || renderers[0].mesh.uuid!==expected.meshUuid) throw new Error('LOD loaded wrong mesh');
      const r=renderers[0];const materials=r.sharedMaterials;
      const textures=materials.map(m=>m.getProperty('mainTexture'));
      if(materials.length!==2 || textures.some(t=>!t?.image||t.width!==512||t.height!==512))throw new Error('Material slot/PNG failed');
      const colors=materials.map(m=>{const c=m.getProperty('albedoScale');return [c.x,c.y,c.z];});
      if(colors.some((color,i)=>color.some((v,j)=>Math.abs(v-expected.colors[i][j])>1e-6)))throw new Error('Imported material color differs from source GLB; refresh Creator assets');
      const model={mesh:r.mesh.uuid,triangles:r.mesh.struct.primitives.reduce((sum,p)=>sum+p.indexView.count/3,0),
        slots:materials.length,colors,textures:textures.map(t=>({uuid:t.uuid,width:t.width,height:t.height,image:t.image.uuid,url:t.image.nativeUrl}))};
      if(model.triangles!==expected.triangles)throw new Error('Imported triangle count differs');
      if(index){
        const anim=e.node.getComponentsInChildren(cc.SkeletalAnimation)[0];
        if(!anim || anim.clips.length!==2 || anim.clips.some(c=>Math.abs(c.duration-1)>1e-6)||r.skeleton.joints.length!==4)throw new Error('Skeleton/animation lost');
        model.skin={baked:anim.useBakedAnimation,bones:r.skeleton.joints.length,clip:e.clip,clips:anim.clips.map(c=>({name:c.name,duration:c.duration})),jointTexture:!!r.model?._jointsMedium?.texture?.handle.texture};
        if(!model.skin.baked||!model.skin.jointTexture)throw new Error('Baked joint texture missing');
      }
      return model;
    });
    return {lod,models,drawCalls:cc.director.root.device.numDrawCalls,triangles:cc.director.root.device.numTris,instances:cc.director.root.device.numInstances};
  };
  state.motion=async()=>{
    const e=state.entities[1];const animation=e.node.getComponentsInChildren(cc.SkeletalAnimation)[0];
    let jointPath;
    const walk=(node,path)=>{if(node.name==='Bone3')jointPath=path;for(const c of node.children)walk(c,path?`${path}/${c.name}`:c.name);};
    walk(animation.node,'');const socket=state.skin.socket(e,jointPath);
    const matrix=()=>{socket.updateWorldTransform();const m=socket.worldMatrix;return Array.from({length:16},(_,i)=>m[`m${String(i).padStart(2,'0')}`]);};
    const first=matrix();await frames(11);const second=matrix();
    if(first.every((v,i)=>Math.abs(v-second[i])<1e-5))throw new Error('Animation socket did not move');
    return {jointPath,first,second};
  };
  state.close=async()=>{state.pool?.close();state.skin?.close();await frames(6);state.owner?.abort();state.stage?.dispose();await frames(6);return snapshot();};
  state.snapshot=snapshot;globalThis.__offlineLod=state;
  return {viewport:{css:{width:innerWidth,height:innerHeight},canvas:{width:cc.game.canvas.width,height:cc.game.canvas.height}},device:cc.director.root.device.constructor.name,webgl:cc.director.root.device.gl.getParameter(cc.director.root.device.gl.VERSION),quality,baseline:snapshot()};
}

let client,tab;
try {
  tab=await (await fetch(options.devtools+'/json/new?about:blank',{method:'PUT'})).json();report.tabId=tab.id;
  client=await CdpClient.connect(tab.webSocketDebuggerUrl);
  client.on(message=>{
    if(message.method==='Runtime.exceptionThrown')report.console.push({type:'exception',details:message.params.exceptionDetails});
    if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))report.console.push({type:message.params.type,args:message.params.args.map(a=>a.value??a.description)});
  });
  await client.send('Runtime.enable');await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride',{width:900,height:650,deviceScaleFactor:1,mobile:false});
  if(options.webgl===1)await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};}`});
  const sceneUuid=JSON.parse(fs.readFileSync(path.join(ROOT,'apps/Cocos/assets/stage3d-dev.scene.meta'))).uuid;
  await openScene(client,{preview:options.preview,sceneUuid,timeoutMs:180000,query:{quality:'high',shadows:0},ready:walk=>walk.sceneName==='stage3d-dev'});
  report.environment=await client.evaluate(`(${install.toString()})(${JSON.stringify(fixtures)})`);
  if(report.environment.device!==(options.webgl===1?'WebGLDevice':'WebGL2Device'))throw new Error('Wrong actual WebGL device');
  await client.evaluate('__offlineLod.open()');
  for(const lod of [0,1,2,0]){
    const observed=await client.evaluate(`__offlineLod.setLod(${lod})`);
    observed.motion=await client.evaluate('__offlineLod.motion()');
    // Wait through first-use shader/driver work and compositor presentation before visual evidence.
    await client.evaluate('__offlineLod.frames(30)');
    observed.presented=await client.evaluate(`__offlineLod.inspect(${lod})`);
    if(observed.presented.instances<6 || observed.presented.triangles<observed.presented.models.reduce((sum,m)=>sum+m.triangles,0))throw new Error('All three models have not reached a rendered frame');
    report.lods.push(observed);
    await client.screenshot(path.join(out,`lod-${lod}-${report.lods.length}.png`),{format:'png'});save();
  }
  report.warmBaseline=await client.evaluate('__offlineLod.close()');
  for(let i=0;i<20;i++){
    await client.evaluate(`(async()=>{await __offlineLod.open();await __offlineLod.setLod(${i%3});await __offlineLod.close();})()`);
    const snapshot=await client.evaluate('__offlineLod.snapshot()');report.cycles.push(snapshot);
    if(snapshot.nodes!==report.warmBaseline.nodes||snapshot.refs.some(r=>r.refs!==0)
      ||snapshot.gfx.bufferSize>report.warmBaseline.gfx.bufferSize||snapshot.gfx.textureSize>report.warmBaseline.gfx.textureSize)throw new Error('Lifecycle did not return to warm baseline');
    save();
  }
  report.unexpectedConsole=report.console.filter(row=>!(options.webgl===1&&row.args?.join(' ')==='This device does not support WebGL2'));
  if(report.unexpectedConsole.length)throw new Error('Unexpected runtime diagnostics');
  report.ok=true;report.visualReview='pending: inspect all LOD screenshots';save();
  console.log(JSON.stringify({ok:true,out,lodTriangles:report.lods.map(l=>l.models.map(m=>m.triangles)),cycles:report.cycles.length}));
}catch(error){report.error=error.stack;save();console.error(error);process.exitCode=1;}
finally{if(client){await client.evaluate('globalThis.__offlineLod?.close()').catch(()=>{});client.close();}if(tab)await fetch(options.devtools+'/json/close/'+tab.id).catch(()=>{});}
