import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    SLG_MAPS, SLG_MAP_DIM_MAX, tileIdFromGrid, gridFromTileId, isSlgTileId, chunkRectForGridRect,
    gridRectForChunkRect, validateSlgChunkRect, applySlgTileAction, slgLodForScale, slgMapIndex,
    validateSlgTerrain, terrainAt, validateSlgTile,
} from "@game/shared/kits/slg/api/worldmap/index";
import { marchDurationMs, positionAt, validateSlgMarch } from "@game/shared/kits/slg/api/march/index";
import {
    validateSlgMapTilesReq, validateSlgMapTilesRes, validateSlgMarchDispatchReq, validateSlgMarchRecallRes,
} from "@game/shared/protocol/lobbyRpc/domains/slg";

test("slg shared: five-map catalog pinned and tile ids round trip with map dimension", () => {
    assert.equal(SLG_MAPS.length, 5);
    assert.deepEqual(SLG_MAPS.map((m) => m.id), ["senzhiguo", "shanzhiguo", "zezhiguo", "jingbeidao", "yuzhiguo"]);
    assert.deepEqual(SLG_MAPS[0], { id: "senzhiguo", name: "森之国", classId: 11, width: 1500, height: 1500 });
    assert.equal(SLG_MAPS[0].width * SLG_MAPS[0].height, 2250000);
    for (const m of SLG_MAPS) assert.ok(m.width <= SLG_MAP_DIM_MAX && m.height <= SLG_MAP_DIM_MAX, "每图边长 ≤ 2048（tileId 11bit/轴）");
    const ids = new Set<number>();
    for (let mapIndex = 0; mapIndex < SLG_MAPS.length; mapIndex++) {
        for (const [x, y] of [[0, 0], [1499, 1499], [7, 0], [0, 1499]]) {
            const id = tileIdFromGrid(mapIndex, x, y); ids.add(id);
            assert.deepEqual(gridFromTileId(id), { mapIndex, x, y });
        }
    }
    assert.equal(ids.size, 20);
    assert.equal(tileIdFromGrid(0, 1499, 1499), 3071451);
    assert.equal(tileIdFromGrid(4, 1499, 1499), 4 * 2 ** 22 + 3071451);
    assert.equal(slgMapIndex("yuzhiguo"), 4);
    // 同坐标不同图：tileId 不同（按图隔离的根基）
    assert.notEqual(tileIdFromGrid(0, 100, 100), tileIdFromGrid(1, 100, 100));
    for (const invalid of [-1, 5 * 2 ** 22, 1500 * 65536, 0.5, NaN, Infinity, "1"]) assert.equal(isSlgTileId(invalid), false);
    assert.throws(() => tileIdFromGrid(0, 2048, 0));
    assert.throws(() => tileIdFromGrid(5, 0, 0));
});
test("slg shared: chunk border, final chunk, bounded request area and exact keys", () => {
    assert.deepEqual(chunkRectForGridRect({ minX: 15, minY: 15, maxX: 16, maxY: 16 }, 1500, 1500), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.deepEqual(gridRectForChunkRect({ minX: 93, minY: 93, maxX: 93, maxY: 93 }, 1500, 1500), { minX: 1488, minY: 1488, maxX: 1499, maxY: 1499 });
    assert.deepEqual(gridRectForChunkRect({ minX: 58, minY: 53, maxX: 58, maxY: 53 }, 940, 850), { minX: 928, minY: 848, maxX: 939, maxY: 849 });
    assert.throws(() => validateSlgChunkRect({ minX: 0, minY: 0, maxX: 12, maxY: 12 }));
    assert.throws(() => validateSlgChunkRect({ minX: 1, minY: 0, maxX: 0, maxY: 0 }));
    assert.throws(() => validateSlgChunkRect({ minX: 0, minY: 0, maxX: 0, maxY: 128 }));
    assert.throws(() => validateSlgMapTilesReq({ rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, uid: "other" }));
    assert.throws(() => validateSlgMapTilesReq({ mapId: "atlantis", rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }));
    assert.deepEqual(validateSlgMapTilesReq({ mapId: "jingbeidao", rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
        { mapId: "jingbeidao", rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
    assert.deepEqual([1, 0.85, 0.849, 0.5, 0.499, 0.28, 0.279].map(slgLodForScale), [0, 0, 1, 1, 2, 2, 3]);
});
test("slg shared: capture on zero in the same action, reinforcement cap and sparse default", () => {
    const empty = { tileId: 0, ownerUid: "", guardPower: 0 };
    assert.deepEqual(applySlgTileAction(empty, "a"), { tile: { tileId: 0, ownerUid: "a", guardPower: 1 }, outcome: "captured" });
    assert.deepEqual(applySlgTileAction({ ...empty, ownerUid: "b", guardPower: 2 }, "a"), { tile: { tileId: 0, ownerUid: "b", guardPower: 1 }, outcome: "damaged" });
    assert.equal(applySlgTileAction({ ...empty, ownerUid: "b", guardPower: 1 }, "a").outcome, "captured");
    assert.equal(applySlgTileAction({ ...empty, ownerUid: "a", guardPower: 99 }, "a").tile.guardPower, 99);
    assert.throws(() => validateSlgTile({ ...empty, ownerUid: "a" }));
    assert.throws(() => validateSlgMapTilesRes({ tiles: [empty], revision: 0, myTrophies: 0 }));
    const owned = { ...empty, ownerUid: "a", guardPower: 1 };
    assert.throws(() => validateSlgMapTilesRes({ tiles: [owned, owned], revision: 2, myTrophies: 0 }));
});
test("slg shared: frozen march time and linear position; invalid or overposted orders rejected", () => {
    const toTile = tileIdFromGrid(0, 3, 4);
    assert.equal(marchDurationMs(0, toTile), 5000);
    const march = { marchId: "m", uid: "a", fromTile: 0, toTile, departAt: 1000, arriveAt: 6000, status: "marching" as const };
    assert.deepEqual(positionAt(march, 0), { x: 0, y: 0 });
    assert.deepEqual(positionAt(march, 3500), { x: 1.5, y: 2 });
    assert.deepEqual(positionAt(march, 9000), { x: 3, y: 4 });
    assert.deepEqual(validateSlgMarch(march), march);
    assert.throws(() => validateSlgMarch({ ...march, arriveAt: 5000 }));
    assert.throws(() => validateSlgMarchDispatchReq({ clientReqId: "d", fromTile: 0, toTile: 0 }));
    assert.throws(() => validateSlgMarchDispatchReq({ clientReqId: "d", fromTile: 0, toTile: 1, cost: 0 }));
    assert.throws(() => marchDurationMs(0, tileIdFromGrid(1, 3, 4)), "跨图行军必须拒绝");
    assert.throws(() => validateSlgMarchRecallRes({ march }));
});
test("slg terrain: frozen content validation and ordered regional painting", () => {
    const source = readFileSync(new URL("../../kits/slg/data/maps/senzhiguo/terrain.json", import.meta.url), "utf8");
    const resource = readFileSync(new URL("../../Cocos/assets/resources/kits/slg/maps/senzhiguo/terrain.json", import.meta.url), "utf8");
    assert.equal(resource, source, "Creator resource must exactly mirror the kit's terrain source");
    assert.equal(validateSlgTerrain(JSON.parse(source)), true, "shipped terrain must match the senzhiguo catalog entry");
    const data = { id: "senzhiguo", name: "Demo", width: 1500, height: 1500, islandRect: { minX: 0, minY: 0, maxX: 1499, maxY: 1499 }, palette: [{ id: 0, color: [1, 2, 3] }, { id: 1, color: [4, 5, 6] }], regions: [{ x: 0, y: 0, width: 1500, height: 1500, terrain: 0 }, { x: 2, y: 3, width: 4, height: 5, terrain: 1 }] };
    if (!validateSlgTerrain(data)) throw new Error("valid fixture rejected");
    assert.equal(terrainAt(data, 0, 0).id, 0);
    assert.equal(terrainAt(data, 2, 3).id, 1);
    assert.equal(terrainAt(data, 6, 3).id, 0);
    assert.equal(validateSlgTerrain({ ...data, width: 1501 }), false);
    assert.equal(validateSlgTerrain({ ...data, id: "atlantis" }), false, "catalog 外地图 id 拒绝");
    assert.equal(validateSlgTerrain({ ...data, width: 1148, height: 983 }), false, "id 与 catalog 尺寸必须一致");
    assert.equal(validateSlgTerrain({ ...data, palette: [data.palette[0], data.palette[0]] }), false);
    assert.equal(validateSlgTerrain({ ...data, regions: [{ x: 0, y: 0, width: 1500, height: 1500, terrain: 0 }, { x: 1499, y: 0, width: 2, height: 1, terrain: 0 }] }), false);
    assert.equal(validateSlgTerrain({ ...data, regions: [{ x: 0, y: 0, width: 1, height: 1, terrain: 2 }] }), false, "region.terrain 超出 palette 拒绝");
});
