import type { ReadonlyBean } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import type { IGameDemoSeason } from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo'
import type { GameDemoSeason } from '../bean/GameDemoSeason'

type SeasonView = GameDemoSeason | ReadonlyBean<GameDemoSeason>

interface RankedScore {
    readonly uid: number
    readonly score: number
    readonly sequence: number
}

/**
 * 炼丹冲榜：10 分钟一期，截止后等待宽限期收齐在途积分再定榜，前三名经可靠队列发邮件，
 * 结算 5 秒后开启下一期。所有写入都在活动串行组内执行。
 */
export class GameDemoLeaderboard {
    static open(season: GameDemoSeason, number: number, now: number): void {
        season.number = number
        season.phase = 'running'
        season.startedAt = now
        season.endsAt = now + GAME_DEMO_CONFIG.seasonDurationMs
        season.settledAt = 0
        season.scoreSeq = 0
        season.rewardedCount = 0
        season.scores!.clear()
        season.applied!.clear()
        season.rewards!.clear()
    }

    /** 只计入本期窗口内提交的批次；同一批次重复投递返回 false。 */
    static applyScore(season: GameDemoSeason, uid: number, batchId: number, score: number, at: number): boolean {
        if (!season.number || season.phase === 'settled') return false
        if (at < season.startedAt || at >= season.endsAt || score < 1) return false
        const key = `${uid}:${batchId}`
        if (season.applied!.has(key)) return false
        season.applied!.set(key, 1)
        const prior = season.scores!.get(uid)
        season.scores!.set(uid, { uid, score: (prior?.score ?? 0) + score, sequence: ++season.scoreSeq })
        return true
    }

    /** 推进一期的状态机；返回是否有变化。 */
    static tick(season: GameDemoSeason, now: number): boolean {
        if (!season.number) {
            this.open(season, 1, now)
            return true
        }
        if (season.phase === 'running' && now >= season.endsAt) {
            season.phase = 'settling'
            return true
        }
        if (season.phase === 'settling' && now >= season.endsAt + GAME_DEMO_CONFIG.seasonSettleGraceMs) {
            this.settle(season, now)
            return true
        }
        if (season.phase === 'settled' && now >= season.settledAt + GAME_DEMO_CONFIG.seasonNextDelayMs) {
            this.open(season, season.number + 1, now)
            return true
        }
        return false
    }

    /** 开发入口：提前截止本期，定榜仍走正常的宽限与结算。 */
    static end(season: GameDemoSeason, number: number, now: number): void {
        if (season.number !== number) throw { code: 'GAME_DEMO_SEASON_CHANGED', msg: '活动已切换，请刷新' }
        if (season.phase !== 'running') return
        season.endsAt = Math.max(season.startedAt, Math.min(season.endsAt, now))
        season.phase = 'settling'
    }

    static ranking(season: SeasonView): RankedScore[] {
        const rows: RankedScore[] = []
        season.scores?.forEach((row) => rows.push({ uid: row.uid, score: row.score, sequence: row.sequence }))
        return rows.sort((a, b) => b.score - a.score || a.sequence - b.sequence || a.uid - b.uid)
    }

    static view(season: SeasonView, uid: number, now: number): IGameDemoSeason {
        const ranked = this.ranking(season)
        const index = ranked.findIndex((row) => row.uid === uid)
        const top = ranked.slice(0, GAME_DEMO_CONFIG.seasonTopSize)
        return {
            number: season.number,
            phase: season.phase as IGameDemoSeason['phase'],
            startedAt: season.startedAt,
            endsAt: season.endsAt,
            serverNow: now,
            top: top.map((row, rank) => ({ uid: row.uid, score: row.score, rank: rank + 1 })),
            myScore: index < 0 ? 0 : ranked[index].score,
            myRank: index < 0 || index >= top.length ? null : index + 1,
            rewardedCount: season.rewardedCount,
        }
    }

    private static settle(season: GameDemoSeason, now: number): void {
        const winners = this.ranking(season).slice(0, GAME_DEMO_CONFIG.seasonGoldRewards.length)
        winners.forEach((winner, index) => {
            const rank = index + 1
            season.rewards!.set(rank, {
                uid: winner.uid,
                gold: GAME_DEMO_CONFIG.seasonGoldRewards[index],
                title: `炼丹榜第 ${rank} 名奖励`,
                source: `season:${season.startedAt}:rank:${rank}`,
            })
        })
        season.rewardedCount = winners.length
        season.phase = 'settled'
        season.settledAt = now
    }
}
