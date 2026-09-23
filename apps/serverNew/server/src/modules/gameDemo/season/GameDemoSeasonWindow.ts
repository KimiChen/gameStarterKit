import { GameDemoHash as AtomicHash } from '../GameDemoPersistence'
import { AtomicHashTransaction, atomicCounterCodec, atomicJsonCodec } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/kits/gameDemo/config'

export interface SeasonScore {
    uid: string
    score: number
    sequence: number
}
export interface StoredSeason {
    schemaVersion: 1
    id: string
    number: number
    phase: 'running' | 'settling' | 'settled'
    startedAt: number
    endsAt: number
    settledAt: number
    revision: number
    processed: number
    frozen: number | null
    top: SeasonScore[]
    rewards: number[]
    delivered: number
}
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0
export const seasonScoreCodec = atomicJsonCodec<SeasonScore>((v): v is SeasonScore => {
    const s = v as SeasonScore | null
    return (
        !!s &&
        typeof s.uid === 'string' &&
        !!s.uid &&
        integer(s.score) &&
        s.score > 0 &&
        integer(s.sequence) &&
        s.sequence > 0
    )
})
const codec = atomicJsonCodec<StoredSeason>((v): v is StoredSeason => {
    const s = v as StoredSeason | null
    if (
        !s ||
        s.schemaVersion !== 1 ||
        typeof s.id !== 'string' ||
        !s.id ||
        !['running', 'settling', 'settled'].includes(s.phase)
    )
        return false
    if (
        ![s.number, s.startedAt, s.endsAt, s.settledAt, s.revision, s.processed, s.delivered].every(integer) ||
        s.number < 1 ||
        s.revision < 1 ||
        s.endsAt < s.startedAt
    )
        return false
    if (s.frozen !== null && (!integer(s.frozen) || s.processed > s.frozen)) return false
    if ((s.phase === 'running') !== (s.frozen === null)) return false
    if (
        !Array.isArray(s.top) ||
        s.top.length > 20 ||
        !Array.isArray(s.rewards) ||
        s.rewards.length !== 3 ||
        !s.rewards.every(integer)
    )
        return false
    if (
        s.delivered > Math.min(s.top.length, s.rewards.length) ||
        new Set(s.top.map((row) => row.uid)).size !== s.top.length
    )
        return false
    try {
        for (const row of s.top) seasonScoreCodec.encode(row)
    } catch {
        return false
    }
    return s.top.every((row, i) => i === 0 || compareScore(s.top[i - 1], row) <= 0)
})
export function compareScore(a: SeasonScore, b: SeasonScore): number {
    return b.score - a.score || a.sequence - b.sequence || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
}

/** Durable instance identity and cutoff participate in every score-producing transaction. */
export class GameDemoSeasonWindow {
    private readonly current = new AtomicHash('kt:gameDemo:season-current:v1', atomicCounterCodec)
    readonly records = new AtomicHash('kt:gameDemo:seasons:v1', codec)
    async load(tx: AtomicHashTransaction, sId: number): Promise<StoredSeason | undefined> {
        const number = await tx.get(this.current, String(sId))
        if (number === undefined) return undefined
        const state = await tx.get(this.records, JSON.stringify([sId, number]))
        if (!state) throw new Error('season current record missing')
        return { ...state, top: state.top.map((row) => ({ ...row })), rewards: [...state.rewards] }
    }
    async ensure(tx: AtomicHashTransaction, sId: number, latest: number): Promise<StoredSeason> {
        const state = await this.load(tx, sId)
        if (state) return state
        return this.open(tx, sId, 1, latest)
    }
    async open(tx: AtomicHashTransaction, sId: number, number: number, latest: number): Promise<StoredSeason> {
        const now = await tx.time(this.records)
        const state: StoredSeason = {
            schemaVersion: 1,
            id: `${sId}:${number}`,
            number,
            phase: 'running',
            startedAt: now,
            endsAt: now + GAME_DEMO_CONFIG.seasonDurationMs,
            settledAt: 0,
            revision: 1,
            processed: latest,
            frozen: null,
            top: [],
            rewards: [...GAME_DEMO_CONFIG.seasonGoldRewards],
            delivered: 0,
        }
        await tx.set(this.current, String(sId), number)
        await this.save(tx, sId, state)
        return state
    }
    async save(tx: AtomicHashTransaction, sId: number, state: StoredSeason): Promise<void> {
        await tx.set(this.records, JSON.stringify([sId, state.number]), state)
    }
}
