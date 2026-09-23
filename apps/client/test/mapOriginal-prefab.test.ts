import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mapoPrefabSkew, mapoReadPrefabVisual, mapoPrefabUv } from "../src/kits/mapOriginal/logic/mapoPrefab";
import { mapoSceneSprites } from "../src/kits/mapOriginal/logic/mapoScene";
import { buildMapoSpriteMesh } from "../src/kits/mapOriginal/logic/mapoMesh";
import { mapoGridLineSprites } from "../src/kits/mapOriginal/logic/mapoGridLines";
import { mapoRoadsInRect, mapoSetRoads } from "../src/kits/mapOriginal/logic/mapoRoads";
import { MAPO_ROAD_CELLS, MAPO_ROAD_ATLAS_W, MAPO_ROAD_ATLAS_H } from "../src/shared/kits/mapOriginal/content/roads.data";
import { MAPO_DECOR_CELLS, MAPO_DECOR_TEXTURES, MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H } from "../src/shared/kits/mapOriginal/content/decor.data";
import type { IMapoPrefabNode } from "../src/shared/kits/mapOriginal/content/prefabs.types";

const PLACE = { x: 0, y: 0, row: 0, col: 0 };
const PX = 32 / 150;
const CELL = [{ id: 0, rect: [0, 0, 10, 20] as const, native: [10, 20] as const, source: "fixture" }];
function node(fields: Partial<IMapoPrefabNode> = {}): IMapoPrefabNode {
    return { name: "fixture", position: [0, 0], scale: [1, 1], angle: 0, size: [10, 20],
        pivot: [0.5, 0.5], skew: [0, 0], mirror: [false, false], color: [255, 255, 255, 255],
        add: [0, 0, 0, 0], z: 0, texture: 0, children: [], ...fields };
}
function sprites(n: IMapoPrefabNode, seconds = 0) { return mapoSceneSprites(n, CELL, [10, 20], seconds, PLACE); }

test("mapOriginal prefab：skew 使用原引擎查表结果，不是 tan 剪切", () => {
    // 独立取自原 libnative-lib 的 0x117ddf4 LUT，角度经 0xb08c8c / 0xb2bc8c 量化。
    assert.deepEqual(mapoPrefabSkew(-43.5742, 0, 1, 1), [1, 0, 0.6884765625, 0.7236328125]);
    assert.deepEqual(mapoPrefabSkew(6.68896, 0, 1, 1), [1, 0, -0.1162109375, 0.9931640625]);
    assert.deepEqual(mapoPrefabSkew(10, 20, 2, 3), [0.939453125, 0.3427734375 * 3 / 2, -0.173828125 * 2 / 3, 0.984375]);
});

test("mapOriginal prefab：父级 SRT、尺寸、偏心锚点与乘色一起传到最终顶点", () => {
    const child = node({ position: [10, 0], pivot: [0, 0], size: [10, 20],
        color: [128, 255, 64, 128], add: [17, 0, 0, 0] });
    const root = node({ texture: -1, position: [100, 200], scale: [2, 3], angle: 90,
        color: [255, 128, 255, 128], children: [child] });
    const mesh = buildMapoSpriteMesh(sprites(root));
    const want = [40, 220, 0, 40, 240, 0, 100, 240, 0, 100, 220, 0].map((v) => v * PX);
    mesh.positions.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-5));
    assert.ok(Math.abs(mesh.colors[3] - (128 / 255) ** 2) < 1e-7);
    assert.ok(Math.abs(mesh.colors[0] - 128 / 255) < 1e-7);
    assert.ok(Math.abs(mesh.colors[1] - 128 / 255) < 1e-7);
    assert.ok(Math.abs(mesh.addColors![0] - 17 / 255) < 1e-7);
    const mirrored = buildMapoSpriteMesh(sprites({ ...root, children: [{ ...child, mirror: [true, true] }] }));
    assert.deepEqual(mirrored.positions, mesh.positions, "mirror 只翻图片，不绕偏心 pivot 翻几何");
    assert.deepEqual(mapoPrefabUv([0.1, 0.2, 0.3, 0.4], true, true), [0.4, 0.6000000000000001, -0.3, -0.4]);
    assert.notDeepEqual(mirrored.uvs, mesh.uvs);
});

test("mapOriginal prefab：loopTimes=0 持续循环，正数仅播指定次数", () => {
    // playable::is_last_loop 0xafcc94 对 loopTimes<1 返回 false；不是“零次即结束”。
    const scene = node({ timeline: { duration: 2, offset: 0, speed: 1, loops: 0 },
        tracks: [{ type: 0, keys: [{ time: 0, value: [0, 0], tween: true }, { time: 2, value: [20, 0], tween: false }] }] });
    assert.equal(sprites(scene, 0)[0].x, 0);
    assert.equal(sprites(scene, 0.5)[0].x, 5 * PX);
    assert.equal(sprites(scene, 2.5)[0].x, 5 * PX);
    const finite = { ...scene, timeline: { ...scene.timeline!, loops: 2 } };
    assert.equal(sprites(finite, 3)[0].x, 10 * PX);
    assert.equal(sprites(finite, 5)[0].x, 20 * PX);
});

test("mapOriginal prefab：事件窗口、逐帧周期和资源动画不会冻结", () => {
    const event = node({ event: { start: 1, duration: 2 } });
    assert.equal(sprites(event, 0).length, 0);
    assert.equal(sprites(event, 1).length, 1);
    assert.equal(sprites(event, 3).length, 0);
    // 0x67fd04：floor(t * 帧数 / duration)，duration 不是帧率或每帧时长。
    const frame = node({ frames: [0, 1, 2, 3], frameStart: 1, frameDuration: 0.8 });
    const cells = Array.from({ length: 4 }, (_, id) => ({ ...CELL[0], id, rect: [id * 10, 0, 10, 20] as const }));
    const at = (t: number) => mapoSceneSprites(frame, cells, [40, 20], t, PLACE)[0].uv[0];
    assert.equal(at(0), 0.25); assert.equal(at(0.21), 0.5); assert.equal(at(0.61), 0); assert.equal(at(0.81), 0.25);
    for (const id of [22, 23, 36, 39, 40, 41]) {
        const root = MAPO_DECOR_CELLS.find((c) => c.id === id)!.scene;
        const sample = (t: number) => mapoSceneSprites(root, MAPO_DECOR_TEXTURES,
            [MAPO_DECOR_ATLAS_W, MAPO_DECOR_ATLAS_H], t, PLACE).map((s) => s.uv);
        assert.notDeepEqual(sample(0), sample(0.73), `res=${id} 动画必须随时间变化`);
    }
});

test("mapOriginal prefab：真实静态记录保留极端 pivot、镜像、skew 和颜色", () => {
    // 独立原版样本 snow/18_1_top_group/2d_mask_2；能抓住只测 mesh、漏传元数据的情况。
    const buf = readFileSync(new URL("../../kits/mapOriginal/data/maps/s1/snow-tops.bin", import.meta.url));
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const groups = v.getUint16(0), start = 2 + groups * 2;
    let match = -1;
    for (let o = start; o < buf.length; o += 60) {
        if (Math.abs(v.getFloat32(o + 30) - 0.020633) < 1e-6 && Math.abs(v.getFloat32(o + 34) + 0.623905) < 1e-6) match = o;
    }
    assert.ok(match >= 0, "没有导出原版非中心 pivot");
    const { sprite } = mapoReadPrefabVisual(v, match);
    assert.ok(Math.abs(sprite.w - 816 * 1.15742 * PX) < 0.001);
    assert.ok(Math.abs(sprite.h - 471 * 1.15742 * PX) < 0.001);
    assert.deepEqual(sprite.pivot, [v.getFloat32(match + 30), v.getFloat32(match + 34)]);
    assert.ok(sprite.pivot[1] < 0, "pivot 不得夹进 0..1");
    // 独立原包审计统计：城池 + 河岸/沙/雪静态节点，避免只验证合成 fixture。
    const counts = { pivot: 0, mirror: 0, skew: 0, color: 0, add: 0 };
    for (const file of ["cities.bin", "river-tops.bin", "desert-tops.bin", "snow-tops.bin"]) {
        const buf = readFileSync(new URL(`../../kits/mapOriginal/data/maps/s1/${file}`, import.meta.url));
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const city = file === "cities.bin", header = city ? 4 : 2, groups = view.getUint16(0);
        let count = 0;
        for (let i = 0; i < groups; i++) count += view.getUint16(header + i * 2);
        for (let i = 0; i < count; i++) {
            const o = header + groups * 2 + i * (city ? 56 : 60);
            counts.pivot += Number(view.getFloat32(o + 30) !== 0.5 || view.getFloat32(o + 34) !== 0.5);
            counts.mirror += Number(view.getUint16(o + 46) !== 0);
            counts.skew += Number(view.getFloat32(o + 38) !== 0 || view.getFloat32(o + 42) !== 0);
            counts.color += Number(view.getUint32(o + 48) !== 0xffffffff);
            counts.add += Number(view.getUint32(o + 52) !== 0);
        }
    }
    assert.deepEqual(counts, { pivot: 129, mirror: 341, skew: 394, color: 793, add: 21 });
});

test("mapOriginal 雪地道路：42,018 片中 6,012 片消费雪皮 UV", () => {
    mapoSetRoads(readFileSync(new URL("../../kits/mapOriginal/data/maps/s1/roads.bin", import.meta.url)));
    const all = mapoRoadsInRect({ left: -1e9, right: 1e9, top: 1e9, bottom: -1e9 }, 50_000);
    const snowRects = new Set(MAPO_ROAD_CELLS.filter((c) => c.clientResId >= 26001 && c.clientResId <= 26018)
        .map((c) => `${c.rect[0] / MAPO_ROAD_ATLAS_W},${c.rect[1] / MAPO_ROAD_ATLAS_H}`));
    assert.equal(all.length, 42_018);
    assert.equal(all.filter((s) => snowRects.has(`${Math.min(s.uv[0], s.uv[0] + s.uv[2])},${s.uv[1]}`)).length, 6_012);
});

test("mapOriginal 格线：按格边铺原图高度，两条边没有额外屏幕宽度补偿", () => {
    const edges = mapoGridLineSprites([{ row: 0, col: 0 }]);
    assert.equal(edges.length, 2);
    assert.equal(edges[0].h, 8 * PX);
    assert.equal(edges[0].w, Math.hypot(32, 16));
    assert.equal(edges[0].angleDeg, -Math.atan(0.5) * 180 / Math.PI);
    assert.equal(edges[1].angleDeg, Math.atan(0.5) * 180 / Math.PI);
});
