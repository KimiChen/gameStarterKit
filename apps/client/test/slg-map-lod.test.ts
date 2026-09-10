/** LOD 滞回 / 远档整图层几何 / chunk 淡出驱动 / 调试开关的无头测试。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ChunkFadeTracker, SLG_CHUNK_FADE_MAX_CONCURRENT, SLG_CHUNK_FADE_MS } from "../src/kits/slg/logic/chunkFade";
import { buildSlgFarGround, buildSlgFarLandmarks, buildSlgFarOwnership, slgFarOwnershipVersion,
    SLG_FAR_LOD } from "../src/kits/slg/logic/farLayerMesh";
import { MapCamera, SLG_GRID_PIXELS } from "../src/kits/slg/logic/mapCamera";
import { installSlgMapDebugGlobal, slgMapDebug, SLG_MAP_DEBUG_GLOBAL } from "../src/kits/slg/logic/mapDebug";
import { SLG_LANDMARKS, slgAtlasUv } from "../src/kits/slg/logic/mapArt";
import { visibleMapLayers } from "../src/kits/slg/logic/mapLayers";
import { SLG_LOD_HYSTERESIS_RATIO, SLG_LOD_SCALE_THRESHOLDS, SLG_MAP_H, SLG_MAP_W, tileIdFromGrid,
    slgLodForScale, slgLodForScaleStable, type ISlgTerrain, type ISlgTile } from "../src/shared/kits/slg/api/worldmap/index";

const SELF = "me";
function terrain(): ISlgTerrain {
    return { name: "lod fixture", width: SLG_MAP_W, height: SLG_MAP_H,
        palette: [{ id: 0, color: [10, 20, 30] }, { id: 1, color: [40, 50, 60] }],
        regions: [{ x: 100, y: 200, width: 300, height: 400, terrain: 1 }] };
}
function near(actual: number, expected: number, epsilon = 0.0001): void {
    assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}

test("SLG LOD hysteresis: 阈值带内往复不越档，明确越界才迁移，跨多档一次到位", () => {
    const t1 = SLG_LOD_SCALE_THRESHOLDS[1]; // 0.5：lod 1 的下界
    // 从 lod 1 出发：跌破下界但未出滞回带 → 保持；明确跌破才降粗。
    assert.equal(slgLodForScaleStable(1, t1 * (1 - SLG_LOD_HYSTERESIS_RATIO / 2)), 1);
    assert.equal(slgLodForScaleStable(1, t1 * (1 - SLG_LOD_HYSTERESIS_RATIO) * 0.999), 2);
    // 升细同样需要明确越过更细档下界。
    assert.equal(slgLodForScaleStable(1, SLG_LOD_SCALE_THRESHOLDS[2] * (1 + SLG_LOD_HYSTERESIS_RATIO / 2)), 1);
    assert.equal(slgLodForScaleStable(1, SLG_LOD_SCALE_THRESHOLDS[2] * (1 + SLG_LOD_HYSTERESIS_RATIO) * 1.001), 0);
    // 在阈值点往复抖动：裸映射来回跳，滞回映射不动。
    for (const scale of [t1 * 0.995, t1 * 1.005, t1 * 0.995, t1 * 1.005]) {
        assert.equal(slgLodForScaleStable(1, scale), 1);
    }
    // 大幅缩放一次跨多档。
    assert.equal(slgLodForScaleStable(0, 0.1), 3);
    assert.equal(slgLodForScaleStable(3, 5), 0);
    // 边界与非法输入。
    assert.equal(slgLodForScaleStable(3, 0.001), 3);
    assert.throws(() => slgLodForScaleStable(4, 1), /prev LOD/);
    assert.throws(() => slgLodForScaleStable(0, 0), /positive/);
});

test("SLG camera: LOD 经滞回状态化，阈值抖动不迁移，locate 不动 LOD", () => {
    const camera = new MapCamera(750, 1000);
    assert.equal(camera.lod, slgLodForScale(camera.scale));
    // 放大到明确越档 → 迁移到 lod 0。
    camera.zoom(2, 0, 0); // scale 0.85 → 1.7
    assert.equal(camera.lod, 0);
    // 缩回 0.85 以下但仍带内（> 0.85×(1−r) ≈ 0.782）→ 不迁移。
    while (camera.scale > 0.8) camera.zoom(0.98, 0, 0);
    assert.equal(camera.lod, 0);
    // 明确跌破 0.85×(1−r) 才降粗；停在 lod 1 带内（≥ 0.5×(1−r) ≈ 0.46）。
    while (camera.scale > 0.5) camera.zoom(0.97, 0, 0);
    assert.equal(camera.lod, 1);
    // 在 0.5 附近继续小幅往复 → 不再迁移。
    for (let i = 0; i < 6; i += 1) camera.zoom(i % 2 === 0 ? 1.01 : 0.99, 0, 0);
    assert.equal(camera.lod, 1);
    const lodBefore = camera.lod;
    camera.locate(100, 200);
    assert.equal(camera.lod, lodBefore);
});

test("SLG far ground: 区域矩形 + 默认底色一张网格，不枚举格，alpha 写入顶点", () => {
    const data = buildSlgFarGround(terrain(), 0.5);
    const quadCount = data.indices16.length / 6;
    assert.equal(quadCount, 2); // 默认底 + 1 个区域矩形
    assert.equal(data.positions.length, quadCount * 12);
    // 默认底覆盖全世界；区域矩形按格→像素换算。
    assert.equal(data.positions[0], 0);
    assert.equal(data.positions[1], SLG_MAP_H * SLG_GRID_PIXELS);
    const regionLeft = 100 * SLG_GRID_PIXELS;
    assert.ok([...data.positions.slice(12)].some((value) => value === regionLeft));
    // 顶点色来自 palette；alpha 通道 = 0.5。
    assert.equal(data.colors[3], 0.5);
    assert.throws(() => buildSlgFarGround(terrain(), 1.5), /alpha/);
});

test("SLG far landmarks: 全部地标一张网格，UV 内缩留在图集格内，按先北后南排序", () => {
    const data = buildSlgFarLandmarks(1536, 1024);
    const sorted = [...SLG_LANDMARKS].sort((a, b) => b.y - a.y || a.x - b.x);
    assert.equal(data.indices16.length / 6, sorted.length);
    const insetU = 0.5 / 1536, insetV = 0.5 / 1024;
    const epsilon = 0.00001; // UV 经 Float32 存储有尾差，容差比对不钉字节。
    for (let quad = 0; quad < sorted.length; quad += 1) {
        const uv = slgAtlasUv(sorted[quad].atlasIndex);
        const us = [data.uvs[quad * 8], data.uvs[quad * 8 + 2]];
        const vs = [data.uvs[quad * 8 + 1], data.uvs[quad * 8 + 5]];
        assert.ok(us[0] >= uv.u0 + insetU - epsilon && us[1] <= uv.u1 - insetU + epsilon, "u inset");
        assert.ok(vs[0] >= uv.v0 + insetV - epsilon && vs[1] <= uv.v1 - insetV + epsilon, "v inset");
    }
    assert.throws(() => buildSlgFarLandmarks(0, 1024), /dimensions/);
});

test("SLG far ownership: 稀疏归属按 tileId 排序、我方/敌方配色、alpha 相乘、空图返回 null", () => {
    assert.equal(buildSlgFarOwnership(new Map(), SELF), null);
    const tiles = new Map<number, ISlgTile>([
        [tileIdFromGrid(5000, 5000), { tileId: tileIdFromGrid(5000, 5000), ownerUid: SELF, guardPower: 1 }],
        [tileIdFromGrid(3, 7), { tileId: tileIdFromGrid(3, 7), ownerUid: "other", guardPower: 2 }],
    ]);
    const data = buildSlgFarOwnership(tiles, SELF, 0.5);
    assert.ok(data);
    assert.equal(data.indices16.length / 6, 2);
    // 排序：小 tileId 在前 → (3,7) 是 quad 0，敌方红色，alpha 0.4*0.5。
    assert.equal(data.positions[0], 3 * SLG_GRID_PIXELS);
    assert.equal(data.positions[1], 8 * SLG_GRID_PIXELS);
    near(data.colors[0], 220 / 255);
    near(data.colors[3], 0.2);
    // quad 1 是我方蓝色。
    near(data.colors[16], 65 / 255);
    // 版次签名随数据变化。
    const v1 = slgFarOwnershipVersion(tiles, new Map([[1, 1]]));
    assert.notEqual(v1, slgFarOwnershipVersion(tiles, new Map([[1, 2]])));
    assert.notEqual(v1, slgFarOwnershipVersion(new Map(), new Map([[1, 1]])));
});

test("SLG far LOD 档位常量与滞回分档一致（lod >= 3 进远档）", () => {
    assert.equal(SLG_FAR_LOD, 3);
    assert.ok(slgLodForScaleStable(2, 0.1) >= SLG_FAR_LOD);
    assert.ok(slgLodForScaleStable(1, 0.9) < SLG_FAR_LOD);
});

test("SLG chunk fade: 淡入到 1 完成、淡出超限退化、半途掉头不跳变", () => {
    const tracker = new ChunkFadeTracker();
    tracker.beginIn(7);
    assert.equal(tracker.alphaOf(7), 0);
    let step = tracker.advance(SLG_CHUNK_FADE_MS / 2);
    near(tracker.alphaOf(7), 0.5);
    step = tracker.advance(SLG_CHUNK_FADE_MS / 2);
    assert.deepEqual(step.finishedIn, [7]);
    assert.equal(tracker.alphaOf(7), 1);
    // 半途掉头：淡出一半重新淡入，alpha 连续。
    tracker.beginOut(9);
    tracker.advance(SLG_CHUNK_FADE_MS / 2);
    near(tracker.alphaOf(9), 0.5);
    tracker.beginIn(9);
    near(tracker.alphaOf(9), 0.5);
    // 淡出并发上限：超出后 beginOut 返回 false（调用方硬销）。全新 tracker 逐格填满。
    const capped = new ChunkFadeTracker();
    for (let key = 100; key < 100 + SLG_CHUNK_FADE_MAX_CONCURRENT; key += 1) assert.equal(capped.beginOut(key), true);
    assert.equal(capped.beginOut(999), false);
    // 已在队内的 key 掉头不受上限影响。
    assert.equal(capped.beginOut(100), true);
    // 淡出完成回收。
    const done = capped.advance(SLG_CHUNK_FADE_MS);
    assert.ok(done.finishedOut.includes(100));
    assert.equal(tracker.alphaOf(9), 0.5);
    assert.throws(() => tracker.advance(-1), /dt/);
});

test("SLG map debug: 强制档校验、隐藏层过滤、globalThis 安装与注销", () => {
    slgMapDebug.reset();
    slgMapDebug.setForceLod(2);
    assert.equal(slgMapDebug.forceLod, 2);
    assert.throws(() => slgMapDebug.setForceLod(4), /forceLod/);
    slgMapDebug.setForceLod(null);
    assert.equal(slgMapDebug.forceLod, null);
    slgMapDebug.setLayerHidden("grid", true);
    assert.ok(!visibleMapLayers(0, slgMapDebug.hiddenLayers).includes("grid"));
    assert.throws(() => slgMapDebug.setLayerHidden("nope" as never, true), /layer/);
    slgMapDebug.setLayerHidden("grid", false);
    assert.ok(visibleMapLayers(0, slgMapDebug.hiddenLayers).includes("grid"));

    const target: Record<string, unknown> = {};
    const uninstall = installSlgMapDebugGlobal(target);
    const api = target[SLG_MAP_DEBUG_GLOBAL] as { setLod(n: number | null): unknown; hide(id: never): unknown; state(): unknown };
    assert.ok(api);
    api.setLod(3);
    assert.equal(slgMapDebug.forceLod, 3);
    uninstall();
    assert.equal(target[SLG_MAP_DEBUG_GLOBAL], undefined);
    assert.equal(slgMapDebug.forceLod, null);
    assert.deepEqual(slgMapDebug.snapshot().hiddenLayers, []);
});
