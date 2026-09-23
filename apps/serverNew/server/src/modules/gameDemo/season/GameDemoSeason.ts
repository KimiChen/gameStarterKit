import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoSeasonWindow, compareScore, seasonScoreCodec, type StoredSeason } from './GameDemoSeasonWindow'
import { GameDemoScoreEvents } from './GameDemoScoreEvents'
import { GameDemoMailbox } from '../rewards/GameDemoMailbox'
import {
    validateGameDemoSeasonRes,
    type IGameDemoSeasonEndReq,
    type IGameDemoSeasonRes,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoSeason'

/** Bounded background reducer. Cursor, ranking, freeze and each mail delivery are durable CAS steps. */
export class GameDemoSeason {
    private readonly windows = new GameDemoSeasonWindow()
    private readonly events = new GameDemoScoreEvents()
    private readonly scores = new AtomicHash('kt:gameDemo:season-scores:v1', seasonScoreCodec)
    private readonly ends = new AtomicOperation('kt:gameDemo:season-ends:v1', (v): v is IGameDemoSeasonRes => {
        try {
            validateGameDemoSeasonRes(v)
            return true
        } catch {
            return false
        }
    })

    async read(uid: string, sId: number): Promise<IGameDemoSeasonRes> {
        return AtomicHashTransaction.run(async (tx) => {
            const state = await this.windows.ensure(tx, sId, await this.events.latest(tx, sId))
            return this.snapshot(tx, uid, sId, state)
        })
    }

    async end(uid: string, sId: number, req: IGameDemoSeasonEndReq, devEnabled: boolean): Promise<IGameDemoSeasonRes> {
        if (!devEnabled) throw { code: 'GAME_DEMO_DEV_DISABLED', msg: '开发入口未开放' }
        const result = await this.ends.run(JSON.stringify([sId, uid, req.clientReqId]), req.seasonId, async (tx) => {
            const state = await this.windows.load(tx, sId)
            if (!state || state.id !== req.seasonId)
                throw { code: 'GAME_DEMO_SEASON_CHANGED', msg: '活动已切换，请刷新' }
            if (state.phase === 'running') {
                state.endsAt = Math.max(state.startedAt, Math.min(state.endsAt, await tx.time(this.windows.records)))
                await this.freeze(tx, sId, state)
            }
            return this.snapshot(tx, uid, sId, state)
        })
        return validateGameDemoSeasonRes(result)
    }

    /** One tick never scans players or the whole stream; competing ticks are safe. */
    async tick(sId: number): Promise<void> {
        for (let count = 0; count < 8; count++) {
            if (!(await this.step(sId))) return
        }
    }

    async step(sId: number, allowNext = true): Promise<boolean> {
        return AtomicHashTransaction.run(async (tx) => {
            const latest = await this.events.latest(tx, sId)
            const state = await this.windows.ensure(tx, sId, latest)
            const now = await tx.time(this.windows.records)
            if (state.phase === 'settled') {
                if (!allowNext || now < state.settledAt + 5000) return false
                await this.windows.open(tx, sId, state.number + 1, latest)
                return false
            }
            if (state.phase === 'running' && now >= state.endsAt) {
                await this.freeze(tx, sId, state)
                return true
            }
            const limit = state.frozen ?? latest
            if (state.processed < limit) {
                const sequence = state.processed + 1
                const event = await this.events.get(tx, sId, sequence)
                if (!event) throw new Error('season score stream has a missing event')
                if (event.seasonId === state.id) {
                    const field = JSON.stringify([sId, state.id, event.uid])
                    const prior = await tx.get(this.scores, field)
                    const row = { uid: event.uid, score: (prior?.score ?? 0) + event.score, sequence }
                    await tx.set(this.scores, field, row)
                    state.top = [...state.top.filter((value) => value.uid !== event.uid), row]
                        .sort(compareScore)
                        .slice(0, 20)
                }
                state.processed = sequence
                state.revision++
                await this.windows.save(tx, sId, state)
                return true
            }
            if (state.phase === 'running') return false
            const rewardCount = Math.min(state.rewards.length, state.top.length)
            if (state.delivered < rewardCount) {
                const index = state.delivered
                await new GameDemoMailbox().deliver(
                    tx,
                    state.top[index].uid,
                    sId,
                    `season:${state.id}:rank:${index + 1}`,
                    `炼丹榜第 ${index + 1} 名奖励`,
                    state.rewards[index],
                    now,
                )
                state.delivered++
            } else {
                state.phase = 'settled'
                state.settledAt = now
            }
            state.revision++
            await this.windows.save(tx, sId, state)
            return true
        })
    }

    /** Operator drain closes the existing season and finishes its bounded reducer without opening another. */
    async drain(sId: number): Promise<boolean> {
        const exists = await AtomicHashTransaction.run(async (tx) => {
            const state = await this.windows.load(tx, sId)
            if (!state) return false
            if (state.phase === 'running') {
                state.endsAt = Math.max(state.startedAt, Math.min(state.endsAt, await tx.time(this.windows.records)))
                await this.freeze(tx, sId, state)
            }
            return true
        })
        if (!exists) return true
        for (let i = 0; i < 8; i++) if (!(await this.step(sId, false))) break
        return AtomicHashTransaction.run(async (tx) => (await this.windows.load(tx, sId))?.phase === 'settled')
    }

    private async freeze(tx: AtomicHashTransaction, sId: number, state: StoredSeason): Promise<void> {
        state.phase = 'settling'
        state.frozen = await this.events.latest(tx, sId)
        state.revision++
        await this.windows.save(tx, sId, state)
    }

    private async snapshot(
        tx: AtomicHashTransaction,
        uid: string,
        sId: number,
        state: StoredSeason,
    ): Promise<IGameDemoSeasonRes> {
        const own = await tx.get(this.scores, JSON.stringify([sId, state.id, uid]))
        const rank = state.top.findIndex((row) => row.uid === uid)
        return {
            id: state.id,
            phase: state.phase,
            startedAt: state.startedAt,
            endsAt: state.endsAt,
            serverNow: await tx.time(this.windows.records),
            revision: state.revision,
            top: state.top.map((row, index) => ({ uid: row.uid, score: row.score, rank: index + 1 })),
            myScore: own?.score ?? 0,
            myRank: rank < 0 ? null : rank + 1,
            deliveredRewards: state.delivered,
            totalRewards: Math.min(state.top.length, state.rewards.length),
        }
    }
}
