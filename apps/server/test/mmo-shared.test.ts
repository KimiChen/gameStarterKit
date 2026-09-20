/**
 * mmo kit shared 三面（MK0-B2）：characters（名字 / 槽位 / 枚举 / 摘要 validator / 槽位视图）、world（地址往返 / 积分 / 钳制）、
 * content（灰盒包过闸；结构 / 数值 / 引用断裂 / 越界一律 ContentPackError 并点名路径；索引）。⛔ 不连库、不起房。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CHARACTER_SLOTS, characterSlots, isValidCharacterName, validateCharacterSummary, validateClassId, validateFactionId,
} from "@game/shared/kits/mmo/api/characters/index";
import { ContentPackError, indexContentPack, validateContentPack, type IContentPack } from "@game/shared/kits/mmo/api/content/index";
import { clampToMap, integrate, parseWorldAddress, withinRadius, worldAddressOf } from "@game/shared/kits/mmo/api/world/index";
import { GREYBOX_MAP_ID, GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const summary = { characterId: "c1", personaId: "p1", slot: 1, name: "Rook", classId: "fighter", factionId: "dawn", level: 3, exp: 10, mapId: "greybox", status: "active" };

test("characters：名字 2–16 个字母 / 数字 / 汉字 / _ -；槽位 0..MAX-1；职业 / 阵营闭合；摘要 exact keys", () => {
  for (const ok of ["Ro", "Rook_1", "灰盒勇者", "a-b", "x".repeat(16)]) assert.ok(isValidCharacterName(ok), ok);
  for (const bad of ["R", "x".repeat(17), "Ro ok", "Rook!", "", 12, "\u0000ab"]) assert.equal(isValidCharacterName(bad), false, String(bad));
  assert.equal(validateClassId("caster"), "caster");
  assert.throws(() => validateClassId("paladin"), /MMO_CLASS_ID/u);
  assert.throws(() => validateFactionId("neutral"), /MMO_FACTION_ID/u);
  assert.deepEqual(validateCharacterSummary(summary), summary);
  assert.throws(() => validateCharacterSummary({ ...summary, slot: MAX_CHARACTER_SLOTS }), /MMO_CHARACTER_SLOT/u);
  assert.throws(() => validateCharacterSummary({ ...summary, hp: 1 }), /WIRE_KEYS/u, "位置 / HP ⛔ 进摘要（M08）");
  assert.throws(() => validateCharacterSummary({ ...summary, status: "gone" }), /MMO_CHARACTER_STATUS/u);
  const slots = characterSlots([summary as never], [{ personaId: "p9", slot: 3 }]);
  assert.deepEqual(slots.map((slot) => slot.kind), ["empty", "character", "empty", "orphan"]);
});

test("world：地址 s<sId>/<mapId>/<line> 往返、坏形态 null；常量速度积分归一化、零向量原地；钳到图内", () => {
  assert.equal(worldAddressOf(7, "greybox", 2), "s7/greybox/2");
  assert.deepEqual(parseWorldAddress("s7/greybox/2"), { sId: 7, mapId: "greybox", line: 2 });
  for (const bad of ["x7/greybox/2", "s7/greybox", "s7/gr ey/2", "s70000/greybox/2", 3]) assert.equal(parseWorldAddress(bad), null, String(bad));
  assert.throws(() => worldAddressOf(1, "bad map", 0), /mapId/u);
  const moved = integrate({ x: 10, y: 10 }, { x: 3, y: 4 }, 100, 500);
  assert.deepEqual({ x: Math.round(moved.x * 1000) / 1000, y: Math.round(moved.y * 1000) / 1000 }, { x: 40, y: 50 });
  assert.deepEqual(integrate({ x: 1, y: 1 }, { x: 0, y: 0 }, 100, 500), { x: 1, y: 1 });
  assert.deepEqual(clampToMap({ x: -5, y: 2500 }, { w: 2000, h: 2000 }), { x: 0, y: 2000 });
  assert.ok(withinRadius({ x: 0, y: 0 }, { x: 3, y: 4 }, 5));
  assert.equal(withinRadius({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.99), false);
});

test("content：灰盒包过闸并可索引（灰盒 v5：主图三只 slime + 野猪 + 田鼠三处刷新点，共 5 只）", () => {
  const pack = validateContentPack(clone(GREYBOX_PACK));
  assert.deepEqual(pack, GREYBOX_PACK, "规范化副本 = 字面量（无隐式字段）");
  const index = indexContentPack(pack);
  assert.equal(index.mapById.get(GREYBOX_MAP_ID)?.aoi.viewRadius, 400);
  assert.equal(index.spawnsByMap.get(GREYBOX_MAP_ID)?.reduce((sum, spawn) => sum + spawn.count, 0), 5, "三只 slime + 野猪 + 田鼠");
  assert.equal(index.creatureById.get("slime")?.hpMax, 30);
  assert.equal(index.spellById.get("strike")?.kind, "damage");
});

test("content：未知键 / 坏枚举 / 引用断裂（spawn→template、portal→map、loot→item）/ 越界坐标 / 重复 id 一律 ContentPackError 并点名路径", () => {
  type MutablePack = { -readonly [K in keyof IContentPack]: IContentPack[K] };
  const mutate = (edit: (pack: MutablePack) => void): unknown => {
    const pack = clone(GREYBOX_PACK) as unknown as MutablePack;
    edit(pack);
    return pack;
  };
  const expectError = (input: unknown, pathPattern: RegExp, label: string): void => {
    assert.throws(() => validateContentPack(input), (error: unknown) => error instanceof ContentPackError && pathPattern.test(error.path), label);
  };
  expectError(mutate((pack) => { (pack as unknown as Record<string, unknown>).extra = 1; }), /^pack$/u, "未知顶层键");
  expectError(mutate((pack) => { pack.creatures = [{ ...pack.creatures[0]!, behavior: "fly" as never }]; }), /creatures\[0\]\.behavior/u, "坏枚举");
  expectError(mutate((pack) => { pack.spawns = [{ ...pack.spawns[0]!, templateId: "dragon" }]; }), /spawns\[0\]\.templateId/u, "spawn → 缺模板");
  expectError(mutate((pack) => { pack.spawns = [{ ...pack.spawns[0]!, pos: { x: 5000, y: 10 } }]; }), /spawns\[0\]\.pos/u, "spawn 越出图");
  expectError(mutate((pack) => { pack.maps = [{ ...pack.maps[0]!, portals: [{ portalId: "p", pos: { x: 1, y: 1 }, radius: 10, toMapId: "nowhere", toSpawnPointId: "start" }] }]; }), /portals\[0\]\.toMapId/u, "portal → 缺图");
  expectError(mutate((pack) => { pack.lootTables = [...pack.lootTables, { lootTableId: "lt", entries: [{ itemId: "gem", weight: 1, countMin: 1, countMax: 1 }] }]; }), /lootTables\[2\]\.entries\[0\]\.itemId/u, "loot → 缺物品");
  expectError(mutate((pack) => { pack.creatures = [{ ...pack.creatures[0]!, lootTableId: "nowhere" }]; }), /creatures\[0\]\.lootTableId/u, "creature → 缺掉落表");
  expectError(mutate((pack) => { pack.creatures = [pack.creatures[0]!, { ...pack.creatures[0]! }]; }), /creatures\[1\]/u, "重复 id");
  expectError(mutate((pack) => { pack.creatures = [{ ...pack.creatures[0]!, spells: ["nova"] }]; }), /creatures\[0\]\.spells\[0\]/u, "creature → 缺技能");
  expectError(mutate((pack) => { pack.maps = [{ ...pack.maps[0]!, spawnPoints: [] }]; }), /spawnPoints/u, "无出生点");
  expectError(mutate((pack) => { pack.spells = [{ ...pack.spells[0]!, kind: "buff" }]; }), /durationMs/u, "buff 缺 durationMs");
  expectError(mutate((pack) => { pack.schemaVersion = 2 as never; }), /schemaVersion/u, "schema 版本");
});
