/** snake@3 房内 wire：无尽世界、分块 baseline/有序 delta 与 demo 金币复活/run 结果。 */
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
import {
    snakeBodyScale,
    SnakeDeathCause,
    SnakeRewardStatus,
    SnakeRunEndReason,
    SnakeRunState,
    SNAKE_ENDLESS_CONFIG,
    SNAKE_RULESET,
    type SnakeDeathCauseType,
    type SnakeRewardStatusType,
    type SnakeRunStateType,
    type SnakeTerminalEndReasonType,
} from "./ruleset";

export interface ISnakeInputReq {
    readonly dirX: number;
    readonly dirY: number;
    readonly boost: boolean;
    readonly seq: number;
}

export interface ISnakeReliveDecisionReq {
    readonly runId: string;
    readonly deathSeq: number;
    readonly clientReqId: string;
    readonly decision: "accept" | "decline";
}

export interface ISnakeEndRunReq {
    readonly runId: string;
    readonly clientReqId: string;
}

export interface ISnakeBaselineRequestReq {
    readonly roomEpochId: string;
    readonly afterSeq: number;
}

export interface ISnakeSnapshotPoint {
    readonly x: number;
    readonly y: number;
}

export interface ISnakeSnapshotSnake {
    readonly id: string;
    readonly name: string;
    readonly skinId: number;
    readonly ai: boolean;
    readonly aiLevel: number | null;
    readonly alive: boolean;
    readonly score: number;
    readonly length: number;
    readonly boost: boolean;
    readonly bodyScale: number;
    readonly magnetUntilTick: number | null;
    readonly protectUntilTick: number | null;
    readonly points: readonly ISnakeSnapshotPoint[];
}

export interface ISnakeSnapshotFood {
    readonly id: number;
    readonly kind: 0 | 1;
    readonly variant: number;
    readonly x: number;
    readonly y: number;
}

export interface ISnakeSnapshotWreck {
    readonly id: number;
    readonly value: number;
    readonly kind: 0 | 1;
    readonly variant?: number;
    readonly sourceSkinId?: number;
    readonly x: number;
    readonly y: number;
}

export interface ISnakeSnapshotTool {
    readonly id: number;
    readonly toolId: 10001;
    readonly x: number;
    readonly y: number;
    readonly expireTick: number;
}

export interface ISnakeRunDelta {
    readonly id: string;
    readonly runId: string;
    readonly state: SnakeRunStateType;
    readonly stateVersion: number;
    readonly deathSeq: number;
    readonly deathCause: SnakeDeathCauseType;
    readonly magnetCollected: number;
    readonly starCollected: number;
    readonly magnetUntilTick: number | null;
}

/** 路径头部追加/尾部裁剪；append 按“最新头点在前”的路径顺序原子插入。 */
export interface ISnakePathDelta {
    readonly id: string;
    readonly append: readonly ISnakeSnapshotPoint[];
    readonly trimTail: number;
}

export interface ISnakeDisplayRankEntry {
    readonly rank: number;
    readonly id: string;
    readonly name: string;
    readonly score: number;
    readonly length: number;
    readonly ai: boolean;
    readonly self: boolean;
}

export interface ISnakeEndlessRoomMeta {
    readonly roomEpochId: string;
    readonly playingStartedTick: number | null;
    readonly battlefieldConfigId: "newEndlessPortraitV2Map4096";
    readonly lifecycleConfigId: "sourceEndlessTotalTime0";
    readonly reliveFlowConfigId: "sourceEndlessReliveFlow";
    readonly relivePolicyId: "onlineCoinRelive5V1";
    readonly onlineAdaptationId: "onlineEndlessDropInV2";
    readonly layerVersions: {
        readonly battlefield: 1;
        readonly lifecycle: 1;
        readonly reliveFlow: 1;
        readonly relivePolicy: 1;
        readonly onlineAdaptation: 2;
    };
    readonly layerHashes: {
        readonly battlefield: string;
        readonly lifecycle: string;
        readonly reliveFlow: string;
        readonly relivePolicy: string;
        readonly onlineAdaptation: string;
    };
    readonly configHash: string;
    readonly totalTime: 0;
    readonly matchDurationTicks: 0;
    readonly hasDeadline: false;
    readonly endTick: null;
}

/** 完整权威世界（仅作为 baseline/checksum/测试模型；线上通过 chunk 发送）。 */
export interface ISnakeWorldSnapshot {
    readonly roomEpochId: string;
    readonly matchId: string;
    readonly tick: number;
    readonly envelopeTick: number;
    readonly seq: number;
    readonly snakes: readonly ISnakeSnapshotSnake[];
    readonly foods: readonly ISnakeSnapshotFood[];
    readonly wrecks: readonly ISnakeSnapshotWreck[];
    readonly tools: readonly ISnakeSnapshotTool[];
    readonly runs: readonly ISnakeRunDelta[];
    readonly displayRank: readonly ISnakeDisplayRankEntry[];
}

export type SnakeBaselineChunkKind = "snakes" | "foods" | "wrecks" | "tools" | "runs" | "displayRank";

export interface ISnakeBaselineBegin {
    readonly baselineId: string;
    readonly roomEpochId: string;
    readonly envelopeTick: number;
    readonly seq: number;
    readonly chunkCount: number;
    readonly snakeCount: number;
    readonly foodCount: number;
    readonly wreckCount: number;
    readonly toolCount: number;
    readonly runCount: number;
    readonly pointCount: number;
    readonly meta: ISnakeEndlessRoomMeta;
}

export interface ISnakeBaselineChunk {
    readonly baselineId: string;
    readonly roomEpochId: string;
    readonly envelopeTick: number;
    readonly seq: number;
    readonly index: number;
    readonly kind: SnakeBaselineChunkKind;
    readonly items: readonly unknown[];
}

export interface ISnakeBaselineEnd {
    readonly baselineId: string;
    readonly roomEpochId: string;
    readonly envelopeTick: number;
    readonly seq: number;
    readonly checksum: string;
}

export interface ISnakeWorldDelta {
    readonly roomEpochId: string;
    readonly tick: number;
    readonly envelopeTick: number;
    readonly seq: number;
    readonly baseSeq: number;
    readonly snakeUpserts: readonly ISnakeSnapshotSnake[];
    readonly snakePathDeltas: readonly ISnakePathDelta[];
    readonly snakeRemovals: readonly string[];
    readonly foodUpserts: readonly ISnakeSnapshotFood[];
    readonly foodRemovals: readonly number[];
    readonly wreckUpserts: readonly ISnakeSnapshotWreck[];
    readonly wreckRemovals: readonly number[];
    readonly toolUpserts: readonly ISnakeSnapshotTool[];
    readonly toolRemovals: readonly number[];
    readonly runRemovals: readonly string[];
    readonly runUpdates: readonly ISnakeRunDelta[];
    readonly displayRank: readonly ISnakeDisplayRankEntry[];
    readonly checksum: string;
}

export interface ISnakeReliveOffered {
    readonly runId: string;
    readonly deathSeq: number;
    readonly offeredTick: number;
    readonly decisionDeadlineTick: number;
    readonly reliveIndex: number;
    readonly relivesRemaining: number;
    readonly coinCost: number;
    readonly relivePolicyVersion: number;
}

export interface ISnakeReliveDecisionResult {
    readonly runId: string;
    readonly deathSeq: number;
    readonly clientReqId: string;
    readonly outcome: "insufficientCoins" | "retryableFailure";
    readonly retryable: boolean;
    readonly balanceAfter?: number;
}

export type SnakeReliveResolution = "revived" | "declined" | "timeout" | "ineligible" | "spawnFailed" | "systemFailed";

export interface ISnakeReliveResolved {
    readonly runId: string;
    readonly deathSeq: number;
    readonly clientReqId?: string;
    readonly result: SnakeReliveResolution;
    readonly resolvedTick: number;
    readonly protectUntilTick?: number;
    readonly receiptId?: string;
}

export interface ISnakeRunFinalizing {
    readonly runId: string;
    readonly stateVersion: number;
    readonly endReason?: SnakeTerminalEndReasonType;
    readonly reliveReceiptState?: "none" | "processing" | "charged" | "applying" | "applied" | "activated" | "refunding" | "refunded";
}

/** 本局统计（S4-01：三项只在房间内存累计，⛔ 不在 Colyseus schema 里）。 */
export interface ISnakeRunResultStats {
    /** run 起始锁存的皮肤（schema 字段名是 `skinId`，此处用语义名）。 */
    readonly skinIdAtRunStart: number;
    readonly activeTicks: number;
    readonly score: number;
    readonly finalLength: number;
    readonly maxLength: number;
    readonly kills: number;
    readonly deaths: number;
    readonly relivesUsed: number;
    readonly reliveCoinSpent: number;
    readonly magnetCollected: number;
    readonly starCollected: number;
    readonly meaningfulInputCount: number;
}

export interface ISnakeRunResultCoin {
    /** 本局获得值，⛔ 不减去复活消耗。 */
    readonly amount: number;
    readonly balanceAfter: number;
}

export interface ISnakeRunResultProgression {
    readonly xpAmount: number;
    readonly xpAfter: number;
    readonly levelBefore: number;
    readonly levelAfter: number;
    /** 本局碎片投向的皮肤；四款全拥有或不合格 run 时为 `null`。 */
    readonly fragmentSkinId: number | null;
    readonly fragmentAmount: number;
    /** 键 = 成就皮肤 ID 十进制字符串；键集合由服务端权威决定。 */
    readonly achievementProgressAfter: Readonly<Record<string, number>>;
    readonly newlyUnlockedSkinIds: readonly number[];
}

/**
 * 个人 run 结果 v2（S4-04）。⚠ 结果只表达**最终值**，⛔ 不含中间状态。
 * 按拍板 B2a：造新 interface 但**沿用同一个 token 名** `s2c.snake.runResult`，
 * ⛔ 不新增并存 token（避免两套 interface / validator / 订阅长期分叉）。
 */
export interface ISnakeRunResultV2 {
    readonly resultVersion: 2;
    readonly runId: string;
    readonly endReason: SnakeTerminalEndReasonType;
    readonly confirmedThroughTick: number;
    readonly rewardStatus: SnakeRewardStatusType;
    /** 不合格 run 仍下发统计，但各项奖励为 0。 */
    readonly qualified: boolean;
    readonly stats: ISnakeRunResultStats;
    readonly coin: ISnakeRunResultCoin;
    readonly progression: ISnakeRunResultProgression;
}

function recordOf(input: unknown, path = "payload"): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function nullableTick(input: unknown, path: string, envelopeTick?: number, maxAhead?: number): number | null {
    if (input === null) return null;
    const tick = finiteInteger(input, path, 0, Number.MAX_SAFE_INTEGER);
    if (envelopeTick !== undefined && maxAhead !== undefined
        && (tick <= envelopeTick || tick > envelopeTick + maxAhead)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    }
    return tick;
}

function finiteWorldCoordinate(input: unknown, path: string): number {
    return finiteNumber(input, path, -SNAKE_RULESET.worldWidth / 2, SNAKE_RULESET.worldWidth / 2);
}

function pointOf(input: unknown, path: string): ISnakeSnapshotPoint {
    const value = recordOf(input, path);
    assertExactKeys(value, ["x", "y"], [], path);
    return { x: finiteWorldCoordinate(value.x, `${path}.x`), y: finiteWorldCoordinate(value.y, `${path}.y`) };
}

function arrayOf<T>(
    input: unknown,
    path: string,
    max: number,
    parser: (item: unknown, path: string) => T,
): readonly T[] {
    if (!Array.isArray(input)) throw new WireValidationError("MESSAGE_FIELD_TYPE", path);
    if (input.length > max) throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return input.map((item, index) => parser(item, `${path}[${index}]`));
}

function uniqueNumberIds<T extends { readonly id: number }>(items: readonly T[], path: string): readonly T[] {
    const seen = new Set<number>();
    for (let index = 0; index < items.length; index += 1) {
        if (seen.has(items[index].id)) throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}[${index}].id`);
        seen.add(items[index].id);
    }
    return items;
}

function snakeOf(input: unknown, path: string, envelopeTick: number): ISnakeSnapshotSnake {
    const value = recordOf(input, path);
    assertExactKeys(value, [
        "id", "name", "skinId", "ai", "aiLevel", "alive", "score", "length", "boost",
        "bodyScale", "magnetUntilTick", "protectUntilTick", "points",
    ], [], path);
    if (typeof value.ai !== "boolean" || typeof value.alive !== "boolean" || typeof value.boost !== "boolean") {
        throw new WireValidationError("MESSAGE_FIELD_TYPE", `${path}.flags`);
    }
    const aiLevel = value.aiLevel === null ? null : finiteInteger(value.aiLevel, `${path}.aiLevel`, 0, 10000);
    if (value.ai !== (aiLevel !== null)) throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.aiLevel`);
    const magnetUntilTick = nullableTick(value.magnetUntilTick, `${path}.magnetUntilTick`, envelopeTick, SNAKE_RULESET.magnetEffectTicks);
    const protectUntilTick = nullableTick(value.protectUntilTick, `${path}.protectUntilTick`);
    if (!value.alive && (magnetUntilTick !== null || protectUntilTick !== null)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.alive`);
    }
    const points = arrayOf(value.points, `${path}.points`, SNAKE_RULESET.snapshotMaxPointsPerSnake, pointOf);
    if (value.alive && points.length === 0) throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.points`);
    const length = finiteNumber(value.length, `${path}.length`, 0, SNAKE_RULESET.maxLength);
    const bodyScale = finiteNumber(value.bodyScale, `${path}.bodyScale`, SNAKE_RULESET.bodyInitScale, SNAKE_RULESET.bodyMaxScale);
    if (bodyScale !== snakeBodyScale(length)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.bodyScale`);
    }
    return {
        id: boundedString(value.id, `${path}.id`, 1, 64),
        name: boundedString(value.name, `${path}.name`, 1, 32),
        skinId: finiteInteger(value.skinId, `${path}.skinId`, 0, Number.MAX_SAFE_INTEGER),
        ai: value.ai,
        aiLevel,
        alive: value.alive,
        score: finiteNumber(value.score, `${path}.score`, 0, Number.MAX_SAFE_INTEGER),
        length,
        boost: value.boost,
        bodyScale,
        magnetUntilTick,
        protectUntilTick,
        points,
    };
}

function foodOf(input: unknown, path: string): ISnakeSnapshotFood {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "kind", "variant", "x", "y"], [], path);
    const kind = finiteInteger(value.kind, `${path}.kind`, 0, 1) as 0 | 1;
    return {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        kind,
        variant: finiteInteger(value.variant, `${path}.variant`, 1, 7),
        x: finiteWorldCoordinate(value.x, `${path}.x`),
        y: finiteWorldCoordinate(value.y, `${path}.y`),
    };
}

function wreckOf(input: unknown, path: string): ISnakeSnapshotWreck {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "value", "kind", "x", "y"], ["variant", "sourceSkinId"], path);
    const result: ISnakeSnapshotWreck = {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        value: finiteNumber(value.value, `${path}.value`, 0.001, Number.MAX_SAFE_INTEGER),
        kind: finiteInteger(value.kind, `${path}.kind`, 0, 1) as 0 | 1,
        x: finiteWorldCoordinate(value.x, `${path}.x`),
        y: finiteWorldCoordinate(value.y, `${path}.y`),
        ...(value.variant === undefined ? {} : { variant: finiteInteger(value.variant, `${path}.variant`, 1, 7) }),
        ...(value.sourceSkinId === undefined ? {} : {
            sourceSkinId: finiteInteger(value.sourceSkinId, `${path}.sourceSkinId`, 0, Number.MAX_SAFE_INTEGER),
        }),
    };
    return result;
}

function toolOf(input: unknown, path: string, envelopeTick: number): ISnakeSnapshotTool {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "toolId", "x", "y", "expireTick"], [], path);
    const toolIdValue = finiteInteger(value.toolId, `${path}.toolId`);
    if (toolIdValue !== SNAKE_RULESET.magnetToolId) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.toolId`);
    }
    const toolId = toolIdValue as 10001;
    const expireTick = finiteInteger(value.expireTick, `${path}.expireTick`);
    if (expireTick <= envelopeTick || expireTick > envelopeTick + SNAKE_RULESET.magnetExpireTicks) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.expireTick`);
    }
    const limit = SNAKE_RULESET.worldWidth / 2 - SNAKE_RULESET.magnetRadius;
    return {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        toolId,
        x: finiteNumber(value.x, `${path}.x`, -limit, limit),
        y: finiteNumber(value.y, `${path}.y`, -limit, limit),
        expireTick,
    };
}

function runOf(input: unknown, path: string, envelopeTick: number): ISnakeRunDelta {
    const value = recordOf(input, path);
    assertExactKeys(value, [
        "id", "runId", "state", "stateVersion", "deathSeq", "deathCause", "magnetCollected", "starCollected",
        "magnetUntilTick",
    ], [], path);
    const state = value.state;
    const states = Object.keys(SnakeRunState).map((key) => SnakeRunState[key as keyof typeof SnakeRunState]);
    if (typeof state !== "string" || !states.includes(state as SnakeRunStateType)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.state`);
    }
    const magnetUntilTick = nullableTick(value.magnetUntilTick, `${path}.magnetUntilTick`, envelopeTick, SNAKE_RULESET.magnetEffectTicks);
    if (state !== SnakeRunState.Active && magnetUntilTick !== null) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.magnetUntilTick`);
    }
    const deathCause = value.deathCause;
    const causes = Object.keys(SnakeDeathCause).map((key) => SnakeDeathCause[key as keyof typeof SnakeDeathCause]);
    if (typeof deathCause !== "string" || !causes.includes(deathCause as SnakeDeathCauseType)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.deathCause`);
    }
    return {
        id: boundedString(value.id, `${path}.id`, 1, 64),
        runId: boundedString(value.runId, `${path}.runId`, 1, 128),
        state: state as SnakeRunStateType,
        stateVersion: finiteInteger(value.stateVersion, `${path}.stateVersion`, 1, Number.MAX_SAFE_INTEGER),
        deathSeq: finiteInteger(value.deathSeq, `${path}.deathSeq`, 0, Number.MAX_SAFE_INTEGER),
        deathCause: deathCause as SnakeDeathCauseType,
        magnetCollected: finiteInteger(value.magnetCollected, `${path}.magnetCollected`, 0, Number.MAX_SAFE_INTEGER),
        starCollected: finiteInteger(value.starCollected, `${path}.starCollected`, 0, Number.MAX_SAFE_INTEGER),
        magnetUntilTick,
    };
}

function pathDeltaOf(input: unknown, path: string): ISnakePathDelta {
    const value = recordOf(input, path);
    assertExactKeys(value, ["id", "append", "trimTail"], [], path);
    return {
        id: boundedString(value.id, `${path}.id`, 1, 64),
        append: arrayOf(value.append, `${path}.append`, 64, pointOf),
        trimTail: finiteInteger(value.trimTail, `${path}.trimTail`, 0, SNAKE_RULESET.snapshotMaxPointsPerSnake),
    };
}

function displayRankOf(input: unknown, path: string): ISnakeDisplayRankEntry {
    const value = recordOf(input, path);
    assertExactKeys(value, ["rank", "id", "name", "score", "length", "ai", "self"], [], path);
    if (typeof value.ai !== "boolean" || typeof value.self !== "boolean") {
        throw new WireValidationError("MESSAGE_FIELD_TYPE", `${path}.flags`);
    }
    return {
        rank: finiteInteger(value.rank, `${path}.rank`, 1, 103),
        id: boundedString(value.id, `${path}.id`, 1, 64),
        name: boundedString(value.name, `${path}.name`, 1, 32),
        score: finiteNumber(value.score, `${path}.score`, 0, Number.MAX_SAFE_INTEGER),
        length: finiteNumber(value.length, `${path}.length`, 0, Number.MAX_SAFE_INTEGER),
        ai: value.ai,
        self: value.self,
    };
}

function roomMetaOf(input: unknown, path: string): ISnakeEndlessRoomMeta {
    const value = recordOf(input, path);
    assertExactKeys(value, [
        "roomEpochId", "playingStartedTick", "battlefieldConfigId", "lifecycleConfigId", "reliveFlowConfigId",
        "relivePolicyId", "onlineAdaptationId", "layerVersions", "layerHashes", "configHash", "totalTime",
        "matchDurationTicks", "hasDeadline", "endTick",
    ], [], path);
    const versions = recordOf(value.layerVersions, `${path}.layerVersions`);
    assertExactKeys(versions, ["battlefield", "lifecycle", "reliveFlow", "relivePolicy", "onlineAdaptation"], [], `${path}.layerVersions`);
    const hashes = recordOf(value.layerHashes, `${path}.layerHashes`);
    assertExactKeys(hashes, ["battlefield", "lifecycle", "reliveFlow", "relivePolicy", "onlineAdaptation"], [], `${path}.layerHashes`);
    const literal = (actual: unknown, expected: unknown, field: string): void => {
        if (actual !== expected) throw new WireValidationError("MESSAGE_FIELD_RANGE", `${path}.${field}`);
    };
    literal(value.battlefieldConfigId, SNAKE_ENDLESS_CONFIG.battlefieldConfigId, "battlefieldConfigId");
    literal(value.lifecycleConfigId, SNAKE_ENDLESS_CONFIG.lifecycleConfigId, "lifecycleConfigId");
    literal(value.reliveFlowConfigId, SNAKE_ENDLESS_CONFIG.reliveFlowConfigId, "reliveFlowConfigId");
    literal(value.relivePolicyId, SNAKE_ENDLESS_CONFIG.relivePolicyId, "relivePolicyId");
    literal(value.onlineAdaptationId, SNAKE_ENDLESS_CONFIG.onlineAdaptationId, "onlineAdaptationId");
    literal(value.totalTime, 0, "totalTime");
    literal(value.matchDurationTicks, 0, "matchDurationTicks");
    literal(value.hasDeadline, false, "hasDeadline");
    literal(value.endTick, null, "endTick");
    for (const key of ["battlefield", "lifecycle", "reliveFlow", "relivePolicy", "onlineAdaptation"] as const) {
        literal(versions[key], SNAKE_ENDLESS_CONFIG.layerVersions[key], `layerVersions.${key}`);
        literal(hashes[key], SNAKE_ENDLESS_CONFIG.layerHashes[key], `layerHashes.${key}`);
    }
    literal(value.configHash, SNAKE_ENDLESS_CONFIG.configHash, "configHash");
    return {
        roomEpochId: boundedString(value.roomEpochId, `${path}.roomEpochId`, 1, 128),
        playingStartedTick: value.playingStartedTick === null
            ? null
            : finiteInteger(value.playingStartedTick, `${path}.playingStartedTick`, 0, Number.MAX_SAFE_INTEGER),
        battlefieldConfigId: SNAKE_ENDLESS_CONFIG.battlefieldConfigId,
        lifecycleConfigId: SNAKE_ENDLESS_CONFIG.lifecycleConfigId,
        reliveFlowConfigId: SNAKE_ENDLESS_CONFIG.reliveFlowConfigId,
        relivePolicyId: SNAKE_ENDLESS_CONFIG.relivePolicyId,
        onlineAdaptationId: SNAKE_ENDLESS_CONFIG.onlineAdaptationId,
        layerVersions: SNAKE_ENDLESS_CONFIG.layerVersions,
        layerHashes: SNAKE_ENDLESS_CONFIG.layerHashes,
        configHash: SNAKE_ENDLESS_CONFIG.configHash,
        totalTime: 0,
        matchDurationTicks: 0,
        hasDeadline: false,
        endTick: null,
    };
}

function validateSnakeInput(input: unknown): ISnakeInputReq {
    const value = recordOf(input);
    assertExactKeys(value, ["dirX", "dirY", "boost", "seq"], [], "payload");
    if (typeof value.boost !== "boolean") throw new WireValidationError("MESSAGE_FIELD_TYPE", "payload.boost");
    return {
        dirX: finiteNumber(value.dirX, "payload.dirX", -1, 1),
        dirY: finiteNumber(value.dirY, "payload.dirY", -1, 1),
        boost: value.boost,
        seq: finiteInteger(value.seq, "payload.seq", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateReliveDecision(input: unknown): ISnakeReliveDecisionReq {
    const value = recordOf(input);
    assertExactKeys(value, ["runId", "deathSeq", "clientReqId", "decision"], [], "payload");
    if (value.decision !== "accept" && value.decision !== "decline") {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.decision");
    }
    return {
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        deathSeq: finiteInteger(value.deathSeq, "payload.deathSeq", 1, Number.MAX_SAFE_INTEGER),
        clientReqId: boundedString(value.clientReqId, "payload.clientReqId", 1, 128),
        decision: value.decision,
    };
}

function validateEndRun(input: unknown): ISnakeEndRunReq {
    const value = recordOf(input);
    assertExactKeys(value, ["runId", "clientReqId"], [], "payload");
    return {
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        clientReqId: boundedString(value.clientReqId, "payload.clientReqId", 1, 128),
    };
}

function validateBaselineRequest(input: unknown): ISnakeBaselineRequestReq {
    const value = recordOf(input);
    assertExactKeys(value, ["roomEpochId", "afterSeq"], [], "payload");
    return {
        roomEpochId: boundedString(value.roomEpochId, "payload.roomEpochId", 1, 128),
        afterSeq: finiteInteger(value.afterSeq, "payload.afterSeq", 0, Number.MAX_SAFE_INTEGER),
    };
}

function validateBaselineBegin(input: unknown): ISnakeBaselineBegin {
    const value = recordOf(input);
    assertExactKeys(value, [
        "baselineId", "roomEpochId", "envelopeTick", "seq", "chunkCount", "snakeCount", "foodCount",
        "wreckCount", "toolCount", "runCount", "pointCount", "meta",
    ], [], "payload");
    const envelopeTick = finiteInteger(value.envelopeTick, "payload.envelopeTick", 0, Number.MAX_SAFE_INTEGER);
    const roomEpochId = boundedString(value.roomEpochId, "payload.roomEpochId", 1, 128);
    const meta = roomMetaOf(value.meta, "payload.meta");
    if (meta.roomEpochId !== roomEpochId) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.meta.roomEpochId");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 128),
        roomEpochId,
        envelopeTick,
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        chunkCount: finiteInteger(value.chunkCount, "payload.chunkCount", 1, SNAKE_RULESET.snapshotMaxChunks),
        snakeCount: finiteInteger(value.snakeCount, "payload.snakeCount", 0, SNAKE_RULESET.snapshotMaxSnakes),
        foodCount: finiteInteger(value.foodCount, "payload.foodCount", 0, SNAKE_RULESET.snapshotMaxFoods),
        wreckCount: finiteInteger(value.wreckCount, "payload.wreckCount", 0, SNAKE_RULESET.snapshotMaxWrecks),
        toolCount: finiteInteger(value.toolCount, "payload.toolCount", 0, SNAKE_RULESET.snapshotMaxTools),
        runCount: finiteInteger(value.runCount, "payload.runCount", 0, 8),
        pointCount: finiteInteger(value.pointCount, "payload.pointCount", 0, SNAKE_RULESET.snapshotMaxPointsTotal),
        meta,
    };
}

function validateBaselineChunk(input: unknown): ISnakeBaselineChunk {
    const value = recordOf(input);
    assertExactKeys(value, ["baselineId", "roomEpochId", "envelopeTick", "seq", "index", "kind", "items"], [], "payload");
    const envelopeTick = finiteInteger(value.envelopeTick, "payload.envelopeTick", 0, Number.MAX_SAFE_INTEGER);
    const kind = value.kind;
    if (kind !== "snakes" && kind !== "foods" && kind !== "wrecks" && kind !== "tools"
        && kind !== "runs" && kind !== "displayRank") {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.kind");
    }
    const parser: (item: unknown, path: string) => unknown = kind === "snakes"
        ? (item: unknown, path: string) => snakeOf(item, path, envelopeTick)
        : kind === "foods" ? foodOf
        : kind === "wrecks" ? wreckOf
        : kind === "tools" ? (item: unknown, path: string) => toolOf(item, path, envelopeTick)
        : kind === "runs" ? (item: unknown, path: string) => runOf(item, path, envelopeTick)
        : displayRankOf;
    const items = arrayOf(value.items, "payload.items", SNAKE_RULESET.snapshotChunkItems, parser);
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 128),
        roomEpochId: boundedString(value.roomEpochId, "payload.roomEpochId", 1, 128),
        envelopeTick,
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        index: finiteInteger(value.index, "payload.index", 0, SNAKE_RULESET.snapshotMaxChunks - 1),
        kind,
        items,
    };
}

function validateBaselineEnd(input: unknown): ISnakeBaselineEnd {
    const value = recordOf(input);
    assertExactKeys(value, ["baselineId", "roomEpochId", "envelopeTick", "seq", "checksum"], [], "payload");
    return {
        baselineId: boundedString(value.baselineId, "payload.baselineId", 1, 128),
        roomEpochId: boundedString(value.roomEpochId, "payload.roomEpochId", 1, 128),
        envelopeTick: finiteInteger(value.envelopeTick, "payload.envelopeTick", 0, Number.MAX_SAFE_INTEGER),
        seq: finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER),
        checksum: boundedString(value.checksum, "payload.checksum", 8, 16),
    };
}

function stringRemovalArray(input: unknown, path: string, max: number = SNAKE_RULESET.snapshotMaxSnakes): readonly string[] {
    const values = arrayOf(input, path, max, (item, itemPath) => boundedString(item, itemPath, 1, 64));
    if (new Set(values).size !== values.length) throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return values;
}

function numberRemovalArray(input: unknown, path: string, max: number): readonly number[] {
    const values = arrayOf(input, path, max, (item, itemPath) => finiteInteger(item, itemPath, 1, Number.MAX_SAFE_INTEGER));
    if (new Set(values).size !== values.length) throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    return values;
}

function validateDelta(input: unknown): ISnakeWorldDelta {
    const value = recordOf(input);
    assertExactKeys(value, [
        "roomEpochId", "tick", "envelopeTick", "seq", "baseSeq", "snakeUpserts", "snakePathDeltas", "snakeRemovals",
        "foodUpserts", "foodRemovals", "wreckUpserts", "wreckRemovals", "toolUpserts", "toolRemovals",
        "runRemovals", "runUpdates", "displayRank", "checksum",
    ], [], "payload");
    const envelopeTick = finiteInteger(value.envelopeTick, "payload.envelopeTick", 0, Number.MAX_SAFE_INTEGER);
    const tick = finiteInteger(value.tick, "payload.tick", 0, Number.MAX_SAFE_INTEGER);
    if (tick !== envelopeTick) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.tick");
    const snakeUpserts = arrayOf(value.snakeUpserts, "payload.snakeUpserts", SNAKE_RULESET.snapshotMaxSnakes,
        (item, path) => snakeOf(item, path, envelopeTick));
    if (new Set(snakeUpserts.map((snake) => snake.id)).size !== snakeUpserts.length) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakeUpserts");
    }
    let pointCount = 0;
    for (const snake of snakeUpserts) pointCount += snake.points.length;
    if (pointCount > SNAKE_RULESET.snapshotMaxPointsTotal) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakeUpserts");
    const snakePathDeltas = arrayOf(value.snakePathDeltas, "payload.snakePathDeltas", SNAKE_RULESET.snapshotMaxSnakes,
        pathDeltaOf);
    if (new Set(snakePathDeltas.map((delta) => delta.id)).size !== snakePathDeltas.length) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakePathDeltas");
    }
    const upsertIds = new Set(snakeUpserts.map((snake) => snake.id));
    if (snakePathDeltas.some((delta) => upsertIds.has(delta.id))) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakePathDeltas");
    }
    const appendedPointCount = snakePathDeltas.reduce((sum, delta) => sum + delta.append.length, 0);
    if (appendedPointCount > SNAKE_RULESET.snapshotMaxPointsTotal) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakePathDeltas");
    }
    const foodUpserts = uniqueNumberIds(arrayOf(value.foodUpserts, "payload.foodUpserts", SNAKE_RULESET.snapshotMaxFoods, foodOf), "payload.foodUpserts");
    const wreckUpserts = uniqueNumberIds(arrayOf(value.wreckUpserts, "payload.wreckUpserts", SNAKE_RULESET.snapshotMaxWrecks, wreckOf), "payload.wreckUpserts");
    const toolUpserts = uniqueNumberIds(arrayOf(value.toolUpserts, "payload.toolUpserts", SNAKE_RULESET.snapshotMaxTools,
        (item, path) => toolOf(item, path, envelopeTick)), "payload.toolUpserts");
    const seq = finiteInteger(value.seq, "payload.seq", 1, Number.MAX_SAFE_INTEGER);
    const baseSeq = finiteInteger(value.baseSeq, "payload.baseSeq", 0, Number.MAX_SAFE_INTEGER);
    if (seq !== baseSeq + 1) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.seq");
    const snakeRemovals = stringRemovalArray(value.snakeRemovals, "payload.snakeRemovals");
    const foodRemovals = numberRemovalArray(value.foodRemovals, "payload.foodRemovals", SNAKE_RULESET.snapshotMaxFoods);
    const wreckRemovals = numberRemovalArray(value.wreckRemovals, "payload.wreckRemovals", SNAKE_RULESET.snapshotMaxWrecks);
    const toolRemovals = numberRemovalArray(value.toolRemovals, "payload.toolRemovals", SNAKE_RULESET.snapshotMaxTools);
    const runRemovals = stringRemovalArray(value.runRemovals, "payload.runRemovals", 8);
    const overlaps = <T extends string | number>(removals: readonly T[], upserts: readonly { readonly id: T }[]): boolean => {
        const removed = new Set<T>(removals);
        return upserts.some((entry) => removed.has(entry.id));
    };
    if (overlaps(snakeRemovals, snakeUpserts)
        || snakePathDeltas.some((entry) => snakeRemovals.includes(entry.id))) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.snakeRemovals");
    }
    if (overlaps(foodRemovals, foodUpserts)) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.foodRemovals");
    if (overlaps(wreckRemovals, wreckUpserts)) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.wreckRemovals");
    if (overlaps(toolRemovals, toolUpserts)) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.toolRemovals");
    const runUpdates = arrayOf(value.runUpdates, "payload.runUpdates", 8, (item, path) => runOf(item, path, envelopeTick));
    if (new Set(runUpdates.map((run) => run.id)).size !== runUpdates.length) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.runUpdates");
    }
    if (overlaps(runRemovals, runUpdates)) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.runRemovals");
    const displayRank = arrayOf(value.displayRank, "payload.displayRank", 11, displayRankOf);
    if (new Set(displayRank.map((entry) => entry.id)).size !== displayRank.length
        || new Set(displayRank.map((entry) => entry.rank)).size !== displayRank.length
        || displayRank.filter((entry) => entry.self).length > 1) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.displayRank");
    }
    return {
        roomEpochId: boundedString(value.roomEpochId, "payload.roomEpochId", 1, 128),
        tick,
        envelopeTick,
        seq,
        baseSeq,
        snakeUpserts,
        snakePathDeltas,
        snakeRemovals,
        foodUpserts,
        foodRemovals,
        wreckUpserts,
        wreckRemovals,
        toolUpserts,
        toolRemovals,
        runRemovals,
        runUpdates,
        displayRank,
        checksum: boundedString(value.checksum, "payload.checksum", 8, 16),
    };
}

function validateReliveOffered(input: unknown): ISnakeReliveOffered {
    const value = recordOf(input);
    assertExactKeys(value, ["runId", "deathSeq", "offeredTick", "decisionDeadlineTick", "reliveIndex", "relivesRemaining", "coinCost", "relivePolicyVersion"], [], "payload");
    const offeredTick = finiteInteger(value.offeredTick, "payload.offeredTick", 0, Number.MAX_SAFE_INTEGER);
    const deadline = finiteInteger(value.decisionDeadlineTick, "payload.decisionDeadlineTick", offeredTick + 1, Number.MAX_SAFE_INTEGER);
    if (deadline !== offeredTick + SNAKE_RULESET.reliveDecisionTicks) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.decisionDeadlineTick");
    return {
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        deathSeq: finiteInteger(value.deathSeq, "payload.deathSeq", 1, Number.MAX_SAFE_INTEGER),
        offeredTick,
        decisionDeadlineTick: deadline,
        reliveIndex: finiteInteger(value.reliveIndex, "payload.reliveIndex", 1, SNAKE_RULESET.maxSuccessfulRelives),
        relivesRemaining: finiteInteger(value.relivesRemaining, "payload.relivesRemaining", 1, SNAKE_RULESET.maxSuccessfulRelives),
        coinCost: finiteInteger(value.coinCost, "payload.coinCost", 1, Number.MAX_SAFE_INTEGER),
        relivePolicyVersion: finiteInteger(value.relivePolicyVersion, "payload.relivePolicyVersion", 1, Number.MAX_SAFE_INTEGER),
    };
}

function validateDecisionResult(input: unknown): ISnakeReliveDecisionResult {
    const value = recordOf(input);
    assertExactKeys(value, ["runId", "deathSeq", "clientReqId", "outcome", "retryable"], ["balanceAfter"], "payload");
    if (value.outcome !== "insufficientCoins" && value.outcome !== "retryableFailure") {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.outcome");
    }
    if (typeof value.retryable !== "boolean") throw new WireValidationError("MESSAGE_FIELD_TYPE", "payload.retryable");
    return {
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        deathSeq: finiteInteger(value.deathSeq, "payload.deathSeq", 1, Number.MAX_SAFE_INTEGER),
        clientReqId: boundedString(value.clientReqId, "payload.clientReqId", 1, 128),
        outcome: value.outcome,
        retryable: value.retryable,
        ...(value.balanceAfter === undefined ? {} : {
            balanceAfter: finiteInteger(value.balanceAfter, "payload.balanceAfter", 0, Number.MAX_SAFE_INTEGER),
        }),
    };
}

function validateReliveResolved(input: unknown): ISnakeReliveResolved {
    const value = recordOf(input);
    assertExactKeys(value, ["runId", "deathSeq", "result", "resolvedTick"], ["clientReqId", "protectUntilTick", "receiptId"], "payload");
    const results: readonly SnakeReliveResolution[] = ["revived", "declined", "timeout", "ineligible", "spawnFailed", "systemFailed"];
    if (typeof value.result !== "string" || !results.includes(value.result as SnakeReliveResolution)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.result");
    }
    return {
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        deathSeq: finiteInteger(value.deathSeq, "payload.deathSeq", 1, Number.MAX_SAFE_INTEGER),
        result: value.result as SnakeReliveResolution,
        resolvedTick: finiteInteger(value.resolvedTick, "payload.resolvedTick", 0, Number.MAX_SAFE_INTEGER),
        ...(value.clientReqId === undefined ? {} : { clientReqId: boundedString(value.clientReqId, "payload.clientReqId", 1, 128) }),
        ...(value.protectUntilTick === undefined ? {} : {
            protectUntilTick: finiteInteger(value.protectUntilTick, "payload.protectUntilTick", 1, Number.MAX_SAFE_INTEGER),
        }),
        ...(value.receiptId === undefined ? {} : { receiptId: boundedString(value.receiptId, "payload.receiptId", 1, 128) }),
    };
}

function terminalReason(input: unknown, path: string): SnakeTerminalEndReasonType {
    const terminalReasons = Object.keys(SnakeRunEndReason)
        .map((key) => SnakeRunEndReason[key as keyof typeof SnakeRunEndReason])
        .filter((reason): reason is SnakeTerminalEndReasonType => reason !== "");
    if (typeof input !== "string" || !terminalReasons.includes(input as SnakeTerminalEndReasonType)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", path);
    }
    return input as SnakeTerminalEndReasonType;
}

function validateRunFinalizing(input: unknown): ISnakeRunFinalizing {
    const value = recordOf(input);
    assertExactKeys(value, ["runId", "stateVersion"], ["endReason", "reliveReceiptState"], "payload");
    const receiptStates = ["none", "processing", "charged", "applying", "applied", "activated", "refunding", "refunded"] as const;
    if (value.reliveReceiptState !== undefined
        && !receiptStates.includes(value.reliveReceiptState as typeof receiptStates[number])) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.reliveReceiptState");
    }
    return {
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        stateVersion: finiteInteger(value.stateVersion, "payload.stateVersion", 1, Number.MAX_SAFE_INTEGER),
        ...(value.endReason === undefined ? {} : { endReason: terminalReason(value.endReason, "payload.endReason") }),
        ...(value.reliveReceiptState === undefined ? {} : { reliveReceiptState: value.reliveReceiptState as typeof receiptStates[number] }),
    };
}

const MAX_ACHIEVEMENT_KEYS = 32;
const MAX_NEW_UNLOCKS = 64;

function validateRunResultStats(input: unknown, path: string): ISnakeRunResultStats {
    const value = recordOf(input, path);
    assertExactKeys(value, ["skinIdAtRunStart", "activeTicks", "score", "finalLength", "maxLength", "kills",
        "deaths", "relivesUsed", "reliveCoinSpent", "magnetCollected", "starCollected", "meaningfulInputCount"], [], path);
    const nonNegative = (key: keyof ISnakeRunResultStats): number =>
        finiteInteger(value[key], `${path}.${key}`, 0, Number.MAX_SAFE_INTEGER);
    return {
        skinIdAtRunStart: finiteInteger(value.skinIdAtRunStart, `${path}.skinIdAtRunStart`, 1, Number.MAX_SAFE_INTEGER),
        activeTicks: nonNegative("activeTicks"),
        score: nonNegative("score"),
        finalLength: nonNegative("finalLength"),
        maxLength: nonNegative("maxLength"),
        kills: nonNegative("kills"),
        deaths: nonNegative("deaths"),
        relivesUsed: nonNegative("relivesUsed"),
        reliveCoinSpent: nonNegative("reliveCoinSpent"),
        magnetCollected: nonNegative("magnetCollected"),
        starCollected: nonNegative("starCollected"),
        meaningfulInputCount: nonNegative("meaningfulInputCount"),
    };
}

function validateRunResultProgression(input: unknown, path: string): ISnakeRunResultProgression {
    const value = recordOf(input, path);
    assertExactKeys(value, ["xpAmount", "xpAfter", "levelBefore", "levelAfter", "fragmentSkinId",
        "fragmentAmount", "achievementProgressAfter", "newlyUnlockedSkinIds"], [], path);
    const progressPath = `${path}.achievementProgressAfter`;
    const progressRaw = recordOf(value.achievementProgressAfter, progressPath);
    const keys = Object.keys(progressRaw);
    if (keys.length > MAX_ACHIEVEMENT_KEYS) throw new WireValidationError("MESSAGE_FIELD_RANGE", progressPath);
    const achievementProgressAfter: Record<string, number> = {};
    // ⚠ 正则内联在函数体里：gameplay wire.ts 的顶层 const 只允许字面量或 defineC2S/defineS2C 调用。
    const achievementKeyPattern = /^[1-9][0-9]{0,8}$/u;
    for (const key of keys) {
        if (!achievementKeyPattern.test(key)) throw new WireValidationError("MESSAGE_FIELD_RANGE", progressPath);
        achievementProgressAfter[key] = finiteInteger(progressRaw[key], `${progressPath}.${key}`, 0, Number.MAX_SAFE_INTEGER);
    }
    return {
        xpAmount: finiteInteger(value.xpAmount, `${path}.xpAmount`, 0, Number.MAX_SAFE_INTEGER),
        xpAfter: finiteInteger(value.xpAfter, `${path}.xpAfter`, 0, Number.MAX_SAFE_INTEGER),
        levelBefore: finiteInteger(value.levelBefore, `${path}.levelBefore`, 1, 99),
        levelAfter: finiteInteger(value.levelAfter, `${path}.levelAfter`, 1, 99),
        fragmentSkinId: value.fragmentSkinId === null
            ? null
            : finiteInteger(value.fragmentSkinId, `${path}.fragmentSkinId`, 1, Number.MAX_SAFE_INTEGER),
        fragmentAmount: finiteInteger(value.fragmentAmount, `${path}.fragmentAmount`, 0, Number.MAX_SAFE_INTEGER),
        achievementProgressAfter,
        newlyUnlockedSkinIds: arrayOf(value.newlyUnlockedSkinIds, `${path}.newlyUnlockedSkinIds`, MAX_NEW_UNLOCKS,
            (item, itemPath) => finiteInteger(item, itemPath, 1, Number.MAX_SAFE_INTEGER)),
    };
}

function validateRunResult(input: unknown): ISnakeRunResultV2 {
    const value = recordOf(input);
    assertExactKeys(value, ["resultVersion", "runId", "endReason", "confirmedThroughTick", "rewardStatus",
        "qualified", "stats", "coin", "progression"], [], "payload");
    if (value.resultVersion !== 2) throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.resultVersion");
    const statuses = Object.keys(SnakeRewardStatus).map((key) => SnakeRewardStatus[key as keyof typeof SnakeRewardStatus]);
    if (typeof value.rewardStatus !== "string" || !statuses.includes(value.rewardStatus as SnakeRewardStatusType)) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "payload.rewardStatus");
    }
    if (typeof value.qualified !== "boolean") throw new WireValidationError("MESSAGE_FIELD_TYPE", "payload.qualified");
    const coinPath = "payload.coin";
    const coin = recordOf(value.coin, coinPath);
    assertExactKeys(coin, ["amount", "balanceAfter"], [], coinPath);
    return {
        resultVersion: 2,
        runId: boundedString(value.runId, "payload.runId", 1, 128),
        endReason: terminalReason(value.endReason, "payload.endReason"),
        confirmedThroughTick: finiteInteger(value.confirmedThroughTick, "payload.confirmedThroughTick", 0, Number.MAX_SAFE_INTEGER),
        rewardStatus: value.rewardStatus as SnakeRewardStatusType,
        qualified: value.qualified,
        stats: validateRunResultStats(value.stats, "payload.stats"),
        coin: {
            amount: finiteInteger(coin.amount, `${coinPath}.amount`, 0, Number.MAX_SAFE_INTEGER),
            balanceAfter: finiteInteger(coin.balanceAfter, `${coinPath}.balanceAfter`, 0, Number.MAX_SAFE_INTEGER),
        },
        progression: validateRunResultProgression(value.progression, "payload.progression"),
    };
}

/** Canonical key ordering + FNV-1a 32-bit；用于发现缺块/乱序/错误 delta，不承担密码学身份。 */
export function snakeWireChecksum(value: unknown): string {
    const canonical = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(canonical);
        if (input !== null && typeof input === "object") {
            const record = input as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(record).sort()) result[key] = canonical(record[key]);
            return result;
        }
        return input;
    };
    const text = JSON.stringify(canonical(value));
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function validateSnakeWorldSnapshot(input: unknown): ISnakeWorldSnapshot {
    const value = recordOf(input, "snapshot");
    assertExactKeys(value, ["roomEpochId", "matchId", "tick", "envelopeTick", "seq", "snakes", "foods", "wrecks", "tools", "runs", "displayRank"], [], "snapshot");
    const envelopeTick = finiteInteger(value.envelopeTick, "snapshot.envelopeTick", 0, Number.MAX_SAFE_INTEGER);
    const tick = finiteInteger(value.tick, "snapshot.tick", 0, Number.MAX_SAFE_INTEGER);
    if (tick !== envelopeTick) throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.tick");
    const snakes = arrayOf(value.snakes, "snapshot.snakes", SNAKE_RULESET.snapshotMaxSnakes,
        (item, path) => snakeOf(item, path, envelopeTick));
    if (new Set(snakes.map((snake) => snake.id)).size !== snakes.length) throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.snakes");
    const pointCount = snakes.reduce((sum, snake) => sum + snake.points.length, 0);
    if (pointCount > SNAKE_RULESET.snapshotMaxPointsTotal) throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.snakes.points");
    const roomEpochId = boundedString(value.roomEpochId, "snapshot.roomEpochId", 1, 128);
    const matchId = boundedString(value.matchId, "snapshot.matchId", 1, 128);
    if (matchId !== roomEpochId) throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.matchId");
    const foods = uniqueNumberIds(arrayOf(value.foods, "snapshot.foods", SNAKE_RULESET.snapshotMaxFoods, foodOf), "snapshot.foods");
    const wrecks = uniqueNumberIds(arrayOf(value.wrecks, "snapshot.wrecks", SNAKE_RULESET.snapshotMaxWrecks, wreckOf), "snapshot.wrecks");
    const tools = uniqueNumberIds(arrayOf(value.tools, "snapshot.tools", SNAKE_RULESET.snapshotMaxTools,
        (item, path) => toolOf(item, path, envelopeTick)), "snapshot.tools");
    const runs = arrayOf(value.runs, "snapshot.runs", 8, (item, path) => runOf(item, path, envelopeTick));
    if (new Set(runs.map((run) => run.id)).size !== runs.length) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.runs");
    }
    const ranks = arrayOf(value.displayRank, "snapshot.displayRank", 11, displayRankOf);
    if (new Set(ranks.map((entry) => entry.id)).size !== ranks.length
        || new Set(ranks.map((entry) => entry.rank)).size !== ranks.length
        || ranks.filter((entry) => entry.self).length > 1) {
        throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.displayRank");
    }
    const runsById = new Map(runs.map((run) => [run.id, run]));
    for (const snake of snakes) {
        if (snake.ai) continue;
        const run = runsById.get(snake.id);
        if (!run || (snake.magnetUntilTick ?? null) !== (run.magnetUntilTick ?? null)
            || (snake.magnetUntilTick !== null && run.state !== SnakeRunState.Active)) {
            throw new WireValidationError("MESSAGE_FIELD_RANGE", "snapshot.runs");
        }
    }
    return {
        roomEpochId,
        matchId,
        tick,
        envelopeTick,
        seq: finiteInteger(value.seq, "snapshot.seq", 1, Number.MAX_SAFE_INTEGER),
        snakes,
        foods,
        wrecks,
        tools,
        runs,
        displayRank: ranks,
    };
}

export const SnakeInput = defineC2S("c2s.snake.input", validateSnakeInput, { phases: [GamePhase.Playing], rateCost: 1 });
export const SnakeReliveDecision = defineC2S("c2s.snake.reliveDecision", validateReliveDecision, { phases: [GamePhase.Playing], rateCost: 2 });
export const SnakeEndRun = defineC2S("c2s.snake.endRun", validateEndRun, { phases: [GamePhase.Playing], rateCost: 2 });
export const SnakeBaselineRequest = defineC2S("c2s.snake.baselineRequest", validateBaselineRequest, { phases: [GamePhase.Playing], rateCost: 4 });

export const SnakeBaselineBegin = defineS2C("s2c.snake.baselineBegin", validateBaselineBegin);
export const SnakeBaselineChunk = defineS2C("s2c.snake.baselineChunk", validateBaselineChunk);
export const SnakeBaselineEnd = defineS2C("s2c.snake.baselineEnd", validateBaselineEnd);
export const SnakeDelta = defineS2C("s2c.snake.delta", validateDelta);
export const SnakeReliveOffered = defineS2C("s2c.snake.reliveOffered", validateReliveOffered);
export const SnakeReliveDecisionResult = defineS2C("s2c.snake.reliveDecisionResult", validateDecisionResult);
export const SnakeReliveResolved = defineS2C("s2c.snake.reliveResolved", validateReliveResolved);
export const SnakeRunFinalizing = defineS2C("s2c.snake.runFinalizing", validateRunFinalizing);
export const SnakeRunResult = defineS2C("s2c.snake.runResult", validateRunResult);
