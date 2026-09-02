/**
 * Snake HUD/结算的纯派生逻辑（docs/snakeoff/04 §6、07 §6；logic 层，⛔ 不 import
 * cc/fairygui/net——可无头测试）。输入是世界快照帧 + 权威 state 摘要，输出是
 * 渲染无关的视图模型。
 */
import type { ISnakeRoomState } from "../../../shared/index";
import type { SnakeRenderFrame } from "./SnakeSnapshotBuffer";

/** 排名条目（HUD 与结算共用）。 */
export interface SnakeRankViewEntry {
    readonly rank: number;
    readonly id: string;
    readonly name: string;
    readonly score: number;
    readonly killCount: number;
    readonly deathCount: number;
    readonly isSelf: boolean;
    readonly isAi: boolean;
}

/** 战斗 HUD 视图模型。 */
export interface SnakeHudModel {
    /** 倒计时显示秒（整数）；倒计时窗口内为开局倒计时。 */
    readonly countdownSeconds: number;
    readonly inStartCountdown: boolean;
    readonly entries: readonly SnakeRankViewEntry[];
    readonly selfAlive: boolean;
    readonly selfBoost: boolean;
    readonly selfRespawnSeconds: number; // 0 = 不在复活等待
}

/** 排名：分数↓ → 击杀↓ → 死亡↑ → id 序（与服务端 comparator 同优先级的展示序）。 */
export function deriveSnakeRanking(
    frame: SnakeRenderFrame,
    state: ISnakeRoomState | null,
    selfId: string | null,
): readonly SnakeRankViewEntry[] {
    const killOf = new Map<string, { kill: number; death: number }>();
    if (state) {
        state.players.forEach((player, sessionId) => {
            killOf.set(sessionId, { kill: player.killCount, death: player.deathCount });
        });
    }
    const sorted = [...frame.snakes].sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        const ka = killOf.get(a.id)?.kill ?? 0;
        const kb = killOf.get(b.id)?.kill ?? 0;
        if (ka !== kb) return kb - ka;
        const da = killOf.get(a.id)?.death ?? 0;
        const db = killOf.get(b.id)?.death ?? 0;
        if (da !== db) return da - db;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted.map((snake, index) => ({
        rank: index + 1,
        id: snake.id,
        name: snake.name,
        score: snake.score,
        killCount: killOf.get(snake.id)?.kill ?? 0,
        deathCount: killOf.get(snake.id)?.death ?? 0,
        isSelf: snake.id === selfId,
        isAi: snake.ai,
    }));
}

/** HUD 派生：倒计时（tick 驱动，⛔ 不用本地时钟）+ 排名 + 自身状态。 */
export function deriveSnakeHud(
    frame: SnakeRenderFrame,
    state: ISnakeRoomState | null,
    selfId: string | null,
): SnakeHudModel {
    const endTick = state?.endTick ?? 0;
    const countdownEndTick = state?.countdownEndTick ?? 0;
    const tick = frame.tick;
    const inStartCountdown = countdownEndTick > 0 && tick <= countdownEndTick;
    const remainingTicks = inStartCountdown
        ? countdownEndTick - tick + 1
        : Math.max(0, endTick - tick);
    const self = selfId ? frame.snakes.find((snake) => snake.id === selfId) : undefined;
    const selfPlayer = state && selfId ? state.players.get(selfId) : undefined;
    const respawnTicks = selfPlayer && selfPlayer.respawnTick > 0
        ? Math.max(0, selfPlayer.respawnTick - tick)
        : 0;
    return {
        countdownSeconds: Math.ceil(remainingTicks / 20),
        inStartCountdown,
        entries: deriveSnakeRanking(frame, state, selfId),
        selfAlive: self?.alive ?? false,
        selfBoost: self?.boost ?? false,
        selfRespawnSeconds: Math.ceil(respawnTicks / 20),
    };
}

/** 结算页模型：到 Settle 后冻结的排名 + 自己的条目。 */
export interface SnakeSettleModel {
    readonly entries: readonly SnakeRankViewEntry[];
    readonly selfEntry: SnakeRankViewEntry | null;
    readonly winnerName: string | null;
}

export function deriveSnakeSettle(
    frame: SnakeRenderFrame,
    state: ISnakeRoomState | null,
    selfId: string | null,
): SnakeSettleModel {
    const entries = deriveSnakeRanking(frame, state, selfId);
    const selfEntry = entries.find((entry) => entry.isSelf) ?? null;
    const winner = state && state.winnerId
        ? entries.find((entry) => entry.id === state.winnerId) ?? null
        : (entries[0] ?? null);
    return { entries, selfEntry, winnerName: winner?.name ?? null };
}
