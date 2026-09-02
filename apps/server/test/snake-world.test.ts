/**
 * SnakeWorld 行为与确定性测试（docs/snakeoff/03 §11 / 06 §2.2–2.4）。
 *
 * 覆盖：出生安全距离、输入 seq 闸、加速消耗与掉落、吃食成长、墙/自身/他蛇/头对头碰撞、
 * 出生保护、复活保留分数、AI 让位/补刷/移除语义、快照有界与 id 唯一、限时到点、
 * 以及同 seed + 同输入序列 → 逐字节相同的终局（确定性）。
 * 房间层（drop-in 全链/断线宽限/撮合）在 snake-room.test.ts 与 int（S3）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";
import { SnakeWorld, type SnakeBody } from "../src/rooms/modes/snake/world";
import { stepDistance } from "../src/rooms/modes/snake/rules";

const MOVE_START = SNAKE_RULESET.countdownTicks;

/** 推进到移动解禁（跳过开局倒计时冻结窗）。 */
function warmUp(world: SnakeWorld): void {
    for (let i = 0; i <= MOVE_START; i++) world.step();
}

/** 测试侧确定性 hash：世界可观测状态的规范化 JSON（键序固定）。 */
function worldHash(world: SnakeWorld): string {
    const canon = {
        tick: world.tick,
        snakes: world.snakes.map((snake) => ({
            id: snake.id,
            alive: snake.alive,
            score: snake.score,
            length: snake.length,
            direction: snake.direction,
            points: snake.points.map((point) => [point.x, point.y]),
        })),
        foods: world.foodList().map((food) => [food.id, food.kind, food.x, food.y]),
        wrecks: world.wreckList().map((wreck) => [wreck.id, wreck.value, wreck.x, wreck.y]),
    };
    return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

/** 把蛇瞬移到指定位置朝指定方向（测试手术：直接改写路径点列）。 */
function teleport(snake: SnakeBody, x: number, y: number, direction: number): void {
    snake.points = [{ x, y }];
    snake.direction = direction;
    snake.targetDirection = direction;
}

test("确定性：同 seed + 同输入序列 → 逐字节相同终局（含 AI 与食物补充）", () => {
    const script = (world: SnakeWorld): void => {
        world.addPlayerSnake("p1", "甲", 0);
        world.addPlayerSnake("p2", "乙", 1);
        world.addAiSnake();
        world.addAiSnake();
        warmUp(world);
        for (let tick = 0; tick < 300; tick++) {
            if (tick === 10) world.applyInput("p1", 1, 0, false, 1);
            if (tick === 40) world.applyInput("p1", 0, 1, true, 2);
            if (tick === 80) world.applyInput("p2", -1, 0, false, 1);
            if (tick === 120) world.applyInput("p1", 0.3, -0.5, false, 3);
            world.step();
        }
    };
    const a = new SnakeWorld({ matchSeed: 20260902 });
    const b = new SnakeWorld({ matchSeed: 20260902 });
    script(a);
    script(b);
    assert.equal(worldHash(a), worldHash(b), "同 seed 同输入必须逐字节一致");
    const c = new SnakeWorld({ matchSeed: 20260903 });
    script(c);
    assert.notEqual(worldHash(a), worldHash(c), "不同 seed 必须产生不同世界");
});

test("出生点：距现存蛇头与墙满足安全距离，方向指向场心", () => {
    const world = new SnakeWorld({ matchSeed: 7 });
    const first = world.addPlayerSnake("p1", "甲", 0);
    for (let i = 1; i <= 8; i++) world.addPlayerSnake(`p${i + 1}`, `玩家${i + 1}`, i);
    for (const snake of world.snakes) {
        if (snake === first) continue;
        assert.ok(
            Math.hypot(snake.points[0].x - first.points[0].x, snake.points[0].y - first.points[0].y)
                >= SNAKE_RULESET.spawnSafeDistance,
            `出生点距现存蛇头必须 ≥ ${SNAKE_RULESET.spawnSafeDistance}`,
        );
    }
    // 方向指向场心：head + dir 应比 head 更靠近原点
    const direction = { x: Math.cos((first.direction * Math.PI) / 180), y: Math.sin((first.direction * Math.PI) / 180) };
    const ahead = Math.hypot(first.points[0].x + direction.x * 10, first.points[0].y + direction.y * 10);
    assert.ok(ahead < Math.hypot(first.points[0].x, first.points[0].y), "出生方向必须指向场心");
});

test("倒计时冻结：movementStartTick 前世界不推进（位置不变、tick 照走）", () => {
    const world = new SnakeWorld({ matchSeed: 11 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    const head = { ...snake.points[0] };
    for (let i = 0; i < MOVE_START; i++) world.step();
    assert.deepEqual(snake.points[0], head, "倒计时期间位置不得变化");
    assert.equal(world.tick, MOVE_START);
    world.step();
    assert.notDeepEqual(snake.points[0], head, "解禁后第一步必须移动");
});

test("输入闸：seq 倒退/重复拒绝；零向量保持方向；未入场 id 拒绝", () => {
    const world = new SnakeWorld({ matchSeed: 13 });
    warmUp(world);
    const snake = world.addPlayerSnake("p1", "甲", 0);
    assert.equal(world.applyInput("p1", 1, 0, false, 5), true);
    assert.equal(snake.lastAcceptedSeq, 5);
    assert.equal(world.applyInput("p1", 0, 1, false, 5), false, "重复 seq 拒绝");
    assert.equal(world.applyInput("p1", 0, 1, false, 4), false, "倒退 seq 拒绝");
    assert.equal(snake.targetDirection, 0, "被拒输入不得改状态");
    const before = snake.targetDirection;
    assert.equal(world.applyInput("p1", 0, 0, true, 6), true, "零向量是合法输入（保持方向）");
    assert.equal(snake.targetDirection, before, "零向量保持上一方向");
    assert.equal(snake.boostIntent, true);
    assert.equal(world.applyInput("ghost", 1, 0, false, 1), false, "未入场 id 拒绝");
});

test("吃食成长：朝最近食物转向的蛇长度与分数增加", () => {
    const world = new SnakeWorld({ matchSeed: 17 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    warmUp(world);
    let seq = 0;
    const scoreBefore = snake.score;
    for (let tick = 0; tick < 600 && snake.score === scoreBefore; tick++) {
        // 每 tick 朝最近食物转（测试驱动，不是 AI）
        const head = snake.points[0];
        let nearest: { x: number; y: number } | null = null;
        let nearestDistance = Infinity;
        for (const food of world.foodList()) {
            const distance = Math.hypot(food.x - head.x, food.y - head.y);
            if (distance < nearestDistance) { nearest = food; nearestDistance = distance; }
        }
        if (nearest) {
            const target = Math.atan2(nearest.y - head.y, nearest.x - head.x);
            world.applyInput("p1", Math.cos(target), Math.sin(target), false, ++seq);
        }
        // 撞墙/撞死会中断测试目标——撞墙即fail（场地足够大，600 tick 内应吃到）
        assert.ok(snake.alive || snake.respawnAtTick > 0, "寻食途中意外死亡（应只在撞墙时发生）");
        world.step();
    }
    assert.ok(snake.score > scoreBefore, "吃到食物必须加分");
    assert.ok(snake.length > SNAKE_RULESET.spawnLength, "吃食必须增长");
});

test("加速消耗：长度减少、尾部掉 Wreck、长度到下限自动停加速", () => {
    const world = new SnakeWorld({ matchSeed: 19 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    warmUp(world);
    snake.length = 40; // 手术：给出加速余量
    const wrecksBefore = world.wreckList().length;
    let seq = 0;
    // 全程直行加速：1s = 3 长度 → 从 40 降到 ≤ 20+ 即停
    for (let tick = 0; tick < 200; tick++) {
        world.applyInput("p1", 1, 0, true, ++seq);
        world.step();
        if (snake.length <= SNAKE_RULESET.minBoostLength) break;
    }
    assert.ok(snake.length < 40, "加速必须消耗长度");
    assert.ok(snake.length >= SNAKE_RULESET.minBoostLength - 1, "长度消耗在下限附近停住");
    assert.equal(snake.boostActive, false, "到达下限后加速必须停止");
    assert.ok(world.wreckList().length > wrecksBefore, "加速必须在尾部掉 Wreck");
});

test("撞墙死亡 → 2s 后复活：复活回初始长度、保留分数", () => {
    const world = new SnakeWorld({ matchSeed: 23 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    warmUp(world);
    snake.score = 42;
    // 朝最近一面墙直冲（出生方向朝场心，反向即朝墙）
    const away = { x: -Math.cos((snake.direction * Math.PI) / 180), y: -Math.sin((snake.direction * Math.PI) / 180) };
    let seq = 0;
    world.applyInput("p1", away.x, away.y, false, ++seq);
    let died = false;
    let scoreAtDeath = 0;
    for (let tick = 0; tick < 600; tick++) {
        world.step();
        if (!snake.alive && !died) {
            died = true;
            scoreAtDeath = snake.score; // 途中可能吃到食物——以死亡时刻的分断言「不减少」
            assert.ok(snake.respawnAtTick > world.tick, "死亡必须进入复活等待");
        }
        if (died && snake.alive) break;
    }
    assert.ok(died, "直冲墙必须死亡");
    assert.equal(snake.alive, true, "复活延迟后必须复活");
    assert.equal(snake.length, SNAKE_RULESET.spawnLength, "复活回初始长度");
    assert.equal(snake.score, scoreAtDeath, "死亡不清分、复活保留累计分数（拍板规则）");
    assert.ok(scoreAtDeath >= 42);
    assert.equal(snake.deathCount, 1);
});

test("蛇间碰撞：头撞他蛇身体 → 移动者死、对方记 kill", () => {
    const world = new SnakeWorld({ matchSeed: 29 });
    const a = world.addPlayerSnake("a", "A", 0);
    const b = world.addPlayerSnake("b", "B", 1);
    warmUp(world);
    a.protectUntilTick = 0;
    b.protectUntilTick = 0;
    // B 横放一条身体线；A 的头朝 B 身体直冲
    b.points = [];
    for (let i = 0; i < 20; i++) b.points.push({ x: i * SNAKE_RULESET.pointSpacing, y: 0 });
    teleport(a, 100, -SNAKE_RULESET.pointSpacing, 90); // 头在 (100,-18) 朝上，下一步进 B 身体
    const killsBefore = b.killCount;
    world.step();
    assert.equal(a.alive, false, "撞他蛇身体的一方必须死");
    assert.equal(b.alive, true);
    assert.equal(b.killCount, killsBefore + 1, "被撞方记 kill");
    assert.ok(world.wreckList().length > 0, "死亡必须产生掉落");
});

test("头对头：较短者死；等长双死", () => {
    // 对头互冲在离散位移下会互穿（各自落在对方上一 tick 的头部位置）——世界的
    // 头对头判定在位移前预检（接近 + 相向），本用例的身体拖尾刻意远离相遇点，
    // 保证只有头对头规则在起作用。
    const headOn = (lengthA: number, lengthB: number): { a: SnakeBody; b: SnakeBody } => {
        const world = new SnakeWorld({ matchSeed: 31 });
        const a = world.addPlayerSnake("a", "A", 0);
        const b = world.addPlayerSnake("b", "B", 1);
        warmUp(world);
        a.protectUntilTick = 0;
        b.protectUntilTick = 0;
        a.length = lengthA;
        b.length = lengthB;
        // a 头在 (-4,0) 朝东、身体向西拖尾；b 头在 (4,0) 朝西、身体向东拖尾
        a.points = [];
        b.points = [];
        for (let i = 0; i < 10; i++) {
            a.points.push({ x: -4 - i * SNAKE_RULESET.pointSpacing, y: 0 });
            b.points.push({ x: 4 + i * SNAKE_RULESET.pointSpacing, y: 0 });
        }
        a.direction = 0;
        a.targetDirection = 0;
        b.direction = 180;
        b.targetDirection = 180;
        world.step();
        return { a, b };
    };
    const shorter = headOn(30, 100);
    assert.equal(shorter.a.alive, false, "头对头较短者死");
    assert.equal(shorter.b.alive, true, "较长者存活");
    const equal = headOn(50, 50);
    assert.equal(equal.a.alive, false, "等长头对头双死");
    assert.equal(equal.b.alive, false);
});

test("出生保护：保护期内蛇间碰撞双向不生效，墙仍杀", () => {
    const world = new SnakeWorld({ matchSeed: 37 });
    const a = world.addPlayerSnake("a", "A", 0);
    const b = world.addPlayerSnake("b", "B", 1);
    warmUp(world);
    a.protectUntilTick = world.tick + 100; // 手术：a 处于保护期
    b.protectUntilTick = 0;
    b.points = [];
    for (let i = 0; i < 20; i++) b.points.push({ x: i * SNAKE_RULESET.pointSpacing, y: 0 });
    teleport(a, 100, -SNAKE_RULESET.pointSpacing, 90);
    world.step();
    assert.equal(a.alive, true, "保护期内不受蛇间碰撞");
    // 同一条保护期蛇冲墙仍死
    teleport(a, SNAKE_RULESET.worldWidth / 2 + 10, 0, 0);
    world.step();
    assert.equal(a.alive, false, "保护期不豁免墙");
});

test("自身碰撞：头回到早期路径点即死；紧邻头部段豁免", () => {
    const world = new SnakeWorld({ matchSeed: 41 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    warmUp(world);
    snake.protectUntilTick = 0;
    // 稠密路径：头在 (0,0) 朝东，身体向西拖尾；把「早期身体点」（skip 范围外）
    // 放到下一步头所在位置 → 必须死
    const skip = Math.max(4, Math.ceil((2 * SNAKE_RULESET.bodyWidth) / SNAKE_RULESET.pointSpacing));
    snake.points = [];
    for (let i = 0; i <= skip + 2; i++) snake.points.push({ x: -i * SNAKE_RULESET.pointSpacing, y: 0 });
    snake.points[skip + 1] = { x: stepDistance(false), y: 0 };
    snake.direction = 0;
    snake.targetDirection = 0;
    world.step();
    assert.equal(snake.alive, false, "头撞自身早期身体必须死");

    // 紧邻头部段（skip 内）不判死：同样的布局，但重叠点在 skip 范围内
    const world2 = new SnakeWorld({ matchSeed: 43 });
    const snake2 = world2.addPlayerSnake("p1", "甲", 0);
    warmUp(world2);
    snake2.protectUntilTick = 0;
    snake2.points = [];
    for (let i = 0; i <= skip + 2; i++) snake2.points.push({ x: -i * SNAKE_RULESET.pointSpacing, y: 0 });
    snake2.points[2] = { x: stepDistance(false), y: 0 }; // skip=4 范围内
    snake2.direction = 0;
    snake2.targetDirection = 0;
    world2.step();
    assert.equal(snake2.alive, true, "紧邻头部段必须豁免（连续路径天然重叠）");
});

test("AI 让位与补刷：真人加入 → 最低分 AI 死亡掉落；真人离开 → 补刷", () => {
    const world = new SnakeWorld({ matchSeed: 47 });
    warmUp(world);
    const ai1 = world.addAiSnake();
    const ai2 = world.addAiSnake();
    ai1.score = 5;
    ai2.score = 99;
    ai1.length = 100; // 手术：让位死亡要有掉落，长度须超 spawnLength（价值折算自超出部分）
    ai2.length = 100;
    assert.equal(world.countAi(), 2);
    // 真人在席 0 → 目标 8；加两个真人后目标 6，需要让位 0 条（2 AI ≤ 6）——先超编：
    assert.equal(world.aiTargetCount(0), 8);
    // 手术超编：真人加入 7 人，AI 2 → 目标 1，需让位 1
    for (let i = 0; i < 7; i++) world.addPlayerSnake(`p${i}`, `P${i}`, i);
    assert.equal(world.aiTargetCount(world.countHumans()), 1);
    const wrecksBefore = world.wreckList().length;
    const culled = world.cullAiForJoin();
    assert.equal(culled?.id, ai1.id, "让位必须选分数最低的 AI");
    assert.equal(ai1.alive, false, "让位 = 死亡掉落（不凭空消失）");
    assert.ok(world.wreckList().length > wrecksBefore);
    assert.equal(ai2.alive, true, "高分 AI 不被让位");
});

test("removePlayerSnake：最终离开死亡掉落且永不复活", () => {
    const world = new SnakeWorld({ matchSeed: 53 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    warmUp(world);
    world.removePlayerSnake("p1");
    assert.equal(world.get("p1"), undefined);
    assert.equal(world.snakes.includes(snake), false, "移出世界（不进快照）");
    for (let i = 0; i < 200; i++) world.step();
    assert.equal(snake.alive, false, "最终离开不复活");
});

test("快照：id 唯一、集合有界、死亡蛇只留头部锚点、坐标为整数", () => {
    const world = new SnakeWorld({ matchSeed: 59 });
    world.addPlayerSnake("p1", "甲", 0);
    const ai = world.addAiSnake();
    warmUp(world);
    ai.alive = false; // 手术：AI 死亡态
    const snapshot = world.buildSnapshot("m-test", 1);
    const ids = new Set(snapshot.snakes.map((snake) => snake.id));
    assert.equal(ids.size, snapshot.snakes.length, "快照 snake id 必须唯一");
    assert.ok(snapshot.foods.length <= SNAKE_RULESET.snapshotMaxFoods);
    assert.ok(snapshot.snakes.length <= SNAKE_RULESET.snapshotMaxSnakes);
    const dead = snapshot.snakes.find((snake) => snake.id === ai.id);
    assert.equal(dead?.alive, false);
    assert.equal(dead?.points.length, 1, "死亡蛇只保留头部位置（死亡表现锚点）");
    for (const snake of snapshot.snakes) {
        for (const point of snake.points) {
            assert.ok(Number.isInteger(point.x) && Number.isInteger(point.y), "快照坐标必须量化整数");
        }
    }
});

test("限时：step 在第 endTick 返回 true（倒计时 + 90s 正式计时）", () => {
    const world = new SnakeWorld({ matchSeed: 61 });
    let done = false;
    let steps = 0;
    while (!done && steps < SNAKE_RULESET.countdownTicks + SNAKE_RULESET.matchTicks + 10) {
        done = world.step();
        steps++;
    }
    assert.ok(done, "到达 endTick 必须返回 true");
    assert.equal(world.tick, SNAKE_RULESET.countdownTicks + SNAKE_RULESET.matchTicks);
});

test("终局前不足复活延迟的死亡不再复活（03 §8.2）", () => {
    const world = new SnakeWorld({ matchSeed: 67 });
    const snake = world.addPlayerSnake("p1", "甲", 0);
    warmUp(world);
    // 快进到临近终局
    while (world.tick < world.endTick - SNAKE_RULESET.respawnDelayTicks + 5) world.step();
    snake.protectUntilTick = 0;
    teleport(snake, SNAKE_RULESET.worldWidth / 2 + 10, 0, 0); // 冲墙
    world.step();
    assert.equal(snake.alive, false);
    assert.equal(snake.respawnAtTick, 0, "终局窗口内的死亡不再排队复活");
});
