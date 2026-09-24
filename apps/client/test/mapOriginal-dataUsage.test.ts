import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { mapoTerrainDataUsage, mapoSetDisplayTerrain, resetMapoTerrain } from "../src/kits/mapOriginal/logic/mapoTerrain";
import { mapoBandsDataUsage, mapoBandAt } from "../src/kits/mapOriginal/logic/mapoBands";
import { mapoCitiesDataUsage, mapoSetCities } from "../src/kits/mapOriginal/logic/mapoCities";
import { mapoRoadsDataUsage, mapoSetRoads } from "../src/kits/mapOriginal/logic/mapoRoads";
import { mapoMinimapMark } from "../src/kits/mapOriginal/logic/mapoFar";
// @ts-expect-error Preview fixture is ESM without declarations.
import { MAPO_BASELINE_BIOMES } from "../../../tools/creator-preview/maporiginal.mjs";

const data = (name: string) => new Uint8Array(readFileSync(new URL(`../../kits/mapOriginal/data/maps/s1/${name}`, import.meta.url)));

test("mapOriginal O0：只读统计不触发解码，BufferAsset 与 reader 持有不能重复计费", () => {
    resetMapoTerrain();
    assert.deepEqual(mapoTerrainDataUsage(), { arrayBufferBytes: 0, passCells: 0, displayCells: 0 });
    const bytes = data("terrain.bytes");
    mapoSetDisplayTerrain(bytes);
    assert.deepEqual(mapoTerrainDataUsage(), { arrayBufferBytes: bytes.buffer.byteLength, passCells: 0, displayCells: 2250000 });
    assert.equal(mapoBandsDataUsage().arrayBufferBytes, 0);
    mapoBandAt(750, 750);
    assert.equal(mapoBandsDataUsage().arrayBufferBytes, 2250000);
    // Re-reading the probe does not decode/allocate another array or clear the retained one.
    assert.equal(mapoBandsDataUsage().arrayBufferBytes, 2250000);
    resetMapoTerrain();
    assert.equal(mapoTerrainDataUsage().arrayBufferBytes, 0);
});

test("mapOriginal O0：摆位按真实 buffer 计字节，城池对象报告数量而非虚构堆大小", () => {
    const roads = data("roads.bin");
    mapoSetRoads(roads);
    assert.deepEqual(mapoRoadsDataUsage(), { arrayBufferBytes: roads.buffer.byteLength, placements: 42018 });
    mapoSetCities(data("cities.bin"));
    assert.deepEqual(mapoCitiesDataUsage(), { arrayBufferBytes: 0, pieces: 15, sprites: 1642, placements: 249 });
});

test("mapOriginal O0：预览地貌落点遵循 shared 坐标和实际地貌数据", () => {
    for (const target of MAPO_BASELINE_BIOMES) {
        assert.equal(mapoBandAt(target.row, target.col), target.band);
        assert.deepEqual(mapoMinimapMark(target.row, target.col), { x: target.u, y: target.v });
    }
});
