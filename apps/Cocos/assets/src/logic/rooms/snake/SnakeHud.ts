/** Snake Endless V2 HUD / 个人 run ViewModel（纯 Logic）。 */
import {
    SnakeRunState,
    type ISnakeReliveDecisionResult,
    type ISnakeReliveOffered,
    type ISnakeReliveResolved,
    type ISnakeRoomState,
    type ISnakeRunFinalizing,
    type ISnakeRunResultV2,
    type SnakeRunStateType,
    type SnakeDeathCauseType,
} from "../../../shared/index";
import type { SnakeRenderFrame } from "./SnakeSnapshotBuffer";

export interface SnakeRankViewEntry {
    readonly rank: number;
    readonly id: string;
    readonly name: string;
    readonly score: number;
    readonly length: number;
    readonly isSelf: boolean;
    readonly isAi: boolean;
}

export interface SnakeHudModel {
    /** 只表示首次 3 秒准备；Playing 后始终 0，绝不承载房级剩余时长。 */
    readonly countdownSeconds: number;
    readonly inStartCountdown: boolean;
    readonly hasRoomDeadline: false;
    readonly entries: readonly SnakeRankViewEntry[];
    readonly selfAlive: boolean;
    readonly selfBoost: boolean;
    readonly runState: SnakeRunStateType | null;
    readonly magnetRemainingTicks: number;
    readonly protectionRemainingTicks: number;
}

export interface SnakeReliveViewModel {
    readonly runId: string;
    readonly deathSeq: number;
    readonly stateVersion: number;
    readonly deathCause: SnakeDeathCauseType;
    readonly coinCost: number;
    readonly coinBalance: number;
    readonly reliveIndex: number;
    readonly relivesRemaining: number;
    readonly decisionSeconds: number;
    readonly score: number;
    readonly length: number;
    readonly processing: boolean;
}

/** 结果页可渲染投影。⚠ 只表达最终值，⛔ View 不再自己算任何奖励。 */
export interface SnakePersonalResultModel {
    readonly runId: string;
    readonly endReason: ISnakeRunResultV2["endReason"];
    readonly confirmedThroughTick: number;
    readonly rewardStatus: ISnakeRunResultV2["rewardStatus"];
    readonly qualified: boolean;
    readonly stats: ISnakeRunResultV2["stats"];
    readonly coin: ISnakeRunResultV2["coin"];
    readonly progression: ISnakeRunResultV2["progression"];
    /** 已经翻译好的展示行（含奖励与解锁），View 逐行画即可。 */
    readonly lines: readonly string[];
}

export type SnakeRunNotice = ISnakeReliveOffered | ISnakeReliveDecisionResult
    | ISnakeReliveResolved | ISnakeRunFinalizing;

export function deriveSnakeRanking(frame: SnakeRenderFrame): readonly SnakeRankViewEntry[] {
    return frame.displayRank.map((entry) => ({
        rank: entry.rank,
        id: entry.id,
        name: entry.name,
        score: entry.score,
        length: entry.length,
        isSelf: entry.self,
        isAi: entry.ai,
    }));
}

export function deriveSnakeHud(
    frame: SnakeRenderFrame,
    state: ISnakeRoomState | null,
    selfId: string | null,
): SnakeHudModel {
    const tick = frame.envelopeTick;
    const countdownEndTick = state?.countdownEndTick ?? 0;
    const inStartCountdown = countdownEndTick > 0 && tick <= countdownEndTick;
    const selfSnake = selfId ? frame.snakes.find((snake) => snake.id === selfId) : undefined;
    const selfPlayer = state && selfId ? state.players.get(selfId) : undefined;
    return {
        countdownSeconds: inStartCountdown ? Math.ceil((countdownEndTick - tick + 1) / 20) : 0,
        inStartCountdown,
        hasRoomDeadline: false,
        entries: deriveSnakeRanking(frame),
        selfAlive: selfSnake?.alive ?? false,
        selfBoost: selfSnake?.boost ?? false,
        runState: selfPlayer?.runState ?? null,
        magnetRemainingTicks: selfSnake?.alive && selfPlayer?.runState === SnakeRunState.Active
            && (selfSnake.magnetUntilTick ?? 0) > tick ? (selfSnake.magnetUntilTick ?? 0) - tick : 0,
        protectionRemainingTicks: selfSnake?.alive && (selfSnake.protectUntilTick ?? 0) > tick
            ? (selfSnake.protectUntilTick ?? 0) - tick : 0,
    };
}

export function deriveSnakeRelive(
    state: ISnakeRoomState | null,
    selfId: string | null,
    serverTick: number,
): SnakeReliveViewModel | null {
    const player = state && selfId ? state.players.get(selfId) : undefined;
    if (!player || (player.runState !== SnakeRunState.PendingRelive
        && player.runState !== SnakeRunState.ReliveSpawning
        && player.runState !== SnakeRunState.ReliveCommitting
        && player.runState !== SnakeRunState.ReliveReady)) return null;
    return {
        runId: player.runId,
        deathSeq: player.deathSeq,
        stateVersion: player.stateVersion,
        deathCause: player.deathCause,
        coinCost: player.coinCost,
        coinBalance: player.coinBalance,
        reliveIndex: player.reliveIndex,
        relivesRemaining: Math.max(0, 6 - player.reliveIndex),
        decisionSeconds: player.runState === SnakeRunState.PendingRelive
            ? Math.ceil(Math.max(0, player.decisionDeadlineTick - serverTick) / 20) : 0,
        score: player.score,
        length: player.length,
        processing: player.runState !== SnakeRunState.PendingRelive,
    };
}

/** 20 Hz → 秒（只用于展示；⛔ 不参与任何判定）。 */
function secondsOf(ticks: number): number {
    return Math.floor(ticks / 20);
}

export function deriveSnakePersonalResult(message: ISnakeRunResultV2): SnakePersonalResultModel {
    const { stats, coin, progression } = message;
    const lines: string[] = [
        `本局：${secondsOf(stats.activeTicks)} 秒 · ${stats.score} 分 · ${stats.kills} 击杀`,
        `最长 ${stats.maxLength} · 星星 ${stats.starCollected} · 磁铁 ${stats.magnetCollected}`,
    ];
    if (stats.relivesUsed > 0) lines.push(`复活 ${stats.relivesUsed} 次，消耗 ${stats.reliveCoinSpent} 金币`);
    if (!message.qualified) {
        // 不合格 run 仍展示统计，但要说清为什么没有奖励，⛔ 不静默显示 0。
        lines.push("本局不计奖励（时长不足或无有效操作）");
        return { runId: message.runId, endReason: message.endReason, confirmedThroughTick: message.confirmedThroughTick,
            rewardStatus: message.rewardStatus, qualified: false, stats, coin, progression, lines };
    }
    lines.push(`金币 +${coin.amount}（余额 ${coin.balanceAfter}）`);
    lines.push(progression.levelAfter > progression.levelBefore
        ? `经验 +${progression.xpAmount}，升到 ${progression.levelAfter} 级`
        : `经验 +${progression.xpAmount}（${progression.xpAfter}，${progression.levelAfter} 级）`);
    if (progression.fragmentSkinId !== null && progression.fragmentAmount > 0) {
        lines.push(`皮肤 ${progression.fragmentSkinId} 碎片 +${progression.fragmentAmount}`);
    }
    if (progression.newlyUnlockedSkinIds.length > 0) {
        lines.push(`新解锁皮肤：${progression.newlyUnlockedSkinIds.join("、")}`);
    }
    return { runId: message.runId, endReason: message.endReason, confirmedThroughTick: message.confirmedThroughTick,
        rewardStatus: message.rewardStatus, qualified: true, stats, coin, progression, lines };
}
