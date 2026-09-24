/**
 * node --import tsx tools/maporiginal-assets/capture_layout.ts --out .cache/layout-before
 * 本机 Chrome 9222 的独立标签页执行 WebGL1 正交烘焙；只读取派生包，关闭自己的标签页。
 * 与运行时 MapoChunkBaker 共用 mapoStaticScene，不能按 res 类别上色替代原地貌。
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { CdpClient } from "../creator-preview/lib.mjs";
import { mapoGrid2Pos } from "../../apps/client/src/shared/kits/mapOriginal/api/hexmap/index";
import { mapoCitiesIn, mapoSetCities } from "../../apps/client/src/kits/mapOriginal/logic/mapoCities";
import { buildMapoSpriteMeshes, mapoPainterCompare, type MapoSpriteInput } from "../../apps/client/src/kits/mapOriginal/logic/mapoMesh";
import { mapoSetDisplayTerrain } from "../../apps/client/src/kits/mapOriginal/logic/mapoTerrain";
import { mapoStaticScene, mapoStaticDecorSprites, type MapoStaticBatch } from "../../apps/client/src/kits/mapOriginal/logic/mapoStaticScene";
import { mapoSetBlockGeo, mapoSetBlocks } from "../../apps/client/src/kits/mapOriginal/logic/mapoBlocks";
import { mapoSetRegions } from "../../apps/client/src/kits/mapOriginal/logic/mapoRegions";
import { mapoSetRiverGeo, mapoSetRivers } from "../../apps/client/src/kits/mapOriginal/logic/mapoRivers";
import { mapoSetTops } from "../../apps/client/src/kits/mapOriginal/logic/mapoTops";
import { mapoSetRoads } from "../../apps/client/src/kits/mapOriginal/logic/mapoRoads";
import { mapoSceneSprites } from "../../apps/client/src/kits/mapOriginal/logic/mapoScene";
import { MAPO_DECOR_CELLS, MAPO_DECOR_SNOW_CELLS, MAPO_DECOR_DESERT_CELLS, MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from "../../apps/client/src/shared/kits/mapOriginal/content/decor.data";
import type { IMapoPrefabCell } from "../../apps/client/src/shared/kits/mapOriginal/content/prefabs.types";

const timeArg = process.argv.indexOf("--seconds");
const seconds = timeArg < 0 ? 0 : Number(process.argv[timeArg + 1]);
if (!Number.isFinite(seconds) || seconds < 0) throw new Error("invalid --seconds");
const pageArg = process.argv.indexOf("--decor-pages");
const pageDir = pageArg < 0 ? null : path.resolve(process.argv[pageArg + 1]);
const pages: { cells: (IMapoPrefabCell & { window: { atlasId: string } })[] } | null = pageDir
    ? JSON.parse(fs.readFileSync(path.join(pageDir, "pages.json"), "utf8")) : null;
const baselineArg = process.argv.indexOf("--decor-baseline");
const baselineDir = baselineArg < 0 ? null : path.resolve(process.argv[baselineArg + 1]);
if (baselineDir && (pages || !process.argv.includes("--gallery-only"))) throw new Error("baseline is only for single-page galleries");
const baseline: { cells: IMapoPrefabCell[]; size: [number,number] } | null = baselineDir
    ? JSON.parse(fs.readFileSync(path.join(baselineDir,"decor-atlas.info.json"),"utf8")) : null;
if (baseline && baseline.cells.some(c => !c.rect)) throw new Error("baseline requires the O1 full-canvas layout");
const decorCells = baseline?.cells ?? pages?.cells ?? MAPO_DECOR_TEXTURES;
const decorSize = baseline?.size ?? (pages ? [1, 1] as const : [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H] as const);
const opaque = process.argv.includes("--opaque-gallery");
const textureArg = process.argv.indexOf("--textures");
const textureDir = textureArg < 0 ? null : path.resolve(process.argv[textureArg + 1]);
if (textureDir && (baselineDir || pageDir)) throw new Error("--textures cannot be combined with layout trials");
function decorBatches(sprites: MapoSpriteInput[]): MapoStaticBatch[] {
    // Candidate pages may ONLY split consecutive runs after stable painter sorting.
    sprites.sort(mapoPainterCompare);
    const texturePage = new Map(pages?.cells.map(c => [c.textureId, c.window.atlasId]) ?? []);
    const batches: MapoStaticBatch[] = [];
    for (let start = 0; start < sprites.length;) {
        const texture = pages ? texturePage.get(sprites[start].textureId)! : "decor-atlas";
        let end = start + 1;
        while (end < sprites.length && (!pages || texturePage.get(sprites[end].textureId) === texture)) end++;
        batches.push(...buildMapoSpriteMeshes(sprites.slice(start, end)).map(geometry => ({texture, geometry, repeat: false})));
        start = end;
    }
    return batches;
}

async function capture(name: string, row: number, col: number, span: number) {
    const data = path.resolve("apps/kits/mapOriginal/data/maps/s1");
    const arg = process.argv.indexOf("--out");
    if (arg < 0 || !process.argv[arg + 1]) throw new Error("--out is required");
    const out = path.resolve(process.argv[arg + 1], name);
    if (!out.startsWith(path.resolve(".cache") + path.sep)) throw new Error("output must be inside .cache");
    const sourceHashes: Record<string, string> = {};
    const read = (name: string) => {
        const bytes = fs.readFileSync(path.join(data, name));
        sourceHashes[name] = createHash("sha256").update(bytes).digest("hex");
        return bytes;
    };
    for (const kind of ["desert", "snow"]) {
        mapoSetBlockGeo(kind, read(`${kind}-geo.bin`)); mapoSetBlocks(kind, read(`${kind}.bin`));
    }
    for (const kind of ["river", "desert", "snow"]) mapoSetTops(kind, read(`${kind}-tops.bin`));
    mapoSetRegions(read("regions.bin")); mapoSetRiverGeo(read("river-geo.bin")); mapoSetRivers(read("rivers.bin")); mapoSetRoads(read("roads.bin"));
    mapoSetCities(read("cities.bin")); mapoSetDisplayTerrain(read("terrain.bytes"));
    const center = mapoGrid2Pos(row, col);
    const gallery = [MAPO_DECOR_CELLS, MAPO_DECOR_SNOW_CELLS, MAPO_DECOR_DESERT_CELLS][row];
    const isGallery = name.startsWith("gallery-");
    const bounds = isGallery ? { minX: -100, maxX: 1700, minY: -900, maxY: 100 }
        : { minX: center.x-span/2, maxX: center.x+span/2, minY: center.y-span/2, maxY: center.y+span/2 };
    const rect = { left: bounds.minX, right: bounds.maxX, bottom: bounds.minY, top: bounds.maxY };
    const batches = isGallery ? decorBatches(gallery.flatMap((cell, i) =>
        mapoSceneSprites(cell.scene, decorCells, decorSize, seconds,
            { x: (i % 9)*200, y: -Math.floor(i/9)*200, row: Math.floor(i/9), col: 0 })))
        : mapoStaticScene(rect, !pages, true, seconds);
    if (!isGallery && pages) batches.push(...decorBatches(mapoStaticDecorSprites(rect, seconds, decorCells, decorSize)));
    if (!isGallery) batches.push(...buildMapoSpriteMeshes(mapoCitiesIn(bounds.minX-1000, bounds.maxX+1000, bounds.minY-1000, bounds.maxY+1000, Infinity))
        .map(geometry => ({ texture: "city-atlas", repeat: false, geometry })));
    const geometryWithoutUv = createHash("sha256");
    for (const batch of batches) {
        geometryWithoutUv.update(JSON.stringify([batch.texture, batch.repeat]));
        for (const arr of [batch.geometry.positions, batch.geometry.colors, batch.geometry.addColors, batch.geometry.indices16]) {
            if (arr) geometryWithoutUv.update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
        }
    }
    const files = new Map<string, { type: string; data: Buffer }>();
    const geometryHash = createHash("sha256");
    const packets = batches.map((batch, i) => {
        const g = batch.geometry;
        const segments = [g.positions, g.uvs, g.colors, g.addColors ?? new Float32Array(g.colors.length), g.indices16];
        const buffer = Buffer.concat(segments.map((s) => Buffer.from(s.buffer, s.byteOffset, s.byteLength)));
        files.set(`/mesh-${i}`, { type: "application/octet-stream", data: buffer }); geometryHash.update(buffer);
        const pngName = `${batch.texture}.png`;
        if (!files.has(`/${pngName}`)) {
            const bytes = baselineDir && batch.texture === "decor-atlas" ? fs.readFileSync(path.join(baselineDir,pngName))
                : pageDir && batch.texture.endsWith("-trial") ? fs.readFileSync(path.join(pageDir, pngName))
                : textureDir ? fs.readFileSync(path.join(textureDir, pngName)) : read(pngName);
            sourceHashes[pngName] = createHash("sha256").update(bytes).digest("hex");
            files.set(`/${pngName}`, { type: "image/png", data: bytes });
        }
        return { url: `/mesh-${i}`, texture: `/${pngName}`, repeat: batch.repeat, vertices: g.positions.length / 3, indices: g.indices16.length };
    });
    const spec = { bounds, packets, width: isGallery ? 1800 : 1024, height: isGallery ? 1000 : 1024,
        background: opaque && isGallery ? [0.5,0.5,0.5,1] : [0,0,0,0] };
    // 使用 sprite.effect 相同的乘色/加色与 straight-alpha 混合，输出 PNG 自动解除预乘。
    const page = `<!doctype html><canvas id="bake"></canvas><script>
    window.result = (async () => {
      const spec = ${JSON.stringify(spec)};
      const canvas = document.querySelector('canvas'); canvas.width = spec.width * 2; canvas.height = spec.height * 2;
      const gl = canvas.getContext('webgl', {alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});
      if (!gl) throw new Error('WebGL1 is unavailable');
      const shader = (type, source) => { const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)); return s; };
      const p=gl.createProgram();
      gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec3 a_position; attribute vec2 a_uv; attribute vec4 a_color; attribute vec4 a_add; varying vec2 v_uv; varying vec4 v_color; varying vec4 v_add; uniform vec4 bounds; void main(){v_uv=a_uv;v_color=a_color;v_add=a_add;gl_Position=vec4((a_position.xy-bounds.xy)/bounds.zw*2.0-1.0,0.0,1.0);}'));
      gl.attachShader(p,shader(gl.FRAGMENT_SHADER,'precision highp float; varying vec2 v_uv; varying vec4 v_color; varying vec4 v_add; uniform sampler2D tex; void main(){vec4 t=texture2D(tex,v_uv);gl_FragColor=vec4(clamp(t.rgb*v_color.rgb+(1.0-t.rgb*v_add.a)*v_add.rgb,0.0,1.0),t.a*v_color.a);}'));
      gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)); gl.useProgram(p);
      const b=spec.bounds; gl.uniform4f(gl.getUniformLocation(p,'bounds'),b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
      gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(...spec.background); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const textures=new Map();
      let drawCalls=0, textureSwitches=0, previousTexture=null;
      const started=performance.now();
      for (const part of spec.packets) {
        let texture=textures.get(part.texture);
        if(!texture){ const img=new Image(); img.src=part.texture; await img.decode(); texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,part.repeat?gl.REPEAT:gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,part.repeat?gl.REPEAT:gl.CLAMP_TO_EDGE); textures.set(part.texture,texture); }
        gl.bindTexture(gl.TEXTURE_2D,texture);
        if (previousTexture!==texture) textureSwitches++; previousTexture=texture;
        const raw=await(await fetch(part.url)).arrayBuffer(); let offset=0; const buffers=[];
        for(const [name,size] of [['a_position',3],['a_uv',2],['a_color',4],['a_add',4]]){
          const attr=gl.getAttribLocation(p,name), buffer=gl.createBuffer(); buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(raw,offset,part.vertices*size),gl.STATIC_DRAW); offset+=part.vertices*size*4;
          gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr,size,gl.FLOAT,false,0,0);
        }
        const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(raw,offset,part.indices),gl.STATIC_DRAW);
        gl.drawElements(gl.TRIANGLES,part.indices,gl.UNSIGNED_SHORT,0); drawCalls++; gl.deleteBuffer(ib); buffers.forEach(v=>gl.deleteBuffer(v));
        const err=gl.getError(); if(err)throw Error('WebGL draw error '+err);
      }
      gl.finish();
      const initialBakeMs=performance.now()-started;
      const output=document.createElement('canvas'); output.width=spec.width; output.height=spec.height;
      output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);
      const mini=document.createElement('canvas'); mini.width=mini.height=512; mini.getContext('2d').drawImage(output,0,128,512,256);
      return {overview:output.toDataURL('image/png'),minimap:mini.toDataURL('image/png'),drawCalls,textureSwitches,initialBakeMs};
    })(); window.result.catch(e=>{window.bakeError=String(e.stack||e)});</script>`;
    files.set("/", { type: "text/html; charset=utf-8", data: Buffer.from(page) });
    const server = http.createServer((req, res) => { const file = files.get(req.url ?? "/"); if(!file){res.writeHead(404).end();return;} res.writeHead(200, { "content-type":file.type }).end(file.data); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    let tab: { id: string; webSocketDebuggerUrl: string } | undefined, client: any;
    try {
        tab = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`, { method:"PUT" })).json() as typeof tab;
        client = await CdpClient.connect(tab!.webSocketDebuggerUrl);
        await client.send("Page.bringToFront");
        const deadline = Date.now() + 30000;
        while (!(await client.evaluate("Boolean(window.result)"))) {
            if (Date.now() > deadline) throw new Error("bake page did not initialize");
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const result = await client.evaluate("Promise.race([window.result,new Promise((_,reject)=>setTimeout(()=>reject(Error(\"bake timeout\")),60000))])");
        if(!result?.overview) throw new Error("overview bake did not complete");
        fs.mkdirSync(out, { recursive:true });
        for(const name of ["overview", "minimap"]) fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(result[name].split(",")[1], "base64"));
        fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ name, row, col, bounds, animationSeconds: seconds,
            drawCalls: result.drawCalls, textureSwitches: result.textureSwitches, initialBakeMs: result.initialBakeMs,
            decorLayout: pageDir ?? "installed-single-page",
            background: spec.background, baselineDir, textureDir,
            width: spec.width, height: spec.height, shader: "mapo-sprite.effect equivalent / WebGL1 straight alpha",
            geometryWithoutUv: geometryWithoutUv.digest("hex"), geometrySha256: geometryHash.digest("hex"),
            batches: batches.map(b => ({ texture: b.texture, vertices: b.geometry.positions.length / 3, indices: b.geometry.indices16.length })),
            sourceHashes }, null, 2) + "\n");
        console.log(JSON.stringify({ name, out, batches: batches.length }));
    } finally {
        client?.close();
        if(tab) await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`).catch(()=>{});
        await new Promise<void>((resolve) => server.close(()=>resolve()));
    }
}
async function main() {
    if (!process.argv.includes("--gallery-only")) for (const [name, row, col, span] of [
        ["grass", 750, 749, 768], ["snow", 220, 80, 768], ["desert", 280, 1440, 768],
        ["luoyang", 661, 543, 768], ["cache-boundary", 660, 530, 2048],
    ] as const) await capture(name, row, col, span);
    if (process.argv.includes("--gallery") || process.argv.includes("--gallery-only")) for (const [i, name] of ["base", "snow", "desert"].entries()) {
        await capture(`gallery-${name}`, i, 0, 0);
    }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
