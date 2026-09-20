/**
 * mmo kit ai 面（MK2-B2，纯函数 / 纯内存，⛔ 起房）：decide（有活目标：出拴绳 evade / 射程内 cast / leash 0 只还手 / 否则 chase；无目标：aggro 内候选 acquire /
 * return 回家与到家 / patrol 换点 / 离家回家 / idle）、bucketOf / shouldThink、findPath（直线直达 / 绕灰盒墙 / 终点阻挡 null / 展开上限 null）、AiScheduler（分桶 due /
 * 预算 run 顺延 / 顺延优先 / forget）、compute 任务 pathfind（admission）、isStalePathResult。
 * 变异验证：decide 不看 leash → 「出拴绳 evade」红；AiScheduler.run 不看预算 → 「顺延」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_ARRIVE_RADIUS, bucketOf, decide, findPath, lineClear, shouldThink, type AiPerception } from "@game/shared/kits/mmo/api/ai/index";
import { GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { parseCollisionGrid } from "@game/shared/kits/mmo/api/movement/index";
import pathfind from "../src/core/compute/tasks/kits/mmo/pathfind";
import { AiScheduler } from "../src/kits/mmo/ai/scheduler";
import { createInProcessPathfinder, isStalePathResult } from "../src/kits/mmo/api/ai/index";

const base: AiPerception = { behavior: "aggro", state: "idle", distanceToOrigin: 0, aggroRadius: 150, leashRadius: 400, target: null, candidate: null, spellRange: 60, waypointCount: 0, arrived: true };

test("decide：有活目标——出拴绳 evade / 射程内 cast / leash 0 只还手 / 否则 chase；无目标——aggro 内候选 acquire、return 回家与到家 evade、patrol 换点、离家回家、idle", () => {
    assert.deepEqual(decide({ ...base, target: { distance: 300, alive: true }, distanceToOrigin: 401 }), { state: "return", action: { kind: "evade" } }, "出拴绳");
    assert.deepEqual(decide({ ...base, target: { distance: 50, alive: true }, distanceToOrigin: 100 }), { state: "attack", action: { kind: "cast" } }, "射程内");
    assert.deepEqual(decide({ ...base, target: { distance: 50, alive: true }, spellRange: null }), { state: "chase", action: { kind: "chase" } }, "没可用技能 ⇒ 继续追");
    assert.deepEqual(decide({ ...base, target: { distance: 200, alive: true }, distanceToOrigin: 100 }), { state: "chase", action: { kind: "chase" } });
    assert.deepEqual(decide({ ...base, leashRadius: 0, target: { distance: 200, alive: true } }), { state: "attack", action: { kind: "stay" } }, "leash 0 只在射程内还手");
    assert.deepEqual(decide({ ...base, target: { distance: 10, alive: false }, candidate: { distance: 100 } }), { state: "chase", action: { kind: "acquire" } }, "目标死了 ⇒ 看候选");
    assert.deepEqual(decide({ ...base, candidate: { distance: 151 } }), { state: "idle", action: { kind: "stay" } }, "候选在 aggro 外");
    assert.deepEqual(decide({ ...base, aggroRadius: 0, candidate: { distance: 10 } }), { state: "idle", action: { kind: "stay" } }, "aggro 0 不主动");
    assert.deepEqual(decide({ ...base, state: "return", arrived: false, distanceToOrigin: 50 }), { state: "return", action: { kind: "goHome" } });
    assert.deepEqual(decide({ ...base, state: "return", arrived: true }), { state: "idle", action: { kind: "evade" } }, "到家 ⇒ 清仇恨回满血转 idle");
    assert.deepEqual(decide({ ...base, behavior: "patrol", waypointCount: 3, arrived: true }), { state: "patrol", action: { kind: "nextWaypoint" } });
    assert.deepEqual(decide({ ...base, behavior: "patrol", state: "patrol", waypointCount: 3, arrived: false }), { state: "patrol", action: { kind: "stay" } });
    assert.deepEqual(decide({ ...base, distanceToOrigin: AI_ARRIVE_RADIUS + 1, arrived: false }), { state: "return", action: { kind: "goHome" } }, "离家 ⇒ 回家");
    assert.deepEqual([bucketOf("a", 4) >= 0 && bucketOf("a", 4) < 4, bucketOf("a", 4) === bucketOf("a", 4), shouldThink("x", 3, 1)], [true, true, true]);
    const hits = [0, 1, 2, 3].filter((tick) => shouldThink("slime-camp:0", tick, 4)).length;
    assert.equal(hits, 1, "四个连续 tick 里恰一次轮到");
});

test("findPath：直线直达 ⇒ [to]；绕灰盒墙每段直线无阻挡且不进阻挡格；终点阻挡 ⇒ null；展开上限 ⇒ null；无碰撞网格永远直线", () => {
    const map = GREYBOX_PACK.maps[0]!;
    const grid = parseCollisionGrid(map.collision, map.size)!;
    assert.deepEqual(findPath(grid, { x: 1000, y: 1000 }, { x: 1300, y: 1000 }), [{ x: 1300, y: 1000 }], "直线直达");
    const path = findPath(grid, { x: 1400, y: 1000 }, { x: 1800, y: 1000 })!;
    assert.ok(path && path.length >= 2, `绕墙折线：${JSON.stringify(path)}`);
    assert.deepEqual(path.at(-1), { x: 1800, y: 1000 }, "终点精确");
    let from = { x: 1400, y: 1000 };
    for (const point of path) {
        assert.equal(grid.blocked(point.x, point.y), false, `路点 ${JSON.stringify(point)} 不在墙里`);
        assert.equal(lineClear(grid, from, point), true, `段 ${JSON.stringify(from)} → ${JSON.stringify(point)} 直线无阻挡`);
        from = point;
    }
    assert.equal(findPath(grid, { x: 1400, y: 1000 }, { x: 1600, y: 1000 }), null, "终点在墙里");
    assert.equal(findPath(grid, { x: 1400, y: 1000 }, { x: 1800, y: 1000 }, { maxExpansions: 2 }), null, "展开上限 fail-closed");
    const open = { cellSize: 100, cols: 20, rows: 20, blocked: () => false };
    assert.deepEqual(findPath(open, { x: 10, y: 10 }, { x: 1990, y: 1990 }), [{ x: 1990, y: 1990 }]);
    const task = pathfind({ cellSize: map.collision!.cellSize, cols: grid.cols, rows: grid.rows, bitmap: map.collision!.bitmap, from: { x: 1400, y: 1000 }, to: { x: 1800, y: 1000 } });
    assert.deepEqual(task.path, path, "compute 任务 = 同一 A*");
    assert.throws(() => pathfind({ cellSize: 100, cols: 20, rows: 20, bitmap: "0".repeat(399), from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }), RangeError, "任务级 admission：位图长度");
});

test("AiScheduler：due = 顺延的在前 + 本桶；run 在 wall 预算内思考、超预算顺延（保持序、下一 tick 优先、不饿死）；forget；进程内 pathfinder 与迟到判定", async () => {
    let clock = 0;
    const scheduler = new AiScheduler({ buckets: 1, budgetMs: 2, now: () => clock });
    const ids = ["a", "b", "c", "d", "e"];
    const thought: string[] = [];
    scheduler.run(scheduler.due(ids, 0), (id) => { thought.push(id); clock += 1.5; });
    assert.deepEqual([thought, scheduler.stats.thought, scheduler.stats.deferred], [["a", "b"], 2, 3], "1.5 ms/次：第三次前已 3 ms ≥ 2 ⇒ 顺延 c d e");
    clock = 0;
    thought.length = 0;
    scheduler.run(scheduler.due(ids, 1), (id) => { thought.push(id); clock += 0.1; });
    assert.deepEqual(thought, ["c", "d", "e", "a", "b"], "顺延的先思考，再本桶其余（去重）");
    assert.equal(scheduler.stats.deferred, 0);
    const buckets = new AiScheduler({ buckets: 4, budgetMs: 100, now: () => 0 });
    const perTick = [0, 1, 2, 3].map((tick) => buckets.due(["x", "y", "z", "w", "v", "u"], tick).length);
    assert.equal(perTick.reduce((sum, n) => sum + n, 0), 6, "四个 tick 恰好每只一次");
    scheduler.run(scheduler.due(ids, 2), (id) => { if (id === "a") { clock += 5; } });
    scheduler.forget("b");
    assert.equal(scheduler.due([], 3).includes("b"), false, "forget 从顺延队列移除");
    const map = GREYBOX_PACK.maps[0]!;
    const port = createInProcessPathfinder(parseCollisionGrid(map.collision, map.size)!);
    const result = await port.request({ instanceEpoch: 3, entityId: "boar", entityVersion: 7, from: { x: 1000, y: 1000 }, to: { x: 1200, y: 1000 } });
    assert.deepEqual([result.instanceEpoch, result.entityVersion, result.path], [3, 7, [{ x: 1200, y: 1000 }]]);
    assert.deepEqual([isStalePathResult(result, { instanceEpoch: 3, entityVersion: 7 }), isStalePathResult(result, { instanceEpoch: 4, entityVersion: 7 }), isStalePathResult(result, { instanceEpoch: 3, entityVersion: 8 })], [false, true, true]);
});
