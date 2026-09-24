#!/usr/bin/env node
/** O4: real release build on an existing loopback server. Own tabs; never changes the user's preview.
 * The PNG case masks ASTC extensions before boot. It is fault injection, NOT mobile-device evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CdpClient, pageWalkSource, sleep, worldToPage } from './lib.mjs';
import { installMapOriginalMetrics } from './maporiginal-metrics.mjs';
import { mapOriginalGestureArea, mapOriginalWheel } from './maporiginal.mjs';

const [url, auditFile, output] = process.argv.slice(2);
if (!url || !auditFile || !output) throw Error('Usage: probe-maporiginal-compression.mjs <release-url> <build-audit.json> <out>');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port === '7456') throw Error('Use a local release server, not editor preview');
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const manifest = JSON.parse(fs.readFileSync('apps/kits/mapOriginal/data/maps/s1/manifest.json', 'utf8'));
const out = path.resolve(output); fs.mkdirSync(out, {recursive:true});
const webgl1=process.argv.includes('--webgl1'), landscape=process.argv.includes('--landscape');
const report = {ok:false, scope:'Desktop release build; ASTC masking is injected unsupported capability, not natural mobile hardware',
    auditSha256:createHash('sha256').update(fs.readFileSync(auditFile)).digest('hex'),contentVersion:manifest.contentVersion,
    focusEmulation:true,webgl1,landscape,cases:[]};

function maskAstc() {
    const record=globalThis.__mapoAstcFault={installedBeforeCocos:typeof cc==='undefined',queries:[],nativeSupport:[]};
    const masked=name=>/^(?:(?:WEBKIT|MOZ)_)?WEBGL_compressed_texture_astc$/i.test(name);
    for(const Type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext].filter(Boolean)) {
        const proto=Type.prototype, extension=proto.getExtension, supported=proto.getSupportedExtensions;
        proto.getExtension=function(name){if(masked(name)){record.queries.push(name);return null;}return extension.apply(this,arguments);};
        proto.getSupportedExtensions=function(){const list=supported.call(this);record.nativeSupport.push(...(list??[]).filter(masked));return list?.filter(n=>!masked(n))??list;};
    }
}

const moduleSource = key => `[...System.entries()].find(([,m])=>m?.[${JSON.stringify(key)}])[1][${JSON.stringify(key)}]`;
async function run(mode) {
    const tab=await(await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'})).json();
    const c=await CdpClient.connect(tab.webSocketDebuggerUrl);
    const result={mode,ok:false,console:[],nativeRequests:[],cycles:[]};report.cases.push(result);
    c.on(message=>{
        if(message.method==='Runtime.exceptionThrown')result.console.push({kind:'uncaught',details:message.params.exceptionDetails});
        if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))
            result.console.push({kind:message.params.type,args:message.params.args.map(a=>a.value??a.description)});
        if(message.method==='Network.responseReceived' && message.params.response.url.includes('/assets/'+manifest.bundle+'/native/'))
            result.nativeRequests.push({url:message.params.response.url,status:message.params.response.status});
    });
    const until=async(source,label)=>{const deadline=Date.now()+45000;while(Date.now()<deadline){const v=await c.evaluate(source);if(v)return v;await sleep(100);}throw Error('Timeout: '+label);};
    const ready=()=>until(`(()=>{const maps=(${moduleSource('mapoArtDiagnostics')})();return maps.length===1&&!maps[0].closed&&Object.values(maps[0].groups).filter(g=>g.wanted).every(g=>g.state==='ready')?maps[0]:null;})()`,'wanted map groups');
    const snap=()=>c.evaluate('globalThis.__mapOriginalMetrics.snapshot()');
    // ViewMgr.open alone bypasses PluginHost.install, so there is no map ticker.
    // Exercise the same AppRuntime.launch boundary as the menu on every reopen.
    const open=async()=>{
        await c.evaluate(`(()=>{const main=cc.director.getScene().getComponentInChildren('Main');if(!main?.runtime)throw Error('Missing application host');return main.runtime.launch({kind:'route',routeId:'mapOriginalWorld'}).then(()=>true);})()`);
        await until(`Boolean((${moduleSource('mapoRuntimeOrNull')})())`,'installed map runtime');
    };
    async function close(){await c.evaluate(`(${moduleSource('appNavigation')}).close('mapOriginalWorld')`);return until(`(()=>{const s=__mapOriginalMetrics.snapshot();return !s.cpu.maps.length&&!s.mapNodes&&!s.sourceTextureRgba8Bytes&&!s.rtBytesWithDepth&&!s.cpu.retainedArrayBufferBytes&&!s.cpu.loadedBufferAssetBytes?s:null})()`,'closed map releases');}
    try {
        await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Network.enable');
        // Keep the owned test page running when the user works in another window.
        // This is a lifecycle/format test, not a foreground frame-time benchmark.
        await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
        await c.send('Network.setCacheDisabled',{cacheDisabled:true});
        await c.send('Emulation.setDeviceMetricsOverride',landscape
            ?{width:1624,height:750,deviceScaleFactor:1,mobile:false}:{width:393,height:773,deviceScaleFactor:2,mobile:true});
        if(webgl1)await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(name,...args){return name==='webgl2'?null:original.call(this,name,...args);};})()`});
        if(mode==='png-injected-unsupported')await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${maskAstc.toString()})()`});
        await c.send('Page.navigate',{url});
        await until(`!document.hidden`,'visible test-page lifecycle');
        await until(`typeof cc!=='undefined'&&cc.director?.getScene()&&typeof System!=='undefined'&&[...System.entries()].some(([,m])=>m.mapoArtDiagnostics)`,'release boot');
        await until(`(${pageWalkSource}).nodes.some(n=>n.name==='btn_login')`,'application navigation ready');
        await c.evaluate(`(${installMapOriginalMetrics.toString()})()`);
        result.entry='AppRuntime.launch → PluginHost.install → NavigationService.open';
        // The host/page APIs also exercise Map/Set spread after release transpilation.
        await open();await ready();
        const point=await c.evaluate(`(()=>{
            const visit=n=>[n,...n.children.flatMap(visit)],world=visit(cc.director.getScene()).find(n=>n.name==='mapo-world');
            if(!world)throw Error('No map world');const p=(${moduleSource('mapoGrid2Pos')})(750,749);
            const w=cc.Vec3.transformMat4(new cc.Vec3(),new cc.Vec3(p.x,p.y,0),world.worldMatrix),r=cc.game.canvas.getBoundingClientRect();
            return (${worldToPage.toString()})(w,cc.view.getVisibleSize(),cc.view.getVisibleOrigin(),{x:r.x,y:r.y,width:r.width,height:r.height});
        })()`);
        result.clickPoint=point;
        await c.click(point.x,point.y);
        await until(`(${pageWalkSource}).nodes.some(n=>n.text?.includes('(750, 749)'))`,'selected original cell');
        await ready();
        result.selected=await snap();
        if (manifest.assets['decor-config.json']) {
            const data=result.selected.cpu.maps.find(m=>!m.closed)?.data;
            if(data?.decor?.prefabs!==135||data?.tops?.atlases!==3)throw Error('External presentation configuration not installed');
        }
        if(webgl1&&!result.selected.environment.api.startsWith('WebGL 1.'))throw Error('WebGL1 was not selected');
        const textures=result.selected.textures.filter(t=>t.valid);
        if(textures.length!==Object.keys(audit.textures).length)throw Error('Not all texture groups loaded');
        for(const [logical,expected] of Object.entries(audit.textures)) {
            const row=textures.find(t=>t.path===manifest.assets[logical].path+'/texture');
            const compressed=mode==='astc-native'&&expected.format==='ASTC_RGBA_4X4';
            if(!row||row.format!==(compressed?89:35)||row.gfxBytes!==(compressed?expected.gpuBytes:expected.rgba8Bytes))
                throw Error('Actual GPU format/size mismatch: '+logical+': '+JSON.stringify(row));
        }
        result.actualSourceGpuBytes=textures.reduce((n,t)=>n+t.gfxBytes,0);
        result.capabilities=await c.evaluate(`(()=>{const canvas=cc.game.canvas,gl=canvas.getContext('webgl2')??canvas.getContext('webgl');return {extensions:gl.getSupportedExtensions(),astc:!!gl.getExtension('WEBGL_compressed_texture_astc'),fault:globalThis.__mapoAstcFault??null};})()`);
        if(mode==='astc-native'&&!result.capabilities.astc)throw Error('Native ASTC GPU required for this case');
        if(mode==='png-injected-unsupported'&&(result.capabilities.astc||!result.capabilities.fault.installedBeforeCocos||!result.capabilities.fault.queries.length))throw Error('Unsupported fault not exercised');
        const astcRequests=result.nativeRequests.filter(r=>r.url.endsWith('.astc'));
        if(astcRequests.length!==(mode==='astc-native'?audit.astcTextures:0)||result.nativeRequests.some(r=>r.status!==200))throw Error('Wrong native variant requests');
        await c.screenshot(path.join(out,mode+'.png'),{format:'png'});
        const zoom=async(target,delta)=>{
            for(let i=0;i<64;i++) {
                const walk=await c.evaluate(pageWalkSource);
                // Release minification changes constructor.name; explicit mapo node names are stable.
                const title=walk.nodes.find(n=>n.name==='mapo-title')?.text,match=/LOD ([0-3])\//u.exec(title??'');
                if(match&&Number(match[1])===target)return {title};
                await mapOriginalWheel({client:c},mapOriginalGestureArea(walk),delta,1);
            }
            throw Error('Could not reach LOD '+target);
        };
        await zoom(1,240);await ready();
        await until(`(()=>{const nodes=${pageWalkSource};return nodes.nodes.some(n=>n.name.startsWith('mapo-cache-1/'));})()`,'L1 baked cache');
        result.l1=await snap();
        if(result.l1.rtBytesWithDepth>48*1024*1024)throw Error('RT budget changed');
        await zoom(3,240);await sleep(5600);
        result.l3=await snap();
        if(result.l3.rtBytesWithDepth||result.l3.textures.filter(t=>t.valid).length!==2)throw Error('L3 retained near sources');
        if (manifest.assets['decor-config.json']) {
            const data=result.l3.cpu.maps.find(m=>!m.closed)?.data;
            if(!data||[...Object.values(data.decor),...Object.values(data.tops)].some(v=>v!==0))throw Error('L3 retained external presentation configuration');
        }
        await zoom(0,-240);await ready();
        for(let i=0;i<10;i++) {
            const state=await close();result.cycles.push({cycle:i+1,source:state.sourceTextureRgba8Bytes,rt:state.rtBytesWithDepth,cpu:state.cpu.retainedArrayBufferBytes,maps:state.cpu.maps.length});
            await open();await ready();
        }
        await close();
        result.expectedBootErrors=webgl1?result.console.filter(e=>e.kind==='error'&&e.args?.length===1&&e.args[0].startsWith('Error 16405,')):[];
        // Creator tries WebGL2 before falling back. 16405 is that explicit injected failure.
        if(result.console.length!==result.expectedBootErrors.length)throw Error('Unexpected release console warnings/errors');
        result.ok=true;
    } catch(error) {
        try{result.failureSnapshot=await snap();}catch{}
        throw error;
    } finally {
        try{await c.evaluate('globalThis.__mapOriginalMetrics?.stop()');}catch{}
        c.close();await fetch('http://127.0.0.1:9222/json/close/'+tab.id);
    }
}
try{await run('astc-native');await run('png-injected-unsupported');report.ok=true;}
catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,cases:report.cases.map(c=>({mode:c.mode,ok:c.ok,bytes:c.actualSourceGpuBytes})),error:report.error,out}));}
