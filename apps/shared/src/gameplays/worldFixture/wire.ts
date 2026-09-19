/**
 * worldFixture（MMO MF4 世界形态夹具，docs/MMO.md §5.1 夹具规则 / §5.4 MF4）的 wire：
 *  - C2S `move { dirX, dirY, seq }`：**意图**（方向分量 −1..1 的整数 + 客户端序号），坐标由服务端按常量速度积分
 *    （§4.6-6：⛔ 客户端不上报坐标）；
 *  - S2C `pos { entityId, x, y, seq, tick }`：本人移动体的权威位置回执（mode 按会话 sendS2C；MF5b-B3 再加 perSession 的
 *    enter / update / leave / baseline 族——本 token 刻意不是 perSession，MF5a 的「只有 viewFixture 声明 perSession」矩阵不动）。
 * world 玩法 C2S 的 phases 以 `GamePhase.Playing` 表示 `WorldPhase.Active`：dispatcher 共用 GamePhase 词表，WorldRoom 把 Active
 * 映射为 playing、其余映射为 settle（只放 Ping）。地图 WORLD_FIXTURE_MAP_SIZE²、速度 WORLD_FIXTURE_SPEED 格/步：数字只是夹具参数。
 */
import { GamePhase } from "../../constants/game";
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { defineC2S, defineS2C } from "../defineGameplayWire";

export const WORLD_FIXTURE_MAP_SIZE = 1000;
export const WORLD_FIXTURE_SPEED = 2;

export interface IWorldFixtureMoveReq {
    readonly dirX: number;
    readonly dirY: number;
    readonly seq: number;
}

export interface IWorldFixturePos {
    readonly entityId: string;
    readonly x: number;
    readonly y: number;
    readonly seq: number;
    readonly tick: number;
}

function recordOf(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function validateMove(input: unknown): IWorldFixtureMoveReq {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["dirX", "dirY", "seq"], [], "payload");
    return {
        dirX: finiteInteger(value.dirX, "payload.dirX", -1, 1),
        dirY: finiteInteger(value.dirY, "payload.dirY", -1, 1),
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validatePos(input: unknown): IWorldFixturePos {
    const value = recordOf(input, "payload");
    assertExactKeys(value, ["entityId", "x", "y", "seq", "tick"], [], "payload");
    return {
        entityId: boundedString(value.entityId, "payload.entityId", 1, 64),
        x: finiteInteger(value.x, "payload.x", 0, WORLD_FIXTURE_MAP_SIZE),
        y: finiteInteger(value.y, "payload.y", 0, WORLD_FIXTURE_MAP_SIZE),
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
        tick: finiteInteger(value.tick, "payload.tick", 0, Number.MAX_SAFE_INTEGER),
    };
}

export const WorldFixtureMove = defineC2S("c2s.worldFixture.move", validateMove, { phases: [GamePhase.Playing], rateCost: 1 });
export const WorldFixturePos = defineS2C("s2c.worldFixture.pos", validatePos);
