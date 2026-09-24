/** O5 格式试验：node --expose-gc tools/maporiginal-assets/measure_config.mjs --input DIR --out FILE
 * binary 候选为字符串字典 + 带类型的 f64 树，不量化任何数值；仅用于对照，不是发布格式。
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';

function encode(value) {
    const strings = [], ids = new Map(), parts = [];
    const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parts.push(b); };
    const text = s => { if (!ids.has(s)) { ids.set(s, strings.length); strings.push(s); } u32(ids.get(s)); };
    const visit = v => {
        const tag = v === null ? 0 : typeof v === 'boolean' ? (v ? 2 : 1) : typeof v === 'number' ? 3
            : typeof v === 'string' ? 4 : Array.isArray(v) ? 5 : 6;
        parts.push(Buffer.from([tag]));
        if (tag === 3) { const b = Buffer.alloc(8); b.writeDoubleLE(v); parts.push(b); }
        if (tag === 4) text(v);
        if (tag === 5) { u32(v.length); v.forEach(visit); }
        if (tag === 6) { const entries = Object.entries(v); u32(entries.length); for (const [k, x] of entries) { text(k); visit(x); } }
    };
    visit(value);
    const dictionary = Buffer.from(JSON.stringify(strings)), header = Buffer.alloc(8);
    header.write('MOC1'); header.writeUInt32LE(8 + dictionary.length, 4);
    return Buffer.concat([header, dictionary, ...parts]);
}
function decode(bytes) {
    if (bytes.length < 8 || bytes.toString('ascii', 0, 4) !== 'MOC1') throw Error('binary header');
    let offset = bytes.readUInt32LE(4);
    if (offset < 8 || offset > bytes.length) throw Error('binary offset');
    const strings = JSON.parse(bytes.toString('utf8', 8, offset));
    const take = n => { const p = offset; offset += n; if (offset > bytes.length) throw Error('binary truncated'); return p; };
    const u32 = () => bytes.readUInt32LE(take(4));
    const text = () => { const id = u32(); if (id >= strings.length) throw Error('binary string id'); return strings[id]; };
    const visit = (depth = 0) => {
        if (depth > 128) throw Error('binary depth');
        switch (bytes[take(1)]) {
            case 0: return null;
            case 1: return false;
            case 2: return true;
            case 3: return bytes.readDoubleLE(take(8));
            case 4: return text();
            case 5: { const n = u32(), out = []; if (n > bytes.length - offset) throw Error('binary length'); for (let i=0;i<n;i++) out.push(visit(depth+1)); return out; }
            case 6: { const n = u32(), out = {}; if (n > (bytes.length - offset)/5) throw Error('binary length'); for(let i=0;i<n;i++) { const k=text(); Object.defineProperty(out,k,{value:visit(depth+1),enumerable:true,writable:true,configurable:true}); } return out; }
            default: throw Error('binary tag');
        }
    };
    const out = visit(); if (offset !== bytes.length) throw Error('binary trailing bytes'); return out;
}
function sample(read) {
    for(let i=0;i<10;i++) read();
    const samples=[];
    for(let i=0;i<50;i++) { const start=performance.now(); read(); samples.push(performance.now()-start); }
    samples.sort((a,b)=>a-b);
    let retainedHeapBytesPerCopy=null;
    if(global.gc) {
        global.gc(); const before=process.memoryUsage().heapUsed, copies=Array.from({length:20},read);
        global.gc(); retainedHeapBytesPerCopy=(process.memoryUsage().heapUsed-before)/copies.length;
        assert.equal(copies.length,20);
    }
    return {medianMs:samples[25],p95Ms:samples[47],retainedHeapBytesPerCopy};
}
const arg = name => { const i=process.argv.indexOf(name); if(i<0 || !process.argv[i+1]) throw Error(`${name} required`); return path.resolve(process.argv[i+1]); };
const input=arg('--input'), out=arg('--out');
const baselineIndex=process.argv.indexOf('--baseline'), baseline=baselineIndex<0?null:process.argv[baselineIndex+1];
const report={version:1,node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0].model,baseline,
    notes:'gzip level 9 per file is a transfer estimate, not measured network traffic. Heap is 20 parsed copies with forced GC, not page memory. JS compilation uses distinct source to avoid V8 source cache; execute uses a compiled script. Binary candidate keeps f64 and all fields.',files:{},script:{}};
for(const name of ['decor','tops']) {
    const file=path.join(input,fs.existsSync(path.join(input,`${name}-config.json`))?`${name}-config.json`:`${name}.json`);
    const json=fs.readFileSync(file,'utf8'), value=JSON.parse(json), binary=encode(value);
    assert.deepEqual(decode(binary),value);
    assert.throws(()=>decode(binary.subarray(0,binary.length-1)));
    const bad=Buffer.from(binary); bad.writeUInt32LE(binary.length+1,4); assert.throws(()=>decode(bad));
    report.files[name]={sha256:createHash('sha256').update(json).digest('hex'),
        json:{rawBytes:Buffer.byteLength(json),gzipBytes:gzipSync(json,{level:9}).length,...sample(()=>JSON.parse(json))},
        binary:{rawBytes:binary.length,gzipBytes:gzipSync(binary,{level:9}).length,...sample(()=>decode(binary))}};
    if (process.argv.includes('--runtime')) {
        const {mapoReadDecorConfig,mapoReadTopConfig}=await import('../../apps/client/src/kits/mapOriginal/logic/mapoPresentation.ts');
        const {mapoValidateBuffer}=await import('../../apps/client/src/kits/mapOriginal/logic/mapoManifest.ts');
        const bytes=Buffer.from(json), read=name==='decor'?mapoReadDecorConfig:mapoReadTopConfig;
        report.files[name].runtime=sample(()=>{mapoValidateBuffer(`${name}-config.json`,bytes);return read(bytes);});
    }
}
for(const name of ['decor','tops','top-scenes']) {
    const file=path.join(input,`${name}.data.ts`); if(!baseline&&!fs.existsSync(file)) continue;
    const source=baseline?execFileSync('git',['show',`${baseline}:apps/shared/src/kits/mapOriginal/content/${name}.data.ts`],{encoding:'utf8',maxBuffer:4*1024*1024}):fs.readFileSync(file,'utf8');
    const built=transformSync(source,{loader:'ts',format:'cjs',minify:true,treeShaking:false}).code;
    const code=`(()=>{var module={exports:{}},exports=module.exports;${built};return module.exports})()`;
    let nonce=0;
    const compiled=new vm.Script(code);
    report.script[name]={sourceBytes:Buffer.byteLength(source),minifiedBytes:Buffer.byteLength(code),gzipBytes:gzipSync(code,{level:9}).length,
        compile:sample(()=>new vm.Script(code+`\n// cold-${nonce++}`)),execute:sample(()=>compiled.runInThisContext())};
}
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
