/**
 * mmo kit · `content` api 面（shared，docs/MMO.md §7.5）：内容包 schema + 零依赖 validator（fail-closed：未知键 / 坏类型 / 越界 / 引用断裂一律抛）
 * + 索引助手。插件（MG 段内容包）只按本面形状交内容；kit 在 codegen 期与启动期都用同一个 `validateContentPack`，任一失败 codegen 拒绝 / WorldRoom 拒启。
 * 原始数据 id 与 `presentationId` 分离（表现映射归客户端 `IPresentationMap`）。可达性（出生点到每个传送点有 nav 路径）随 MK2 的 nav 网格接入，
 * MK0 只做引用完整性 + 数值域 + 几何在图内；v2（MK1-B1）加职业模板 `classes`（角色速度 / HP / MP 的真源）与碰撞位图校验（长度 = cols × rows、'0'/'1'、
 * 出生点 / 刷新点 ⛔ 落在阻挡格）。本面任何导出变化都要 bump `api.content.version`。
 */
import { assertExactKeys, boundedString, finiteInteger, finiteNumber, isPlainRecord, type PlainRecord } from "../../../../protocol/http";
import { collisionGridDims, parseCollisionGrid } from "../movement/index";

export const MMO_CONTENT_SCHEMA_VERSION = 1;

/** 上限（内容包大小闸；数字是 v1 候选，MK4 冻结）。 */
export const MMO_CONTENT_LIMITS = Object.freeze({
    maps: 64, regions: 1024, classes: 64, creatures: 1024, spawns: 4096, spells: 512, items: 4096, lootTables: 1024, npcs: 1024,
    spawnCountMax: 64, waypointsMax: 32, mapSizeMax: 1_000_000, viewRadiusMax: 5_000, speedMax: 10_000, statMax: 100_000_000,
});

export type MmoBehavior = "idle" | "patrol" | "aggro";
export type MmoCreatureTier = "normal" | "elite" | "boss";
export type MmoSpellKind = "damage" | "heal" | "buff" | "debuff";
export type MmoItemSlot = "none" | "weapon" | "armor" | "trinket" | "consumable";
export type MmoSpawnManaged = "kit" | "orchestration";

export interface IContentVec2 { readonly x: number; readonly y: number }

export interface ISpawnPoint { readonly spawnPointId: string; readonly pos: IContentVec2; readonly factionId?: string }
export interface IPortalDef { readonly portalId: string; readonly pos: IContentVec2; readonly radius: number; readonly toMapId: string; readonly toSpawnPointId: string }

export interface IMapDef {
    readonly mapId: string;
    readonly name: string;
    /** 世界单位 */
    readonly size: { readonly w: number; readonly h: number };
    /** 三个 cellSize 互不绑定；viewRadius 用世界单位 */
    readonly aoi: { readonly cellSize: number; readonly viewRadius: number };
    readonly collision?: { readonly cellSize: number; readonly bitmap: string };
    readonly nav?: { readonly cellSize: number };
    readonly spawnPoints: readonly ISpawnPoint[];
    readonly portals: readonly IPortalDef[];
    readonly respawnPoints: readonly IContentVec2[];
}

export type IRegionShape =
    | { readonly kind: "circle"; readonly center: IContentVec2; readonly radius: number }
    | { readonly kind: "rect"; readonly min: IContentVec2; readonly max: IContentVec2 };
export interface IRegionDef { readonly regionId: string; readonly mapId: string; readonly shape: IRegionShape; readonly enabledByDefault: boolean; readonly tags: readonly string[] }

export interface ICreatureTemplate {
    readonly templateId: string;
    readonly name: string;
    readonly presentationId: string;
    readonly level: number;
    readonly hpMax: number;
    readonly mpMax: number;
    readonly attack: number;
    readonly defense: number;
    /** 服务端常量（世界单位 / 秒） */
    readonly speedPerSec: number;
    readonly behavior: MmoBehavior;
    readonly aggroRadius: number;
    readonly leashRadius: number;
    readonly spells: readonly string[];
    readonly lootTableId?: string;
    readonly respawnSec: number;
    readonly tier: MmoCreatureTier;
    readonly checkpointOnDeath: boolean;
    readonly interacts: readonly string[];
}

/** 职业模板（MK1-B1）：角色的成长起点与常量速度（服务端权威积分用；客户端预测同源）。 */
export interface IClassTemplate {
    readonly classId: string;
    readonly name: string;
    readonly presentationId: string;
    readonly hpMax: number;
    readonly mpMax: number;
    readonly attack: number;
    readonly defense: number;
    /** 服务端常量（世界单位 / 秒） */
    readonly speedPerSec: number;
    readonly spells: readonly string[];
}

export interface ISpawnDef {
    readonly spawnId: string;
    readonly mapId: string;
    readonly templateId: string;
    readonly pos: IContentVec2;
    readonly count: number;
    readonly waypoints: readonly IContentVec2[];
    readonly managed: MmoSpawnManaged;
}

export interface ISpellTemplate {
    readonly spellId: string;
    readonly name: string;
    readonly kind: MmoSpellKind;
    readonly castMs: number;
    readonly cooldownMs: number;
    readonly mpCost: number;
    readonly range: number;
    readonly power: number;
    readonly durationMs?: number;
}

export interface IItemTemplate {
    readonly itemId: string;
    readonly name: string;
    readonly presentationId: string;
    readonly slot: MmoItemSlot;
    readonly stackMax: number;
    readonly classIds: readonly string[];
    readonly price: number;
    readonly attrs: { readonly attack?: number; readonly defense?: number; readonly hpMax?: number };
}

export interface ILootEntry { readonly itemId: string; readonly weight: number; readonly countMin: number; readonly countMax: number }
export interface ILootTable { readonly lootTableId: string; readonly entries: readonly ILootEntry[] }
export interface INpcDef { readonly npcId: string; readonly mapId: string; readonly name: string; readonly presentationId: string; readonly pos: IContentVec2; readonly interacts: readonly string[] }

export interface IContentPack {
    readonly schemaVersion: typeof MMO_CONTENT_SCHEMA_VERSION;
    readonly packId: string;
    readonly version: number;
    readonly maps: readonly IMapDef[];
    readonly regions: readonly IRegionDef[];
    readonly classes: readonly IClassTemplate[];
    readonly creatures: readonly ICreatureTemplate[];
    readonly spawns: readonly ISpawnDef[];
    readonly spells: readonly ISpellTemplate[];
    readonly items: readonly IItemTemplate[];
    readonly lootTables: readonly ILootTable[];
    readonly npcs: readonly INpcDef[];
}

export class ContentPackError extends Error {
    constructor(readonly path: string, readonly reason: string) {
        super(`[mmo content] ${path}: ${reason}`);
        this.name = "ContentPackError";
    }
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

function fail(path: string, reason: string): never {
    throw new ContentPackError(path, reason);
}

function record(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) fail(path, "must be an object");
    return input;
}

function exact(value: PlainRecord, path: string, required: readonly string[], optional: readonly string[] = []): void {
    try {
        assertExactKeys(value, [...required], [...optional], path);
    } catch (error) {
        fail(path, error instanceof Error ? error.message : String(error));
    }
}

function guard<T>(path: string, fn: () => T): T {
    try {
        return fn();
    } catch (error) {
        if (error instanceof ContentPackError) throw error;
        fail(path, error instanceof Error ? error.message : String(error));
    }
}

const idOf = (value: unknown, path: string): string => {
    const id = guard(path, () => boundedString(value, path, 1, 64));
    if (!ID_RE.test(id)) fail(path, "id shape");
    return id;
};
const nameOf = (value: unknown, path: string): string => guard(path, () => boundedString(value, path, 1, 32));
const int = (value: unknown, path: string, min: number, max: number): number => guard(path, () => finiteInteger(value, path, min, max));
const num = (value: unknown, path: string, min: number, max: number): number => guard(path, () => finiteNumber(value, path, min, max));
const bool = (value: unknown, path: string): boolean => {
    if (typeof value !== "boolean") fail(path, "must be boolean");
    return value;
};
const enumOf = <T extends string>(value: unknown, path: string, allowed: readonly T[]): T => {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) fail(path, `must be one of ${allowed.join(" / ")}`);
    return value as T;
};
const list = (value: unknown, path: string, max: number): readonly unknown[] => {
    if (!Array.isArray(value)) fail(path, "must be an array");
    if (value.length > max) fail(path, `at most ${max} entries`);
    return value;
};
const idList = (value: unknown, path: string, max = 64): string[] => list(value, path, max).map((entry, index) => idOf(entry, `${path}[${index}]`));

function vec2(input: unknown, path: string, size: { readonly w: number; readonly h: number } | null): IContentVec2 {
    const value = record(input, path);
    exact(value, path, ["x", "y"]);
    const max = MMO_CONTENT_LIMITS.mapSizeMax;
    const out = { x: num(value.x, `${path}.x`, 0, max), y: num(value.y, `${path}.y`, 0, max) };
    if (size && (out.x > size.w || out.y > size.h)) fail(path, `outside map size ${size.w}×${size.h}`);
    return out;
}

function unique(ids: readonly string[], path: string): Set<string> {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
        if (seen.has(id)) fail(`${path}[${index}]`, `duplicate id "${id}"`);
        seen.add(id);
    });
    return seen;
}

function mapDef(input: unknown, path: string): IMapDef {
    const value = record(input, path);
    exact(value, path, ["mapId", "name", "size", "aoi", "spawnPoints", "portals", "respawnPoints"], ["collision", "nav"]);
    const size = record(value.size, `${path}.size`);
    exact(size, `${path}.size`, ["w", "h"]);
    const sizeOut = { w: int(size.w, `${path}.size.w`, 1, MMO_CONTENT_LIMITS.mapSizeMax), h: int(size.h, `${path}.size.h`, 1, MMO_CONTENT_LIMITS.mapSizeMax) };
    const aoi = record(value.aoi, `${path}.aoi`);
    exact(aoi, `${path}.aoi`, ["cellSize", "viewRadius"]);
    const out: {
        mapId: string; name: string; size: IMapDef["size"]; aoi: IMapDef["aoi"]; collision?: NonNullable<IMapDef["collision"]>; nav?: NonNullable<IMapDef["nav"]>;
        spawnPoints: ISpawnPoint[]; portals: IPortalDef[]; respawnPoints: IContentVec2[];
    } = {
        mapId: idOf(value.mapId, `${path}.mapId`),
        name: nameOf(value.name, `${path}.name`),
        size: sizeOut,
        aoi: { cellSize: int(aoi.cellSize, `${path}.aoi.cellSize`, 1, MMO_CONTENT_LIMITS.mapSizeMax), viewRadius: int(aoi.viewRadius, `${path}.aoi.viewRadius`, 1, MMO_CONTENT_LIMITS.viewRadiusMax) },
        spawnPoints: [],
        portals: [],
        respawnPoints: [],
    };
    if (value.collision !== undefined) {
        const collision = record(value.collision, `${path}.collision`);
        exact(collision, `${path}.collision`, ["cellSize", "bitmap"]);
        out.collision = { cellSize: int(collision.cellSize, `${path}.collision.cellSize`, 1, MMO_CONTENT_LIMITS.mapSizeMax), bitmap: guard(`${path}.collision.bitmap`, () => boundedString(collision.bitmap, `${path}.collision.bitmap`, 0, 1_048_576)) };
        const dims = collisionGridDims(sizeOut, out.collision.cellSize);
        if (out.collision.bitmap.length !== dims.cols * dims.rows) fail(`${path}.collision.bitmap`, `length ${out.collision.bitmap.length} ≠ cols × rows = ${dims.cols} × ${dims.rows}`);
        if (!/^[01]*$/u.test(out.collision.bitmap)) fail(`${path}.collision.bitmap`, "only '0' / '1'");
    }
    if (value.nav !== undefined) {
        const nav = record(value.nav, `${path}.nav`);
        exact(nav, `${path}.nav`, ["cellSize"]);
        out.nav = { cellSize: int(nav.cellSize, `${path}.nav.cellSize`, 1, MMO_CONTENT_LIMITS.mapSizeMax) };
    }
    const spawnPoints = list(value.spawnPoints, `${path}.spawnPoints`, 256);
    if (spawnPoints.length === 0) fail(`${path}.spawnPoints`, "at least one spawn point");
    out.spawnPoints = spawnPoints.map((entry, index) => {
        const point = record(entry, `${path}.spawnPoints[${index}]`);
        exact(point, `${path}.spawnPoints[${index}]`, ["spawnPointId", "pos"], ["factionId"]);
        const spawnPoint: { spawnPointId: string; pos: IContentVec2; factionId?: string } = {
            spawnPointId: idOf(point.spawnPointId, `${path}.spawnPoints[${index}].spawnPointId`), pos: vec2(point.pos, `${path}.spawnPoints[${index}].pos`, sizeOut),
        };
        if (point.factionId !== undefined) spawnPoint.factionId = idOf(point.factionId, `${path}.spawnPoints[${index}].factionId`);
        return spawnPoint;
    });
    unique(out.spawnPoints.map((point) => point.spawnPointId), `${path}.spawnPoints`);
    out.portals = list(value.portals, `${path}.portals`, 64).map((entry, index) => {
        const portal = record(entry, `${path}.portals[${index}]`);
        exact(portal, `${path}.portals[${index}]`, ["portalId", "pos", "radius", "toMapId", "toSpawnPointId"]);
        return {
            portalId: idOf(portal.portalId, `${path}.portals[${index}].portalId`),
            pos: vec2(portal.pos, `${path}.portals[${index}].pos`, sizeOut),
            radius: num(portal.radius, `${path}.portals[${index}].radius`, 1, MMO_CONTENT_LIMITS.mapSizeMax),
            toMapId: idOf(portal.toMapId, `${path}.portals[${index}].toMapId`),
            toSpawnPointId: idOf(portal.toSpawnPointId, `${path}.portals[${index}].toSpawnPointId`),
        };
    });
    unique(out.portals.map((portal) => portal.portalId), `${path}.portals`);
    out.respawnPoints = list(value.respawnPoints, `${path}.respawnPoints`, 256).map((entry, index) => vec2(entry, `${path}.respawnPoints[${index}]`, sizeOut));
    return out;
}

function regionDef(input: unknown, path: string): IRegionDef {
    const value = record(input, path);
    exact(value, path, ["regionId", "mapId", "shape", "enabledByDefault", "tags"]);
    const shape = record(value.shape, `${path}.shape`);
    let parsedShape: IRegionShape;
    if (shape.kind === "circle") {
        exact(shape, `${path}.shape`, ["kind", "center", "radius"]);
        parsedShape = { kind: "circle", center: vec2(shape.center, `${path}.shape.center`, null), radius: num(shape.radius, `${path}.shape.radius`, 1, MMO_CONTENT_LIMITS.mapSizeMax) };
    } else if (shape.kind === "rect") {
        exact(shape, `${path}.shape`, ["kind", "min", "max"]);
        const min = vec2(shape.min, `${path}.shape.min`, null);
        const max = vec2(shape.max, `${path}.shape.max`, null);
        if (min.x >= max.x || min.y >= max.y) fail(`${path}.shape`, "rect min must be below max");
        parsedShape = { kind: "rect", min, max };
    } else {
        fail(`${path}.shape.kind`, "must be circle / rect");
    }
    return {
        regionId: idOf(value.regionId, `${path}.regionId`),
        mapId: idOf(value.mapId, `${path}.mapId`),
        shape: parsedShape,
        enabledByDefault: bool(value.enabledByDefault, `${path}.enabledByDefault`),
        tags: idList(value.tags, `${path}.tags`, 16),
    };
}

function creatureTemplate(input: unknown, path: string): ICreatureTemplate {
    const value = record(input, path);
    exact(value, path, ["templateId", "name", "presentationId", "level", "hpMax", "mpMax", "attack", "defense", "speedPerSec", "behavior", "aggroRadius", "leashRadius", "spells", "respawnSec", "tier", "checkpointOnDeath", "interacts"], ["lootTableId"]);
    const stat = MMO_CONTENT_LIMITS.statMax;
    const out: {
        templateId: string; name: string; presentationId: string; level: number; hpMax: number; mpMax: number; attack: number; defense: number; speedPerSec: number;
        behavior: MmoBehavior; aggroRadius: number; leashRadius: number; spells: string[]; lootTableId?: string; respawnSec: number; tier: MmoCreatureTier; checkpointOnDeath: boolean; interacts: string[];
    } = {
        templateId: idOf(value.templateId, `${path}.templateId`),
        name: nameOf(value.name, `${path}.name`),
        presentationId: idOf(value.presentationId, `${path}.presentationId`),
        level: int(value.level, `${path}.level`, 1, 65535),
        hpMax: int(value.hpMax, `${path}.hpMax`, 1, stat),
        mpMax: int(value.mpMax, `${path}.mpMax`, 0, stat),
        attack: int(value.attack, `${path}.attack`, 0, stat),
        defense: int(value.defense, `${path}.defense`, 0, stat),
        speedPerSec: num(value.speedPerSec, `${path}.speedPerSec`, 0, MMO_CONTENT_LIMITS.speedMax),
        behavior: enumOf(value.behavior, `${path}.behavior`, ["idle", "patrol", "aggro"]),
        aggroRadius: num(value.aggroRadius, `${path}.aggroRadius`, 0, MMO_CONTENT_LIMITS.mapSizeMax),
        leashRadius: num(value.leashRadius, `${path}.leashRadius`, 0, MMO_CONTENT_LIMITS.mapSizeMax),
        spells: idList(value.spells, `${path}.spells`, 16),
        respawnSec: int(value.respawnSec, `${path}.respawnSec`, 0, 86_400),
        tier: enumOf(value.tier, `${path}.tier`, ["normal", "elite", "boss"]),
        checkpointOnDeath: bool(value.checkpointOnDeath, `${path}.checkpointOnDeath`),
        interacts: idList(value.interacts, `${path}.interacts`, 16),
    };
    if (value.lootTableId !== undefined) out.lootTableId = idOf(value.lootTableId, `${path}.lootTableId`);
    if (out.leashRadius < out.aggroRadius) fail(`${path}.leashRadius`, "leash must be ≥ aggro radius");
    return out;
}

function classTemplate(input: unknown, path: string): IClassTemplate {
    const value = record(input, path);
    exact(value, path, ["classId", "name", "presentationId", "hpMax", "mpMax", "attack", "defense", "speedPerSec", "spells"]);
    const stat = MMO_CONTENT_LIMITS.statMax;
    return {
        classId: idOf(value.classId, `${path}.classId`),
        name: nameOf(value.name, `${path}.name`),
        presentationId: idOf(value.presentationId, `${path}.presentationId`),
        hpMax: int(value.hpMax, `${path}.hpMax`, 1, stat),
        mpMax: int(value.mpMax, `${path}.mpMax`, 0, stat),
        attack: int(value.attack, `${path}.attack`, 0, stat),
        defense: int(value.defense, `${path}.defense`, 0, stat),
        speedPerSec: num(value.speedPerSec, `${path}.speedPerSec`, 1, MMO_CONTENT_LIMITS.speedMax),
        spells: idList(value.spells, `${path}.spells`, 16),
    };
}

function spawnDef(input: unknown, path: string): ISpawnDef {
    const value = record(input, path);
    exact(value, path, ["spawnId", "mapId", "templateId", "pos", "count", "waypoints", "managed"]);
    return {
        spawnId: idOf(value.spawnId, `${path}.spawnId`),
        mapId: idOf(value.mapId, `${path}.mapId`),
        templateId: idOf(value.templateId, `${path}.templateId`),
        pos: vec2(value.pos, `${path}.pos`, null),
        count: int(value.count, `${path}.count`, 1, MMO_CONTENT_LIMITS.spawnCountMax),
        waypoints: list(value.waypoints, `${path}.waypoints`, MMO_CONTENT_LIMITS.waypointsMax).map((entry, index) => vec2(entry, `${path}.waypoints[${index}]`, null)),
        managed: enumOf(value.managed, `${path}.managed`, ["kit", "orchestration"]),
    };
}

function spellTemplate(input: unknown, path: string): ISpellTemplate {
    const value = record(input, path);
    exact(value, path, ["spellId", "name", "kind", "castMs", "cooldownMs", "mpCost", "range", "power"], ["durationMs"]);
    const out: { spellId: string; name: string; kind: MmoSpellKind; castMs: number; cooldownMs: number; mpCost: number; range: number; power: number; durationMs?: number } = {
        spellId: idOf(value.spellId, `${path}.spellId`),
        name: nameOf(value.name, `${path}.name`),
        kind: enumOf(value.kind, `${path}.kind`, ["damage", "heal", "buff", "debuff"]),
        castMs: int(value.castMs, `${path}.castMs`, 0, 60_000),
        cooldownMs: int(value.cooldownMs, `${path}.cooldownMs`, 0, 3_600_000),
        mpCost: int(value.mpCost, `${path}.mpCost`, 0, MMO_CONTENT_LIMITS.statMax),
        range: num(value.range, `${path}.range`, 0, MMO_CONTENT_LIMITS.mapSizeMax),
        power: int(value.power, `${path}.power`, 0, MMO_CONTENT_LIMITS.statMax),
    };
    if (value.durationMs !== undefined) out.durationMs = int(value.durationMs, `${path}.durationMs`, 0, 3_600_000);
    if ((out.kind === "buff" || out.kind === "debuff") && out.durationMs === undefined) fail(`${path}.durationMs`, "buff / debuff need durationMs");
    return out;
}

function itemTemplate(input: unknown, path: string): IItemTemplate {
    const value = record(input, path);
    exact(value, path, ["itemId", "name", "presentationId", "slot", "stackMax", "classIds", "price", "attrs"]);
    const attrs = record(value.attrs, `${path}.attrs`);
    exact(attrs, `${path}.attrs`, [], ["attack", "defense", "hpMax"]);
    const parsedAttrs: { attack?: number; defense?: number; hpMax?: number } = {};
    for (const key of ["attack", "defense", "hpMax"] as const) {
        if (attrs[key] !== undefined) parsedAttrs[key] = int(attrs[key], `${path}.attrs.${key}`, 0, MMO_CONTENT_LIMITS.statMax);
    }
    return {
        itemId: idOf(value.itemId, `${path}.itemId`),
        name: nameOf(value.name, `${path}.name`),
        presentationId: idOf(value.presentationId, `${path}.presentationId`),
        slot: enumOf(value.slot, `${path}.slot`, ["none", "weapon", "armor", "trinket", "consumable"]),
        stackMax: int(value.stackMax, `${path}.stackMax`, 1, 9_999),
        classIds: idList(value.classIds, `${path}.classIds`, 16),
        price: int(value.price, `${path}.price`, 0, MMO_CONTENT_LIMITS.statMax),
        attrs: parsedAttrs,
    };
}

function lootTable(input: unknown, path: string): ILootTable {
    const value = record(input, path);
    exact(value, path, ["lootTableId", "entries"]);
    const entries = list(value.entries, `${path}.entries`, 64).map((entry, index) => {
        const item = record(entry, `${path}.entries[${index}]`);
        exact(item, `${path}.entries[${index}]`, ["itemId", "weight", "countMin", "countMax"]);
        const out = {
            itemId: idOf(item.itemId, `${path}.entries[${index}].itemId`),
            weight: int(item.weight, `${path}.entries[${index}].weight`, 1, 1_000_000),
            countMin: int(item.countMin, `${path}.entries[${index}].countMin`, 1, 9_999),
            countMax: int(item.countMax, `${path}.entries[${index}].countMax`, 1, 9_999),
        };
        if (out.countMin > out.countMax) fail(`${path}.entries[${index}]`, "countMin > countMax");
        return out;
    });
    if (entries.length === 0) fail(`${path}.entries`, "at least one entry");
    return { lootTableId: idOf(value.lootTableId, `${path}.lootTableId`), entries };
}

function npcDef(input: unknown, path: string): INpcDef {
    const value = record(input, path);
    exact(value, path, ["npcId", "mapId", "name", "presentationId", "pos", "interacts"]);
    return {
        npcId: idOf(value.npcId, `${path}.npcId`),
        mapId: idOf(value.mapId, `${path}.mapId`),
        name: nameOf(value.name, `${path}.name`),
        presentationId: idOf(value.presentationId, `${path}.presentationId`),
        pos: vec2(value.pos, `${path}.pos`, null),
        interacts: idList(value.interacts, `${path}.interacts`, 16),
    };
}

/** 结构 + 数值域 + 引用完整性 + 几何在图内；任一失败抛 ContentPackError（fail-closed）。返回冻结的规范化副本。 */
export function validateContentPack(input: unknown): IContentPack {
    const value = record(input, "pack");
    exact(value, "pack", ["schemaVersion", "packId", "version", "maps", "regions", "classes", "creatures", "spawns", "spells", "items", "lootTables", "npcs"]);
    if (value.schemaVersion !== MMO_CONTENT_SCHEMA_VERSION) fail("pack.schemaVersion", `must be ${MMO_CONTENT_SCHEMA_VERSION}`);
    const limits = MMO_CONTENT_LIMITS;
    const maps = list(value.maps, "pack.maps", limits.maps).map((entry, index) => mapDef(entry, `pack.maps[${index}]`));
    if (maps.length === 0) fail("pack.maps", "at least one map");
    const regions = list(value.regions, "pack.regions", limits.regions).map((entry, index) => regionDef(entry, `pack.regions[${index}]`));
    const classes = list(value.classes, "pack.classes", limits.classes).map((entry, index) => classTemplate(entry, `pack.classes[${index}]`));
    if (classes.length === 0) fail("pack.classes", "at least one class");
    const creatures = list(value.creatures, "pack.creatures", limits.creatures).map((entry, index) => creatureTemplate(entry, `pack.creatures[${index}]`));
    const spawns = list(value.spawns, "pack.spawns", limits.spawns).map((entry, index) => spawnDef(entry, `pack.spawns[${index}]`));
    const spells = list(value.spells, "pack.spells", limits.spells).map((entry, index) => spellTemplate(entry, `pack.spells[${index}]`));
    const items = list(value.items, "pack.items", limits.items).map((entry, index) => itemTemplate(entry, `pack.items[${index}]`));
    const lootTables = list(value.lootTables, "pack.lootTables", limits.lootTables).map((entry, index) => lootTable(entry, `pack.lootTables[${index}]`));
    const npcs = list(value.npcs, "pack.npcs", limits.npcs).map((entry, index) => npcDef(entry, `pack.npcs[${index}]`));

    const mapIds = unique(maps.map((map) => map.mapId), "pack.maps");
    unique(regions.map((region) => region.regionId), "pack.regions");
    unique(classes.map((klass) => klass.classId), "pack.classes");
    const creatureIds = unique(creatures.map((creature) => creature.templateId), "pack.creatures");
    unique(spawns.map((spawn) => spawn.spawnId), "pack.spawns");
    const spellIds = unique(spells.map((spell) => spell.spellId), "pack.spells");
    const itemIds = unique(items.map((item) => item.itemId), "pack.items");
    const lootIds = unique(lootTables.map((table) => table.lootTableId), "pack.lootTables");
    unique(npcs.map((npc) => npc.npcId), "pack.npcs");
    const mapById = new Map(maps.map((map) => [map.mapId, map]));

    // 引用完整性：spawn → map / template；creature → spell / lootTable；loot → item；portal → map / spawnPoint；region / npc → map；几何在图内
    maps.forEach((map, mapIndex) => {
        map.portals.forEach((portal, index) => {
            const target = mapById.get(portal.toMapId);
            if (!target) fail(`pack.maps[${mapIndex}].portals[${index}].toMapId`, `unknown map "${portal.toMapId}"`);
            if (!target.spawnPoints.some((point) => point.spawnPointId === portal.toSpawnPointId)) fail(`pack.maps[${mapIndex}].portals[${index}].toSpawnPointId`, `unknown spawn point "${portal.toSpawnPointId}" in map "${portal.toMapId}"`);
        });
    });
    regions.forEach((region, index) => {
        if (!mapIds.has(region.mapId)) fail(`pack.regions[${index}].mapId`, `unknown map "${region.mapId}"`);
    });
    classes.forEach((klass, index) => {
        klass.spells.forEach((spellId, spellIndex) => {
            if (!spellIds.has(spellId)) fail(`pack.classes[${index}].spells[${spellIndex}]`, `unknown spell "${spellId}"`);
        });
    });
    // 碰撞位图：出生点 / 复活点 / 刷新点 ⛔ 落在阻挡格（进图即卡死）
    const grids = new Map(maps.map((map) => [map.mapId, parseCollisionGrid(map.collision ?? null, map.size)]));
    maps.forEach((map, mapIndex) => {
        const grid = grids.get(map.mapId) ?? null;
        if (!grid) return;
        map.spawnPoints.forEach((point, index) => {
            if (grid.blocked(point.pos.x, point.pos.y)) fail(`pack.maps[${mapIndex}].spawnPoints[${index}].pos`, "spawn point inside a blocked cell");
        });
        map.respawnPoints.forEach((point, index) => {
            if (grid.blocked(point.x, point.y)) fail(`pack.maps[${mapIndex}].respawnPoints[${index}]`, "respawn point inside a blocked cell");
        });
    });
    creatures.forEach((creature, index) => {
        creature.spells.forEach((spellId, spellIndex) => {
            if (!spellIds.has(spellId)) fail(`pack.creatures[${index}].spells[${spellIndex}]`, `unknown spell "${spellId}"`);
        });
        if (creature.lootTableId !== undefined && !lootIds.has(creature.lootTableId)) fail(`pack.creatures[${index}].lootTableId`, `unknown loot table "${creature.lootTableId}"`);
    });
    spawns.forEach((spawn, index) => {
        const map = mapById.get(spawn.mapId);
        if (!map) fail(`pack.spawns[${index}].mapId`, `unknown map "${spawn.mapId}"`);
        if (!creatureIds.has(spawn.templateId)) fail(`pack.spawns[${index}].templateId`, `unknown creature "${spawn.templateId}"`);
        if (spawn.pos.x > map.size.w || spawn.pos.y > map.size.h) fail(`pack.spawns[${index}].pos`, `outside map size ${map.size.w}×${map.size.h}`);
        const grid = grids.get(map.mapId) ?? null;
        if (grid && grid.blocked(spawn.pos.x, spawn.pos.y)) fail(`pack.spawns[${index}].pos`, "spawn inside a blocked cell");
        spawn.waypoints.forEach((point, pointIndex) => {
            if (point.x > map.size.w || point.y > map.size.h) fail(`pack.spawns[${index}].waypoints[${pointIndex}]`, "outside map");
        });
    });
    lootTables.forEach((table, index) => {
        table.entries.forEach((entry, entryIndex) => {
            if (!itemIds.has(entry.itemId)) fail(`pack.lootTables[${index}].entries[${entryIndex}].itemId`, `unknown item "${entry.itemId}"`);
        });
    });
    npcs.forEach((npc, index) => {
        const map = mapById.get(npc.mapId);
        if (!map) fail(`pack.npcs[${index}].mapId`, `unknown map "${npc.mapId}"`);
        if (npc.pos.x > map.size.w || npc.pos.y > map.size.h) fail(`pack.npcs[${index}].pos`, "outside map");
    });

    return {
        schemaVersion: MMO_CONTENT_SCHEMA_VERSION,
        packId: idOf(value.packId, "pack.packId"),
        version: int(value.version, "pack.version", 1, 65535),
        maps, regions, classes, creatures, spawns, spells, items, lootTables, npcs,
    };
}

/** 只读索引（服务端注册表 / 客户端几何共用）。 */
export interface IContentPackIndex {
    readonly pack: IContentPack;
    readonly mapById: ReadonlyMap<string, IMapDef>;
    readonly classById: ReadonlyMap<string, IClassTemplate>;
    readonly creatureById: ReadonlyMap<string, ICreatureTemplate>;
    readonly spellById: ReadonlyMap<string, ISpellTemplate>;
    readonly itemById: ReadonlyMap<string, IItemTemplate>;
    readonly lootTableById: ReadonlyMap<string, ILootTable>;
    readonly spawnsByMap: ReadonlyMap<string, readonly ISpawnDef[]>;
    readonly regionsByMap: ReadonlyMap<string, readonly IRegionDef[]>;
    readonly npcsByMap: ReadonlyMap<string, readonly INpcDef[]>;
}

function groupBy<T>(entries: readonly T[], keyOf: (entry: T) => string): ReadonlyMap<string, readonly T[]> {
    const map = new Map<string, T[]>();
    for (const entry of entries) {
        const key = keyOf(entry);
        const bucket = map.get(key);
        if (bucket) bucket.push(entry);
        else map.set(key, [entry]);
    }
    return map;
}

export function indexContentPack(pack: IContentPack): IContentPackIndex {
    return {
        pack,
        mapById: new Map(pack.maps.map((map) => [map.mapId, map])),
        classById: new Map(pack.classes.map((klass) => [klass.classId, klass])),
        creatureById: new Map(pack.creatures.map((creature) => [creature.templateId, creature])),
        spellById: new Map(pack.spells.map((spell) => [spell.spellId, spell])),
        itemById: new Map(pack.items.map((item) => [item.itemId, item])),
        lootTableById: new Map(pack.lootTables.map((table) => [table.lootTableId, table])),
        spawnsByMap: groupBy(pack.spawns, (spawn) => spawn.mapId),
        regionsByMap: groupBy(pack.regions, (region) => region.mapId),
        npcsByMap: groupBy(pack.npcs, (npc) => npc.mapId),
    };
}
