import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSlgTerrainMeshes, type SlgGroundMeshGeometry, type SlgMeshGeometry } from "../src/kits/slg/logic/terrainMesh";
import { SLG_GRID_PIXELS } from "../src/kits/slg/logic/mapCamera";
import { SLG_CHUNK_SIZE, SLG_MAP_H, SLG_MAP_W, tileIdFromGrid,
    type ISlgTerrain, type ISlgTile } from "../src/shared/kits/slg/api/worldmap/index";

const EMPTY_TILES: ReadonlyMap<number, ISlgTile> = new Map();
const SELF = "me";
function near(actual: number, expected: number, epsilon = 0.0001): void {
    assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}
function terrain(id = 0): ISlgTerrain {
    return { name: "mesh fixture", width: SLG_MAP_W, height: SLG_MAP_H,
        palette: Array.from({ length: 16 }, (_, value) => ({ id: value, color: [31, 132, 68] as const })),
        regions: id === 0 ? [] : [{ x: 0, y: 0, width: SLG_MAP_W, height: SLG_MAP_H, terrain: id }] };
}
interface Vertex { readonly x: number; readonly y: number; readonly u: number; readonly v: number }
function vertices(mesh: SlgGroundMeshGeometry, quad: number): readonly Vertex[] {
    return Array.from({ length: 4 }, (_, vertex) => ({
        x: mesh.positions[quad * 12 + vertex * 3], y: mesh.positions[quad * 12 + vertex * 3 + 1],
        u: mesh.uvs[quad * 8 + vertex * 2], v: mesh.uvs[quad * 8 + vertex * 2 + 1],
    }));
}
function quadAt(mesh: SlgMeshGeometry, x: number, y: number): number {
    for (let quad = 0; quad < mesh.positions.length / 12; quad++) {
        let centerX = 0, centerY = 0;
        for (let vertex = 0; vertex < 4; vertex++) {
            centerX += mesh.positions[quad * 12 + vertex * 3] / 4;
            centerY += mesh.positions[quad * 12 + vertex * 3 + 1] / 4;
        }
        if (Math.floor(centerX / SLG_GRID_PIXELS) === x && Math.floor(centerY / SLG_GRID_PIXELS) === y) return quad;
    }
    throw new Error(`Missing tile quad (${x}, ${y})`);
}
function edge(mesh: SlgGroundMeshGeometry, x: number, y: number, side: "left" | "right" | "top" | "bottom"): readonly number[][] {
    const points = vertices(mesh, quadAt(mesh, x, y));
    const horizontal = side === "top" || side === "bottom";
    const axis = horizontal ? "y" : "x";
    const boundary = (side === "top" || side === "right" ? Math.max : Math.min)(...points.map((point) => point[axis]));
    return points.filter((point) => point[axis] === boundary)
        .sort((a, b) => horizontal ? a.x - b.x : a.y - b.y)
        .map((point) => [point.u, point.v]);
}
function tile(x: number, y: number, ownerUid: string): ISlgTile {
    return { tileId: tileIdFromGrid(x, y), ownerUid, guardPower: ownerUid ? 1 : 0 };
}

test("SLG terrain mesh: adjacent ground edges sample exactly the same texture edge, including chunk joins", () => {
    for (const terrainId of [0, 1, 2, 3, 4, 5]) {
        const data = terrain(terrainId);
        const center = buildSlgTerrainMeshes(data, 0, 0, 2, EMPTY_TILES, SELF).ground;
        const east = buildSlgTerrainMeshes(data, 1, 0, 2, EMPTY_TILES, SELF).ground;
        const north = buildSlgTerrainMeshes(data, 0, 1, 2, EMPTY_TILES, SELF).ground;
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
            assert.deepEqual(edge(center, x, y, "right"), edge(center, x + 1, y, "left"));
            assert.deepEqual(edge(center, x, y, "top"), edge(center, x, y + 1, "bottom"));
        }
        for (let coordinate = 0; coordinate < SLG_CHUNK_SIZE; coordinate++) {
            assert.deepEqual(edge(center, 15, coordinate, "right"), edge(east, 16, coordinate, "left"));
            assert.deepEqual(edge(center, coordinate, 15, "top"), edge(north, coordinate, 16, "bottom"));
        }
    }
});

test("SLG terrain mesh: every valid terrain ID selects its assigned atlas cell without bleeding", () => {
    const atlasCells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];
    for (let id = 0; id < 16; id++) {
        const [column, row] = atlasCells[id < 6 ? id : 0];
        const mesh = buildSlgTerrainMeshes(terrain(id), 0, 0, 2, EMPTY_TILES, SELF).ground;
        const allU = [...mesh.uvs].filter((_, index) => index % 2 === 0);
        const allV = [...mesh.uvs].filter((_, index) => index % 2 === 1);
        assert.ok(allU.every((u) => u > column / 3 && u < (column + 1) / 3));
        assert.ok(allV.every((v) => v > row / 2 && v < (row + 1) / 2));
        near(Math.min(...allU) - column / 3, 0.5 / 1536, 0.0000001);
        near((column + 1) / 3 - Math.max(...allU), 0.5 / 1536, 0.0000001);
        near(Math.min(...allV) - row / 2, 0.5 / 1024, 0.0000001);
        near((row + 1) / 2 - Math.max(...allV), 0.5 / 1024, 0.0000001);
        if (id < 6) assert.ok([...mesh.colors].every((channel) => channel === 1), "dedicated art retains its original colors");
        else {
            const expected = [31 / 255, 132 / 255, 68 / 255, 1];
            mesh.colors.forEach((channel, index) => near(channel, expected[index % 4]));
        }
    }
    const doubled = buildSlgTerrainMeshes(terrain(), 0, 0, 2, EMPTY_TILES, SELF, 3072, 2048).ground;
    near(Math.min(...[...doubled.uvs].filter((_, index) => index % 2 === 0)), 0.5 / 3072, 0.0000001);
    near(Math.min(...[...doubled.uvs].filter((_, index) => index % 2 === 1)), 0.5 / 2048, 0.0000001);
});

test("SLG terrain mesh: ownership is a sparse blue/red alpha overlay independent of terrain color", () => {
    const fixture = [tile(2, 3, SELF), tile(14, 9, "other"), tile(1, 1, ""), tile(20, 20, SELF)];
    const tiles = new Map(fixture.map((entry) => [entry.tileId, entry]));
    for (const terrainId of [0, 1, 2, 3, 4, 5, 6, 15]) {
        const { ground, ownership } = buildSlgTerrainMeshes(terrain(terrainId), 0, 0, 0, tiles, SELF);
        assert.ok(ownership);
        assert.equal(ownership.positions.length, 2 * 4 * 3);
        assert.equal(ownership.indices16.length, 2 * 6);
        assert.equal("uvs" in ownership, false, "ownership must never sample the terrain atlas");
        for (const [x, y, expected] of [[2, 3, [65, 148, 236]], [14, 9, [220, 91, 78]]] as const) {
            const ownerQuad = quadAt(ownership, x, y), groundQuad = quadAt(ground, x, y);
            assert.deepEqual(ownership.positions.subarray(ownerQuad * 12, ownerQuad * 12 + 12),
                ground.positions.subarray(groundQuad * 12, groundQuad * 12 + 12), "overlay and terrain must align");
            for (let vertex = 0; vertex < 4; vertex++) {
                for (let channel = 0; channel < 3; channel++) {
                    near(ownership.colors[ownerQuad * 16 + vertex * 4 + channel], expected[channel] / 255);
                }
                near(ownership.colors[ownerQuad * 16 + vertex * 4 + 3], 0.4);
            }
        }
    }
    assert.equal(buildSlgTerrainMeshes(terrain(), 0, 0, 0, EMPTY_TILES, SELF).ownership, null);
    const unowned = tile(1, 1, "");
    assert.equal(buildSlgTerrainMeshes(terrain(), 0, 0, 0, new Map([[unowned.tileId, unowned]]), SELF).ownership, null);
});

test("SLG terrain mesh: close LODs preserve grid gaps while distant LODs join exactly", () => {
    const owner = tile(0, 0, SELF);
    for (const lod of [0, 1, 2, 3]) {
        const { ground, ownership } = buildSlgTerrainMeshes(terrain(), 0, 0, lod, new Map([[owner.tileId, owner]]), SELF);
        assert.ok(ownership);
        const first = vertices(ground, quadAt(ground, 0, 0));
        const next = vertices(ground, quadAt(ground, 1, 0));
        const minX = Math.min(...first.map((vertex) => vertex.x)), maxX = Math.max(...first.map((vertex) => vertex.x));
        const gap = lod < 2 ? 0.65 : 0;
        near(minX, gap); near(maxX, SLG_GRID_PIXELS - gap);
        near(Math.min(...next.map((vertex) => vertex.x)) - maxX, gap * 2);
        near(ground.minX, gap); near(ground.minY, gap);
        near(ground.maxX, SLG_CHUNK_SIZE * SLG_GRID_PIXELS - gap);
        near(ground.maxY, SLG_CHUNK_SIZE * SLG_GRID_PIXELS - gap);
        assert.deepEqual([ownership.minX, ownership.minY, ownership.maxX, ownership.maxY],
            [ground.minX, ground.minY, ground.maxX, ground.maxY]);
    }
});

test("SLG terrain mesh: farthest chunk stays bounded and indices address only its own geometry", () => {
    // 1500 = 93×16 + 12：尾块是不满 16×16 的部分块（12×12）。
    const { ground, ownership, quadCapacity } = buildSlgTerrainMeshes(terrain(), 93, 93, 3, EMPTY_TILES, SELF);
    assert.equal(quadCapacity, 12 * 12);
    assert.equal(ground.positions.length, quadCapacity * 4 * 3);
    assert.equal(ground.indices16.length, quadCapacity * 6);
    assert.ok([...ground.indices16].every((index) => index < ground.positions.length / 3));
    assert.equal(ground.maxX, SLG_MAP_W * SLG_GRID_PIXELS);
    assert.equal(ground.maxY, SLG_MAP_H * SLG_GRID_PIXELS);
    assert.equal(ownership, null);
    assert.throws(() => buildSlgTerrainMeshes(terrain(), 94, 0, 0, EMPTY_TILES, SELF), RangeError);
    assert.throws(() => buildSlgTerrainMeshes(terrain(), 0, 0, 4, EMPTY_TILES, SELF), RangeError);
    assert.throws(() => buildSlgTerrainMeshes(terrain(), 0, 0, 0, EMPTY_TILES, SELF, 0, 0), RangeError);
});
