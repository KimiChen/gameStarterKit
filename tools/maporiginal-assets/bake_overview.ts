/**
 * node --import tsx tools/maporiginal-assets/bake_overview.ts
 * 本机 Chrome 9222 的独立标签页执行 WebGL1 正交烘焙；只读取派生包，关闭自己的标签页。
 * 与运行时 MapoChunkBaker 共用 mapoStaticScene，不能按 res 类别上色替代原地貌。
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { CdpClient } from "../creator-preview/lib.mjs";
import { mapoWorldBounds } from "../../apps/client/src/shared/kits/mapOriginal/api/hexmap/index";
import { mapoStaticScene } from "../../apps/client/src/kits/mapOriginal/logic/mapoStaticScene";
import { mapoSetBlockGeo, mapoSetBlocks } from "../../apps/client/src/kits/mapOriginal/logic/mapoBlocks";
import { mapoSetRegions } from "../../apps/client/src/kits/mapOriginal/logic/mapoRegions";
import { mapoSetRiverGeo, mapoSetRivers } from "../../apps/client/src/kits/mapOriginal/logic/mapoRivers";
import { mapoSetTops } from "../../apps/client/src/kits/mapOriginal/logic/mapoTops";
import { mapoSetRoads } from "../../apps/client/src/kits/mapOriginal/logic/mapoRoads";
import { MAPO_MINIMAP_SOURCE_CANVAS, MAPO_MINIMAP_CONTENT_RECT } from "../../apps/client/src/kits/mapOriginal/logic/mapoFar";

async function main() {
    const data = path.resolve("apps/kits/mapOriginal/data/maps/s1");
    const out = path.resolve("tools/maporiginal-assets/out/pack/s1");
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
    const bounds = mapoWorldBounds();
    const batches = mapoStaticScene({ left: bounds.minX, right: bounds.maxX, bottom: bounds.minY, top: bounds.maxY }, false);
    const files = new Map<string, { type: string; data: Buffer }>();
    const geometryHash = createHash("sha256");
    const packets = batches.map((batch, i) => {
        const g = batch.geometry;
        const segments = [g.positions, g.uvs, g.colors, g.addColors ?? new Float32Array(g.colors.length), g.indices16];
        const buffer = Buffer.concat(segments.map((s) => Buffer.from(s.buffer, s.byteOffset, s.byteLength)));
        files.set(`/mesh-${i}`, { type: "application/octet-stream", data: buffer }); geometryHash.update(buffer);
        const pngName = `${batch.texture}.png`;
        if (!files.has(`/${pngName}`)) files.set(`/${pngName}`, { type: "image/png", data: read(pngName) });
        return { url: `/mesh-${i}`, texture: `/${pngName}`, repeat: batch.repeat, vertices: g.positions.length / 3, indices: g.indices16.length };
    });
    const spec = { bounds, packets, width: 2048, height: 1024 };
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
      gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const textures=new Map();
      for (const part of spec.packets) {
        let texture=textures.get(part.texture);
        if(!texture){ const img=new Image(); img.src=part.texture; await img.decode(); texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,part.repeat?gl.REPEAT:gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,part.repeat?gl.REPEAT:gl.CLAMP_TO_EDGE); textures.set(part.texture,texture); }
        gl.bindTexture(gl.TEXTURE_2D,texture);
        const raw=await(await fetch(part.url)).arrayBuffer(); let offset=0; const buffers=[];
        for(const [name,size] of [['a_position',3],['a_uv',2],['a_color',4],['a_add',4]]){
          const attr=gl.getAttribLocation(p,name), buffer=gl.createBuffer(); buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(raw,offset,part.vertices*size),gl.STATIC_DRAW); offset+=part.vertices*size*4;
          gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr,size,gl.FLOAT,false,0,0);
        }
        const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(raw,offset,part.indices),gl.STATIC_DRAW);
        gl.drawElements(gl.TRIANGLES,part.indices,gl.UNSIGNED_SHORT,0); gl.deleteBuffer(ib); buffers.forEach(v=>gl.deleteBuffer(v));
        const err=gl.getError(); if(err)throw Error('WebGL draw error '+err);
      }
      gl.finish();
      const output=document.createElement('canvas'); output.width=spec.width; output.height=spec.height;
      output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);
      // Same 512×256 resampling as before, then exact canvas crop (no second resample).
      const canvasSize=${JSON.stringify(MAPO_MINIMAP_SOURCE_CANVAS)}, content=${JSON.stringify(MAPO_MINIMAP_CONTENT_RECT)};
      const fullMini=document.createElement('canvas'); [fullMini.width,fullMini.height]=canvasSize;
      fullMini.getContext('2d').drawImage(output,...content);
      const mini=document.createElement('canvas'); mini.width=content[2]; mini.height=content[3];
      mini.getContext('2d').putImageData(fullMini.getContext('2d').getImageData(...content),0,0);
      return {overview:output.toDataURL('image/png'),minimap:mini.toDataURL('image/png'),minimapSource:fullMini.toDataURL('image/png')};
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
        // Audit-only full canvas; installer deliberately does not publish this file.
        fs.writeFileSync(path.join(out,"minimap-source.png"),Buffer.from(result.minimapSource.split(",")[1],"base64"));
        const codeHashes: Record<string,string> = {};
        const geometrySources = ["mapoStaticScene", "mapoMesh", "mapoScene", "mapoPrefab", "mapoGround",
            "mapoBlocks", "mapoPolyLib", "mapoRegions", "mapoRoads", "mapoRivers", "mapoTops", "mapoBands", "mapoFar"];
        const contentSources = ["ground", "blocks", "region", "roads", "river", "tops", "top-scenes", "bands"];
        for (const relative of [
            ...geometrySources.map((name) => `apps/client/src/kits/mapOriginal/logic/${name}.ts`),
            ...contentSources.map((name) => `apps/shared/src/kits/mapOriginal/content/${name}.data.ts`),
            "apps/shared/src/kits/mapOriginal/api/hexmap/index.ts",
            "tools/maporiginal-assets/bake_overview.ts", "tools/maporiginal-assets/shaders/mapo-sprite.effect",
        ]) {
            codeHashes[relative] = createHash("sha256").update(fs.readFileSync(relative)).digest("hex");
        }
        const info = { codeHashes, version:1, width:spec.width, height:spec.height, supersample:2, bounds,
            source:"mapoStaticScene: original ground / desert / snow / regions / roads / rivers / tops; no resource icons or cities",
            geometrySha256:geometryHash.digest("hex"), batches:batches.length, sourceHashes,
            pngSha256:createHash("sha256").update(fs.readFileSync(path.join(out,"overview.png"))).digest("hex") };
        fs.writeFileSync(path.join(out,"overview.info.json"), JSON.stringify(info,null,2)+"\n");
        fs.writeFileSync(path.join(out,"minimap.info.json"), JSON.stringify({size:MAPO_MINIMAP_CONTENT_RECT.slice(2),
            sourceCanvasSize:MAPO_MINIMAP_SOURCE_CANVAS, contentRect:MAPO_MINIMAP_CONTENT_RECT,
            source:"mapoStaticScene / overview.png",projection:"mapoWorldBounds orthographic; middle half"},null,2)+"\n");
        console.log(JSON.stringify({output:path.join(out,"overview.png"),batches:batches.length,geometrySha256:info.geometrySha256}));
    } finally {
        client?.close();
        if(tab) await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`).catch(()=>{});
        await new Promise<void>((resolve) => server.close(()=>resolve()));
    }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
