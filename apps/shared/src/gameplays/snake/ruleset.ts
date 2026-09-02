/**
 * snake-ruleset@1：Snake Off 全部数值与量化口径的双端单源（docs/snakeoff/03 §10）。
 *
 * 服务端权威模拟以本表为唯一数值来源；客户端只读必要表现值。
 * ⛔ 玩法数值不得散落成客户端/服务端魔法数（铁律 6 同款：公式/常量从本表导入）。
 *
 * 与源档案（`~/work/tanchishe/wegameVersion`，GameConstant.js）的数值对照与换算依据
 * 见 docs/snakeoff/03 与本仓 plan 的 Snake 实施方案 §1.4：源为横版 3264×1920 /
 * 60fps 帧驱动，本表为竖版 700×1500 / 服务端 20Hz fixed-step 收敛后的首轮定稿。
 */

/** 世界量化：round(x * 1000) / 1000（位置、速度积分和碰撞距离统一量化，03 §3.2）；
 *  并把 -0 归一成 0（确定性 hash 友好）。 */
export function quantizeSnake(value: number): number {
    const quantized = Math.round(value * 1000) / 1000;
    return Object.is(quantized, -0) ? 0 : quantized;
}

export const SNAKE_RULESET = Object.freeze({
    // ── 世界（竖版 1920×3264 = 原游戏 3264×1920 的竖版转置，面积相同；
    //    中心原点：x∈[-960,960]，y∈[-1632,1632]）────────────────────────
    //    用户拍板（2026-09-03）：按原游戏大小复原——03 文档的 700×1500 是
    //    4 人私房候选，已过时（drop-in 8 蛇 + AI 需要原尺寸的密度与游走空间）。
    worldWidth: 1920,
    worldHeight: 3264,

    // ── 时钟（GameRoom fixedStep 20Hz）─────────────────────────────────
    fixedStepMs: 50,
    countdownTicks: 60, // 开局 3s 倒计时
    matchTicks: 1800, // 正式计时 90s（限时计分制，用户拍板 2026-09-02）

    // ── 移动 ───────────────────────────────────────────────────────────
    baseSpeed: 160, // unit/s（源 4.5px/帧@60fps≈270px/s；竖版场地小，先收敛）
    boostMultiplier: 1.6, // 源 2.0，收敛手感
    maxTurnDegPerTick: 9, // 180°/s（源 10°/帧@60fps 为 600°/s，本表刻意放慢防瞬时掉头）

    // ── 长度与身体 ─────────────────────────────────────────────────────
    spawnLength: 30, // 与源 SNAKE_MIN_LENGTH=30 同量级
    maxBodyPoints: 512, // 每蛇身体点硬上限（⛔ 不继承源的 10,000）
    bodyWidth: 36, // 首版固定体宽（源随长度 1→2.8；变粗联动碰撞半径与渲染，列 v1.1）
    pointSpacing: 18, // 身体路径点采样间距 unit（源点距 2.25px ≈ 0.5×体宽/点 的同比例换算）
    initialPointCount: 10, // 出生长度对应的最少身体点

    // ── 加速 ───────────────────────────────────────────────────────────
    minBoostLength: 20,
    boostLengthCostPerSecond: 3, // 源为每 20 帧 -1 长度（≈3/s@60fps），同量级
    boostWreckEveryLength: 1, // 每消耗 1 长度在尾部掉 1 个 Wreck
    boostWreckValue: 1,

    // ── 食物 ───────────────────────────────────────────────────────────
    dotTarget: 300, // 复原源值（地图面积已与源相同，密度同步复原）
    dotGrowth: 1,
    dotScore: 1,
    dotRadius: 8, // 源 Dot size 16 的半径
    starTarget: 15, // 复原源值
    starGrowth: 5,
    starScore: 5,
    starRadius: 21, // 源 Star size 42 的半径
    foodSpawnMaxAttempts: 24, // 每槽位单 tick 位置尝试上限（不无限循环）
    foodReplenishPerTick: 4, // 每 tick 限补，防清屏后单帧尖峰

    // ── 残骸 ───────────────────────────────────────────────────────────
    wreckRoomCap: 240, // 全房硬上限
    wreckRadius: 11, // 源加速掉落 size 22 的半径
    deathDropRatio: 0.5, // floor((length - spawnLength) × ratio)
    maxDeathDrops: 24, // 单次死亡最多掉落数（剩余价值聚合，不为每个身体点建对象）

    // ── 碰撞（半径倍率 × 体宽；源 BORDER 0.4 / SNAKE 0.5 / EAT 1.6）─────
    wallCollisionFactor: 0.4,
    snakeCollisionFactor: 0.5,
    eatDistanceFactor: 1.6,

    // ── 出生 / 死亡 / 复活（拍板：2s 复活保留分数）─────────────────────
    spawnProtectionTicks: 30, // 1.5s（源 3s，竖版小场收敛）
    respawnDelayTicks: 40, // 2s
    spawnSafeDistance: 100, // 出生点距现存蛇头与墙的最小距离（源 SAFE_DISTANCE=100）

    // ── AI（服务端权威；全部随机走 seeded 子流，⛔ Math.random/Date.now）
    aiFillTarget: 8, // 真人 + AI 的总蛇数目标（= roster.max）
    aiWallSenseFactor: 2, // × 体宽（源 AI 感应因子 2/4/8）
    aiSnakeSenseFactor: 4,
    aiFoodSenseFactor: 8,
    aiWanderTurnChancePerTick: 0.01, // 1%/tick 随机转向
    aiWanderMaxTurnDeg: 45, // 随机游走单次最大偏转
    aiBoostChancePerTick: 0.005,
    aiBoostTicks: 20, // 随机加速持续 1s

    // ── 快照（10Hz 有界完整快照；03 §2.3/04 §6.2）──────────────────────
    snapshotEveryTicks: 2,
    snapshotMaxSnakes: 8,
    snapshotMaxFoods: 315, // dotTarget + starTarget
    snapshotMaxWrecks: 240,
    snapshotMaxPointsPerSnake: 512,
    snapshotMaxBytes: 65536, // 64 KiB 预算；达到预算降采样而非截断关键头部
} as const);

export type SnakeRuleset = typeof SNAKE_RULESET;
