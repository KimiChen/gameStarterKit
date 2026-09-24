#!/usr/bin/env node
/** O6 desktop CPU/upload baseline. Own tab; controlled focus, no foreground frame-time claim. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {CdpClient,openScene,pageWalkSource,sleep} from './lib.mjs';
import {installMapOriginalMetrics,distribution} from './maporiginal-metrics.mjs';
import {MAPO_BASELINE_BIOMES,mapOriginalGestureArea} from './maporiginal.mjs';
const [url,output]=process.argv.slice(2);if(!url||!output)throw Error('Usage: probe-maporiginal-animation.mjs <local-url> <out> [--webgl1] [--landscape]');
const out=path.resolve(output);fs.mkdirSync(out,{recursive:true});
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local only');
const tab=await(await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'})).json();
const c=await CdpClient.connect(tab.webSocketDebuggerUrl);
const report={ok:false,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),focusEmulation:true,scope:'Desktop instrumented per-tick CPU and actual GL uploads; no foreground frame-time claim',console:[],samples:[]};
c.on(m=>{if(m.method==='Runtime.exceptionThrown')report.console.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))report.console.push(m.params.args.map(a=>a.value??a.description));});
const until=async(source,label)=>{const end=Date.now()+60000;while(Date.now()<end){let x;try{x=await c.evaluate(source)}catch{}if(x)return x;await sleep(100)}throw Error('Timeout '+label)};
const mod=k=>`[...System.entries()].find(([,m])=>m?.[${JSON.stringify(k)}])[1][${JSON.stringify(k)}]`;
const ready=()=>until(`(()=>{const a=(${mod('mapoArtDiagnostics')})();return a.length===1&&Object.values(a[0].groups).filter(g=>g.wanted).every(g=>g.state==='ready')})()`,'art');
try{
 await c.send('Runtime.enable');await c.send('Page.enable');await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await c.send('Emulation.setDeviceMetricsOverride',process.argv.includes('--landscape')?{width:1624,height:750,deviceScaleFactor:1,mobile:false}:{width:393,height:773,deviceScaleFactor:2,mobile:true});
 if(process.argv.includes('--webgl1'))await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const f=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(n,...a){return n==='webgl2'?null:f.call(this,n,...a)}})()`});
 if(new URL(url).port==='7456')await openScene(c,{preview:url,sceneUuid:'33a6cd88-ca61-42f3-97e1-6b18a9096a34',timeoutMs:180000});
 else{await c.send('Page.navigate',{url});await until(`typeof cc!=='undefined'&&!!cc.director?.getScene()?.getComponentInChildren('Main')?.runtime`,'boot')}
 if(new URL(url).port==='7456'){
  const base=path.resolve('apps/Cocos/temp/programming/packer-driver/targets/preview');
  const imports=JSON.parse(fs.readFileSync(path.join(base,'import-map.json'))).imports;
  report.compiled={};
  for(const name of ['view/MapoDecorRenderer','view/MapoTopRenderer','view/MapoMeshBatch','logic/mapoSceneCompiled','logic/mapoSpriteUpdates','logic/mapoTops']){
   const file=path.resolve('apps/Cocos/assets/src/kits/mapOriginal/'+name+'.ts'),source=fs.readFileSync(file,'utf8'),chunk=imports[pathToFileURL(file).href];
   if(!chunk||!JSON.parse(fs.readFileSync(path.join(base,chunk+'.map'))).sourcesContent.includes(source))throw Error('Stale Creator compilation: '+name);
   report.compiled[name]=createHash('sha256').update(source).digest('hex');
  }
 }
 await c.evaluate(`(${installMapOriginalMetrics.toString()})()`);
 await c.evaluate(`(()=>{const state=globalThis.__mapoAnimationProbe={rows:[],restore:[],instances:new Set(),depth:0,bytes:0,calls:0};
 const canvas=cc.game.canvas,gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
 for(const name of ['bufferData','bufferSubData']){const old=gl[name];gl[name]=function(...a){const d=a[name==='bufferData'?1:2];if(state.depth&&d?.byteLength!==undefined){state.bytes+=a[4]?a[4]*(d.BYTES_PER_ELEMENT??1):d.byteLength-(a[3]??0)*(d.BYTES_PER_ELEMENT??1);state.calls++}return old.apply(this,a)};state.restore.push(()=>gl[name]=old)}
 for(const key of ['MapoDecorRenderer','MapoTopRenderer']){
  const Type=[...System.entries()].find(([,m])=>m?.[key])[1][key],old=Type.prototype.tick;
  Type.prototype.tick=function(dt){state.instances.add(this);const start=performance.now(),b=state.bytes,k=state.calls;state.depth++;
   try{return old.call(this,dt)}finally{state.depth--;state.rows.push({kind:key+(this.kind?'/'+this.kind:''),ms:performance.now()-start,bytes:state.bytes-b,calls:state.calls-k})}};
  state.restore.push(()=>Type.prototype.tick=old);
 }
})()`);
 await c.evaluate(`cc.director.getScene().getComponentInChildren('Main').runtime.launch({kind:'route',routeId:'mapOriginalWorld'}).then(()=>true)`);await ready();
 const sample=async(name,drag=false)=>{
  await sleep(500);await c.evaluate(`__mapoAnimationProbe.rows=[];__mapOriginalMetrics.resetFrames()`);
  if(drag){const w=await c.evaluate(pageWalkSource),a=mapOriginalGestureArea(w);const x=a.x,y=a.y;await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});for(let i=1;i<=60;i++){await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+70*Math.sin(i/60*Math.PI*2),y:y+50*Math.sin(i/60*Math.PI*2),button:'left',buttons:1});await sleep(33)}await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});}
  else await sleep(4200);
  const state=await c.evaluate(`({rows:__mapoAnimationProbe.rows,snapshot:__mapOriginalMetrics.snapshot()})`);
  const kinds=[...new Set(state.rows.map(r=>r.kind))],summary=Object.fromEntries(kinds.map(k=>[k,Object.fromEntries(['ms','bytes','calls'].map(key=>[key,distribution(state.rows.filter(r=>r.kind===k).map(r=>r[key]))]))]));
  report.samples.push({name,summary,...state});await c.screenshot(path.join(out,name+'.png'),{format:'png'});
 };
 const verify=async(name,fixture=false)=>{
  await c.evaluate(`cc.game.pause();cc.profiler.hideStats()`);
  try {
   if(fixture)await c.evaluate(`(()=>{
    const get=k=>[...System.entries()].find(([,m])=>m?.[k])[1][k];
    const instances=[...__mapoAnimationProbe.instances],decor=instances.find(r=>r.key&&!r.kind);
    const ids=decor.key.split(';'),[row,col]=ids[Math.floor(ids.length/2)].split(',').map(Number),p=get('mapoGrid2Pos')(row,col);
    for(const r of instances.filter(r=>r.kind)){
     const scenes=r.art.data.tops.config.scenes[r.kind];
     const polys=Object.keys(scenes).map((id,i)=>({s:row+col+i,geo:Number(id)+1,x:p.x+i*10,y:p.y,verts:new Float32Array(),indices:new Uint16Array(),uv:[0,0],rgba:[1,1,1,1]}));
     r.render(polys,true);
    }
   })()`);
   for(const time of [0,.125,.5,1,2,10]) {
    const validation=await c.evaluate(`(()=>{
     const get=k=>[...System.entries()].find(([,m])=>m?.[k])[1][k],items=[];
     for(const r of __mapoAnimationProbe.instances){
      if(!r.visible)continue;r.seconds=${time};r.flush();
      const data=r.art.data;let sprites;
      if(r.kind){const polys=r.key.split(';').filter(Boolean).map(k=>{const [s,geo,x,y]=k.split(',').map(Number);return {s,geo,x,y}});sprites=data.tops.mapoTopsFor(r.kind,polys,Infinity,${time});}
      else{sprites=r.key.split(';').filter(Boolean).flatMap(k=>{const [row,col]=k.split(',').map(Number),p=data.decor.mapoDecorAt(row,col,data.terrain.mapoValueAt(row,col),true,data.bands.mapoBandAt);return p?get('mapoSceneSprites')(p.cell.scene,data.decor.textures,data.decor.size,${time},p):[]})}
      const geometry=get('buildMapoSpriteMeshes')(sprites);
      if(geometry.length!==r.batches.length)throw Error('Wrong batch count');
      geometry.forEach((g,i)=>{
       const mesh=r.batches[i].mesh;
       for(const [name,values] of [['a_position',g.positions],['a_texCoord',g.uvs],['a_color',g.colors],['a_colorAdd',g.addColors]]){
        const actual=mesh.readAttribute(0,name);if(!actual||actual.length!==values.length||values.some((v,j)=>v!==actual[j]))throw Error('CPU mesh differs: '+name);
       }
       const indices=mesh.readIndices(0);if(indices.length!==g.indices16.length||g.indices16.some((v,j)=>v!==indices[j]))throw Error('Wrong index buffer');
       for(const [key,v] of [['minPosition',g.minPos],['maxPosition',g.maxPos]])if(['x','y','z'].some((k,j)=>mesh.struct[key][k]!==v[j]))throw Error('Wrong bounds');
      });items.push({r,geometry});
     }
     globalThis.__mapoReferenceGeometry=items;cc.director.tick(0);
     return items.map(({r,geometry})=>({kind:r.kind??'decor',quads:geometry.reduce((n,g)=>n+g.quads,0),batches:geometry.length}));
    })()`);
    const prefix=name+'-'+String(time).replace('.','_');
    await c.screenshot(path.join(out,prefix+'-incremental.png'),{format:'png'});
    await c.evaluate(`(()=>{const upload=${mod('uploadMapoBatch')};for(const {r,geometry} of __mapoReferenceGeometry)geometry.forEach((g,i)=>upload(r.batches[i],g));cc.director.tick(0)})()`);
    await c.screenshot(path.join(out,prefix+'-reference.png'),{format:'png'});
    (report.geometry??=[]).push({name,time,prefix,validation});
   }
  }finally{await c.evaluate(`delete globalThis.__mapoReferenceGeometry;cc.game.resume()`)}
 };
 await sample('grass');
 if(process.argv.includes('--verify'))await verify('grass');
 await sample('drag',true);
 for(const target of MAPO_BASELINE_BIOMES){const w=await c.evaluate(pageWalkSource),m=w.nodes.find(n=>n.name==='mapo-minimap'&&n.center);if(!m)throw Error('Missing minimap');await c.click(m.center.x+(target.u-.5)*m.center.width*w.canvas.width/w.visible.width,m.center.y+(target.v-.5)*m.center.height*w.canvas.height/w.visible.height);await ready();await sample(target.name);if(process.argv.includes('--verify'))await verify(target.name)}
 if(process.argv.includes('--verify'))await verify('dynamic-top-fixtures',true);
 report.expectedBootErrors=process.argv.includes('--webgl1')?report.console.filter(e=>Array.isArray(e)&&e.length===1&&e[0].startsWith('Error 16405,')):[];
 if(report.console.length!==report.expectedBootErrors.length)throw Error('Unexpected engine console errors');
 report.ok=true;
}catch(e){report.error=String(e.stack??e);process.exitCode=1}
finally{try{await c.evaluate(`__mapoAnimationProbe?.restore.reverse().forEach(f=>f());delete globalThis.__mapoAnimationProbe;__mapOriginalMetrics?.stop()`)}catch{}c.close();await fetch('http://127.0.0.1:9222/json/close/'+tab.id);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,samples:report.samples.map(s=>({name:s.name,summary:s.summary})),error:report.error}))}
