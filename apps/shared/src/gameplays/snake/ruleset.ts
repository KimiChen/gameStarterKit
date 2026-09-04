/**
 * snake-ruleset@2：Snake 新版无尽 V2 的双端单源。
 *
 * 这里仅包含纯 TypeScript/ES 标准库值与纯函数。配置来源、地图覆盖与五层 hash 的
 * 审计证据见 docs/s/s0-replication-baseline.md 与 docs/s/s2-battle-and-endless-lifecycle.md。
 */

/** 世界量化：round(x * 1000) / 1000，并把 -0 归一成 0。 */
export function quantizeSnake(value: number): number {
    const quantized = Math.round(value * 1000) / 1000;
    return Object.is(quantized, -0) ? 0 : quantized;
}

/** [0, 360) 角度归一化。 */
export function normalizeSnakeDegrees(deg: number): number {
    const wrapped = deg % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** 方向角到 0.001 量化单位向量；Star、磁铁、蛇移动共用，禁止服务端复制公式。 */
export function directionVector(deg: number): { readonly x: number; readonly y: number } {
    const rad = (deg * Math.PI) / 180;
    return { x: quantizeSnake(Math.cos(rad)), y: quantizeSnake(Math.sin(rad)) };
}

export interface SnakePointStep {
    readonly max_length: number;
    readonly step_length: number;
}

/** 原作 V2 的 71 项有序 point_step_config（含 18900 重复端点及三个兼容尾段）。 */
function buildPointSteps(): readonly SnakePointStep[] {
    const result: SnakePointStep[] = [];
    for (let n = 1; n <= 63; n += 1) result.push(Object.freeze({ max_length: 300 * n, step_length: n + 2 }));
    result.push(Object.freeze({ max_length: 18900, step_length: 66 }));
    for (let n = 64; n <= 67; n += 1) result.push(Object.freeze({ max_length: 300 * n, step_length: n + 3 }));
    result.push(
        Object.freeze({ max_length: 100000, step_length: 50 }),
        Object.freeze({ max_length: 200000, step_length: 100 }),
        Object.freeze({ max_length: 300000, step_length: 100 }),
    );
    return Object.freeze(result);
}

export const SNAKE_POINT_STEP_CONFIG = buildPointSteps();

/** 原作逐段覆盖累计后向下取整，再乘 STEP_POINT_COUNT=2。 */
export function snakePathPointCount(length: number): number {
    if (!Number.isFinite(length) || length <= 0) return 0;
    let previousMax = 0;
    let accumulated = 0;
    for (const segment of SNAKE_POINT_STEP_CONFIG) {
        const covered = Math.max(0, Math.min(length, segment.max_length) - previousMax);
        accumulated += covered / segment.step_length;
        previousMax = Math.max(previousMax, segment.max_length);
        if (length <= segment.max_length) break;
    }
    return Math.floor(accumulated) * 2;
}

export function snakeCameraScale(length: number): number {
    const clamped = Math.max(0, Math.min(SNAKE_RULESET.maxLength, length));
    return Math.max(
        SNAKE_RULESET.cameraMinScale,
        SNAKE_RULESET.cameraInitScale
            - clamped * (SNAKE_RULESET.cameraInitScale - SNAKE_RULESET.cameraMinScale)
            / SNAKE_RULESET.cameraScaleSnakeMaxLength,
    );
}

export function snakeBodyScale(length: number): number {
    const clamped = Math.max(0, Math.min(SNAKE_RULESET.maxLength, length));
    return quantizeSnake(SNAKE_RULESET.bodyInitScale
        + clamped * (SNAKE_RULESET.bodyMaxScale - SNAKE_RULESET.bodyInitScale)
        / SNAKE_RULESET.bodyScaleSnakeMaxLength);
}

/** 房级结束唯一合法判断；Endless 的 endTick 为 null，永远不会因 world tick 完成。 */
export function snakeDeadlineDone(
    meta: { readonly hasDeadline: boolean; readonly endTick: number | null },
    tick: number,
): boolean {
    return meta.hasDeadline && meta.endTick !== null && tick >= meta.endTick;
}

/**
 * 320/3 unit/s @20Hz 的确定性标量步长。输入/输出都是 milli-unit；余数永不因变向或反弹清零。
 * 从 remainder=0 起输出 5333, 5333, 5334 循环。
 */
export function nextSnakeMotionStepMilli(remainder: number): {
    readonly stepMilli: number;
    readonly remainder: number;
} {
    if (!Number.isSafeInteger(remainder) || remainder < 0 || remainder >= 3) {
        throw new RangeError("snake motion remainder must be an integer in [0, 3)");
    }
    const numerator = remainder + SNAKE_RULESET.motionDistanceMilliNumerator;
    return { stepMilli: Math.floor(numerator / 3), remainder: numerator % 3 };
}

/** micro-unit 内部坐标投影到 wire 的 0.001 unit。 */
export function snakeMicroToWire(valueMicro: number): number {
    if (!Number.isSafeInteger(valueMicro)) throw new RangeError("snake micro position must be a safe integer");
    return quantizeSnake(valueMicro / 1_000_000);
}

/** 五层运行时身份；四个 S0 层 hash 不变，online adaptation 在 S2 升为 v2。 */
export const SNAKE_ENDLESS_CONFIG = Object.freeze({
    configId: "newEndlessPortraitV2Map4096TotalTime0",
    battlefieldConfigId: "newEndlessPortraitV2Map4096",
    lifecycleConfigId: "sourceEndlessTotalTime0",
    reliveFlowConfigId: "sourceEndlessReliveFlow",
    relivePolicyId: "onlineCoinRelive5V1",
    onlineAdaptationId: "onlineEndlessDropInV2",
    layerVersions: Object.freeze({ battlefield: 1, lifecycle: 1, reliveFlow: 1, relivePolicy: 1, onlineAdaptation: 2 }),
    layerHashes: Object.freeze({
        battlefield: "6750cb34f7b454902a0263b17ddd9745942eb511b56e1510aed5a886ea72a07e",
        lifecycle: "efc56090b06e92c5ba0027330b7719d6f857c5709045ddb850d64a46e551b477",
        reliveFlow: "9b33262d53fd0de440a8adc6ca6bf7c09493d32d0b0034dd20677c10915eb865",
        relivePolicy: "e668f382989f593802dc6ab608524811a0fb39756d70a5afe9e6ce2737bbc646",
        onlineAdaptation: "3a61016ceb2e9fc1ffe8a342ed5b174fabec1cff4581346a8224f97a2b19a53f",
    }),
    configHash: "2c74f005c0375f98a07250c4c14ede9d0075a238d9f355ff6f07c9935d97e8e7",
    legacyS0ConfigHash: "2319d173326602d85fc4c6a85f5b4ca16452cd778f0794896398294a1d5f87e2",
    totalTime: 0,
    matchDurationTicks: 0,
    hasDeadline: false,
    endTick: null,
} as const);

/** onlineEndlessDropInV2@2 的规范 payload；server 测试会按 S0 canonical JSON 算法重算 hash。 */
export const SNAKE_ONLINE_ADAPTATION_V2 = Object.freeze({
    aiPolicy: "16 source K1 level-0 AI at one human; level-401 AI yields as humans join, leaving 9 AI at eight humans",
    disposal: "last human run frozen and player leaves; Colyseus autoDispose invokes mode onDispose",
    humanCapacity: 8,
    id: "onlineEndlessDropInV2",
    playingJoinAllowed: true,
    prepareTicks: 60,
    roomSettlement: "none for ordinary Endless time progression",
    runSettlement: "individual",
    startPolicy: "first human starts world",
    steadyActiveSnakeCount: 17,
    version: 2,
    motion: Object.freeze({
        fixedStepHz: 20,
        speedNumeratorUnitsPerSecond: 320,
        speedDenominator: 3,
        distanceMilliNumeratorPerTick: 16000,
        distanceMilliDenominator: 3,
        distanceMilliSequence: Object.freeze([5333, 5333, 5334]),
        directionHoldTicks: Object.freeze({ minInclusive: 34, maxInclusive: 67 }),
        drawOrder: Object.freeze(["headingDeg", "holdTicks"]),
        starStreamPrefix: "snake.motion.star:",
        magnetStreamPrefix: "snake.motion.magnet:",
        starRadius: 21,
        magnetRadius: 35,
        phaseOrder: Object.freeze([
            "trigger-from-previous-committed-run-snapshot",
            "world-entity-motion",
            "snake-motion",
            "collisions-and-pickups",
        ]),
    }),
    magnet: Object.freeze({
        toolId: 10001,
        unconditionalWaveTicks: Object.freeze([300, 1200, 3000]),
        recurringFirstTick: 6000,
        recurringEveryTicks: 3000,
        perWaveCount: 10,
        maxAlive: 10,
        existTicks: 400,
        effectTicks: 160,
        extraPickupRadius: 86.4,
        eligibleHumanRunStates: Object.freeze([
            "active", "deadPresentation", "reliveOffering", "pendingRelive",
            "reliveSpawning", "reliveCommitting", "reliveReady",
        ]),
        lengthExclusiveMax: 50000,
        skipDoesNotConsumeEntityIdOrRng: true,
        skippedWavesBackfilled: false,
    }),
} as const);

/** 五层按稳定顺序进入组合 hash 的规范清单；hash 算法为 S0 的递归 key 排序 JSON + LF。 */
export const SNAKE_ENDLESS_LAYER_MANIFEST = Object.freeze({
    configId: SNAKE_ENDLESS_CONFIG.configId,
    layers: Object.freeze([
        Object.freeze({
            id: SNAKE_ENDLESS_CONFIG.battlefieldConfigId,
            version: SNAKE_ENDLESS_CONFIG.layerVersions.battlefield,
            sha256: SNAKE_ENDLESS_CONFIG.layerHashes.battlefield,
        }),
        Object.freeze({
            id: SNAKE_ENDLESS_CONFIG.lifecycleConfigId,
            version: SNAKE_ENDLESS_CONFIG.layerVersions.lifecycle,
            sha256: SNAKE_ENDLESS_CONFIG.layerHashes.lifecycle,
        }),
        Object.freeze({
            id: SNAKE_ENDLESS_CONFIG.reliveFlowConfigId,
            version: SNAKE_ENDLESS_CONFIG.layerVersions.reliveFlow,
            sha256: SNAKE_ENDLESS_CONFIG.layerHashes.reliveFlow,
        }),
        Object.freeze({
            id: SNAKE_ENDLESS_CONFIG.relivePolicyId,
            version: SNAKE_ENDLESS_CONFIG.layerVersions.relivePolicy,
            sha256: SNAKE_ENDLESS_CONFIG.layerHashes.relivePolicy,
        }),
        Object.freeze({
            id: SNAKE_ENDLESS_CONFIG.onlineAdaptationId,
            version: SNAKE_ENDLESS_CONFIG.layerVersions.onlineAdaptation,
            sha256: SNAKE_ENDLESS_CONFIG.layerHashes.onlineAdaptation,
        }),
    ]),
} as const);

export const SNAKE_AI_LINEUP = Object.freeze([
    Object.freeze({ level: 401, count: 8 }),
    Object.freeze({ level: 402, count: 4 }),
    Object.freeze({ level: 403, count: 2 }),
    Object.freeze({ level: 404, count: 2 }),
] as const);

export const SNAKE_RELIVE_COIN_COSTS = Object.freeze([100, 200, 300, 300, 300] as const);

export const SNAKE_MAGNET_ELIGIBLE_RUN_STATES = Object.freeze([
    "active", "deadPresentation", "reliveOffering", "pendingRelive",
    "reliveSpawning", "reliveCommitting", "reliveReady",
] as const);

export const SNAKE_RULESET = Object.freeze({
    worldWidth: 4096,
    worldHeight: 4096,
    mapMargin: 16,
    visualGridSpacing: 32,
    broadphaseGridCell: 150,
    fixedStepMs: 50,
    countdownTicks: 60,
    matchTicks: 0,
    totalTime: 0,
    baseSpeed: 160,
    boostMultiplier: 2,
    maxTurnDegPerTick: 9,
    spawnLength: 80,
    maxLength: 100000,
    bodyWidth: 36,
    bodyInitScale: 1,
    bodyMaxScale: 2.8,
    bodyScaleSnakeMaxLength: 100000,
    cameraInitScale: 1.3,
    cameraMinScale: 0.6,
    cameraScaleSnakeMaxLength: 100000,
    maxBodyPoints: 5186,
    initialPointCount: 52,
    pointSpacing: 8,
    minBoostLength: 20,
    boostLengthCostPerSecond: 3,
    boostWreckEveryLength: 1,
    boostWreckValue: 1,
    dotTarget: 1000,
    dotGrowth: 1,
    dotScore: 1,
    dotRadius: 8,
    starTarget: 30,
    starGrowth: 10,
    starScore: 10,
    starRadius: 21,
    foodSpawnMaxAttempts: 24,
    foodReplenishPerTick: 32,
    motionDistanceMilliNumerator: 16000,
    motionDistanceDenominator: 3,
    motionHoldMinTicks: 34,
    motionHoldMaxExclusive: 68,
    magnetToolId: 10001,
    magnetRadius: 35,
    magnetWaveCount: 10,
    magnetMaxAlive: 10,
    magnetExpireTicks: 400,
    magnetEffectTicks: 160,
    magnetExtraPickupRadius: 86.4,
    magnetFirstWaveTick: 300,
    magnetSecondWaveTick: 1200,
    magnetThirdWaveTick: 3000,
    magnetRecurringFirstTick: 6000,
    magnetRecurringTicks: 3000,
    magnetGateMaxLengthExclusive: 50000,
    wreckRoomCap: 1024,
    wreckRadius: 11,
    aiDeathWreckScoreExponent: 0.8,
    aiDeathWreckScoreMultiplier: 2,
    aiDeathWreckMinValue: 3,
    wallCollisionFactor: 0.4,
    snakeCollisionFactor: 0.5,
    eatDistanceFactor: 1.6,
    spawnProtectionTicks: 30,
    humanDeathPresentationTicks: 4,
    aiRespawnDelayTicks: 40,
    reliveDecisionTicks: 100,
    reliveSpawnSearchTicks: 20,
    reliveProtectionTicks: 60,
    maxSuccessfulRelives: 5,
    spawnSafeDistance: 100,
    aiFillTarget: 17,
    fakeSnakeCount: 86,
    fakeSnakeResetRatePermille: 20,
    fakeSnakeResetScore: 80,
    fakeSnakeInitMin: 100,
    fakeSnakeInitMaxExclusive: 50001,
    fakeSnakeIncrementMin: 10,
    fakeSnakeIncrementMaxExclusive: 101,
    aiWallSenseFactor: 2,
    aiSnakeSenseFactor: 4,
    aiFoodSenseFactor: 8,
    aiWanderTurnChancePerTick: 0.01,
    aiWanderMaxTurnDeg: 45,
    aiBoostChancePerTick: 0.005,
    aiBoostTicks: 20,
    snapshotEveryTicks: 2,
    snapshotMaxSnakes: 17,
    snapshotMaxFoods: 1030,
    snapshotMaxTools: 10,
    snapshotMaxWrecks: 1024,
    snapshotMaxPointsPerSnake: 5186,
    snapshotMaxPointsTotal: 88162,
    snapshotChunkItems: 128,
    snapshotMaxChunks: 1024,
    snapshotMaxBytes: 4 * 1024 * 1024,
} as const);

/** 保留完整数值键集但放宽数字字面量，供确定性测试注入小型世界。 */
export type SnakeRuleset = Readonly<{ [Key in keyof typeof SNAKE_RULESET]: number }>;

// ── Snake 自有 wire 枚举（state.json 以 enumSource:"gameplay" 引用；桶导出保持 @game/shared 面不变） ──

/** Snake Endless 个人 run 状态；Schema 与 typed message 共用，禁止客户端自造分支。 */
export const SnakeRunState = {
    Preparing: "preparing",
    Cancelled: "cancelled",
    Active: "active",
    DeadPresentation: "deadPresentation",
    ReliveOffering: "reliveOffering",
    PendingRelive: "pendingRelive",
    ReliveSpawning: "reliveSpawning",
    ReliveCommitting: "reliveCommitting",
    ReliveReady: "reliveReady",
    Finalizing: "finalizing",
    Finalized: "finalized",
} as const;

export type SnakeRunStateType = (typeof SnakeRunState)[keyof typeof SnakeRunState];

/** 当前生命的权威死亡原因；仅用于死亡演出/复活窗，不替代 run 终局原因。 */
export const SnakeDeathCause = {
    None: "",
    Wall: "wall",
    Collision: "collision",
    Forced: "forced",
} as const;

export type SnakeDeathCauseType = (typeof SnakeDeathCause)[keyof typeof SnakeDeathCause];

export const SnakeRunEndReason = {
    None: "",
    ExplicitExit: "explicitExit",
    DisconnectTimeout: "disconnectTimeout",
    SessionReplaced: "sessionReplaced",
    ModerationKick: "moderationKick",
    ReliveDeclined: "reliveDeclined",
    ReliveTimeout: "reliveTimeout",
    DeathNoOffer: "deathNoOffer",
    ReliveSpawnFailed: "reliveSpawnFailed",
    ReliveSystemFailed: "reliveSystemFailed",
    ForcedDeath: "forcedDeath",
    Escape: "escape",
    ServerDrain: "serverDrain",
    RoomFault: "roomFault",
} as const;

export type SnakeRunEndReasonType = (typeof SnakeRunEndReason)[keyof typeof SnakeRunEndReason];
export type SnakeTerminalEndReasonType = Exclude<SnakeRunEndReasonType, "">;

export const SnakeReliveReceiptState = {
    None: "none",
    Processing: "processing",
    Charged: "charged",
    Applying: "applying",
    Applied: "applied",
    Activated: "activated",
    Refunding: "refunding",
    Refunded: "refunded",
} as const;

export type SnakeReliveReceiptStateType =
    (typeof SnakeReliveReceiptState)[keyof typeof SnakeReliveReceiptState];

export const SnakeRewardStatus = {
    NotEnabled: "notEnabled",
    Pending: "pending",
    Applied: "applied",
    Dead: "dead",
} as const;

export type SnakeRewardStatusType = (typeof SnakeRewardStatus)[keyof typeof SnakeRewardStatus];
