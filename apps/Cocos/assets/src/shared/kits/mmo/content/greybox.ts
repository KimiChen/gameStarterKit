/**
 * mmo kit · 灰盒内容包（docs/MMO.md §7.6「kit v1 自带灰盒内容包」；MK0-B5）：一图（greybox 2000×2000）一怪（slime，三只）一技能（strike）。
 * 只证能力不承诺内容：数值全是灰盒；MK4 改经贡献点（data 贡献 = JSON）装载，届时本 TS 字面量退役——MK0 以 TS 字面量作单源
 * （kit 服务端代码 ⛔ node:fs、tsconfig 未开 resolveJsonModule，见 MMO.md §12 MK0 偏差）。启动期与用例都经 `validateContentPack` 过闸。
 */
import type { IContentPack } from "../api/content/index";

export const GREYBOX_PACK_ID = "greybox";
export const GREYBOX_MAP_ID = "greybox";
export const GREYBOX_SPAWN_POINT_ID = "start";
export const GREYBOX_CREATURE_ID = "slime";
export const GREYBOX_SPELL_ID = "strike";
/** 角色常量速度（世界单位 / 秒；MK1 movement 面改由职业模板给出）。 */
export const GREYBOX_CHARACTER_SPEED = 120;
export const GREYBOX_CHARACTER_HP = 100;
export const GREYBOX_CHARACTER_MP = 50;

export const GREYBOX_PACK: IContentPack = {
    schemaVersion: 1,
    packId: GREYBOX_PACK_ID,
    version: 1,
    maps: [{
        mapId: GREYBOX_MAP_ID,
        name: "灰盒草原",
        size: { w: 2000, h: 2000 },
        aoi: { cellSize: 100, viewRadius: 400 },
        spawnPoints: [{ spawnPointId: GREYBOX_SPAWN_POINT_ID, pos: { x: 1000, y: 1000 } }],
        portals: [],
        respawnPoints: [{ x: 1000, y: 1000 }],
    }],
    regions: [],
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
    spawns: [{ spawnId: "slime-camp", mapId: GREYBOX_MAP_ID, templateId: GREYBOX_CREATURE_ID, pos: { x: 1200, y: 1000 }, count: 3, waypoints: [], managed: "kit" }],
    spells: [{ spellId: GREYBOX_SPELL_ID, name: "挥击", kind: "damage", castMs: 0, cooldownMs: 1500, mpCost: 0, range: 60, power: 8 }],
    items: [],
    lootTables: [],
    npcs: [],
};
