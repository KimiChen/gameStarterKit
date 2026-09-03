/** Snake Endless V2 HUD / 个人 run ViewModel（纯 Logic）。 */
import {
    SnakeRunState,
    type ISnakeReliveDecisionResult,
    type ISnakeReliveOffered,
    type ISnakeReliveResolved,
    type ISnakeRoomState,
    type ISnakeRunFinalizing,
    type ISnakeRunResultV1,
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
    readonly reliveIndex: number;
    readonly relivesRemaining: number;
    readonly decisionSeconds: number;
    readonly score: number;
    readonly length: number;
    readonly testEconomy: true;
    readonly processing: boolean;
}

export interface SnakePersonalResultModel {
    readonly runId: string;
    readonly endReason: ISnakeRunResultV1["endReason"];
    readonly confirmedThroughTick: number;
    readonly rewardStatus: "notEnabled";
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
        reliveIndex: player.reliveIndex,
        relivesRemaining: Math.max(0, 6 - player.reliveIndex),
        decisionSeconds: player.runState === SnakeRunState.PendingRelive
            ? Math.ceil(Math.max(0, player.decisionDeadlineTick - serverTick) / 20) : 0,
        score: player.score,
        length: player.length,
        testEconomy: true,
        processing: player.runState !== SnakeRunState.PendingRelive,
    };
}

export function deriveSnakePersonalResult(message: ISnakeRunResultV1): SnakePersonalResultModel {
    return {
        runId: message.runId,
        endReason: message.endReason,
        confirmedThroughTick: message.confirmedThroughTick,
        // S2 的 renderer 只接受未发布结果；真实奖励状态由后续阶段启用。
        rewardStatus: "notEnabled",
    };
}
