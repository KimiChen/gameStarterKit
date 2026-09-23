import { GameDemoHash as AtomicHash } from '../GameDemoPersistence'
import { GameDemoSeasonWindow } from './GameDemoSeasonWindow'
import { AtomicHashTransaction, atomicCounterCodec, atomicJsonCodec } from '@arthropoda/game-engine'

export interface GameDemoScoreEvent {
    uid: string
    batchId: string
    score: number
    at: number
    seasonId?: string | null
}
const eventCodec = atomicJsonCodec<GameDemoScoreEvent>((value): value is GameDemoScoreEvent => {
    const event = value as GameDemoScoreEvent | null
    return (
        !!event &&
        typeof event.uid === 'string' &&
        !!event.uid &&
        typeof event.batchId === 'string' &&
        !!event.batchId &&
        Number.isSafeInteger(event.score) &&
        event.score > 0 &&
        Number.isSafeInteger(event.at) &&
        event.at >= 0 &&
        (event.seasonId === undefined ||
            event.seasonId === null ||
            (typeof event.seasonId === 'string' && !!event.seasonId))
    )
})

/** Bounded reads by sequence; the producer commits the fact and its high-water mark with inventory. */
export class GameDemoScoreEvents {
    private readonly sequences = new AtomicHash('kt:gameDemo:score-sequences:v1', atomicCounterCodec)
    private readonly events = new AtomicHash('kt:gameDemo:score-events:v1', eventCodec)

    async append(tx: AtomicHashTransaction, sId: number, event: GameDemoScoreEvent): Promise<number> {
        const next = ((await tx.get(this.sequences, String(sId))) ?? 0) + 1
        const windows = new GameDemoSeasonWindow()
        const season = await windows.ensure(tx, sId, next - 1)
        const at = await tx.time(this.events)
        const eligible = season.phase === 'running' && at < season.endsAt
        if (eligible) tx.validBefore(season.endsAt)
        await tx.set(this.events, JSON.stringify([sId, next]), { ...event, at, seasonId: eligible ? season.id : null })
        await tx.set(this.sequences, String(sId), next)
        return next
    }

    async latest(tx: AtomicHashTransaction, sId: number): Promise<number> {
        return (await tx.get(this.sequences, String(sId))) ?? 0
    }

    async get(tx: AtomicHashTransaction, sId: number, sequence: number): Promise<GameDemoScoreEvent | undefined> {
        const event = await tx.get(this.events, JSON.stringify([sId, sequence]))
        return event ? { ...event } : undefined
    }
}
