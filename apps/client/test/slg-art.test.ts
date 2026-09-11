import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    SLG_ART_ATLAS_CELL_SIZE, SLG_ART_ATLAS_COLUMNS, SLG_ART_ATLAS_ROWS, SLG_LANDMARK_FOOT, SLG_MAX_DECORATIONS_PER_CHUNK,
    buildSlgLayoutIndex, buildSlgOverviewRects, overviewToWorld, overviewViewportRect, slgArtAtlasRect, slgAtlasUv,
    slgDecorationsForChunk, slgTerrainUv, validateSlgForestLayout, worldToOverview, type SlgLayoutIndex,
} from "../src/kits/slg/logic/mapArt";
import { SLG_CHUNK_SIZE, SLG_TERRAIN_MAX_REGIONS, slgMapInfo, terrainAt, validateSlgTerrain,
    type ISlgTerrain } from "../src/shared/kits/slg/api/worldmap/index";

/** 默认图森之国（catalog 登记 1500×1500）；五国多图化后尺寸按图取，不再用全局常量。 */
const MAP = slgMapInfo("senzhiguo");

function near(a: number, b: number): void { assert.ok(Math.abs(a - b) < 0.000001, `${a} != ${b}`); }
function shippedTerrain(): ISlgTerrain {
    const data: unknown = JSON.parse(readFileSync(new URL("../../kits/slg/data/maps/senzhiguo/terrain.json", import.meta.url), "utf8"));
    if (!validateSlgTerrain(data)) throw new Error("shipped SLG terrain violates the shared contract");
    return data;
}
function shippedLayout(): SlgLayoutIndex {
    const data: unknown = JSON.parse(readFileSync(new URL("../../kits/slg/data/maps/senzhiguo/layout.json", import.meta.url), "utf8"));
    if (!validateSlgForestLayout(data)) throw new Error("shipped SLG layout violates the shared contract");
    return buildSlgLayoutIndex(data);
}
function uniformTerrain(id: number): ISlgTerrain {
    const palette = Array.from({ length: 6 }, (_, index) => ({ id: index, color: [100, 150, 200] as const }));
    return { id: MAP.id, name: "Fixture", width: MAP.width, height: MAP.height,
        islandRect: { minX: 0, minY: 0, maxX: MAP.width - 1, maxY: MAP.height - 1 }, palette,
        regions: [{ x: 0, y: 0, width: MAP.width, height: MAP.height, terrain: id }] };
}
/** 带装饰点位的 layout 夹具：指定 chunk 各放 6 个 tree（chunk 上限），无地标。 */
function fixtureLayout(...chunkXys: readonly (readonly [number, number])[]): SlgLayoutIndex {
    const decorations = chunkXys.flatMap(([cx, cy]) => Array.from({ length: 6 }, (_, i) => ({
        x: cx * SLG_CHUNK_SIZE + 2 + i * 2, y: cy * SLG_CHUNK_SIZE + 8, kind: "tree" as const,
    })));
    return buildSlgLayoutIndex({ source: "fixture", id: MAP.id, mapSize: MAP.width, landmarks: [], decorations });
}

test("SLG art atlas: six nonoverlapping cells use PNG top-left coordinates and exact pixel bounds", () => {
    assert.equal(SLG_ART_ATLAS_COLUMNS * SLG_ART_ATLAS_CELL_SIZE, 1536);
    assert.equal(SLG_ART_ATLAS_ROWS * SLG_ART_ATLAS_CELL_SIZE, 1024);
    let area = 0;
    const rectangles = Array.from({ length: 6 }, (_, index) => slgArtAtlasRect(index));
    assert.deepEqual(rectangles[0], { x: 0, y: 0, width: 512, height: 512 });
    assert.deepEqual(rectangles[5], { x: 1024, y: 512, width: 512, height: 512 });
    for (let index = 0; index < 6; index++) {
        const uv = slgAtlasUv(index), rect = rectangles[index];
        near(uv.u0 * 1536, rect.x); near(uv.v0 * 1024, rect.y);
        near((uv.u1 - uv.u0) * 1536, rect.width); near((uv.v1 - uv.v0) * 1024, rect.height);
        assert.ok(uv.u0 >= 0 && uv.v0 >= 0 && uv.u1 <= 1 && uv.v1 <= 1);
        assert.deepEqual(slgTerrainUv(index), uv);
        area += (uv.u1 - uv.u0) * (uv.v1 - uv.v0);
    }
    near(area, 1);
    assert.deepEqual(slgTerrainUv(15), slgAtlasUv(0), "future palette entries get a bounded texture fallback");
    for (const bad of [-1, 0.5, 6, NaN]) assert.throws(() => slgAtlasUv(bad), RangeError);
    assert.throws(() => slgTerrainUv(16), RangeError);
});

test("SLG decorations: fixed seed does not depend on chunk visitation order or LOD changes", () => {
    const terrain = uniformTerrain(1);
    const layout = fixtureLayout([0, 0], [1, 0], [46, 46]);
    const chunks = [[0, 0], [1, 0], [0, 1], [46, 46], [93, 93]] as const;
    const first = new Map(chunks.map(([x, y]) => [`${x}:${y}`, slgDecorationsForChunk(terrain, x, y, 0, layout)]));
    for (const [x, y] of [...chunks].reverse()) {
        slgDecorationsForChunk(terrain, x, y, 3, layout);
        assert.deepEqual(slgDecorationsForChunk(terrain, x, y, 0, layout), first.get(`${x}:${y}`));
        let previous = slgDecorationsForChunk(terrain, x, y, 0, layout);
        for (let lod = 1; lod <= 3; lod++) {
            const next = slgDecorationsForChunk(terrain, x, y, lod, layout);
            for (const entry of next) assert.deepEqual(entry, previous.find((old) => old.id === entry.id), "retained objects keep their footprint");
            previous = next;
        }
    }
    // LOD 只截断数量不移动物件；无 layout 覆盖的 chunk 一律为空（拒绝哈希兜底）
    assert.deepEqual([0, 1, 2, 3].map((lod) => slgDecorationsForChunk(terrain, 0, 0, lod, layout).length), [6, 4, 2, 0]);
    assert.deepEqual([0, 1, 2, 3].map((lod) => slgDecorationsForChunk(terrain, 0, 1, lod, layout).length), [0, 0, 0, 0]);
    assert.deepEqual([0, 1, 2, 3].map((lod) => slgDecorationsForChunk(terrain, 93, 93, lod).length), [0, 0, 0, 0]);
});

test("SLG decorations: bounded density, unique neighboring ownership and complete footprints inside chunks", () => {
    const layout = fixtureLayout(...Array.from({ length: 64 }, (_, i) => [i % 8, Math.floor(i / 8)] as const));
    const ids = new Set<string>();
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
        const entries = slgDecorationsForChunk(uniformTerrain(1), cx, cy, 0, layout);
        assert.equal(entries.length, 6);
        for (const entry of entries) {
            assert.equal(ids.has(entry.id), false); ids.add(entry.id);
            assert.ok(entry.x - entry.width / 2 >= cx * SLG_CHUNK_SIZE - 9);
            assert.ok(entry.x + entry.width / 2 <= (cx + 1) * SLG_CHUNK_SIZE + 9);
        }
    }
    for (const terrainId of [0, 1, 2, 3, 4, 5]) {
        const terrain = uniformTerrain(terrainId);
        for (const [cx, cy] of [[0, 0], [46, 46], [93, 93]]) for (let lod = 0; lod <= 3; lod++) {
            const entries = slgDecorationsForChunk(terrain, cx, cy, lod, fixtureLayout([0, 0], [46, 46]));
            assert.ok(entries.length <= SLG_MAX_DECORATIONS_PER_CHUNK);
            if (cx === 93 && cy === 93) assert.equal(entries.length, 0, "无布局覆盖的 chunk 为空");
        }
    }
    for (const [cx, cy, lod] of [[-1, 0, 0], [625, 0, 0], [0, 0, 4], [0, 0, 0.5]]) {
        assert.throws(() => slgDecorationsForChunk(uniformTerrain(1), cx, cy, lod), RangeError);
    }
});

test("SLG森之国: 海环、内陆湖与六类地形围绕中心复刻区，地标各占独立旱地 chunk", () => {
    const terrain = shippedTerrain(), layout = shippedLayout();
    assert.deepEqual(terrain.palette.map((entry) => entry.id), [0, 1, 2, 3, 4, 5]);
    assert.ok(terrain.regions.length <= SLG_TERRAIN_MAX_REGIONS, "原版 GroundType 直读矩形分解（契约上限 8192）");
    assert.equal(terrainAt(terrain, 50, 50).id, 2, "西南海外");
    assert.equal(terrainAt(terrain, 1450, 1450).id, 2, "东北海外");
    assert.equal(terrainAt(terrain, 935, 634).id, 2, "内陆水道（气泡湖东侧）");
    assert.equal(terrainAt(terrain, 800, 740).id, 3, "归木村南侧高地（GroundType.Hill 直读）");
    assert.equal(terrainAt(terrain, 758, 849).id, 0, "狂花海岸草地");
    assert.equal(terrainAt(terrain, 730, 790).id, 1, "蛛后巢穴西侧林地");
    const chunks = new Set<string>();
    for (const landmark of layout.landmarks) {
        const cx = Math.floor(landmark.x / SLG_CHUNK_SIZE), cy = Math.floor(landmark.y / SLG_CHUNK_SIZE);
        const key = `${cx}:${cy}`;
        assert.equal(chunks.has(key), false); chunks.add(key);
        assert.equal(landmark.width, SLG_LANDMARK_FOOT); assert.equal(landmark.height, SLG_LANDMARK_FOOT);
        // 布局坐标按管线约定为中心格锚（tools/slg-maps calibrate --check-landmarks 的 x−4..x+4）：
        // 整片 9×9 footprint 落在同一 chunk 且全为旱地。
        const half = (SLG_LANDMARK_FOOT - 1) / 2;
        assert.equal(Math.floor((landmark.x - half) / SLG_CHUNK_SIZE), cx, "地标足迹不跨 chunk");
        assert.equal(Math.floor((landmark.x + half) / SLG_CHUNK_SIZE), cx, "地标足迹不跨 chunk");
        assert.equal(Math.floor((landmark.y - half) / SLG_CHUNK_SIZE), cy, "地标足迹不跨 chunk");
        assert.equal(Math.floor((landmark.y + half) / SLG_CHUNK_SIZE), cy, "地标足迹不跨 chunk");
        for (let dy = -half; dy <= half; dy += 1) for (let dx = -half; dx <= half; dx += 1) {
            assert.notEqual(terrainAt(terrain, landmark.x + dx, landmark.y + dy).id, 2, "地标不下水");
        }
        assert.deepEqual(slgDecorationsForChunk(terrain, cx, cy, 3, layout), [landmark]);
    }
    const village = slgDecorationsForChunk(terrain, 50, 47, 0, layout);
    assert.ok(village.some((entry) => entry.name === "归木村"));
    // 无 layout 覆盖的海上 chunk：拒绝哈希兜底后一律为空（原版没有的就是没有）
    assert.deepEqual(slgDecorationsForChunk(terrain, 0, 0, 0, layout), []);
});

test("SLG overview: north-up coordinates round trip with arbitrary display dimensions and clamp outer bounds", () => {
    const terrain = uniformTerrain(0);
    assert.deepEqual(worldToOverview(terrain, { x: 0, y: MAP.height }), { x: 0, y: 0 });
    assert.deepEqual(overviewToWorld(terrain, { x: 1, y: 1 }), { x: MAP.width, y: 0 });
    for (const [width, height] of [[1, 1], [512, 512], [731, 429]]) {
        for (const point of [{ x: 0, y: 0 }, { x: MAP.width, y: MAP.height }, { x: 838, y: 764 }, { x: 317.25, y: 841.5 }]) {
            const result = overviewToWorld(terrain, worldToOverview(terrain, point, width, height), width, height);
            near(result.x, point.x); near(result.y, point.y);
        }
    }
    assert.deepEqual(overviewToWorld(terrain, { x: -10, y: 20 }), { x: 0, y: 0 });
    assert.deepEqual(worldToOverview(terrain, { x: 12000, y: -4 }), { x: 1, y: 1 });
    assert.throws(() => worldToOverview(terrain, { x: NaN, y: 0 }), RangeError);
    assert.throws(() => overviewToWorld(terrain, { x: 0, y: 0 }, 0, 2), RangeError);
});

test("SLG overview viewport: inclusive final cells keep one-cell edge footprints visible", () => {
    const terrain = uniformTerrain(0);
    assert.deepEqual(overviewViewportRect(terrain, { minX: 0, minY: 0, maxX: MAP.width - 1, maxY: MAP.height - 1 }, 600, 400),
        { x: 0, y: 0, width: 600, height: 400 });
    const cell = overviewViewportRect(terrain, { minX: 1499, minY: 1499, maxX: 1499, maxY: 1499 }, 1500, 1500);
    near(cell.x, 1499); near(cell.y, 0); near(cell.width, 1); near(cell.height, 1);
    const southwest = overviewViewportRect(terrain, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, 1500, 1500);
    near(southwest.x, 0); near(southwest.y, 1499); near(southwest.width, 1); near(southwest.height, 1);
    assert.throws(() => overviewViewportRect(terrain, { minX: 10, minY: 0, maxX: 9, maxY: 0 }), RangeError);
});

test("SLG overview: ordered geographic quads reproduce terrainAt without enumerating cells", () => {
    const terrain = shippedTerrain(), rectangles = buildSlgOverviewRects(terrain);
    assert.equal(rectangles.length, terrain.regions.length + 1);
    assert.deepEqual(rectangles[0], { x: 0, y: 0, width: MAP.width, height: MAP.height, color: terrain.palette[0].color });
    const points = [...shippedLayout().landmarks, { x: 0, y: 0 }, { x: 1499, y: 1499 },
        ...Array.from({ length: 64 }, (_, index) => ({ x: index * 743 % 1500, y: index * 1379 % 1500 }))];
    for (const point of points) {
        let color: readonly [number, number, number] = rectangles[0].color;
        for (const rect of rectangles) {
            if (point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height) color = rect.color;
        }
        assert.deepEqual(color, terrainAt(terrain, point.x, point.y).color);
    }
});
