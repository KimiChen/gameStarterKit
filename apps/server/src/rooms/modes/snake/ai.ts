/**
 * Snake AI（用户拍板 2026-09-02：首版加 AI 填充；apps/plugins/snake/README.md §2 参考源
 * `AiUtil.changeAiDirection` 优先级链，全部确定性化）。
 *
 * 决策优先级（每 tick 短路）：
 *   1. 躲墙——朝墙且前伸感测点越界时，转向场心方向；
 *   2. 躲蛇——前方/左右 45° 探针发现他蛇头部过近，转向更空的一侧；
 *   3. 追食——视野（aiFoodSenseFactor × 体宽）内最近食物/残骸，追残骸且够远时加速；
 *   4. 游走——aiWanderChancePerTick 概率随机偏转目标方向（±aiWanderMaxTurnDeg）；
 *   5. 随机加速——aiBoostChancePerTick 概率开启 aiBoostTicks 时长的加速（长度足够时）。
 *
 * 一切随机取自注入的 `snake.ai` 命名子流（⛔ 不用 Math.random/Date.now()）；AI 意图经
 * `world.applyAiIntent` 走与真人完全相同的意图通道（规则对等，03 §4）。
 */
import type { SeededRandom } from "@game/shared";
import { directionVector, normalizeDegrees, wallBounds } from "./rules";
import type { SnakeBody, SnakeWorld } from "./world";

/** AI 感知探针：从头部沿指定方向探出 senseDistance，返回最近的他蛇头部距离。 */
function probeClear(
    world: SnakeWorld,
    snake: SnakeBody,
    directionDeg: number,
    senseDistance: number,
): number {
    const direction = directionVector(directionDeg);
    const probe = {
        x: snake.points[0].x + direction.x * senseDistance,
        y: snake.points[0].y + direction.y * senseDistance,
    };
    let nearest = Infinity;
    for (const other of world.snakes) {
        if (!other.alive || other.id === snake.id) continue;
        // 轻量近似：只比他蛇头部；身体避让由躲墙/游走吸收长尾（首版不做路径级规避）
        const distance = Math.hypot(other.points[0].x - probe.x, other.points[0].y - probe.y);
        if (distance < nearest) nearest = distance;
    }
    return nearest;
}

/** 驱动一条 AI 蛇的本 tick 决策并写入世界（AI 加速计时也在此推进）。 */
export function driveAi(world: SnakeWorld, snake: SnakeBody, rng: SeededRandom): void {
    const ruleset = world.ruleset;
    const head = snake.points[0];
    const bodyWidth = ruleset.bodyWidth;

    // AI 加速计时推进（上一段随机加速的剩余 tick）
    if (snake.aiBoostTicksLeft > 0) snake.aiBoostTicksLeft -= 1;
    let boost = snake.aiBoostTicksLeft > 0;
    let target: number | null = null;

    // 1. 躲墙：当前方向前伸感测点越界（含余量）→ 朝场心转
    const bounds = wallBounds();
    const ahead = directionVector(snake.direction);
    const sense = ruleset.aiWallSenseFactor * bodyWidth;
    const projected = { x: head.x + ahead.x * sense, y: head.y + ahead.y * sense };
    if (Math.abs(projected.x) > bounds.halfWidth - bodyWidth / 2
        || Math.abs(projected.y) > bounds.halfHeight - bodyWidth / 2) {
        target = normalizeDegrees((Math.atan2(-head.y, -head.x) * 180) / Math.PI);
    }

    // 2. 躲蛇：正前方过近时，左右 45° 探针哪边空往哪边转
    if (target === null) {
        const snakeSense = ruleset.aiSnakeSenseFactor * bodyWidth;
        const aheadClear = probeClear(world, snake, snake.direction, snakeSense);
        if (aheadClear < bodyWidth * 1.5) {
            const left = probeClear(world, snake, normalizeDegrees(snake.direction + 45), snakeSense);
            const right = probeClear(world, snake, normalizeDegrees(snake.direction - 45), snakeSense);
            target = normalizeDegrees(snake.direction + (left >= right ? 60 : -60));
        }
    }

    // 3. 追食：视野内最近食物/残骸；残骸优先（同距离时），追残骸且距离够远时加速
    if (target === null) {
        const vision = ruleset.aiFoodSenseFactor * bodyWidth;
        let nearest: { x: number; y: number; isWreck: boolean; distance: number } | null = null;
        const consider = (x: number, y: number, isWreck: boolean): void => {
            const distance = Math.hypot(x - head.x, y - head.y);
            if (distance > vision) return;
            if (!nearest || distance < nearest.distance || (distance === nearest.distance && isWreck && !nearest.isWreck)) {
                nearest = { x, y, isWreck, distance };
            }
        };
        for (const food of world.foodList()) consider(food.x, food.y, false);
        for (const wreck of world.wreckList()) consider(wreck.x, wreck.y, true);
        if (nearest !== null) {
            const chosen: { x: number; y: number; isWreck: boolean; distance: number } = nearest;
            target = normalizeDegrees((Math.atan2(chosen.y - head.y, chosen.x - head.x) * 180) / Math.PI);
            if (chosen.isWreck && chosen.distance > 4 * bodyWidth
                && snake.length > ruleset.minBoostLength * 2) {
                boost = true; // 追残骸窗口内加速（源 follow_wreck + speedUp 语义）
            }
        }
    }

    // 4. 游走随机偏转
    if (target === null && rng.next() < ruleset.aiWanderTurnChancePerTick) {
        target = normalizeDegrees(snake.targetDirection
            + (rng.next() * 2 - 1) * ruleset.aiWanderMaxTurnDeg);
    }

    // 5. 随机加速触发（开启一段计时；与追食加速不叠加）
    if (!boost && rng.next() < ruleset.aiBoostChancePerTick
        && snake.length > ruleset.minBoostLength * 2) {
        snake.aiBoostTicksLeft = ruleset.aiBoostTicks;
        boost = true;
    }

    const vector = target === null
        ? directionVector(snake.targetDirection)
        : directionVector(target);
    world.applyAiIntent(snake.id, vector.x, vector.y, boost);
}
