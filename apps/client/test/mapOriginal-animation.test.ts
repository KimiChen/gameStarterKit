import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { mapoReadDecorConfig, mapoReadTopConfig } from "../src/kits/mapOriginal/logic/mapoPresentation";
import { compileMapoScene, createMapoScenePlayer } from "../src/kits/mapOriginal/logic/mapoSceneCompiled";
import { MapoSpriteUpdates } from "../src/kits/mapOriginal/logic/mapoSpriteUpdates";
import { mapoSceneSprites } from "../src/kits/mapOriginal/logic/mapoScene";
import { buildMapoSpriteMesh, buildMapoSpriteMeshes, type MapoGeometry, type MapoSpriteInput } from "../src/kits/mapOriginal/logic/mapoMesh";
import { createMapoTopsData } from "../src/kits/mapOriginal/logic/mapoTops";
import type { IMapoPrefabNode } from "../src/shared/kits/mapOriginal/content/prefabs.types";
const read = (name: string) => readFileSync(new URL(`../../kits/mapOriginal/data/maps/s1/${name}`, import.meta.url));
const d = mapoReadDecorConfig(read("decor-config.json")), t = mapoReadTopConfig(read("tops-config.json"));
const cells = d.cells.map(c => ({ id: c.id, rect: d.textures[c.textureId].rect, window: d.textures[c.textureId], textureId: c.textureId }));
const place = { row: 750, col: 749, x: 16, y: -23984 };
const items = [
    ...Object.values(d.variants).flatMap(v => v.map(c => ({ scene: c.scene, cells, size: d.size }))),
    ...t.atlases.flatMap(a => Object.values(t.scenes[a.kind]).map(scene => ({ scene, size: a.size,
        cells: a.cells.map(c => ({ id: c.id, rect: a.textures[c.textureId].rect, window: a.textures[c.textureId] })) }))),
];
function node(fields: Partial<IMapoPrefabNode> = {}): IMapoPrefabNode {
    return { name: "fixture", position: [0, 0], scale: [1, 1], angle: 0, size: [10, 20], pivot: [-.2, 1.3], skew: [0, 0],
        mirror: [true, false], color: [255, 128, 255, 200], add: [17, 0, 0, 0], z: 0, texture: 0, children: [], ...fields };
}
const fixtureCells = [{ id: 0, rect: [0, 0, 10, 20] as const }, { id: 1, rect: [10, 0, 10, 20] as const }];

test("mapOriginal O6：全部 139 棵树、17,653 个时间/回跳样本与原求值器一致", () => {
    for (const i of items) {
        const player = createMapoScenePlayer(compileMapoScene(i.scene), i.cells, i.size, place);
        for (const time of [0, .125, .5, 1, 2, 10, 0, ...Array.from({ length: 120 }, (_, i) => i / 60)]) {
            const wanted = mapoSceneSprites(i.scene, i.cells, i.size, time, place), actual = player.read(time);
            assert.deepEqual(actual, wanted);
            assert.deepEqual(buildMapoSpriteMesh([...actual]), buildMapoSpriteMesh(wanted));
        }
    }
});

test("mapOriginal O6：父动画、嵌套事件、有限循环、乘加色和负 z 遮挡等价", () => {
    const root = node({ texture: -1, timeline: { duration: 2, offset: .1, speed: 1.2, loops: 2 },
        tracks: [
            { type: 0, keys: [{ time: 0, value: [0, 0], tween: true }, { time: 2, value: [20, 30], tween: false }] },
            { type: 4, keys: [{ time: 0, value: 1, tween: true }, { time: 2, value: 0, tween: false }] },
            { type: 12, keys: [{ time: 0, value: [0, .3, 0], tween: true }, { time: 2, value: [.4, 0, .2], tween: false }] },
        ], children: [node({ z: 1, angle: 30 }), node({ z: -1, event: { start: .25, duration: 1 },
            timeline: { duration: .3, offset: 0, speed: 2, loops: 0 }, children: [node({ z: -1, frames: [0, 1], frameDuration: .25 })] })] });
    const player = createMapoScenePlayer(compileMapoScene(root), fixtureCells, [20, 20], place);
    const layer = new MapoSpriteUpdates(); layer.reset([player]);
    for (const time of [0, .1, .25, .26, .5, 1, 1.25, 2, 3, 5, 100, 0]) {
        const actual = player.read(time), wanted = mapoSceneSprites(root, fixtureCells, [20, 20], time, place);
        assert.deepEqual(actual, wanted); layer.read(time);
    }
    const staticPlayer = createMapoScenePlayer(compileMapoScene(node()), fixtureCells, [20, 20], place);
    const first = staticPlayer.read(0); assert.equal(staticPlayer.read(100), first); assert.equal(staticPlayer.evaluatedNodes, 0);
});

test("mapOriginal O6：固定时间未换帧不上传；只改 UV，拓扑变化和变空安全重建", () => {
    const root = node({ frames: [0, 1], frameDuration: 1 });
    const player = createMapoScenePlayer(compileMapoScene(root), fixtureCells, [20, 20], place);
    const layer = new MapoSpriteUpdates(); layer.reset([player]);
    assert.equal(layer.read(0)[0].full, true);
    assert.deepEqual(layer.read(.1), []);
    const update = layer.read(.5); assert.deepEqual(update[0].ends, [0, 1, 0, 0]); assert.equal(update[0].full, false);
    assert.deepEqual(layer.read(.6), []);
    const event = createMapoScenePlayer(compileMapoScene(node({ event: { start: 1, duration: 1 } })), fixtureCells, [20, 20], place);
    layer.reset([event]); assert.deepEqual(layer.read(0), []); assert.equal(layer.batchCount, 0);
    assert.equal(layer.read(1)[0].full, true); assert.equal(layer.batchCount, 1);
    assert.deepEqual(layer.read(2), []); assert.equal(layer.batchCount, 0);
    assert.equal(layer.read(1)[0].full, true);
    layer.clear(); assert.equal(layer.size, 0); assert.equal(layer.batchCount, 0); assert.deepEqual(layer.read(0), []);
});

test("mapOriginal O6：多摆位混合静态/动画保持全局画家序及最终网格字节", () => {
    const sources = items.slice(0, 45).map((i, n) => createMapoScenePlayer(compileMapoScene(i.scene), i.cells, i.size,
        { row: 20 - n % 7, col: n % 3, x: n * 17, y: n * -11 }));
    const layer = new MapoSpriteUpdates(); layer.reset(sources);
    let retained: MapoGeometry[] = [];
    for (let frame = 0; frame < 121; frame++) {
        const time = frame / 60, updates = layer.read(time);
        if (updates.length) retained = updates.map(u => u.geometry);
        retained.length = layer.batchCount;
        assert.deepEqual(retained, buildMapoSpriteMeshes(sources.flatMap(s => [...s.read(time)])));
    }
});

test("mapOriginal O6：跨 Uint16 批次的局部更新不串位、不丢画家序", () => {
    let value = 0;
    const sprites: MapoSpriteInput[] = Array.from({ length: 17000 }, (_, row) => ({ row, col: 0, x: row, y: 0, w: 1, h: 1, pivot: [.5, .5], uv: [0, 0, 1, 1] }));
    const sources = sprites.map((s, i) => { let last = value, part = [s]; return { row: s.row, col: 0, read: () => {
        if (i === 16500 && last !== value) { part = [{ ...s, x: s.x + value }]; last = value; } return part;
    } }; });
    const layer = new MapoSpriteUpdates(); layer.reset(sources); layer.read(0); value = 2;
    const changed = layer.read(1); assert.equal(changed.length, 2); assert.deepEqual(changed[0].ends, [0, 0, 0, 0]);
    assert.deepEqual(changed[1].ends, [118, 0, 0, 0]);
    assert.deepEqual(changed.map(u => u.geometry), buildMapoSpriteMeshes(sources.flatMap(s => s.read())));
});

test("mapOriginal O6：top 静态记录/动态树共用更新路径，配置卸载清空编译缓存", () => {
    const data = createMapoTopsData(); data.mapoSetTopConfig(read("tops-config.json"));
    for (const a of t.atlases) {
        data.mapoSetTops(a.kind, read(`${a.kind}-tops.bin`));
        const polys = Array.from({ length: a.groups }, (_, i) => ({ geo: i + 1, s: i, x: 30 * i, y: -20 * i,
            verts: new Float32Array(), indices: new Uint16Array(), uv: [0, 0] as const, rgba: [1, 1, 1, 1] as const }));
        const sources = data.mapoTopSources(a.kind, polys), layer = new MapoSpriteUpdates(); layer.reset(sources);
        for (const time of [0, .5, 1, 2, 10, 0]) {
            assert.deepEqual(sources.flatMap(s => [...s.read(time)]), data.mapoTopsFor(a.kind, polys, Infinity, time));
            layer.read(time);
        }
    }
    assert.equal(data.mapoTopsDataUsage().programs, 4);
    data.dispose(); assert.ok(Object.values(data.mapoTopsDataUsage()).every(v => v === 0));
});
