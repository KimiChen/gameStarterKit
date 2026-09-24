import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMapoSpriteMesh, type MapoSpriteInput } from '../src/kits/mapOriginal/logic/mapoMesh';
import { mapoSceneSprites } from '../src/kits/mapOriginal/logic/mapoScene';
import type { IMapoPrefabNode } from '../src/shared/kits/mapOriginal/content/prefabs.types';
import { MAPO_DECOR_CELLS, MAPO_DECOR_SNOW_CELLS, MAPO_DECOR_DESERT_CELLS, MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from '../src/shared/kits/mapOriginal/content/decor.data';
import { MAPO_TOP_ATLASES } from '../src/shared/kits/mapOriginal/content/tops.data';
import { MAPO_TOP_SCENES } from '../src/shared/kits/mapOriginal/content/top-scenes.data';

/** Independent affine interpolation of the original untrimmed quad. */
function sameSourcePixels(sprite: MapoSpriteInput): void {
    const window = sprite.textureWindow;
    assert.ok(window);
    const full = buildMapoSpriteMesh([{ ...sprite, textureWindow: undefined }]);
    const actual = buildMapoSpriteMesh([sprite]);
    const [sw, sh] = window.storageSize, [x,y,w,h] = window.trimRect;
    const xs = sprite.uv[2] < 0 ? [1-(x+w)/sw, 1-x/sw] : [x/sw, (x+w)/sw];
    const ys = sprite.uv[3] < 0 ? [1-(y+h)/sh, 1-y/sh] : [y/sh, (y+h)/sh];
    const fractions = [[xs[0],ys[0]], [xs[1],ys[0]], [xs[1],ys[1]], [xs[0],ys[1]]];
    for (let v=0; v<4; v++) for (let axis=0; axis<2; axis++) {
        const p = full.positions;
        const expected = p[axis] + fractions[v][0]*(p[3+axis]-p[axis]) + fractions[v][1]*(p[9+axis]-p[axis]);
        assert.ok(Math.abs(actual.positions[v*3+axis]-expected)<0.00015,
            `trim moves source pixel: ${actual.positions[v*3+axis]} != ${expected}`);
    }
    assert.deepEqual(actual.colors, full.colors);
    assert.deepEqual(actual.addColors, full.addColors);
}

const place = { x: 0, y: 0, row: 0, col: 0 };
function node(fields: Partial<IMapoPrefabNode> = {}): IMapoPrefabNode {
    return { name:'trim', position:[3,7], scale:[1,1], angle:0, size:[500,700], pivot:[-0.3,1.4],
        skew:[13,-8], mirror:[false,false], color:[127,235,57,92], add:[18,0,7,40], z:0,
        texture:0, children:[], ...fields };
}

test('mapOriginal trim: per-frame/texture-track windows preserve pivot through mirrored negative scales and parent matrices', () => {
    const cells = [
        { id:0, rect:[2,3,20,30] as const, window:{storageSize:[100,100] as const, trimRect:[5,12,20,30] as const}},
        { id:1, rect:[30,3,10,60] as const, window:{storageSize:[80,120] as const, trimRect:[40,24,10,60] as const}},
    ];
    for (const mirror of [[false,false],[true,false],[false,true],[true,true]]) {
        for (const sx of [-2,1.5]) for (const sy of [-3,2]) for (const track of [false,true]) {
            const child = node({mirror, scale:[sx,sy], angle:27, ...(track
                ? {tracks:[{type:5,keys:[{time:0,value:0,tween:false},{time:0.5,value:1,tween:false}]}]}
                : {frames:[0,1],frameDuration:1})});
            const root = node({texture:-1,angle:48,scale:[2,-0.5],children:[node({texture:-1,angle:-18,children:[child]})]});
            const samples = [0,0.51].map(t => mapoSceneSprites(root,cells,[128,128],t,place)[0]);
            for (const sprite of samples) sameSourcePixels(sprite);
            assert.equal(samples[0].x,samples[1].x); assert.equal(samples[0].y,samples[1].y);
            assert.equal(samples[0].w,500); assert.equal(samples[0].h,700);
            assert.deepEqual(samples[0].pivot,[-0.3,1.4]);
            assert.notDeepEqual(samples[0].textureWindow,samples[1].textureWindow);
        }
    }
});

test('mapOriginal trim: every original decor and dynamic top hierarchy retains source-pixel placement at seven animation times', () => {
    let count=0;
    for (const t of [0,0.1,0.37,0.73,1.5,2.5,8]) {
        for (const cell of [...MAPO_DECOR_CELLS,...MAPO_DECOR_SNOW_CELLS,...MAPO_DECOR_DESERT_CELLS]) {
            for (const sprite of mapoSceneSprites(cell.scene,MAPO_DECOR_TEXTURES,[MAPO_DECOR_ATLAS_W,MAPO_DECOR_ATLAS_H],t,place)) {
                sameSourcePixels(sprite); count++;
            }
        }
        for (const atlas of MAPO_TOP_ATLASES) {
            const cells=atlas.cells.map(c=>({id:c.id,rect:atlas.textures[c.textureId].rect,window:atlas.textures[c.textureId]}));
            for (const root of Object.values(MAPO_TOP_SCENES[atlas.kind] ?? {})) {
                for (const sprite of mapoSceneSprites(root,cells,atlas.size,t,place)) { sameSourcePixels(sprite); count++; }
            }
        }
    }
    assert.equal(count,2353, '135 decor roots and all dynamic top hierarchies at the seven fixed times');
});
