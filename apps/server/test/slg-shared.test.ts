import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
    SLG_MAP_W, SLG_MAP_H, tileIdFromGrid, gridFromTileId, isSlgTileId, chunkRectForGridRect,
    gridRectForChunkRect, validateSlgChunkRect, applySlgTileAction, slgLodForScale,
    validateSlgTerrain, terrainAt, validateSlgTile,
} from "@game/shared/kits/slg/api/worldmap/index";
import { marchDurationMs, positionAt, validateSlgMarch } from "@game/shared/kits/slg/api/march/index";
import {
    validateSlgMapTilesReq, validateSlgMapTilesRes, validateSlgMarchDispatchReq, validateSlgMarchRecallRes,
} from "@game/shared/protocol/lobbyRpc/domains/slg";

test("slg shared: 1500×1500 grid ids round trip across both axes and uint32 boundaries", () => {
    const ids = new Set<number>();
    for (let i = 0; i < 1500; i++) for (const [x, y] of [[i, 0], [i, 1499], [0, i], [1499, i]]) {
        const id = tileIdFromGrid(x, y); ids.add(id);
        assert.deepEqual(gridFromTileId(id), { x, y });
    }
    assert.equal(SLG_MAP_W * SLG_MAP_H, 2250000);
    assert.equal(ids.size, 5996);
    assert.equal(tileIdFromGrid(1499, 1499), 98239963);
    for (const invalid of [-1, 1500, 65535, 1500 * 65536, 0.5, NaN, Infinity, "1"]) assert.equal(isSlgTileId(invalid), false);
    assert.throws(() => tileIdFromGrid(1500, 0));
});
test("slg shared: chunk border, final chunk, bounded request area and exact keys", () => {
    assert.deepEqual(chunkRectForGridRect({ minX: 15, minY: 15, maxX: 16, maxY: 16 }), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.deepEqual(gridRectForChunkRect({ minX: 93, minY: 93, maxX: 93, maxY: 93 }), { minX: 1488, minY: 1488, maxX: 1499, maxY: 1499 });
    assert.throws(() => validateSlgChunkRect({ minX: 0, minY: 0, maxX: 12, maxY: 12 }));
    assert.throws(() => validateSlgChunkRect({ minX: 1, minY: 0, maxX: 0, maxY: 0 }));
    assert.throws(() => validateSlgMapTilesReq({ rect: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, uid: "other" }));
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
    const toTile = tileIdFromGrid(3, 4);
    assert.equal(marchDurationMs(0, toTile), 5000);
    const march = { marchId: "m", uid: "a", fromTile: 0, toTile, departAt: 1000, arriveAt: 6000, status: "marching" as const };
    assert.deepEqual(positionAt(march, 0), { x: 0, y: 0 });
    assert.deepEqual(positionAt(march, 3500), { x: 1.5, y: 2 });
    assert.deepEqual(positionAt(march, 9000), { x: 3, y: 4 });
    assert.deepEqual(validateSlgMarch(march), march);
    assert.throws(() => validateSlgMarch({ ...march, arriveAt: 5000 }));
    assert.throws(() => validateSlgMarchDispatchReq({ clientReqId: "d", fromTile: 0, toTile: 0 }));
    assert.throws(() => validateSlgMarchDispatchReq({ clientReqId: "d", fromTile: 0, toTile: 1, cost: 0 }));
    assert.throws(() => validateSlgMarchRecallRes({ march }));
});
test("slg terrain: frozen content validation and ordered regional painting", () => {
    const source = readFileSync(new URL("../../kits/slg/data/terrain.json", import.meta.url), "utf8");
    const resource = readFileSync(new URL("../../Cocos/assets/resources/kits/slg/terrain.json", import.meta.url), "utf8");
    assert.equal(resource, source, "Creator resource must exactly mirror the kit's terrain source");
    assert.equal(validateSlgTerrain(JSON.parse(source)), true, "shipped terrain must match the 1500×1500 contract");
    const data = { name: "Demo", width: 1500, height: 1500, palette: [{ id: 0, color: [1, 2, 3] }, { id: 1, color: [4, 5, 6] }], regions: [{ x: 2, y: 3, width: 4, height: 5, terrain: 1 }] };
    if (!validateSlgTerrain(data)) throw new Error("valid fixture rejected");
    assert.equal(terrainAt(data, 0, 0).id, 0);
    assert.equal(terrainAt(data, 2, 3).id, 1);
    assert.equal(terrainAt(data, 6, 3).id, 0);
    assert.equal(validateSlgTerrain({ ...data, width: 1501 }), false);
    assert.equal(validateSlgTerrain({ ...data, palette: [data.palette[0], data.palette[0]] }), false);
    assert.equal(validateSlgTerrain({ ...data, regions: [{ x: 1499, y: 0, width: 2, height: 1, terrain: 0 }] }), false);
    assert.equal(validateSlgTerrain({ ...data, regions: [{ x: 0, y: 0, width: 1, height: 1, terrain: 2 }] }), false);
});
