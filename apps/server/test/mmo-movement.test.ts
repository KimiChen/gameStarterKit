/**
 * mmo kit movement 面（MK1-B1，纯函数，⛔ 不起房不连库）：normalizeDir / parseCollisionGrid / applyIntent / resolveMove（双端同源）、服务端 teleportWithin，
 * 以及 content 面 v2（职业模板 classes + 碰撞位图校验 + 出生 / 复活 / 刷新点 ⛔ 落阻挡格）。
 * 变异验证（改哪一行 → 哪条用例转红）：resolveMove 撞墙不试轴向滑动 → 「斜向撞墙沿 y 滑动」红；content 去掉出生点阻挡格检查 → 「出生点落阻挡格」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TICK_MS } from "@game/shared/constants/game";
import { ContentPackError, indexContentPack, validateContentPack, type IContentPack, type IMapDef } from "@game/shared/kits/mmo/api/content/index";
import { MMO_MOVE_STEP_MS, applyIntent, normalizeDir, parseCollisionGrid, resolveMove, type MoveState } from "@game/shared/kits/mmo/api/movement/index";
import { GREYBOX_COLLISION_CELL, GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { teleportWithin } from "../src/kits/mmo/api/movement/index";

const SIZE = { w: 2000, h: 2000 };
const GRID = parseCollisionGrid(GREYBOX_PACK.maps[0]!.collision, SIZE)!;
const at = (x: number, y: number, extra: Partial<MoveState> = {}): MoveState => ({ x, y, dirX: 0, dirY: 0, target: null, ...extra });
const round = (value: number): number => Math.round(value * 1000) / 1000;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("normalizeDir：分量钳 [-1,1]、长度 > 1 归一、零向量 / NaN ⇒ 停；预测步长 = 框架 TICK_MS", () => {
    assert.deepEqual(normalizeDir({ x: 0, y: 0 }), { x: 0, y: 0 });
    assert.deepEqual(normalizeDir({ x: 0.5, y: 0 }), { x: 0.5, y: 0 });
    const diagonal = normalizeDir({ x: 3, y: -0.5 });
    assert.deepEqual([round(diagonal.x), round(diagonal.y)], [0.894, -0.447], "先钳 (1, -0.5) 再归一");
    assert.deepEqual(normalizeDir({ x: Number.NaN, y: 2 }), { x: 0, y: 1 });
    assert.equal(MMO_MOVE_STEP_MS, TICK_MS);
});

test("parseCollisionGrid：无 collision ⇒ null；cols × rows 按 ceil；长度 / 字符 / cellSize 不合 RangeError；blocked 按格查、图边缘最大坐标落最后一格", () => {
    assert.equal(parseCollisionGrid(null, SIZE), null);
    assert.deepEqual([GRID.cols, GRID.rows, GRID.cellSize], [20, 20, GREYBOX_COLLISION_CELL]);
    assert.equal(GRID.blocked(1000, 1000), false, "出生点通行");
    assert.equal(GRID.blocked(1500, 900), true, "墙左上角");
    assert.equal(GRID.blocked(1699.9, 1099.9), true, "墙右下角");
    assert.equal(GRID.blocked(1700, 1000), false, "墙右侧第一格外");
    assert.equal(GRID.blocked(1499.9, 1000), false, "墙左侧");
    const odd = parseCollisionGrid({ cellSize: 300, bitmap: `${"0".repeat(48)}1` }, SIZE)!;
    assert.deepEqual([odd.cols, odd.rows], [7, 7], "ceil(2000 / 300) = 7");
    assert.equal(odd.blocked(2000, 2000), true, "最大坐标落最后一格（不越界）");
    assert.throws(() => parseCollisionGrid({ cellSize: 100, bitmap: "0".repeat(399) }, SIZE), RangeError, "长度");
    assert.throws(() => parseCollisionGrid({ cellSize: 100, bitmap: `${"0".repeat(399)}2` }, SIZE), RangeError, "字符");
    assert.throws(() => parseCollisionGrid({ cellSize: 0, bitmap: "" }, SIZE), RangeError, "cellSize");
});

test("resolveMove：dir 常量速度（120 × 50 ms = 6）；target 直奔、reach 内到达并清目标；钳图；撞墙：正向停下清目标、斜向沿轴滑动；无网格全图通行", () => {
    const dir = resolveMove(at(1000, 1000, { dirX: 1, dirY: 0 }), 120, 50, SIZE, GRID);
    assert.deepEqual([dir.x, dir.y, dir.moved, dir.blocked, dir.arrived], [1006, 1000, true, false, false]);
    const diagonal = resolveMove(at(1000, 1000, { dirX: 1, dirY: 1 }), 120, 50, SIZE, GRID);
    assert.deepEqual([round(diagonal.x), round(diagonal.y)], [1004.243, 1004.243], "斜向按长度归一");
    const idle = resolveMove(at(1000, 1000), 120, 50, SIZE, GRID);
    assert.deepEqual([idle.moved, idle.x, idle.y], [false, 1000, 1000]);
    const far = resolveMove(at(1000, 1000, { target: { x: 1100, y: 1000 } }), 120, 50, SIZE, GRID);
    assert.deepEqual([far.x, far.target, far.arrived], [1006, { x: 1100, y: 1000 }, false], "目标保留");
    const near = resolveMove(at(1000, 1000, { target: { x: 1005, y: 1003 } }), 120, 50, SIZE, GRID);
    assert.deepEqual([near.x, near.y, near.target, near.arrived], [1005, 1003, null, true], "距离 5.83 ≤ reach 6 + 0.5 一步到达");
    const edge = resolveMove(at(1998, 5, { dirX: 1, dirY: -1 }), 120, 50, SIZE, GRID);
    assert.deepEqual([edge.x, round(edge.y)], [2000, 0.757], "钳图");
    const headOn = resolveMove(at(1496, 1000, { dirX: 1, dirY: 0 }), 120, 50, SIZE, GRID);
    assert.deepEqual([headOn.x, headOn.moved, headOn.blocked, headOn.target], [1496, false, true, null], "正向撞墙原地");
    const headOnTarget = resolveMove(at(1496, 1000, { target: { x: 1600, y: 1000 } }), 120, 50, SIZE, GRID);
    assert.deepEqual([headOnTarget.x, headOnTarget.target, headOnTarget.blocked], [1496, null, true], "点地穿墙 ⇒ 停下清目标（⛔ 空转）");
    const slide = resolveMove(at(1496, 1000, { dirX: 1, dirY: 1 }), 120, 50, SIZE, GRID);
    assert.deepEqual([slide.x, round(slide.y), slide.moved, slide.blocked], [1496, 1004.243, true, true], "斜向撞墙沿 y 滑动");
    assert.equal(resolveMove(at(1496, 1000, { dirX: 1, dirY: 0 }), 120, 50, SIZE, null).x, 1502, "无网格 = 全图通行");
});

test("applyIntent：dir ⇒ 规范化并清目标；target ⇒ 钳图并清方向；teleportWithin：钳图、落阻挡格 ⇒ null", () => {
    const byDir = applyIntent(at(10, 10, { target: { x: 50, y: 50 } }), { seq: 1, dir: { x: 2, y: 0 } }, SIZE);
    assert.deepEqual([byDir.dirX, byDir.dirY, byDir.target], [1, 0, null]);
    const byTarget = applyIntent(at(10, 10, { dirX: 1, dirY: 0 }), { seq: 2, target: { x: -5, y: 9999 } }, SIZE);
    assert.deepEqual([byTarget.dirX, byTarget.dirY, byTarget.target], [0, 0, { x: 0, y: 2000 }]);
    assert.deepEqual(teleportWithin({ x: -1, y: 50 }, SIZE, GRID), { x: 0, y: 50 });
    assert.equal(teleportWithin({ x: 1550, y: 950 }, SIZE, GRID), null, "落墙");
    assert.deepEqual(teleportWithin({ x: 1550, y: 950 }, SIZE, null), { x: 1550, y: 950 });
});

test("content v2：灰盒包两职业 + 墙过闸并可索引；classes 缺 / 空 / 重复 / 未知技能 / 速度域、位图长度 / 字符、出生点 / 复活点 / 刷新点落阻挡格一律 ContentPackError 并点名路径", () => {
    const pack = validateContentPack(clone(GREYBOX_PACK));
    const index = indexContentPack(pack);
    assert.deepEqual([...index.classById.keys()], ["fighter", "caster"]);
    assert.deepEqual(
        [index.classById.get("fighter")?.speedPerSec, index.classById.get("caster")?.speedPerSec, index.classById.get("caster")?.hpMax, index.classById.get("caster")?.mpMax],
        [120, 110, 80, 100],
    );
    assert.deepEqual([pack.version, pack.maps[0]!.collision?.bitmap.length], [2, 400]);
    type MutablePack = { -readonly [K in keyof IContentPack]: IContentPack[K] };
    type MutableMap = { -readonly [K in keyof IMapDef]: IMapDef[K] };
    const mutate = (edit: (pack: MutablePack, map: MutableMap) => void): unknown => {
        const copy = clone(GREYBOX_PACK) as unknown as MutablePack;
        edit(copy, copy.maps[0] as MutableMap);
        return copy;
    };
    const expectError = (input: unknown, pathPattern: RegExp, label: string): void => {
        assert.throws(() => validateContentPack(input), (error: unknown) => error instanceof ContentPackError && pathPattern.test(error.path), label);
    };
    expectError(mutate((copy) => { copy.classes = []; }), /^pack\.classes$/u, "无职业");
    expectError(mutate((copy) => { delete (copy as Partial<MutablePack>).classes; }), /^pack(\.classes)?$/u, "缺 classes 键");
    expectError(mutate((copy) => { copy.classes = [copy.classes[0]!, { ...copy.classes[0]! }]; }), /classes\[1\]/u, "重复 classId");
    expectError(mutate((copy) => { copy.classes = [{ ...copy.classes[0]!, spells: ["fireball"] }]; }), /classes\[0\]\.spells\[0\]/u, "职业 → 缺技能");
    expectError(mutate((copy) => { copy.classes = [{ ...copy.classes[0]!, speedPerSec: 0 }]; }), /classes\[0\]\.speedPerSec/u, "速度 ≥ 1");
    expectError(mutate((_copy, map) => { map.collision = { cellSize: 100, bitmap: "0".repeat(399) }; }), /maps\[0\]\.collision\.bitmap/u, "位图长度 ≠ cols × rows");
    expectError(mutate((_copy, map) => { map.collision = { cellSize: 100, bitmap: `${"0".repeat(399)}x` }; }), /maps\[0\]\.collision\.bitmap/u, "位图字符");
    expectError(mutate((_copy, map) => { map.spawnPoints = [{ spawnPointId: "start", pos: { x: 1550, y: 950 } }]; }), /maps\[0\]\.spawnPoints\[0\]\.pos/u, "出生点落阻挡格");
    expectError(mutate((_copy, map) => { map.respawnPoints = [{ x: 1550, y: 950 }]; }), /maps\[0\]\.respawnPoints\[0\]/u, "复活点落阻挡格");
    expectError(mutate((copy) => { copy.spawns = [{ ...copy.spawns[0]!, pos: { x: 1550, y: 950 } }]; }), /^pack\.spawns\[0\]\.pos$/u, "刷新点落阻挡格");
    const noWall = validateContentPack(mutate((_copy, map) => { delete (map as Partial<MutableMap>).collision; }));
    assert.equal(noWall.maps[0]!.collision, undefined, "无 collision = 全图通行");
});
