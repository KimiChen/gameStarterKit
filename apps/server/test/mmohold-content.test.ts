/** MG2-B1：内容独立装载、据点与守卫可达、三奖励及职业完整。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { indexContentPack, mergeItemTemplates, validateContentPack, type IContentPack } from "@game/shared/kits/mmo/api/content/index";
import { MMO_CLASS_IDS } from "@game/shared/kits/mmo/api/characters/index";
import { parseCollisionGrid } from "@game/shared/kits/mmo/api/movement/index";
import { orchestration } from "../src/core/mmohold/mmoOrchestration";
import { HOLD_PACK_ID, POINT_IDS, REWARD_ITEM_IDS, SENTINEL_TEMPLATE_ID } from "../src/core/mmohold/encounters/capture";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const loadHoldRidge = (): IContentPack => validateContentPack(JSON.parse(fs.readFileSync(path.join(ROOT, "apps/plugins/mmohold/content/pack.json"), "utf8")));

test("holdRidge：独立地图、两据点、两职业、编排守卫与三奖励齐全", () => {
    const pack = loadHoldRidge();
    const index = indexContentPack(pack);
    assert.equal(pack.packId, HOLD_PACK_ID);
    assert.deepEqual(pack.maps.map((map) => map.mapId), [HOLD_PACK_ID]);
    assert.deepEqual(pack.regions.map((region) => region.regionId), [...POINT_IDS]);
    assert.deepEqual([...index.classById.keys()].sort(), [...MMO_CLASS_IDS].sort());
    assert.deepEqual([...index.itemById.keys()], [...REWARD_ITEM_IDS]);
    assert.equal(index.creatureById.get(SENTINEL_TEMPLATE_ID)?.behavior, "idle", "v1 spawn不带阵营，守卫作为中立驻守标记");
    assert.ok(pack.spawns.length > 0 && pack.spawns.every((spawn) => spawn.managed === "orchestration" && spawn.templateId === SENTINEL_TEMPLATE_ID));
    assert.equal(orchestration.packId, pack.packId);
    assert.equal(orchestration.tickEvery, 20);
    assert.deepEqual(orchestration.subscribes, ["instanceStarted", "tick", "timer"]);
});

test("holdRidge：出生点到两据点中心与守卫落点均可达；出生即处于pointA", () => {
    const pack = loadHoldRidge();
    const map = pack.maps[0]!;
    const grid = parseCollisionGrid(map.collision ?? null, map.size)!;
    const step = 100;
    const start = map.spawnPoints[0]!.pos;
    const queue = [{ x: Math.floor(start.x / step), y: Math.floor(start.y / step) }];
    const seen = new Set<string>();
    for (let i = 0; i < queue.length; i += 1) {
        const point = queue[i]!;
        const key = `${point.x}:${point.y}`;
        if (seen.has(key) || point.x < 0 || point.y < 0 || point.x >= map.size.w / step || point.y >= map.size.h / step || grid.blocked(point.x * step + 50, point.y * step + 50)) continue;
        seen.add(key);
        queue.push({ x: point.x - 1, y: point.y }, { x: point.x + 1, y: point.y }, { x: point.x, y: point.y - 1 }, { x: point.x, y: point.y + 1 });
    }
    for (const region of pack.regions) {
        assert.equal(region.shape.kind, "circle");
        if (region.shape.kind !== "circle") continue;
        assert.ok(seen.has(`${Math.floor(region.shape.center.x / step)}:${Math.floor(region.shape.center.y / step)}`), `${region.regionId}可达`);
        for (const offset of [-55, 55]) assert.equal(grid.blocked(region.shape.center.x + offset, region.shape.center.y + 50), false);
    }
    const pointA = pack.regions[0]!.shape;
    assert.ok(pointA.kind === "circle" && Math.hypot(start.x - pointA.center.x, start.y - pointA.center.y) <= pointA.radius);
});

test("两样本同装载：地图 / 表现 / 物品独立，奖励无同名异义", () => {
    const hold = loadHoldRidge();
    const demo = validateContentPack(JSON.parse(fs.readFileSync(path.join(ROOT, "apps/plugins/mmodemo/content/pack.json"), "utf8")));
    const maps = [...hold.maps, ...demo.maps].map((map) => map.mapId);
    assert.equal(new Set(maps).size, maps.length);
    assert.equal(mergeItemTemplates([indexContentPack(hold), indexContentPack(demo)]).size, hold.items.length + demo.items.length);
    const presentations = (pack: IContentPack) => [...pack.classes, ...pack.creatures, ...pack.items, ...pack.npcs].map((entry) => entry.presentationId);
    const demoIds = new Set(presentations(demo));
    assert.ok(presentations(hold).every((id) => !demoIds.has(id)));
});
