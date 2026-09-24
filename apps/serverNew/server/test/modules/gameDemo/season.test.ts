import assert from 'node:assert/strict'
import { GAME_DEMO_CONFIG } from '../../../generated/lobby-contract/protocol/lobbyRpc/checks/gameDemo'
import { GameDemoSeason } from '../../../src/modules/gameDemo/bean/GameDemoSeason'
import { GameDemoLeaderboard } from '../../../src/modules/gameDemo/rules/GameDemoLeaderboard'

const T0 = 1_000_000
const END = T0 + GAME_DEMO_CONFIG.seasonDurationMs
const GRACE = GAME_DEMO_CONFIG.seasonSettleGraceMs

function season(): GameDemoSeason {
    const bean = new GameDemoSeason(1)
    bean.id = 1
    GameDemoLeaderboard.tick(bean, T0)
    return bean
}

describe('gameDemo season leaderboard', () => {
    it('opens the first season on the first tick', () => {
        const bean = season()
        assert.equal(bean.number, 1)
        assert.equal(bean.phase, 'running')
        assert.equal(bean.endsAt, END)
    })

    it('counts each batch once and orders ties by who reached the score first', () => {
        const bean = season()
        assert.equal(GameDemoLeaderboard.applyScore(bean, 2, 1, 5, T0 + 1), true)
        assert.equal(GameDemoLeaderboard.applyScore(bean, 3, 1, 5, T0 + 2), true)
        assert.equal(GameDemoLeaderboard.applyScore(bean, 2, 1, 5, T0 + 1), false, '重复投递只计一次')
        assert.equal(GameDemoLeaderboard.applyScore(bean, 4, 1, 3, T0 - 1), false, '开期前的批次不计入')
        const view = GameDemoLeaderboard.view(bean, 3, T0 + 10)
        assert.deepEqual(view.top, [
            { uid: 2, score: 5, rank: 1 },
            { uid: 3, score: 5, rank: 2 },
        ])
        assert.equal(view.myScore, 5)
        assert.equal(view.myRank, 2)
    })

    it('accepts in-window scores during the grace period, then settles the top three', () => {
        const bean = season()
        for (const uid of [1, 2, 3, 4]) GameDemoLeaderboard.applyScore(bean, uid, 1, uid, T0 + uid)
        GameDemoLeaderboard.tick(bean, END)
        assert.equal(bean.phase, 'settling')
        assert.equal(GameDemoLeaderboard.applyScore(bean, 5, 1, 10, END - 1), true, '截止前提交、宽限内到达')
        assert.equal(GameDemoLeaderboard.applyScore(bean, 6, 1, 10, END), false, '截止后提交不计入')
        GameDemoLeaderboard.tick(bean, END + GRACE)
        assert.equal(bean.phase, 'settled')
        assert.deepEqual(
            bean.rewards!.values().map((reward) => [reward.uid, reward.gold, reward.source]),
            [
                [5, 1000, `season:${T0}:rank:1`],
                [4, 500, `season:${T0}:rank:2`],
                [3, 200, `season:${T0}:rank:3`],
            ],
        )
        assert.equal(GameDemoLeaderboard.applyScore(bean, 7, 1, 10, END - 1), false, '定榜后不再改榜')
    })

    it('opens the next season after the settle delay and clears the previous standings', () => {
        const bean = season()
        GameDemoLeaderboard.applyScore(bean, 1, 1, 1, T0)
        GameDemoLeaderboard.end(bean, 1, T0 + 5)
        assert.equal(bean.endsAt, T0 + 5)
        GameDemoLeaderboard.tick(bean, T0 + 5 + GRACE)
        const settledAt = bean.settledAt
        GameDemoLeaderboard.tick(bean, settledAt + GAME_DEMO_CONFIG.seasonNextDelayMs - 1)
        assert.equal(bean.number, 1)
        GameDemoLeaderboard.tick(bean, settledAt + GAME_DEMO_CONFIG.seasonNextDelayMs)
        assert.equal(bean.number, 2)
        assert.equal(bean.scores!.size(), 0)
        assert.equal(bean.rewards!.size(), 0)
        assert.throws(
            () => GameDemoLeaderboard.end(bean, 1, settledAt + 10_000),
            (error: { code?: string }) => error.code === 'GAME_DEMO_SEASON_CHANGED',
        )
    })
})
