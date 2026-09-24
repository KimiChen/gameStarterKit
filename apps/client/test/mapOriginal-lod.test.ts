import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { MAPO_LOD_MAX, MAPO_LOD_SCALE_THRESHOLDS, mapoFitScale, mapoLodForScale, mapoLodForScaleStable, mapoWorldBounds } from "../src/shared/kits/mapOriginal/api/hexmap/index";
import { MapoCamera } from "../src/kits/mapOriginal/logic/mapoCamera";
import { mapoCacheTiles, MAPO_CACHE_BYTES, MapoLodCache } from "../src/kits/mapOriginal/logic/mapoLodCache";
import { buildMapoSpriteMesh, buildMapoSpriteMeshes, buildMapoPolygonMeshes, type MapoSpriteInput } from "../src/kits/mapOriginal/logic/mapoMesh";
import { mapoLayoutLabels, mapoCityMarkers } from "../src/kits/mapOriginal/logic/mapoLabels";
import { MAPO_DECOR_CELLS, MAPO_DECOR_DESERT_CELLS, MAPO_DECOR_SNOW_CELLS, MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from "../../../tools/maporiginal-assets/read_presentation";
import { mapoSceneSprites } from "../src/kits/mapOriginal/logic/mapoScene";
import { MAPO_STATIC_DECOR_MARGIN, mapoRegionSprites } from "../src/kits/mapOriginal/logic/mapoStaticScene";
import { mapoSetRegions, resetMapoRegions } from "../src/kits/mapOriginal/logic/mapoRegions";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);

test("mapOriginal 四档：连续范围、8% 双向滞回与跨多档跳变", () => {
    assert.equal(MAPO_LOD_MAX, 3);
    assert.deepEqual(MAPO_LOD_SCALE_THRESHOLDS, [.04, .20, .55]);
    for (const [s, lod] of [[2,0],[.55,0],[.5499,1],[.20,1],[.1999,2],[.04,2],[.0399,3],[.007,3]]) assert.equal(mapoLodForScale(s), lod);
    for (const [lod, threshold] of [[0,.55],[1,.20],[2,.04]]) {
        assert.equal(mapoLodForScaleStable(lod, threshold * .92), lod);
        assert.equal(mapoLodForScaleStable(lod, threshold * .92 - 1e-9), lod + 1);
        assert.equal(mapoLodForScaleStable(lod + 1, threshold * 1.08 - 1e-9), lod + 1);
        assert.equal(mapoLodForScaleStable(lod + 1, threshold * 1.08), lod);
    }
    assert.equal(mapoLodForScaleStable(0, .007), 3);
    assert.equal(mapoLodForScaleStable(3, 2), 0);
});

test("mapOriginal 相机：竖屏/横屏缩至最小都装下完整地图，不能拖离居中位置", () => {
    const b = mapoWorldBounds();
    for (const [width,height] of [[750,1055],[750,1204],[1920,1080],[375,400]]) {
        const c = new MapoCamera(width,height); c.locate(1499,1499); c.zoom(.00001,0,0);
        close(c.scale,mapoFitScale(width,height));
        close(c.x,(b.minX+b.maxX)/2); close(c.y,(b.minY+b.maxY)/2);
        const r=c.worldRect(); assert.ok(r.left <= b.minX && r.right >= b.maxX && r.bottom <= b.minY && r.top >= b.maxY);
        const x=c.x,y=c.y; c.pan(100000,-100000); close(c.x,x); close(c.y,y);
        c.resize(height,width); assert.ok(c.scale >= c.minScale);
    }
    close(mapoFitScale(750,1055),.9*750/95984);
});

test("mapOriginal 相机：同格内缩放也更新版本，屏幕锚点保持原世界位置", () => {
    const c=new MapoCamera(750,1055), p=c.worldAt(365,512), v=c.version;
    c.zoom(1.001,365,512); const q=c.worldAt(365,512);
    close(p.x,q.x); close(p.y,q.y); assert.ok(c.version>v);
});

test("mapOriginal 16 位网格拆批：四万条格边全部保留，全局画家序不倒置", () => {
    const sprites: MapoSpriteInput[]=Array.from({length:40000},(_,i)=>({row:40000-i,col:0,x:i,y:0,w:1,h:1,pivot:[.5,.5],uv:[0,0,1,1]}));
    assert.throws(()=>buildMapoSpriteMesh(sprites),RangeError);
    const meshes=buildMapoSpriteMeshes(sprites);
    assert.equal(meshes.length,3); assert.equal(meshes.reduce((n,m)=>n+m.quads,0),40000);
    for(const m of meshes) assert.ok(m.positions.length/3<=65535);
    assert.ok(meshes[0].positions[0] > meshes[1].positions[0]);
    const polys=Array.from({length:20000},(_,i)=>({geo:0,s:i,x:i,y:0,verts:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint16Array([0,1,2,0,2,3]),uv:[0,0] as const,rgba:[1,1,1,1] as const}));
    assert.equal(buildMapoPolygonMeshes(polys).reduce((n,m)=>n+m.indices16.length/6,0),20000);
});

test("mapOriginal 分块缓存：矩形完整覆盖、邻域采样与颜色+深度总预算", () => {
    for(const [width,height] of [[750,1055],[750,1204],[2560,1440]]) for(const [lod,scale] of [[1,.184],[1,.5939],[2,.0368],[2,.2159]] as const) {
        const c=new MapoCamera(width,height); c.zoom(scale/c.scale);
        const tiles=mapoCacheTiles(c.worldRect(),lod,scale);
        assert.ok(tiles.length>0); assert.ok(tiles.reduce((n,t)=>n+t.bytes,0)<=MAPO_CACHE_BYTES);
        assert.equal(new Set(tiles.map(t=>t.key)).size,tiles.length);
        for(const t of tiles) assert.ok(t.capture.left<t.rect.left&&t.capture.right>t.rect.right&&t.capture.bottom<t.rect.bottom&&t.capture.top>t.rect.top);
        for(let x=0;x<=width;x+=width/9)for(let y=0;y<=height;y+=height/9){
            const p=c.worldAt(x,y); assert.ok(tiles.some(t=>p.x>=t.rect.left&&p.x<=t.rect.right&&p.y>=t.rect.bottom&&p.y<=t.rect.top));
        }
    }
});

test("mapOriginal LRU：保护当前可见块、预算包含待建块、资源只释放一次", () => {
    const released:string[]=[]; const cache=new MapoLodCache<string>(s=>released.push(s),12);
    cache.put('a','a',4);cache.put('b','b',4);cache.put('c','c',4);cache.get('a');
    assert.ok(cache.reserve(4,new Set(['a','b']))); assert.deepEqual(released,['c']);
    cache.put('d','d',4);assert.equal(cache.bytes,12);
    assert.equal(cache.reserve(4,new Set(['a','b','d'])),false);
    cache.clear();cache.clear();assert.equal(cache.bytes,0);assert.equal(new Set(released).size,4);assert.equal(released.length,4);
});

test("mapOriginal 地名：垂直裁剪、优先级碰撞避让，概览城市标记保留", () => {
    const cam=new MapoCamera(750,1055); cam.zoom(.007/cam.scale);
    for(const lod of [0,1,2,3]) {
        const labels=mapoLayoutLabels(lod,cam);
        for(let i=0;i<labels.length;i++) {
            const a=labels[i];assert.ok(a.sx-a.width/2>=0&&a.sx+a.width/2<=cam.width&&a.sy-a.height/2>=0&&a.sy+a.height/2<=cam.height);
            for(const b of labels.slice(i+1)) assert.ok(Math.abs(a.sx-b.sx)>=(a.width+b.width)/2||Math.abs(a.sy-b.sy)>=(a.height+b.height)/2);
        }
    }
    assert.ok(mapoLayoutLabels(3,cam).some(l=>l.tier==='canton'));
    assert.ok(mapoCityMarkers(3,cam).length>0);
});

test("mapOriginal 分块边界：原版所有资源 prefab 的实际外伸被查询边距覆盖", () => {
    for(const cell of [...MAPO_DECOR_CELLS,...MAPO_DECOR_DESERT_CELLS,...MAPO_DECOR_SNOW_CELLS]) {
        if(cell.kind!=='res')continue;
        const geometry=buildMapoSpriteMesh(mapoSceneSprites(cell.scene,MAPO_DECOR_TEXTURES,[MAPO_DECOR_ATLAS_W,MAPO_DECOR_ATLAS_H],0,{x:0,y:0,row:0,col:0}));
        const extent=Math.max(...geometry.minPos.map(Math.abs),...geometry.maxPos.map(Math.abs));
        assert.ok(extent<=MAPO_STATIC_DECOR_MARGIN,`${cell.prefab} 外伸 ${extent} 超出缓存查询边距`);
    }
});

test("mapOriginal 山体裁剪：块上方锚点向下外伸的部分不能被二分查询漏掉", () => {
    mapoSetRegions(readFileSync(new URL('../../kits/mapOriginal/data/maps/s1/regions.bin',import.meta.url)));
    try {
        const strip={left:0,right:1024,bottom:-23556,top:-23548};
        const key=(p:MapoSpriteInput)=>`${p.row}/${p.x}/${p.y}/${p.w}/${p.h}`;
        const actual=new Set(mapoRegionSprites(strip).map(key));
        const reference=mapoRegionSprites({left:-512,right:1536,bottom:-24068,top:-23036}).filter(p=>{
            const mesh=buildMapoSpriteMesh([p]);
            return mesh.minPos[0]<=strip.right && mesh.maxPos[0]>=strip.left
                && mesh.minPos[1]<=strip.top && mesh.maxPos[1]>=strip.bottom;
        });
        assert.ok(reference.length>0);
        for(const p of reference)assert.ok(actual.has(key(p)),`边缘山体缺失 ${key(p)}`);
    } finally {resetMapoRegions();}
});

test("mapOriginal 同源概览：几何图层与贴图指纹齐全，产物与来源绑定", () => {
    const root=new URL('../../kits/mapOriginal/data/maps/s1/',import.meta.url);
    const info=JSON.parse(readFileSync(new URL('overview.info.json',root),'utf8')) as {width:number;height:number;sourceHashes:Record<string,string>;codeHashes:Record<string,string>;pngSha256:string};
    assert.equal(info.width,2048);assert.equal(info.height,1024);
    for(const name of ['snow-geo.bin','desert-geo.bin','regions.bin','rivers.bin','roads.bin','ground-base.png','snow-base.png','river-fill.png']) assert.ok(info.sourceHashes[name],name);
    for(const [name,hash] of Object.entries(info.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(name,root))).digest('hex'),hash,name);
    for(const [name,hash] of Object.entries(info.codeHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+name,import.meta.url))).digest('hex'),hash,name);
    assert.equal(createHash('sha256').update(readFileSync(new URL('overview.png',root))).digest('hex'),info.pngSha256);
});
