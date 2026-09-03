/** Snake Endless V2 权威世界：运动、工具、roster、残骸与容量。 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { SeededRandom } from "@game/shared";
import {
    directionVector,
    SNAKE_AI_LINEUP,
    SNAKE_MAGNET_ELIGIBLE_RUN_STATES,
    SNAKE_RULESET,
} from "@game/shared/gameplays/snake/ruleset";
import { aiDeathWreckValues, eatDistance } from "../src/rooms/modes/snake/rules";
import { SnakeWorld, type SnakeBody } from "../src/rooms/modes/snake/world";

function advance(world: SnakeWorld, targetTick: number, gate: readonly { state: string; length: number }[] = []): void {
    while (world.tick < targetTick) world.step(gate);
}

function teleport(snake: SnakeBody, x: number, y: number, direction = 0): void {
    snake.points = [{ x, y }];
    snake.direction = direction;
    snake.targetDirection = direction;
}

function digest(world: SnakeWorld): string {
    return createHash("sha256").update(JSON.stringify({
        tick: world.tick,
        snakes: world.snakes.map((snake) => [snake.id, snake.alive, snake.skinId, snake.aiLevel,
            snake.score, snake.length, snake.magnetUntilTick, snake.points]),
        foods: world.foodList().map((food) => [food.id, food.kind, food.variant, food.x, food.y]),
        wrecks: world.wreckList(),
        tools: world.toolList().map((tool) => [tool.id, tool.x, tool.y, tool.expireTick]),
        triggers: world.magnetTriggers,
    })).digest("hex");
}

test("同 seed/输入的 Star、磁铁、AI 与世界字节级可重放", () => {
    const run = (): SnakeWorld => {
        const world = new SnakeWorld({ matchSeed: 20260903, aiSkinPool: [1, 2, 3, 4] });
        world.addPlayerSnake("p1", "甲", 1);
        world.addInitialAiLineup();
        for (let tick = 0; tick < 420; tick += 1) {
            if (tick === 80) world.applyInput("p1", 1, 0, false, 1);
            if (tick === 140) world.applyInput("p1", 0, 1, true, 2);
            world.step([{ state: "active", length: 80 }]);
        }
        return world;
    };
    const first = run();
    const second = run();
    assert.equal(digest(first), digest(second));
    const other = new SnakeWorld({ matchSeed: 20260904 });
    advance(other, 420, [{ state: "active", length: 80 }]);
    assert.notEqual(digest(first), digest(other));
});

test("稳态严格 1000 Dot + 30 Star，variant 与独立运动流合法", () => {
    const world = new SnakeWorld({ matchSeed: 11 });
    assert.equal(world.foodList().filter((food) => food.kind === 0).length, 1000);
    assert.equal(world.foodList().filter((food) => food.kind === 1).length, 30);
    assert.equal(world.foodList().length, 1030);
    assert.ok(world.foodList().every((food) => food.variant >= 1 && food.variant <= 7));
    const star = world.foodList().find((food) => food.kind === 1);
    assert.ok(star);
    const initial = world.motionProbe("star", star.id);
    assert.ok(initial && initial.remainingDirectionTicks >= 34 && initial.remainingDirectionTicks <= 67);
    const remainders: number[] = [];
    for (let index = 0; index < 3; index += 1) {
        world.step();
        remainders.push(world.motionProbe("star", star.id)?.distanceMilliRemainder ?? -1);
    }
    assert.deepEqual(remainders, [1, 2, 0]);
});

test("Star 独立子流严格按 heading→hold 抽取，34/67 都驱动完整 movement 次数", () => {
    for (const [seed, expectedHold] of [[89, 34], [130, 67]] as const) {
        const ruleset = { ...SNAKE_RULESET, dotTarget: 0, starTarget: 1, fakeSnakeCount: 0 };
        const world = new SnakeWorld({ matchSeed: seed, ruleset });
        const star = world.foodList()[0];
        const replay = SeededRandom.stream(seed, `snake.motion.star:${star.id}`);
        const heading = replay.nextInt(0, 360);
        const hold = replay.nextInt(34, 68);
        const vector = directionVector(heading);
        assert.equal(hold, expectedHold);
        assert.deepEqual(world.motionProbe("star", star.id), {
            xMicro: Math.round(star.x * 1_000_000),
            yMicro: Math.round(star.y * 1_000_000),
            directionMilliX: Math.round(vector.x * 1000),
            directionMilliY: Math.round(vector.y * 1000),
            remainingDirectionTicks: hold,
            distanceMilliRemainder: 0,
        });
        for (let moved = 1; moved <= hold; moved += 1) {
            world.step();
            assert.equal(world.motionProbe("star", star.id)?.remainingDirectionTicks, hold - moved);
        }
        const nextHeading = replay.nextInt(0, 360);
        const nextHold = replay.nextInt(34, 68);
        world.step();
        const next = world.motionProbe("star", star.id);
        const nextVector = directionVector(nextHeading);
        assert.equal(next?.directionMilliX, Math.round(nextVector.x * 1000));
        assert.equal(next?.directionMilliY, Math.round(nextVector.y * 1000));
        assert.equal(next?.remainingDirectionTicks, nextHold - 1);
    }
});

test("计划变向与角落反射同 tick：方向/hold 后再仅抽一次反射 hold", () => {
    type MutableMotion = {
        xMicro: number; yMicro: number; directionMilliX: number; directionMilliY: number;
        remainingDirectionTicks: number; distanceMilliRemainder: number;
    };
    type InternalWorld = { foods: Map<number, { x: number; y: number; motion: MutableMotion }> };
    const ruleset = {
        ...SNAKE_RULESET,
        worldWidth: 100,
        worldHeight: 100,
        dotTarget: 0,
        starTarget: 1,
        fakeSnakeCount: 0,
    };
    const world = new SnakeWorld({ matchSeed: 9, ruleset });
    const star = world.foodList()[0];
    const internal = (world as unknown as InternalWorld).foods.get(star.id);
    assert.ok(internal?.motion);
    const replay = SeededRandom.stream(9, `snake.motion.star:${star.id}`);
    replay.nextInt(0, 360);
    replay.nextInt(34, 68);
    const plannedHeading = replay.nextInt(0, 360);
    replay.nextInt(34, 68); // 计划变向 hold 会被同 tick 反射覆盖，但 draw 必须消费。
    const reflectedHold = replay.nextInt(34, 68);
    const planned = directionVector(plannedHeading);
    const limit = (ruleset.worldWidth / 2 - ruleset.starRadius) * 1_000_000;
    internal.motion.xMicro = Math.sign(planned.x) * (limit - 1);
    internal.motion.yMicro = Math.sign(planned.y) * (limit - 1);
    internal.motion.remainingDirectionTicks = 0;
    internal.motion.distanceMilliRemainder = 0;
    world.step();
    const probe = world.motionProbe("star", star.id);
    assert.ok(probe);
    assert.ok(Math.abs(probe.xMicro) <= limit && Math.abs(probe.yMicro) <= limit);
    assert.equal(probe.directionMilliX, -Math.round(planned.x * 1000));
    assert.equal(probe.directionMilliY, -Math.round(planned.y * 1000));
    assert.equal(probe.remainingDirectionTicks, reflectedHold, "角落双轴反射只能再消费一个 hold，且当 tick 不递减");
    assert.equal(probe.distanceMilliRemainder, 1, "反射不得清空标量位移余数");
});

test("Star 小地图长驻反弹保持实体半径在四边内，反弹只重抽一次 hold", () => {
    const ruleset = { ...SNAKE_RULESET, worldWidth: 100, worldHeight: 100, dotTarget: 0, starTarget: 1 };
    const world = new SnakeWorld({ matchSeed: 9, ruleset });
    const star = world.foodList()[0];
    let reflected = false;
    let previous = world.motionProbe("star", star.id);
    for (let tick = 0; tick < 500; tick += 1) {
        world.step();
        const probe = world.motionProbe("star", star.id);
        assert.ok(probe);
        assert.ok(Math.abs(probe.xMicro) <= (50 - SNAKE_RULESET.starRadius) * 1_000_000);
        assert.ok(Math.abs(probe.yMicro) <= (50 - SNAKE_RULESET.starRadius) * 1_000_000);
        if (previous && (Math.sign(previous.directionMilliX) !== Math.sign(probe.directionMilliX)
            || Math.sign(previous.directionMilliY) !== Math.sign(probe.directionMilliY))) {
            reflected = true;
            assert.ok(probe.remainingDirectionTicks >= 34 && probe.remainingDirectionTicks <= 67);
            break;
        }
        previous = probe;
    }
    assert.equal(reflected, true, "长驻轨迹必须到达并反射边界");
});

test("磁铁 300/1200/3000 必发、400 tick 半开过期，6000 gate 跳过不耗 ID", () => {
    const world = new SnakeWorld({ matchSeed: 31 });
    advance(world, 299);
    assert.equal(world.toolList().length, 0);
    world.step();
    assert.equal(world.toolList().length, 10);
    assert.ok(world.toolList().every((tool) => tool.spawnTick === 300 && tool.expireTick === 700));
    assert.equal(world.motionProbe("magnet", 1)?.distanceMilliRemainder, 1,
        "新磁铁在 trigger tick 已完成第一次移动");
    advance(world, 699);
    assert.equal(world.toolList().length, 10);
    world.step();
    assert.equal(world.toolList().length, 0, "[spawn, expire) 在 700 排除");
    advance(world, 1200);
    assert.deepEqual(world.toolList().map((tool) => tool.id), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    advance(world, 3000);
    assert.deepEqual(world.toolList().map((tool) => tool.id), [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    advance(world, 6000);
    assert.equal(world.toolList().length, 0);
    assert.equal(world.nextToolEntityId, 31, "无资格 gate 跳过不得分配实体 ID");
    assert.deepEqual(world.magnetTriggers.map((entry) => [entry.relativeTick, entry.ordinal, entry.spawned]), [
        [300, 1, true], [1200, 2, true], [3000, 3, true], [6000, 4, false],
    ]);
});

test("6000 gate 精确区分真人资格状态与 49999/50000", () => {
    const eligible = new SnakeWorld({ matchSeed: 41 });
    advance(eligible, 5999);
    eligible.step([{ state: "reliveReady", length: 49999 }]);
    assert.equal(eligible.toolList().length, 10);
    assert.equal(eligible.nextToolEntityId, 41);

    const boundary = new SnakeWorld({ matchSeed: 41 });
    advance(boundary, 5999);
    boundary.step([{ state: "active", length: 50000 }, { state: "finalized", length: 1 }]);
    assert.equal(boundary.toolList().length, 0);
    assert.equal(boundary.nextToolEntityId, 31);
    assert.equal(boundary.magnetTriggers.at(-1)?.ordinal, 4, "跳过仍消费触发序号");
});

test("循环 gate 覆盖七种资格与四种排除状态，AI/跳过均不补发", () => {
    for (const state of SNAKE_MAGNET_ELIGIBLE_RUN_STATES) {
        const world = new SnakeWorld({ matchSeed: 43, ruleset: {
            ...SNAKE_RULESET, dotTarget: 0, starTarget: 0, fakeSnakeCount: 0,
        } });
        world.tick = 5999;
        world.step([{ state, length: 49999 }]);
        assert.equal(world.toolList().length, 10, `${state} 应通过循环 gate`);
    }
    for (const state of ["preparing", "cancelled", "finalizing", "finalized"]) {
        const world = new SnakeWorld({ matchSeed: 43, ruleset: {
            ...SNAKE_RULESET, dotTarget: 0, starTarget: 0, fakeSnakeCount: 0,
        } });
        world.tick = 5999;
        world.step([{ state, length: 1 }]);
        assert.equal(world.toolList().length, 0, `${state} 必须被循环 gate 排除`);
        assert.equal(world.nextToolEntityId, 1);
    }
});

test("trigger 使用调用前快照；新磁铁当 tick 可拾取，buff 同 tick 扩大食物圈且重拾只刷新", () => {
    const ruleset = {
        ...SNAKE_RULESET,
        baseSpeed: 0,
        dotTarget: 1,
        starTarget: 0,
        fakeSnakeCount: 0,
        foodReplenishPerTick: 0,
    };
    let pickups = 0;
    const world = new SnakeWorld({
        matchSeed: 47,
        ruleset,
        events: { onMagnetPickup: () => { pickups += 1; } },
    });
    const snake = world.addPlayerSnake("human", "真人", 1);
    teleport(snake, 0, 0);
    snake.protectUntilTick = 1_000;
    snake.length = 50000; // 本 step 内的当前值不得反向覆盖调用方给出的上一 tick 快照 49999。
    const baseFoodDistance = eatDistance(ruleset.dotRadius, snake.length, false);
    const food = world.foodList()[0];
    food.x = baseFoodDistance + 10;
    food.y = 0;
    const internal = world as unknown as {
        placeEntity(radius: number, rng: SeededRandom, salt: number): { x: number; y: number };
    };
    internal.placeEntity = (_radius, _rng, salt) => ({ x: salt === 1 ? 0 : salt === 2 ? 200 : 1000, y: 0 });
    world.tick = 299;
    world.step([{ state: "active", length: 49999 }]);
    assert.equal(world.magnetTriggers.at(-1)?.spawned, true);
    assert.equal(pickups, 1, "trigger tick 新实体必须先移动再可被拾取");
    assert.equal(world.toolList().length, 9);
    assert.equal(world.foodList().some((entry) => entry.id === food.id), false,
        "同 tick 获得的磁铁 buff 应在食物拾取阶段扩大范围 86.4");
    assert.equal(snake.magnetUntilTick, 300 + ruleset.magnetEffectTicks);
    const second = world.toolList().find((tool) => tool.id === 2);
    assert.ok(second, "已生效 buff 不能扩大磁铁自身拾取圈");
    teleport(snake, second.x, second.y);
    world.step([{ state: "active", length: snake.length }]);
    assert.equal(pickups, 2);
    assert.equal(snake.magnetUntilTick, 301 + ruleset.magnetEffectTicks,
        "重拾只刷新为 pickupTick+160，不能在旧值上叠加 160");

    const skipped = new SnakeWorld({ matchSeed: 47, ruleset });
    skipped.tick = 5999;
    skipped.step([{ state: "active", length: 50000 }]);
    assert.equal(skipped.toolList().length, 0, "上一 tick gate 快照为 50000 时，即便本 tick 后续缩短也必须跳过");
});

test("同 tick 磁铁唯一胜者按稳定 entityId；buff 为 160 tick 且不扩大磁铁拾取圈", () => {
    const ruleset = { ...SNAKE_RULESET, baseSpeed: 0, dotTarget: 0, starTarget: 0 };
    let humanPickups = 0;
    const world = new SnakeWorld({
        matchSeed: 51,
        ruleset,
        events: { onMagnetPickup: (snake) => { if (!snake.isAi) humanPickups += 1; } },
    });
    advance(world, 300);
    const tool = world.toolList()[0];
    const first = world.addPlayerSnake("first", "甲", 1);
    const second = world.addPlayerSnake("second", "乙", 2);
    teleport(first, tool.x, tool.y);
    teleport(second, tool.x, tool.y);
    world.step();
    assert.equal(world.toolList().some((entry) => entry.id === tool.id), false);
    assert.equal(first.magnetUntilTick, 301 + SNAKE_RULESET.magnetEffectTicks);
    assert.equal(second.magnetUntilTick, 0);
    assert.equal(humanPickups, 1);
    world.removePlayerSnake("second");
    teleport(first, 0, 0);
    advance(world, first.magnetUntilTick - 1);
    assert.ok(world.buildSnapshot("epoch", 1).snakes[0].magnetUntilTick !== null);
    world.step();
    assert.equal(world.buildSnapshot("epoch", 2).snakes[0].magnetUntilTick, null);
});

test("首人 + 16 AI 阵容；2～8 真人只替换 401，活动蛇始终 17", () => {
    const world = new SnakeWorld({ matchSeed: 61, aiSkinPool: [1, 2, 3, 4, 5] });
    world.addPlayerSnake("p1", "玩家1", 1);
    world.addInitialAiLineup();
    const counts = (): Map<number | null, number> => {
        const result = new Map<number | null, number>();
        for (const snake of world.snakes.filter((entry) => entry.isAi)) {
            result.set(snake.aiLevel, (result.get(snake.aiLevel) ?? 0) + 1);
        }
        return result;
    };
    assert.deepEqual([...counts()], SNAKE_AI_LINEUP.map((entry) => [entry.level, entry.count]));
    assert.equal(world.countActiveSnakes(), 17);
    for (let human = 2; human <= 8; human += 1) {
        const wrecksBefore = world.wreckList().length;
        assert.equal(world.cullAiForJoin()?.aiLevel, 401);
        assert.equal(world.wreckList().length, wrecksBefore, "AI 让位不是玩法死亡，不得注入残骸");
        world.addPlayerSnake(`p${human}`, `玩家${human}`, human);
        assert.equal(world.snakes.length, 17);
        assert.equal(world.countHumans(), human);
        assert.equal(world.countAi(), 17 - human);
    }
    assert.equal(counts().get(401), 1);
    assert.equal(counts().get(402), 4);
    assert.equal(counts().get(403), 2);
    assert.equal(counts().get(404), 2);
});

test("真人无自动重生/无计分残骸；AI 独立 40 tick 重生并守恒掉落", () => {
    const world = new SnakeWorld({ matchSeed: 71 });
    const human = world.addPlayerSnake("human", "真人", 1);
    const ai = world.addAiSnake(401);
    advance(world, SNAKE_RULESET.countdownTicks + 1);
    ai.score = 100;
    const before = world.wreckList().length;
    assert.equal(world.forceKill(human.id), true);
    assert.equal(world.pendingAiRespawnCount, 0);
    assert.equal(world.wreckList().length, before);
    assert.equal(world.forceKill(ai.id), true);
    assert.equal(world.pendingAiRespawnCount, 1);
    assert.ok(world.wreckList().length > before);
    const respawnTick = ai.respawnAtTick;
    advance(world, respawnTick - 1);
    assert.equal(ai.alive, false);
    world.step();
    assert.equal(ai.alive, true);
    assert.equal(ai.magnetUntilTick, 0);
    advance(world, respawnTick + 100);
    assert.equal(human.alive, false, "真人永不进入 AI 自动重生集合");
});

test("AI 残骸达到房间 cap 时只合并实体，逐点 min=3 后的总分严格守恒", () => {
    const ruleset = {
        ...SNAKE_RULESET,
        dotTarget: 0,
        starTarget: 0,
        fakeSnakeCount: 0,
        wreckRoomCap: 2,
    };
    const world = new SnakeWorld({ matchSeed: 73, ruleset });
    const ai = world.addAiSnake(401);
    ai.score = 80;
    ai.points = Array.from({ length: 10 }, (_unused, index) => ({ x: index, y: 0 }));
    const expected = aiDeathWreckValues(ai.score, ai.points.length)
        .reduce((sum, value) => sum + value, 0);
    world.forceKill(ai.id);
    assert.equal(world.wreckList().length, 2);
    assert.equal(
        Math.round(world.wreckList().reduce((sum, wreck) => sum + wreck.value, 0) * 1000),
        Math.round(expected * 1000),
    );
});

test("无尽世界跨越 1799/1800/1801 且从不返回房级完成", () => {
    const world = new SnakeWorld({ matchSeed: 81 });
    let completed = false;
    for (let tick = 0; tick < 1901; tick += 1) completed ||= world.step();
    assert.equal(world.tick, 1901);
    assert.equal(world.endTick, null);
    assert.equal(completed, false);
});

test("最大路径 fixture 可承载 17×5186=88162 点且工具不计入 food cap", () => {
    const world = new SnakeWorld({ matchSeed: 91 });
    for (let index = 0; index < 17; index += 1) {
        const snake = world.addPlayerSnake(`p${index}`, `P${index}`, 1);
        world.forceKill(snake.id);
        assert.ok(world.reviveHumanAt(snake.id, { x: 0, y: 0, direction: 0 },
            { length: 100000, score: 0, killCount: 0 }, 1));
    }
    const snapshot = world.buildSnapshot("epoch-cap", 1);
    assert.equal(snapshot.snakes.length, 17);
    assert.equal(snapshot.snakes.reduce((sum, snake) => sum + snake.points.length, 0), 88162);
    assert.equal(snapshot.foods.length, 1030);
    assert.equal(snapshot.tools.length, 0);
    assert.ok(snapshot.displayRank.every((entry) => !entry.id.startsWith("rank-fake-") ||
        !snapshot.snakes.some((snake) => snake.id === entry.id)), "假榜永不进入实体数组");
});
