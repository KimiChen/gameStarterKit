/**
 * S4-03 run 终局结算：**同步**算完全部奖励、一次替换进程内 profile、缓存结果，
 * 再用**一条** best-effort `HSET` 镜像所有变化字段。
 *
 * ⚠ 这里是 S3-02 里那条「⛔ 不合并 coinBalance」的延后点兑现处：终局是唯一同时持有
 * 钱包与 cosmetic/progression 最新值的时刻，所以合并成一条写是安全的；⛔ 不要退回各写各的。
 *
 * 去重键 `uid + roomEpochId + runId`（S4 文档）。重复终局直接返回缓存结果，
 * ⛔ 不重复发奖、不重复写 Redis。⚠ 只在进程内存——进程重启后去重与最近结果都会重置，这是登记在案的
 * demo 限制，不是待补实现。
 */

import {
    SNAKE_ACHIEVEMENTS,
    accumulateAchievement,
    achievementMetricOf,
    computeCoinReward,
    computeFragmentGrant,
    computeXpReward,
    derivedLevel,
    isQualifiedRun,
    levelUnlocksBetween,
    type SnakeRunStats,
} from "@game/shared/gameplays/snake/progression";
import { clientFor } from "../../../core/infra/redisRoute";
import {
    SNAKE_ACHIEVEMENT_KEYS,
    applyRunGrantToProfile,
    fullSnapshotOf,
    isProfileHydrated,
    type SnakeDemoFullProfile,
} from "./cosmeticProfile";
import { kSnakeUser } from "./keys";
import { demoCoinBalanceOf, grantDemoCoins, isDemoCoinBalanceHydrated } from "./lifecycle";

/** 冷档兜底的默认告警：点名 uid，⛔ 不静默——静默正是 F13 一路没被发现的原因。 */
const reportColdProfile = (uid: string): void => {
    console.error(
        `[snake] 结算跳过 Redis 写回：uid=${uid} 的进程内档案未被回灌（Redis 当时不可用？），`
        + "写回会用默认档覆盖玩家的皮肤/碎片/余额（F13）",
    );
};

export interface SnakeRunRewardInput {
    readonly uid: string;
    readonly roomEpochId: string;
    readonly runId: string;
    readonly endReason: string;
    readonly stats: SnakeRunStats;
}

export interface SnakeRunRewardResult {
    readonly runId: string;
    readonly qualified: boolean;
    readonly coinAmount: number;
    readonly coinBalanceAfter: number;
    readonly xpAmount: number;
    readonly xpAfter: number;
    readonly levelBefore: number;
    readonly levelAfter: number;
    readonly fragmentSkinId: number | null;
    readonly fragmentAmount: number;
    readonly achievementProgressAfter: Readonly<Record<string, number>>;
    readonly newlyUnlockedSkinIds: readonly number[];
}

export type SnakeRewardPersistence = (record: SnakeRewardPersistenceRecord) => Promise<void>;

export interface SnakeRewardPersistenceRecord {
    readonly uid: string;
    readonly coinBalance: number;
    readonly equippedSkinId: number;
    readonly ownedSkinIds: readonly number[];
    readonly fragmentBalances: Readonly<Record<string, number>>;
    readonly snakeXp: number;
    readonly achievementProgress: Readonly<Record<string, number>>;
}

/** 一条 `HSET` 写六项白名单字段（S5 验收口径）。⛔ 不写 run、结果、处理标记、请求 ID 或 `sId`。 */
const persistRewards: SnakeRewardPersistence = async (record): Promise<void> => {
    await clientFor(record.uid).hset(
        kSnakeUser(record.uid),
        "coinBalance", String(record.coinBalance),
        "equippedSkinId", String(record.equippedSkinId),
        "ownedSkinIds", JSON.stringify([...record.ownedSkinIds].sort((a, b) => a - b)),
        "fragmentBalances", JSON.stringify(record.fragmentBalances),
        "snakeXp", String(record.snakeXp),
        "achievementProgress", JSON.stringify(record.achievementProgress),
    );
};

/**
 * 结算镜像的环境解析，形态同 `resolveS2ReliveEconomy`。
 *
 * ⚠ `test` 环境返回 no-op：默认 persistence 会经 `clientFor` 真开 Redis 连接，而房间单测是纯内存
 * 套件——不隔离会让整个 server 测试挂起（实测踩过）。⛔ 不要把这条判据删掉当「多余的防御」。
 */
export function resolveRewardPersistence(
    injected: SnakeRewardPersistence | undefined,
    runtimeEnvironment: string | undefined,
): SnakeRewardPersistence | undefined {
    if (injected) return injected;
    const environment = runtimeEnvironment ?? process.env.NODE_ENV ?? "development";
    return environment === "test" ? async () => {} : undefined;
}

const processedRuns = new Map<string, SnakeRunRewardResult>();
const latestResultByUid = new Map<string, SnakeRunRewardResult>();

const runKey = (input: SnakeRunRewardInput): string =>
    `${input.uid}\u0000${input.roomEpochId}\u0000${input.runId}`;

export interface SnakeRewardOptions {
    readonly persistence?: SnakeRewardPersistence;
    readonly reportError?: (error: unknown) => void;
    /** 冷档兜底触发时的告警注入（测试用）。 */
    readonly reportColdProfile?: (uid: string) => void;
}

/**
 * 应用一次 run 终局奖励。**同一 `uid+roomEpochId+runId` 只应用一次**，重复调用返回缓存结果。
 *
 * ⚠ AI、假榜条目与 `displayRank` ⛔ 不进本路径——调用方只对真人 run 调用它。
 */
export function applyRunRewards(
    input: SnakeRunRewardInput,
    options: SnakeRewardOptions = {},
): SnakeRunRewardResult {
    const key = runKey(input);
    const cached = processedRuns.get(key);
    if (cached) return cached;

    const before = fullSnapshotOf(input.uid);
    const qualified = isQualifiedRun(input.stats, input.endReason);
    const coinAmount = computeCoinReward(input.stats, input.endReason);
    const xpAmount = computeXpReward(input.stats, input.endReason);
    const fragment = computeFragmentGrant(input.stats, input.endReason, before.ownedSkinIds);

    const xpAfter = before.xp + xpAmount;
    const levelBefore = derivedLevel(before.xp);
    const levelAfter = derivedLevel(xpAfter);

    // 成就进度只在合格 run 累计；达到门槛即解锁对应皮肤。
    const achievementProgressAfter: Record<string, number> = {};
    const achievementUnlocks: number[] = [];
    for (const achievement of SNAKE_ACHIEVEMENTS) {
        const mapKey = String(achievement.skinId);
        const previous = before.achievementProgress[mapKey] ?? 0;
        const gained = qualified ? achievementMetricOf(input.stats, achievement.metric) : 0;
        const next = accumulateAchievement(previous, gained, achievement.threshold);
        achievementProgressAfter[mapKey] = next;
        if (next >= achievement.threshold && !before.ownedSkinIds.includes(achievement.skinId)) {
            achievementUnlocks.push(achievement.skinId);
        }
    }

    const levelUnlocks = levelUnlocksBetween(levelBefore, levelAfter)
        .filter((skinId) => !before.ownedSkinIds.includes(skinId));
    const newlyUnlockedSkinIds = [...new Set([...levelUnlocks, ...achievementUnlocks])].sort((a, b) => a - b);

    // 一次同步替换 profile；⛔ 中途不得有半写状态。
    const after: SnakeDemoFullProfile = applyRunGrantToProfile(input.uid, {
        xpGained: xpAmount,
        newlyOwnedSkinIds: newlyUnlockedSkinIds,
        fragmentSkinId: fragment.skinId,
        fragmentAmount: fragment.amount,
        achievementProgressAfter,
    });
    const coinBalanceAfter = coinAmount > 0
        ? grantDemoCoins(input.uid, coinAmount)
        : demoCoinBalanceOf(input.uid);

    const result: SnakeRunRewardResult = Object.freeze({
        runId: input.runId,
        qualified,
        coinAmount,
        coinBalanceAfter,
        xpAmount,
        xpAfter: after.xp,
        levelBefore,
        levelAfter,
        fragmentSkinId: fragment.skinId,
        fragmentAmount: fragment.amount,
        achievementProgressAfter: Object.freeze({ ...after.achievementProgress }),
        newlyUnlockedSkinIds: Object.freeze(newlyUnlockedSkinIds),
    });
    processedRuns.set(key, result);
    latestResultByUid.set(input.uid, result);

    const persistence = options.persistence ?? persistRewards;
    const reportError = options.reportError
        ?? ((error: unknown) => console.warn("[snake] demo reward Redis mirror failed; result is kept", error));
    // ⚠ F13 兜底闸：那条六字段 HSET 是**全量覆盖**，一旦 profile / 钱包没被 Redis 回灌过，
    // 写回去的就是默认档——玩家的皮肤、碎片、余额会被本局结算抹平。⛔ 宁可这一局的奖励
    // 落不了盘，也不能拿默认档盖掉真实档。正常路径由 mode 的 onBeforeAdmission 在入房前
    // await 回灌保证走不到这里；走到了就是 Redis 当时不可用。
    const trustworthy = isProfileHydrated(input.uid) && isDemoCoinBalanceHydrated(input.uid);
    if (!trustworthy) {
        (options.reportColdProfile ?? reportColdProfile)(input.uid);
        return result;
    }
    void persistence({
        uid: input.uid,
        coinBalance: coinBalanceAfter,
        equippedSkinId: after.equippedSkinId,
        ownedSkinIds: after.ownedSkinIds,
        fragmentBalances: after.fragmentBalances,
        snakeXp: after.xp,
        achievementProgress: after.achievementProgress,
    }).catch(reportError);

    return result;
}

/** 断线后回到首页时展示用；⛔ 只在进程内，重启即丢。 */
export function latestRunResultOf(uid: string): SnakeRunRewardResult | undefined {
    return latestResultByUid.get(uid);
}

/** 诊断用：已处理 run 数（churn 泄漏闸）。 */
export function processedRunCount(): number {
    return processedRuns.size;
}

/** 测试 seam：清空去重与最近结果。⛔ 运行时不要调用。 */
export function __resetRunRewardsForTest(): void {
    processedRuns.clear();
    latestResultByUid.clear();
}

export { SNAKE_ACHIEVEMENT_KEYS };
