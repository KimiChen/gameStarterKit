#!/usr/bin/env node
/** O4 river sampler comparison: exact fragment body from the runtime effect, fixed coordinates/time. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { CdpClient } from '../creator-preview/lib.mjs';

const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); if (i < 0 || !args[i + 1]) throw Error('Missing ' + key); return path.resolve(args[i + 1]); };
const out = value('--out'), textures = value('--textures');
if (!out.startsWith(path.resolve('.cache') + path.sep)) throw Error('Output must be inside .cache');
const source = fs.readFileSync('tools/maporiginal-assets/shaders/mapo-river.effect', 'utf8');
const start = source.indexOf('  vec3 waveNormal(');
if (start < 0) throw Error('River fragment entry changed');
let body = source.slice(start, source.lastIndexOf('}%')).trim();
body = body.replace(/\/\/[^\r\n]*/g, '').replaceAll('texture(', 'texture2D(');
const fragment = `precision highp float; varying vec2 v_position; uniform sampler2D mainTexture; uniform sampler2D normalTexture; uniform vec4 clockCamera;\n${body}\nvoid main(){gl_FragColor=frag();}`;
const samples = [{name:'whole-mask', x:0, y:-112500, span:450000, t:0}];
// Source mask landmarks include nonzero RGB at alpha=0. Invert the shader's mapUV transform.
for (const [i, [px,py]] of [[1276,523],[1374,1001],[2015,1915]].entries()) {
    const u=((px+.5)/2048-.5)/Math.sqrt(2), v=((py+.5)/2048-.5)/Math.sqrt(2), a=45/180*3.14;
    const x=(.5+u*Math.cos(a)+v*Math.sin(a))*450000-225000, y=(-.5-u*Math.sin(a)+v*Math.cos(a))*225000;
    for (const t of [0,.37,1,10]) samples.push({name:`flow-${i}-${t}`,x,y,span:1200,t});
}
const files = new Map(['river-mask.png', 'river-normal.png'].map(n => ['/' + n, fs.readFileSync(path.join(textures, n))]));
const raw = new Map([...files.keys()].map(n => [n+'.rgba',execFileSync(process.env.MAPO_PYTHON??'python3',
    ['-c','from PIL import Image; import sys,struct; im=Image.open(sys.argv[1]).convert("RGBA"); sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',path.join(textures,n.slice(1))],{maxBuffer:32*1024*1024})]));
const html = `<!doctype html><meta charset="utf-8"><canvas></canvas><script>
window.result=(async()=>{
 const canvas=document.querySelector('canvas'); canvas.width=1024; canvas.height=1024;
 const gl=canvas.getContext('webgl',{alpha:false,preserveDrawingBuffer:true,antialias:false}); if(!gl)throw Error('No WebGL1');
 const shader=(kind,text)=>{const s=gl.createShader(kind);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 position; varying vec2 v_position; uniform vec3 region; void main(){v_position=region.xy+position*region.z*.5;gl_Position=vec4(position,0,1);}'));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,${JSON.stringify(fragment)}));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 for(const [i,name] of ['river-mask.png','river-normal.png'].entries()){const data=await(await fetch('/'+name+'.rgba')).arrayBuffer(),header=new DataView(data);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,header.getUint32(0,true),header.getUint32(4,true),0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(data,8));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.uniform1i(gl.getUniformLocation(p,i?'normalTexture':'mainTexture'),i);}
 const images=[];for(const s of ${JSON.stringify(samples)}){gl.uniform3f(gl.getUniformLocation(p,'region'),s.x,s.y,s.span);gl.uniform4f(gl.getUniformLocation(p,'clockCamera'),s.t,s.x,s.y,0);gl.drawArrays(gl.TRIANGLES,0,6);gl.finish();if(gl.getError()!==0)throw Error('WebGL error');images.push({name:s.name,png:canvas.toDataURL('image/png').split(',')[1]});}
 return {images,renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};
})();</script>`;
const server = http.createServer((req,res) => { const data=raw.get(req.url);res.setHeader('Content-Type',data?'application/octet-stream':'text/html; charset=utf-8');res.end(data??html); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let tab, client;
try {
    tab=await(await fetch('http://127.0.0.1:9222/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();
    client=await CdpClient.connect(tab.webSocketDebuggerUrl);await client.send('Page.bringToFront');
    const deadline=Date.now()+30000;
    while(!await client.evaluate('Boolean(window.result)')) {
        if(Date.now()>deadline)throw Error('Water probe did not initialize');
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    const result=await client.evaluate('window.result');
    fs.mkdirSync(out,{recursive:true});
    for(const img of result.images)fs.writeFileSync(path.join(out,img.name+'.png'),Buffer.from(img.png,'base64'));
    const hash=b=>createHash('sha256').update(b).digest('hex');
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({shaderSha256:hash(source),samples,textures,
        sourceHashes:Object.fromEntries([...files].map(([k,v])=>[k,hash(v)])),upload:'RGBA bytes; no browser alpha premultiplication',
        renderer:result.renderer,version:result.version},null,2)+'\n');
    console.log(JSON.stringify({out,images:result.images.length}));
} finally { client?.close();if(tab)await fetch('http://127.0.0.1:9222/json/close/'+tab.id);server.close(); }
