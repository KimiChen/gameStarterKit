/** Tilemap 瓦片网格几何：格→瓦片摆放、pivot 对齐、LOD 减层与归属 overlay。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSlgTileIndex, buildSlgTilemapMeshes, type SlgTilesData } from "../src/kits/slg/logic/tilemapMesh";
import { SLG_GRID_PIXELS } from "../src/kits/slg/logic/mapCamera";
import { SLG_CHUNK_SIZE, chunkKey, slgMapInfo, tileIdFromGrid,
    type ISlgTerrain, type ISlgTile } from "../src/shared/kits/slg/api/worldmap/index";

const MAP = slgMapInfo("senzhiguo");
const EMPTY_TILES: ReadonlyMap<number, ISlgTile> = new Map();
const SELF = "me";

function terrain(): ISlgTerrain {
    return { id: MAP.id, name: "tilemap fixture", width: MAP.width, height: MAP.height,
        islandRect: { minX: 414, minY: 525, maxX: 1086, maxY: 975 },
        palette: [{ id: 0, color: [31, 132, 68] }], regions: [] };
}
/** 两瓦片：0 = 单格地表（168px/168ppu = 1 渲染格，居中 pivot），1 = 双格树（336px 宽，底部居中 pivot）。 */
function tilesData(layers: SlgTilesData["layers"]): SlgTilesData {
    return { id: MAP.id, tile: 16, scale: 3, atlasCols: 16, cellPx: 256, atlas: ["tileset-0.png"], layers,
        tiles: [
            { atlas: 0, cell: 0, w: 168, h: 168, ppu: 168, pivotX: 0.5, pivotY: 0.5 },
            { atlas: 0, cell: 5, w: 336, h: 504, ppu: 168, pivotX: 0.5, pivotY: 0 },
        ] };
}
function near(actual: number, expected: number, epsilon = 0.0001): void {
    assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}

test("SLG tilemap index: cells bucket into their owning chunk preserving layer order", () => {
    const ground = { name: "Ground", seq: 0, cells: [[0, 0, 0], [SLG_CHUNK_SIZE, 0, 0], [SLG_CHUNK_SIZE + 1, 0, 0]] as const };
    const object = { name: "Object", seq: 10, cells: [[1, 1, 1], [SLG_CHUNK_SIZE, 1, 1]] as const };
    const index = buildSlgTileIndex(tilesData([ground, object]));
    const first = index.get(chunkKey(0, 0));
    assert.equal(first?.length, 2);
    assert.deepEqual(first?.map((bucket) => bucket.layer.name), ["Ground", "Object"]);
    assert.deepEqual(first?.[0].cells, [[0, 0, 0]]);
    assert.deepEqual(first?.[1].cells, [[1, 1, 1]]);
    const second = index.get(chunkKey(1, 0));
    assert.deepEqual(second?.[0].cells, [[SLG_CHUNK_SIZE, 0, 0], [SLG_CHUNK_SIZE + 1, 0, 0]]);
    assert.deepEqual(second?.[1].cells, [[SLG_CHUNK_SIZE, 1, 1]]);
    assert.equal(index.size, 2);
});

test("SLG tilemap mesh: every cell emits one quad with world size w/ppu×scale and pivot alignment", () => {
    const data = tilesData([{ name: "Ground", seq: 0, cells: [[2, 3, 0]] }, { name: "Object", seq: 10, cells: [[4, 5, 1]] }]);
    const mesh = buildSlgTilemapMeshes(terrain(), data, buildSlgTileIndex(data), 0, 0, 0, EMPTY_TILES, SELF).ground;
    assert.ok(mesh); assert.equal(mesh.positions.length / 12, 2);
    // scale=3：1 渲染格 = 144 世界像素。m_TileAnchor=(0,0) → 锚点 = 格左下角。
    // 格 (2,3) 单渲染格地表（pivot 0.5,0.5）：边长 144，中心 pivot → [24,168) × [72,216)。
    near(mesh.positions[0], 2 * SLG_GRID_PIXELS - 72);
    near(mesh.positions[1], 3 * SLG_GRID_PIXELS + 72);
    near(mesh.positions[3], 2 * SLG_GRID_PIXELS + 72);
    near(mesh.positions[7], 3 * SLG_GRID_PIXELS - 72);
    // 格 (4,5) 双渲染格树（pivot 0.5,0）：宽 288 高 432 → 底边贴格底边中点、左缘内缩半宽。
    const tree = 12;
    near(mesh.positions[tree], 4 * SLG_GRID_PIXELS - 144);
    near(mesh.positions[tree + 1], 5 * SLG_GRID_PIXELS + 432);
    near(mesh.positions[tree + 6], 4 * SLG_GRID_PIXELS - 144);
    near(mesh.positions[tree + 7], 5 * SLG_GRID_PIXELS);
    // 索引自寻址且三角化两枚。
    assert.deepEqual(Array.from(mesh.indices16!.slice(0, 6)), [0, 1, 2, 2, 1, 3]);
    assert.deepEqual(Array.from(mesh.indices16!.slice(6, 12)), [4, 5, 6, 6, 5, 7]);
});

test("SLG tilemap mesh: layer m_TileAnchor shifts the anchor by anchor×scale cells", () => {
    const data = tilesData([{ name: "Ground", seq: 0, ax: 0.5, ay: 0.5, cells: [[2, 3, 0]] }]);
    const mesh = buildSlgTilemapMeshes(terrain(), data, buildSlgTileIndex(data), 0, 0, 0, EMPTY_TILES, SELF).ground;
    assert.ok(mesh);
    // anchor (0.5,0.5) × scale 3 → 锚点 = (2+1.5, 3+1.5) 格；pivot 0.5 → 四边再内缩 72。
    near(mesh.positions[0], (2 + 1.5) * SLG_GRID_PIXELS - 72);
    near(mesh.positions[1], (3 + 1.5) * SLG_GRID_PIXELS + 72);
});

test("SLG tilemap mesh: UVs stay inside their atlas cell with a half-texel inset", () => {
    const data = tilesData([{ name: "Object", seq: 10, cells: [[0, 0, 1]] }]);
    const mesh = buildSlgTilemapMeshes(terrain(), data, buildSlgTileIndex(data), 0, 0, 0, EMPTY_TILES, SELF).ground;
    assert.ok(mesh);
    const cols = 16, inset = 0.5 / (cols * 256);
    // 瓦片 cell 5 = 列 5 行 0：u ∈ [5/16+inset, 6/16-inset]；v 与 far 层同约定（v=0 = PNG 顶）：行 0 → v ∈ [0+inset, 1/16-inset]。
    near(mesh.uvs[0], 5 / cols + inset); near(mesh.uvs[2], 6 / cols - inset);
    near(mesh.uvs[1], inset); near(mesh.uvs[5], 1 / cols - inset);
    assert.ok(mesh.uvs[0] < mesh.uvs[2] && mesh.uvs[1] < mesh.uvs[5]);
});

test("SLG tilemap mesh: content sub-rect keeps off-square tiles distortion-free", () => {
    const data = tilesData([{ name: "Object", seq: 10, cells: [[0, 0, 1]] }]);
    // 双格树内容子矩形：图集格内横向居中（u0/u1 内缩），纵向顶格。
    const withRect: SlgTilesData = { ...data, tiles: [data.tiles[0], { ...data.tiles[1], u0: 0.167, v0: 0, u1: 0.833, v1: 1 }] };
    const mesh = buildSlgTilemapMeshes(terrain(), withRect, buildSlgTileIndex(withRect), 0, 0, 0, EMPTY_TILES, SELF).ground;
    assert.ok(mesh);
    const cols = 16, inset = 0.5 / (cols * 256);
    near(mesh.uvs[0], (5 + 0.167) / cols + inset); near(mesh.uvs[2], (5 + 0.833) / cols - inset);
    near(mesh.uvs[1], inset); near(mesh.uvs[5], 1 / cols - inset);
});

test("SLG tilemap mesh: LOD 3 keeps only primary layers and drops fine decal layers", () => {
    const layers: SlgTilesData["layers"] = [
        { name: "Ground", seq: 0, cells: [[0, 0, 0]] },
        { name: "Shadow", seq: 5, cells: [[1, 0, 0]] },
        { name: "Rug", seq: 6, cells: [[2, 0, 0]] },
        { name: "Object", seq: 10, cells: [[3, 0, 1]] },
    ];
    const data = tilesData(layers);
    const index = buildSlgTileIndex(data);
    const nearMesh = buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 2, EMPTY_TILES, SELF).ground;
    const farMesh = buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 3, EMPTY_TILES, SELF).ground;
    assert.ok(nearMesh); assert.ok(farMesh);
    assert.equal(nearMesh.positions.length / 12, 4);
    assert.equal(farMesh.positions.length / 12, 2, "LOD3 只留 Ground + Object");
});

test("SLG tilemap mesh: empty chunk has no ground mesh and ownership overlay matches terrainMesh colors", () => {
    const data = tilesData([]);
    const index = buildSlgTileIndex(data);
    const empty = buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 0, EMPTY_TILES, SELF);
    assert.equal(empty.ground, null); assert.equal(empty.ownership, null); assert.equal(empty.quadCapacity, 0);
    const owned = new Map<number, ISlgTile>([
        [tileIdFromGrid(0, 1, 1), { tileId: tileIdFromGrid(0, 1, 1), ownerUid: SELF, guardPower: 1 }],
        [tileIdFromGrid(0, 2, 2), { tileId: tileIdFromGrid(0, 2, 2), ownerUid: "enemy", guardPower: 1 }],
    ]);
    const mesh = buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 0, owned, SELF);
    assert.equal(mesh.ownership?.positions.length ?? 0, 2 * 12);
    const self = Array.from(mesh.ownership!.colors.slice(0, 4));
    const other = Array.from(mesh.ownership!.colors.slice(16, 20));
    near(self[0], 65 / 255); near(self[1], 148 / 255); near(self[2], 236 / 255); near(self[3], 0.4);
    near(other[0], 220 / 255); near(other[1], 91 / 255); near(other[2], 78 / 255); near(other[3], 0.4);
    // 淡出 alpha 相乘。
    const fading = buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 0, owned, SELF, 0.5);
    near(fading.ownership!.colors[3], 0.2);
});

test("SLG tilemap mesh: invalid lod or alpha are rejected before any geometry is built", () => {
    const data = tilesData([{ name: "Ground", seq: 0, cells: [[0, 0, 0]] }]);
    const index = buildSlgTileIndex(data);
    assert.throws(() => buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 4, EMPTY_TILES, SELF), RangeError);
    assert.throws(() => buildSlgTilemapMeshes(terrain(), data, index, 0, 0, 0, EMPTY_TILES, SELF, 1.5), RangeError);
});
