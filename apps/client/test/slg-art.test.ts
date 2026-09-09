import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    SLG_ART_ATLAS_CELL_SIZE, SLG_ART_ATLAS_COLUMNS, SLG_ART_ATLAS_ROWS, SLG_LANDMARKS, SLG_MAX_DECORATIONS_PER_CHUNK,
    buildSlgOverviewRects, overviewToWorld, overviewViewportRect, slgArtAtlasRect, slgAtlasUv, slgDecorationsForChunk,
    slgTerrainUv, worldToOverview,
} from "../src/kits/slg/logic/mapArt";
import { SLG_CHUNK_SIZE, SLG_MAP_H, SLG_MAP_W, terrainAt, validateSlgTerrain, type ISlgTerrain } from "../src/shared/kits/slg/api/worldmap/index";

function near(a: number, b: number): void { assert.ok(Math.abs(a - b) < 0.000001, `${a} != ${b}`); }
function shippedTerrain(): ISlgTerrain {
    const data: unknown = JSON.parse(readFileSync(new URL("../../kits/slg/data/terrain.json", import.meta.url), "utf8"));
    if (!validateSlgTerrain(data)) throw new Error("shipped SLG terrain violates the shared contract");
    return data;
}
function uniformTerrain(id: number): ISlgTerrain {
    const palette = Array.from({ length: 6 }, (_, index) => ({ id: index, color: [100, 150, 200] as const }));
    return { name: "Fixture", width: SLG_MAP_W, height: SLG_MAP_H, palette,
        regions: [{ x: 0, y: 0, width: SLG_MAP_W, height: SLG_MAP_H, terrain: id }] };
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
    const chunks = [[0, 0], [1, 0], [0, 1], [312, 312], [624, 624]] as const;
    const first = new Map(chunks.map(([x, y]) => [`${x}:${y}`, slgDecorationsForChunk(terrain, x, y, 0)]));
    for (const [x, y] of [...chunks].reverse()) {
        slgDecorationsForChunk(terrain, x, y, 3);
        assert.deepEqual(slgDecorationsForChunk(terrain, x, y, 0), first.get(`${x}:${y}`));
        let previous = slgDecorationsForChunk(terrain, x, y, 0);
        for (let lod = 1; lod <= 3; lod++) {
            const next = slgDecorationsForChunk(terrain, x, y, lod);
            for (const entry of next) assert.deepEqual(entry, previous.find((old) => old.id === entry.id), "retained objects keep their footprint");
            previous = next;
        }
        assert.ok(previous.every((entry) => entry.landmark));
    }
    assert.deepEqual([0, 1, 2, 3].map((lod) => slgDecorationsForChunk(terrain, 0, 0, lod).length), [6, 4, 2, 0]);
});

test("SLG decorations: bounded density, unique neighboring ownership and complete footprints inside chunks", () => {
    const ids = new Set<string>();
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
        const entries = slgDecorationsForChunk(uniformTerrain(1), cx, cy, 0);
        assert.equal(entries.length, 6);
        for (const entry of entries) {
            assert.equal(ids.has(entry.id), false); ids.add(entry.id);
            assert.ok(entry.x - entry.width / 2 >= cx * SLG_CHUNK_SIZE);
            assert.ok(entry.x + entry.width / 2 <= (cx + 1) * SLG_CHUNK_SIZE);
            assert.ok(entry.y - entry.height / 2 >= cy * SLG_CHUNK_SIZE);
            assert.ok(entry.y + entry.height / 2 <= (cy + 1) * SLG_CHUNK_SIZE);
        }
    }
    for (const terrainId of [0, 1, 2, 3, 4, 5]) {
        const terrain = uniformTerrain(terrainId);
        for (const [cx, cy] of [[0, 0], [312, 312], [624, 624]]) for (let lod = 0; lod <= 3; lod++) {
            const entries = slgDecorationsForChunk(terrain, cx, cy, lod);
            assert.ok(entries.length <= SLG_MAX_DECORATIONS_PER_CHUNK);
            assert.ok(entries.filter((entry) => !entry.landmark).length <= [6, 4, 2, 0][lod]);
            for (const entry of entries) {
                assert.ok(entry.x - entry.width / 2 >= cx * 16 && entry.x + entry.width / 2 <= (cx + 1) * 16);
                assert.ok(entry.y - entry.height / 2 >= cy * 16 && entry.y + entry.height / 2 <= (cy + 1) * 16);
            }
            if (terrainId === 0) assert.ok(entries.filter((entry) => !entry.landmark).length <= 2);
            if (terrainId === 2) assert.ok(entries.every((entry) => entry.landmark), "water never grows ordinary decorations");
        }
    }
    for (const [cx, cy, lod] of [[-1, 0, 0], [625, 0, 0], [0, 0, 4], [0, 0, 0.5]]) {
        assert.throws(() => slgDecorationsForChunk(uniformTerrain(1), cx, cy, lod), RangeError);
    }
});

test("SLG仙洲: compact six-terrain geography leaves the default sect dry and all landmarks in separate chunks", () => {
    const terrain = shippedTerrain();
    assert.deepEqual(terrain.palette.map((entry) => entry.id), [0, 1, 2, 3, 4, 5]);
    assert.ok(terrain.regions.length < 100, "compact rectangles replace a hundred million records");
    assert.equal(terrainAt(terrain, 5000, 5000).id, 0);
    assert.equal(terrainAt(terrain, 5005, 5005).id, 0);
    assert.equal(terrainAt(terrain, 5000, 9500).id, 5, "north is positive world Y");
    assert.equal(terrainAt(terrain, 500, 5000).id, 3);
    assert.equal(terrainAt(terrain, 4000, 1000).id, 1);
    assert.equal(terrainAt(terrain, 9700, 4000).id, 2);
    assert.equal(terrainAt(terrain, 3200, 7000).id, 4);
    const chunks = new Set<string>();
    for (const landmark of SLG_LANDMARKS) {
        const cx = Math.floor(landmark.x / SLG_CHUNK_SIZE), cy = Math.floor(landmark.y / SLG_CHUNK_SIZE);
        const key = `${cx}:${cy}`;
        assert.equal(chunks.has(key), false); chunks.add(key);
        assert.ok(landmark.x - landmark.width / 2 >= cx * 16 && landmark.x + landmark.width / 2 <= (cx + 1) * 16);
        assert.ok(landmark.y - landmark.height / 2 >= cy * 16 && landmark.y + landmark.height / 2 <= (cy + 1) * 16);
        assert.notEqual(terrainAt(terrain, landmark.x, landmark.y).id, 2);
        assert.deepEqual(slgDecorationsForChunk(terrain, cx, cy, 3), [landmark]);
    }
    const center = slgDecorationsForChunk(terrain, 312, 312, 0);
    assert.deepEqual(center.filter((entry) => !entry.landmark).map((entry) => entry.kind).sort(), ["crystal", "tree"]);
    assert.ok(center.some((entry) => entry.name === "青云宗"));
});

test("SLG overview: north-up coordinates round trip with arbitrary display dimensions and clamp outer bounds", () => {
    assert.deepEqual(worldToOverview({ x: 0, y: 10000 }), { x: 0, y: 0 });
    assert.deepEqual(overviewToWorld({ x: 1, y: 1 }), { x: 10000, y: 0 });
    for (const [width, height] of [[1, 1], [512, 512], [731, 429]]) {
        for (const point of [{ x: 0, y: 0 }, { x: 10000, y: 10000 }, { x: 5005, y: 5005 }, { x: 3172.25, y: 8417.5 }]) {
            const result = overviewToWorld(worldToOverview(point, width, height), width, height);
            near(result.x, point.x); near(result.y, point.y);
        }
    }
    assert.deepEqual(overviewToWorld({ x: -10, y: 20 }), { x: 0, y: 0 });
    assert.deepEqual(worldToOverview({ x: 12000, y: -4 }), { x: 1, y: 1 });
    assert.throws(() => worldToOverview({ x: NaN, y: 0 }), RangeError);
    assert.throws(() => overviewToWorld({ x: 0, y: 0 }, 0, 2), RangeError);
});

test("SLG overview viewport: inclusive final cells keep one-cell edge footprints visible", () => {
    assert.deepEqual(overviewViewportRect({ minX: 0, minY: 0, maxX: 9999, maxY: 9999 }, 600, 400),
        { x: 0, y: 0, width: 600, height: 400 });
    const cell = overviewViewportRect({ minX: 9999, minY: 9999, maxX: 9999, maxY: 9999 }, 10000, 10000);
    near(cell.x, 9999); near(cell.y, 0); near(cell.width, 1); near(cell.height, 1);
    const southwest = overviewViewportRect({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, 10000, 10000);
    near(southwest.x, 0); near(southwest.y, 9999); near(southwest.width, 1); near(southwest.height, 1);
    assert.throws(() => overviewViewportRect({ minX: 10, minY: 0, maxX: 9, maxY: 0 }), RangeError);
});

test("SLG overview: ordered geographic quads reproduce terrainAt without enumerating cells", () => {
    const terrain = shippedTerrain(), rectangles = buildSlgOverviewRects(terrain);
    assert.equal(rectangles.length, terrain.regions.length + 1);
    assert.deepEqual(rectangles[0], { x: 0, y: 0, width: 10000, height: 10000, color: terrain.palette[0].color });
    const points = [...SLG_LANDMARKS, { x: 0, y: 0 }, { x: 9999, y: 9999 },
        ...Array.from({ length: 64 }, (_, index) => ({ x: index * 743 % 10000, y: index * 1379 % 10000 }))];
    for (const point of points) {
        let color: readonly [number, number, number] = rectangles[0].color;
        for (const rect of rectangles) {
            if (point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height) color = rect.color;
        }
        assert.deepEqual(color, terrainAt(terrain, point.x, point.y).color);
    }
});
