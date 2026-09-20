/**
 * mmo kit · 灰盒内容包（docs/MMO.md §7.6「kit v1 自带灰盒内容包」；MK0-B5，MK1-B1 加职业模板与碰撞位图，MK1-B3 加第二图与一对传送门）：
 * 主图 greybox（2000×2000，视距 400，一堵 200×200 的墙，slime ×3）+ 东郊 greybox-east（1000×1000，slime ×2），gate-east ↔ gate-west 互通，
 * 落点各自的 "gate" 出生点在门外（半径外）；两职业（fighter / caster）一技能（strike）。只证能力不承诺内容：数值全是灰盒；MK4 改经贡献点
 * （data 贡献 = JSON）装载，届时本 TS 字面量退役——MK0 以 TS 字面量作单源（kit 服务端代码 ⛔ node:fs、tsconfig 未开 resolveJsonModule，
 * 见 MMO.md §12 MK0 偏差 ①）。启动期与用例都经 `validateContentPack` 过闸。
 */
import type { IContentPack } from "../api/content/index";

export const GREYBOX_PACK_ID = "greybox";
export const GREYBOX_MAP_ID = "greybox";
export const GREYBOX_SPAWN_POINT_ID = "start";
export const GREYBOX_CREATURE_ID = "slime";
export const GREYBOX_SPELL_ID = "strike";
export const GREYBOX_MAP_SIZE = 2000;
export const GREYBOX_EAST_MAP_ID = "greybox-east";
export const GREYBOX_EAST_MAP_SIZE = 1000;
/** 交接落点出生点 id（两图同名，各自在自己门外）。 */
export const GREYBOX_GATE_SPAWN_POINT_ID = "gate";
export const GREYBOX_PORTAL_EAST_ID = "gate-east";
export const GREYBOX_PORTAL_WEST_ID = "gate-west";
export const GREYBOX_PORTAL_RADIUS = 60;
export const GREYBOX_COLLISION_CELL = 100;
/** 墙：格 col 15–16 × row 9–10 ⇒ 世界坐标 x ∈ [1500, 1700)、y ∈ [900, 1100)。 */
export const GREYBOX_WALL = Object.freeze({ colMin: 15, colMax: 16, rowMin: 9, rowMax: 10 });

function greyboxBitmap(): string {
    const cells = GREYBOX_MAP_SIZE / GREYBOX_COLLISION_CELL;
    let bitmap = "";
    for (let row = 0; row < cells; row += 1) {
        for (let col = 0; col < cells; col += 1) {
            const wall = col >= GREYBOX_WALL.colMin && col <= GREYBOX_WALL.colMax && row >= GREYBOX_WALL.rowMin && row <= GREYBOX_WALL.rowMax;
            bitmap += wall ? "1" : "0";
        }
    }
    return bitmap;
}

export const GREYBOX_PACK: IContentPack = {
    schemaVersion: 1,
    packId: GREYBOX_PACK_ID,
    version: 3,
    maps: [{
        mapId: GREYBOX_MAP_ID,
        name: "灰盒草原",
        size: { w: GREYBOX_MAP_SIZE, h: GREYBOX_MAP_SIZE },
        aoi: { cellSize: 100, viewRadius: 400 },
        collision: { cellSize: GREYBOX_COLLISION_CELL, bitmap: greyboxBitmap() },
        spawnPoints: [
            { spawnPointId: GREYBOX_SPAWN_POINT_ID, pos: { x: 1000, y: 1000 } },
            { spawnPointId: GREYBOX_GATE_SPAWN_POINT_ID, pos: { x: 1000, y: 780 } }, // 门外 80（半径 60 之外，⛔ 落地即再触发）
        ],
        portals: [{ portalId: GREYBOX_PORTAL_EAST_ID, pos: { x: 1000, y: 700 }, radius: GREYBOX_PORTAL_RADIUS, toMapId: GREYBOX_EAST_MAP_ID, toSpawnPointId: GREYBOX_GATE_SPAWN_POINT_ID }],
        respawnPoints: [{ x: 1000, y: 1000 }],
    }, {
        mapId: GREYBOX_EAST_MAP_ID,
        name: "灰盒东郊",
        size: { w: GREYBOX_EAST_MAP_SIZE, h: GREYBOX_EAST_MAP_SIZE },
        aoi: { cellSize: 100, viewRadius: 400 },
        spawnPoints: [
            { spawnPointId: GREYBOX_SPAWN_POINT_ID, pos: { x: 500, y: 500 } },
            { spawnPointId: GREYBOX_GATE_SPAWN_POINT_ID, pos: { x: 500, y: 720 } },
        ],
        portals: [{ portalId: GREYBOX_PORTAL_WEST_ID, pos: { x: 500, y: 800 }, radius: GREYBOX_PORTAL_RADIUS, toMapId: GREYBOX_MAP_ID, toSpawnPointId: GREYBOX_GATE_SPAWN_POINT_ID }],
        respawnPoints: [{ x: 500, y: 500 }],
    }],
    regions: [],
    classes: [
        { classId: "fighter", name: "战士", presentationId: "fighter", hpMax: 100, mpMax: 50, attack: 10, defense: 2, speedPerSec: 120, spells: [GREYBOX_SPELL_ID] },
        { classId: "caster", name: "法师", presentationId: "caster", hpMax: 80, mpMax: 100, attack: 6, defense: 1, speedPerSec: 110, spells: [GREYBOX_SPELL_ID] },
    ],
    creatures: [{
        templateId: GREYBOX_CREATURE_ID,
        name: "史莱姆",
        presentationId: "slime",
        level: 1,
        hpMax: 30,
        mpMax: 0,
        attack: 4,
        defense: 0,
        speedPerSec: 60,
        behavior: "idle",
        aggroRadius: 0,
        leashRadius: 0,
        spells: [],
        respawnSec: 20,
        tier: "normal",
        checkpointOnDeath: false,
        interacts: [],
    }],
    spawns: [
        { spawnId: "slime-camp", mapId: GREYBOX_MAP_ID, templateId: GREYBOX_CREATURE_ID, pos: { x: 1200, y: 1000 }, count: 3, waypoints: [], managed: "kit" },
        { spawnId: "east-camp", mapId: GREYBOX_EAST_MAP_ID, templateId: GREYBOX_CREATURE_ID, pos: { x: 700, y: 500 }, count: 2, waypoints: [], managed: "kit" },
    ],
    spells: [{ spellId: GREYBOX_SPELL_ID, name: "挥击", kind: "damage", castMs: 0, cooldownMs: 1500, mpCost: 0, range: 60, power: 8 }],
    items: [],
    lootTables: [],
    npcs: [],
};
