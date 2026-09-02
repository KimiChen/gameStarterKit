/**
 * snake 玩法的 wire 契约（docs/snakeoff/03 §4、04 §6；drop-in 自由加入房型）。
 *
 * 与文档提案的两处收敛（已在方案中拍板）：
 *  - ⛔ 首版不做 `c2s.snake.snapshotRequest`：重连后 Colyseus 重发 Schema 全量，
 *    下一份 10Hz 快照 100ms 内到达，恢复链路不需要拉取式请求；
 *  - 快照坐标为**整数**（世界坐标四舍五入到 unit）：体宽 36 unit 下 1 unit 精度
 *    不可见，msgpack 体积近似减半；完整精度只在服务端世界内存在。
 */
import { GamePhase } from "../../constants/game";
import {
    assertExactKeys,
    boundedString,
    finiteInteger,
    finiteNumber,
    isPlainRecord,
    WireValidationError,
    type PlainRecord,
} from "../../protocol/http";
import { defineC2S, defineS2C } from "../defineGameplayWire";
import { SNAKE_RULESET } from "./ruleset";

/** 蛇输入（03 §4.1）：只表达方向、加速与严格递增序号；客户端 ⛔ 不提交坐标/长度/碰撞结论。 */
export interface ISnakeInputReq {
    readonly dirX: number; // [-1, 1]
    readonly dirY: number; // [-1, 1]
    readonly boost: boolean;
    readonly seq: number; // 同一 match/player 严格递增；重连后从权威 ackSeq 之后继续
}

/** 快照里的单个身体/路径点（量化整数坐标，见文件头）。 */
export interface ISnakeSnapshotPoint {
    readonly x: number;
    readonly y: number;
}

export interface ISnakeSnapshotSnake {
    readonly id: string; // 真人 = sessionId；AI = "ai-N"
    readonly name: string;
    readonly skin: number; // 皮肤索引（客户端贴图表）
    readonly ai: boolean;
    readonly alive: boolean;
    readonly score: number;
    readonly length: number;
    readonly boost: boolean; // 服务端接受的加速态（表现拖尾用）
    readonly points: readonly ISnakeSnapshotPoint[]; // 头在 [0]；长度 ≤ snapshotMaxPointsPerSnake
}

export interface ISnakeSnapshotFood {
    readonly id: number;
    readonly kind: number; // 0 = Dot，1 = Star
    readonly x: number;
    readonly y: number;
}

export interface ISnakeSnapshotWreck {
    readonly id: number;
    readonly value: number; // 聚合后的长度/分值（等值，吃 1 wreck = +value 长度 +value 分）
    readonly x: number;
    readonly y: number;
}

/** 有界完整世界快照（10Hz；03 §2.3 的集合上限在 validator 烧死）。 */
export interface ISnakeWorldSnapshot {
    readonly matchId: string;
    readonly tick: number;
    readonly seq: number;
    readonly snakes: readonly ISnakeSnapshotSnake[];
    readonly foods: readonly ISnakeSnapshotFood[];
    readonly wrecks: readonly ISnakeSnapshotWreck[];
}

function recordOf(input: unknown): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", "payload");
    return input;
}

function pointOf(input: unknown, path: string): ISnakeSnapshotPoint {
    const value = recordOf(input);
    assertExactKeys(value, ["x", "y"], [], path);
    const margin = 64; // 保护期/插值期间的合法越界余量（出生点贴边 + 表现外摆）
    return {
        x: finiteInteger(value.x, `${path}.x`,
            -SNAKE_RULESET.worldWidth / 2 - margin, SNAKE_RULESET.worldWidth / 2 + margin),
        y: finiteInteger(value.y, `${path}.y`,
            -SNAKE_RULESET.worldHeight / 2 - margin, SNAKE_RULESET.worldHeight / 2 + margin),
    };
}

function pointArray(input: unknown, path: string, max: number): readonly ISnakeSnapshotPoint[] {
    if (!Array.isArray(input)) throw new WireValidationError("MESSAGE_FIELD_TYPE", path);
    if (input.length > max) throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return input.map((item, index) => pointOf(item, `${path}[${index}]`));
}

function validateSnakeInput(input: unknown): ISnakeInputReq {
    const value = recordOf(input);
    assertExactKeys(value, ["dirX", "dirY", "boost", "seq"], [], "payload");
    const dirX = finiteNumber(value.dirX, "payload.dirX", -1, 1);
    const dirY = finiteNumber(value.dirY, "payload.dirY", -1, 1);
    if (typeof value.boost !== "boolean") {
        throw new WireValidationError("MESSAGE_FIELD_TYPE", "payload.boost");
    }
    return {
        dirX,
        dirY,
        boost: value.boost,
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateSnakeSnapshot(input: unknown): ISnakeWorldSnapshot {
    const value = recordOf(input);
    assertExactKeys(value, ["matchId", "tick", "seq", "snakes", "foods", "wrecks"], [], "payload");
    const matchId = boundedString(value.matchId, "payload.matchId", 1, 128);
    const tick = finiteInteger(value.tick, "payload.tick", 0, Number.MAX_SAFE_INTEGER);
    const seq = finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER);

    if (!Array.isArray(value.snakes)) throw new WireValidationError("MESSAGE_FIELD_TYPE", "payload.snakes");
    if (value.snakes.length > SNAKE_RULESET.snapshotMaxSnakes) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakes");
    }
    const snakeIds = new Set<string>();
    const snakes = value.snakes.map((item, index) => {
        const path = `payload.snakes[${index}]`;
        const snake = recordOf(item);
        assertExactKeys(snake,
            ["id", "name", "skin", "ai", "alive", "score", "length", "boost", "points"], [], path);
        const id = boundedString(snake.id, `${path}.id`, 1, 64);
        if (snakeIds.has(id)) throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.id`);
        snakeIds.add(id);
        if (typeof snake.ai !== "boolean" || typeof snake.alive !== "boolean" || typeof snake.boost !== "boolean") {
            throw new WireValidationError("MESSAGE_FIELD_TYPE", `${path}.flags`);
        }
        return {
            id,
            name: boundedString(snake.name, `${path}.name`, 1, 32),
            skin: finiteInteger(snake.skin, `${path}.skin`, 0, 15),
            ai: snake.ai,
            alive: snake.alive,
            score: finiteInteger(snake.score, `${path}.score`, 0, Number.MAX_SAFE_INTEGER),
            length: finiteInteger(snake.length, `${path}.length`, 0, Number.MAX_SAFE_INTEGER),
            boost: snake.boost,
            points: pointArray(snake.points, `${path}.points`, SNAKE_RULESET.snapshotMaxPointsPerSnake),
        };
    });

    const foodIds = new Set<number>();
    const foods = boundedIdArray<ISnakeSnapshotFood>(value.foods, "payload.foods",
        SNAKE_RULESET.snapshotMaxFoods, foodIds, (item, path) => {
            const food = recordOf(item);
            assertExactKeys(food, ["id", "kind", "x", "y"], [], path);
            return {
                id: finiteInteger(food.id, `${path}.id`, 0, Number.MAX_SAFE_INTEGER),
                kind: finiteInteger(food.kind, `${path}.kind`, 0, 1),
                x: finiteInteger(food.x, `${path}.x`,
                    -SNAKE_RULESET.worldWidth / 2 - 64, SNAKE_RULESET.worldWidth / 2 + 64),
                y: finiteInteger(food.y, `${path}.y`,
                    -SNAKE_RULESET.worldHeight / 2 - 64, SNAKE_RULESET.worldHeight / 2 + 64),
            };
        });

    const wreckIds = new Set<number>();
    const wrecks = boundedIdArray<ISnakeSnapshotWreck>(value.wrecks, "payload.wrecks",
        SNAKE_RULESET.snapshotMaxWrecks, wreckIds, (item, path) => {
            const wreck = recordOf(item);
            assertExactKeys(wreck, ["id", "value", "x", "y"], [], path);
            return {
                id: finiteInteger(wreck.id, `${path}.id`, 0, Number.MAX_SAFE_INTEGER),
                value: finiteInteger(wreck.value, `${path}.value`, 1, Number.MAX_SAFE_INTEGER),
                x: finiteInteger(wreck.x, `${path}.x`,
                    -SNAKE_RULESET.worldWidth / 2 - 64, SNAKE_RULESET.worldWidth / 2 + 64),
                y: finiteInteger(wreck.y, `${path}.y`,
                    -SNAKE_RULESET.worldHeight / 2 - 64, SNAKE_RULESET.worldHeight / 2 + 64),
            };
        });

    return { matchId, tick, seq, snakes, foods, wrecks };
}

function boundedIdArray<T>(
    input: unknown,
    path: string,
    max: number,
    seen: Set<number>,
    mapItem: (item: unknown, path: string) => T,
): readonly T[] {
    if (!Array.isArray(input)) throw new WireValidationError("MESSAGE_FIELD_TYPE", path);
    if (input.length > max) throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return input.map((item, index) => {
        const mapped = mapItem(item, `${path}[${index}]`);
        const id = (mapped as unknown as { id: number }).id;
        if (seen.has(id)) throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}[${index}].id`);
        seen.add(id);
        return mapped;
    });
}

/** 蛇输入（Playing 限定；方向不变时客户端合并不发，预算恒 1）。 */
export const SnakeInput = defineC2S("c2s.snake.input", validateSnakeInput, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});

/** 世界快照（10Hz 有界完整快照；客户端按 04 §6.3 的 matchId/tick/seq 接受条件消费）。 */
export const SnakeSnapshot = defineS2C("s2c.snake.snapshot", validateSnakeSnapshot);
