import { AtomicHashTransaction, atomicCounterCodec, atomicStringCodec } from '@arthropoda/game-engine'
import { GameDemoHash as AtomicHash, GameDemoLease as AtomicLease, gameDemoLifecycle } from './GameDemoPersistence'
import { GameDemoAlchemy } from './alchemy/GameDemoAlchemy'
import { GameDemoBossStore } from './boss/GameDemoBossStore'
import { GameDemoSeason } from './season/GameDemoSeason'
import { GAME_DEMO_CONFIG } from '../../../generated/lobby-contract/kits/gameDemo/config'

export interface GameDemoDrainReport {
    phase: 'draining' | 'drained'
    waitingBatches: number
    waitingOwners: number
    settlingBosses: number
    settlingSeasons: number
    checkpointedBosses: number
}

/** Offline operator work. Foreground writes are fenced before scanning stable active indexes. */
export class GameDemoDrain {
    private readonly batches = new AtomicHash('kt:gameDemo:alchemy-current:v1', atomicStringCodec)
    private readonly seasons = new AtomicHash('kt:gameDemo:season-current:v1', atomicCounterCodec)
    private readonly bosses = new AtomicHash('kt:gameDemo:boss-current:v1', atomicCounterCodec)

    async pass(owner: string): Promise<GameDemoDrainReport> {
        if (!owner || owner.length > 120) throw new Error('invalid drain owner')
        const report: GameDemoDrainReport = {
            phase: 'draining',
            waitingBatches: 0,
            waitingOwners: 0,
            settlingBosses: 0,
            settlingSeasons: 0,
            checkpointedBosses: 0,
        }
        const before = await AtomicHashTransaction.run((tx) => gameDemoLifecycle.state(tx))
        if (before?.phase === 'drained') return { ...report, phase: 'drained' }
        const token = await gameDemoLifecycle.beginDrain(owner)
        return gameDemoLifecycle.drainWork(token, async () => {
            const renew = async () => {
                const renewed = await gameDemoLifecycle.beginDrain(owner)
                if (renewed.epoch !== token.epoch) throw new Error('drain lease expired; rerun the pass')
            }
            const sids = new Set<number>()
            let cursor = 0
            const alchemy = new GameDemoAlchemy()
            do {
                const page = await this.batches.scan(cursor)
                for (const { field, value: batchId } of page.entries) {
                    const separator = field.indexOf(':')
                    const sid = Number(field.slice(0, separator)),
                        uid = field.slice(separator + 1)
                    if (separator < 1 || !uid || !Number.isSafeInteger(sid) || sid < 1)
                        throw new Error('invalid alchemy owner index')
                    sids.add(sid)
                    const current = await alchemy.read(uid, sid)
                    if (!current.batch || current.batch.id !== batchId) throw new Error('alchemy drain index changed')
                    if (current.batch.phase !== 'running') continue
                    if (current.batch.completed < current.batch.count) {
                        report.waitingBatches++
                        continue
                    }
                    await alchemy.finish(uid, sid, { clientReqId: `drain-${batchId}`, batchId, early: false })
                }
                await renew()
                cursor = page.cursor
            } while (cursor !== 0)
            for (const index of [this.seasons, this.bosses]) {
                cursor = 0
                do {
                    const page = await index.scan(cursor)
                    for (const { field } of page.entries) {
                        const sid = index === this.seasons ? Number(field) : JSON.parse(field)[0]
                        if (!Number.isSafeInteger(sid) || sid < 1) throw new Error('invalid realm index')
                        sids.add(sid)
                    }
                    await renew()
                    cursor = page.cursor
                } while (cursor !== 0)
            }
            for (const sid of sids) {
                await renew()
                if (report.waitingBatches === 0 && !(await new GameDemoSeason().drain(sid))) report.settlingSeasons++
                const store = new GameDemoBossStore()
                for (const boss of GAME_DEMO_CONFIG.bosses) {
                    if (!(await AtomicHashTransaction.run((tx) => store.load(tx, sid, boss.id)))) continue
                    const lease = new AtomicLease('kt:gameDemo:boss-leases:v1', JSON.stringify([sid, boss.id]))
                    const roomToken = await lease.acquire(`drain:${owner}`, 5000)
                    if (!roomToken) {
                        report.waitingOwners++
                        continue
                    }
                    try {
                        for (let step = 0; step < 4; step++) {
                            const state = await store.step(
                                sid,
                                boss.id,
                                roomToken,
                                (tx, t) => lease.assert(tx, t),
                                false,
                            )
                            if (state.phase === 'running') {
                                report.checkpointedBosses++
                                break
                            }
                            if (state.phase === 'settled') break
                            if (step === 3) report.settlingBosses++
                        }
                    } finally {
                        await lease.release(roomToken)
                    }
                }
            }
            if (report.waitingBatches + report.waitingOwners + report.settlingBosses + report.settlingSeasons === 0) {
                // The stable indexes were inspected under an exclusive drain token. Normal writes cannot
                // add work, and another operator invalidates this token before the final CAS can succeed.
                await gameDemoLifecycle.finishDrain(token, async () => undefined)
                report.phase = 'drained'
            }
            return report
        })
    }
}
