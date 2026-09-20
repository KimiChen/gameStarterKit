/**
 * mmo kit AOI 内部模块（MK1-B2，纯函数 / 纯内存，⛔ 不起房）：AoiGrid 空间网格（格序号 / 插入 / 跨格搬桶 / 删除 / 候选 = 视距圆外接矩形覆盖的格子）、
 * canSee 可见性规则（本人 / 位面 / 隐身 × 阵营）、pickInterest（精确欧氏视距 + 规则 + 最近优先截到 cap）。
 * 变异验证（改哪一行 → 哪条用例转红）：canSee 不看 plane → 「canSee」红；pickInterest 不截 cap → 「pickInterest」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AoiGrid } from "../src/kits/mmo/aoi/grid";
import { canSee, pickInterest, type IVisibilityFacts } from "../src/kits/mmo/aoi/visibility";

const facts = (id: string, extra: Partial<IVisibilityFacts> = {}): IVisibilityFacts => ({ id, x: 0, y: 0, plane: 0, stealth: false, factionId: "dawn", ...extra });

test("AoiGrid：格序号 / 插入 / 跨格搬桶 / 同格不搬 / 删除 / 清空；candidates = 视距圆外接矩形覆盖的格子（边缘钳制、超图 = 全图），⛔ 远格", () => {
    const grid = new AoiGrid(100, { w: 2000, h: 2000 });
    assert.deepEqual([grid.cols, grid.rows], [20, 20]);
    assert.equal(grid.cellOf(2000, 2000), 20 * 20 - 1, "最大坐标落最后一格");
    grid.insert("a", 1000, 1000);
    grid.insert("b", 1350, 1000);
    grid.insert("c", 1500, 1000);
    grid.insert("d", 50, 50);
    const around = (radius: number, center = { x: 1000, y: 1000 }): string[] => [...grid.candidates(center, radius)].sort();
    assert.deepEqual(around(400), ["a", "b"], "bbox 覆盖格 6..14（x < 1500）：c 在格 15");
    assert.deepEqual(around(401), ["a", "b"], "1401 仍是格 14");
    assert.deepEqual(around(500), ["a", "b", "c"]);
    assert.deepEqual(around(60, { x: 0, y: 0 }), ["d"], "边缘钳制不越界");
    assert.equal(around(5000).length, 4, "视距超图 = 全图");
    grid.move("c", 1200, 1000);
    assert.deepEqual(around(400), ["a", "b", "c"], "跨格搬桶后成为候选");
    grid.move("c", 1210, 1000);
    assert.deepEqual(around(400), ["a", "b", "c"], "同格移动不变");
    grid.remove("b");
    assert.deepEqual(around(400), ["a", "c"]);
    grid.remove("b");
    assert.throws(() => grid.insert("a", 1, 1), /已在网格内/u);
    assert.equal(grid.size, 3);
    const out: string[] = ["stale"];
    assert.equal(grid.candidates({ x: 1000, y: 1000 }, 400, out), out, "写进调用方数组（先清空）");
    assert.equal(out.includes("stale"), false);
    grid.clear();
    assert.deepEqual([grid.size, around(5000).length], [0, 0]);
    assert.throws(() => new AoiGrid(0, { w: 1, h: 1 }), RangeError);
});

test("canSee：本人永远可见；位面不同不可见；隐身只对同阵营可见（无阵营观察者看不见）；无阵营实体本身可见", () => {
    assert.equal(canSee(facts("a"), facts("b")), true);
    assert.equal(canSee(facts("a"), facts("b", { plane: 1 })), false, "位面");
    assert.equal(canSee(facts("a", { plane: 1 }), facts("a", { plane: 0 })), true, "本人（同 id）");
    assert.equal(canSee(facts("a"), facts("b", { stealth: true })), true, "同阵营看得见隐身");
    assert.equal(canSee(facts("a", { factionId: "dusk" }), facts("b", { stealth: true })), false, "异阵营看不见隐身");
    assert.equal(canSee(facts("slime", { factionId: null }), facts("b", { stealth: true })), false, "无阵营看不见隐身");
    assert.equal(canSee(facts("a"), facts("slime", { factionId: null })), true, "无阵营实体本身可见");
    assert.equal(canSee(facts("b", { stealth: true }), facts("b", { stealth: true })), true, "隐身者看得见自己");
});

test("pickInterest：精确欧氏视距（⛔ bbox）+ 规则 + 最近优先（距离再 id）截到 cap；本人距离 0 首位", () => {
    const viewer = facts("me", { x: 1000, y: 1000 });
    const pool = [
        viewer,
        facts("corner", { x: 1283, y: 1283 }),
        facts("near", { x: 1010, y: 1000 }),
        facts("far", { x: 1400, y: 1000 }),
        facts("hidden", { x: 1005, y: 1000, stealth: true, factionId: "dusk" }),
        facts("tie-b", { x: 1000, y: 1100 }),
        facts("tie-a", { x: 1100, y: 1000 }),
        facts("phased", { x: 1001, y: 1000, plane: 1 }),
    ];
    assert.deepEqual(pickInterest(viewer, pool, 400, 10).map((pick) => pick.entity.id), ["me", "near", "tie-a", "tie-b", "far"], "corner 在 bbox 内但欧氏 400.2 外；hidden 异阵营隐身；phased 异位面；far 恰 400 含");
    assert.deepEqual(pickInterest(viewer, pool, 400, 3).map((pick) => pick.entity.id), ["me", "near", "tie-a"], "cap 截断保最近");
    assert.deepEqual(pickInterest(viewer, pool, 400, 10).map((pick) => pick.distanceSq).slice(0, 3), [0, 100, 10_000]);
});
