import { GameDemoHash as AtomicHash, GameDemoOperation as AtomicOperation } from '../GameDemoPersistence'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { AtomicHashTransaction, atomicCounterCodec, atomicJsonCodec, atomicStringCodec } from '@arthropoda/game-engine'
import { GAME_DEMO_CONFIG } from '../../../../generated/lobby-contract/kits/gameDemo/config'
import {
    validateGameDemoAlchemyBatch,
    validateGameDemoAlchemyRes,
    type IGameDemoAlchemyRes,
    type IGameDemoAlchemyStartReq,
    type IGameDemoAlchemyFinishReq,
} from '../../../../generated/lobby-contract/native/lobbyRpc/domains/gameDemoAlchemy'
import type { GameDemoAlchemyBatch } from '../../../../generated/lobby-contract/kits/gameDemo/api/production'
import { NativeLobbyAssets } from '../../../runtime/lobby/NativeLobbyAssets'
import { GameDemoAccount } from '../growth/GameDemoAccount'
import { GameDemoScoreEvents } from '../season/GameDemoScoreEvents'

interface StoredBatch {
    schemaVersion: 1
    view: GameDemoAlchemyBatch
    seed: string
    outcomes: number[]
    herbCost: number
    dewCost: number
    normalScore: number
    fineScore: number
}
const batchCodec = atomicJsonCodec<StoredBatch>((value): value is StoredBatch => {
    const batch = value as StoredBatch | null
    if (!batch || batch.schemaVersion !== 1 || typeof batch.seed !== 'string' || !/^[a-f0-9]{32}$/.test(batch.seed))
        return false
    try {
        validateGameDemoAlchemyBatch(batch.view)
    } catch {
        return false
    }
    return (
        Array.isArray(batch.outcomes) &&
        batch.outcomes.length === batch.view.count &&
        batch.outcomes.every((outcome) => outcome === 0 || outcome === 1) &&
        [batch.herbCost, batch.dewCost, batch.normalScore, batch.fineScore].every(
            (cost) => Number.isSafeInteger(cost) && cost > 0,
        )
    )
})
const resultGuard = (value: unknown): value is IGameDemoAlchemyRes => {
    try {
        validateGameDemoAlchemyRes(value)
        return true
    } catch {
        return false
    }
}

export class GameDemoAlchemy {
    private readonly current = new AtomicHash('kt:gameDemo:alchemy-current:v1', atomicStringCodec)
    private readonly batches = new AtomicHash('kt:gameDemo:alchemy-batches:v1', batchCodec)
    private readonly versions = new AtomicHash('kt:gameDemo:alchemy-versions:v1', atomicCounterCodec)
    private readonly starts = new AtomicOperation('kt:gameDemo:alchemy-starts:v1', resultGuard)
    private readonly finishes = new AtomicOperation('kt:gameDemo:alchemy-finishes:v1', resultGuard)

    async read(uid: string, sId: number, now = Date.now()): Promise<IGameDemoAlchemyRes> {
        return AtomicHashTransaction.run((tx) => this.snapshot(tx, uid, sId, now))
    }

    async start(
        uid: string,
        sId: number,
        req: IGameDemoAlchemyStartReq,
        now = Date.now(),
        entropy = { batchId: randomUUID() as string, seed: randomBytes(16).toString('hex') },
    ): Promise<IGameDemoAlchemyRes> {
        if (!Number.isSafeInteger(req.count) || req.count < 1 || req.count > GAME_DEMO_CONFIG.alchemy.maxBatch)
            throw { code: 'INVALID_PAYLOAD', msg: '炼丹数量无效' }
        const result = await this.starts.run(
            JSON.stringify([sId, uid, req.clientReqId]),
            JSON.stringify([req.count]),
            async (tx) => {
                const state = await this.snapshot(tx, uid, sId, now)
                if (!state.assets.initialized) throw { code: 'GAME_DEMO_NOT_INITIALIZED', msg: '请先初始化玩法账号' }
                if (state.batch?.phase === 'running')
                    throw { code: 'GAME_DEMO_BATCH_RUNNING', msg: '请先领取或结束当前批次' }
                const rules = GAME_DEMO_CONFIG.alchemy
                const outcomes = Array.from({ length: req.count }, (_, index) =>
                    createHash('sha256').update(`${entropy.seed}:${index}`).digest().readUInt32BE(0) % 100 <
                    rules.fineChancePercent
                        ? 1
                        : 0,
                )
                await NativeLobbyAssets.changeItem(
                    tx,
                    uid,
                    sId,
                    GAME_DEMO_CONFIG.itemIds.herb,
                    -rules.herbPerBatch * req.count,
                )
                await NativeLobbyAssets.changeItem(
                    tx,
                    uid,
                    sId,
                    GAME_DEMO_CONFIG.itemIds.dew,
                    -rules.dewPerBatch * req.count,
                )
                const finePill = outcomes.reduce((sum, value) => sum + value, 0)
                const pill = req.count - finePill
                const score = pill * GAME_DEMO_CONFIG.pillScore.normal + finePill * GAME_DEMO_CONFIG.pillScore.fine
                if (pill) await NativeLobbyAssets.changeItem(tx, uid, sId, GAME_DEMO_CONFIG.itemIds.pill, pill)
                if (finePill)
                    await NativeLobbyAssets.changeItem(tx, uid, sId, GAME_DEMO_CONFIG.itemIds.finePill, finePill)
                await new GameDemoScoreEvents().append(tx, sId, { uid, batchId: entropy.batchId, score, at: now })
                const batch: StoredBatch = {
                    schemaVersion: 1,
                    seed: entropy.seed,
                    outcomes,
                    herbCost: rules.herbPerBatch,
                    dewCost: rules.dewPerBatch,
                    normalScore: GAME_DEMO_CONFIG.pillScore.normal,
                    fineScore: GAME_DEMO_CONFIG.pillScore.fine,
                    view: {
                        id: entropy.batchId,
                        configVersion: GAME_DEMO_CONFIG.version,
                        count: req.count,
                        startedAt: now,
                        durationMs: 0,
                        endsAt: now,
                        phase: 'claimed',
                        completed: req.count,
                        pill,
                        finePill,
                        refundedHerb: 0,
                        refundedDew: 0,
                        score,
                    },
                }
                await tx.set(this.batches, JSON.stringify([sId, uid, entropy.batchId]), batch)
                await tx.set(this.current, NativeLobbyAssets.owner(uid, sId), entropy.batchId)
                await this.bump(tx, uid, sId)
                return this.snapshot(tx, uid, sId, now)
            },
        )
        return validateGameDemoAlchemyRes(result)
    }

    async finish(
        uid: string,
        sId: number,
        req: IGameDemoAlchemyFinishReq,
        now = Date.now(),
    ): Promise<IGameDemoAlchemyRes> {
        const result = await this.finishes.run(
            JSON.stringify([sId, uid, req.clientReqId]),
            JSON.stringify([req.batchId, req.early]),
            async (tx) => {
                const field = JSON.stringify([sId, uid, req.batchId])
                const batch = await tx.get(this.batches, field)
                if (!batch) throw { code: 'GAME_DEMO_BATCH_NOT_FOUND', msg: '炼丹批次不存在' }
                if (batch.view.phase === 'claimed') return this.snapshot(tx, uid, sId, now)
                const current = await tx.get(this.current, NativeLobbyAssets.owner(uid, sId))
                if (current !== req.batchId) throw { code: 'GAME_DEMO_BATCH_NOT_FOUND', msg: '当前炼丹批次已变化' }
                const completed = this.completed(batch.view, now)
                if (!req.early && completed !== batch.view.count)
                    throw { code: 'GAME_DEMO_BATCH_NOT_READY', msg: '炼丹尚未完成' }
                const finePill = batch.outcomes.slice(0, completed).reduce((sum, value) => sum + value, 0)
                const pill = completed - finePill
                const remaining = batch.view.count - completed
                const refundedHerb = remaining * batch.herbCost
                const refundedDew = remaining * batch.dewCost
                const score = pill * batch.normalScore + finePill * batch.fineScore
                for (const [itemId, amount] of [
                    [GAME_DEMO_CONFIG.itemIds.pill, pill],
                    [GAME_DEMO_CONFIG.itemIds.finePill, finePill],
                    [GAME_DEMO_CONFIG.itemIds.herb, refundedHerb],
                    [GAME_DEMO_CONFIG.itemIds.dew, refundedDew],
                ])
                    if (amount) await NativeLobbyAssets.changeItem(tx, uid, sId, itemId, amount)
                const view: GameDemoAlchemyBatch = {
                    ...batch.view,
                    phase: 'claimed',
                    completed,
                    pill,
                    finePill,
                    refundedHerb,
                    refundedDew,
                    score,
                }
                await tx.set(this.batches, field, { ...batch, outcomes: [...batch.outcomes], view })
                if (score)
                    await new GameDemoScoreEvents().append(tx, sId, { uid, batchId: req.batchId, score, at: now })
                await this.bump(tx, uid, sId)
                return this.snapshot(tx, uid, sId, now)
            },
        )
        return validateGameDemoAlchemyRes(result)
    }

    private completed(batch: GameDemoAlchemyBatch, now: number) {
        if (batch.configVersion >= 4) return now >= batch.endsAt ? batch.count : 0
        return Math.max(0, Math.min(batch.count, Math.floor((now - batch.startedAt) / batch.durationMs)))
    }

    private async bump(tx: AtomicHashTransaction, uid: string, sId: number) {
        const field = NativeLobbyAssets.owner(uid, sId)
        await tx.set(this.versions, field, ((await tx.get(this.versions, field)) ?? 0) + 1)
    }

    private async snapshot(
        tx: AtomicHashTransaction,
        uid: string,
        sId: number,
        now: number,
    ): Promise<IGameDemoAlchemyRes> {
        const owner = NativeLobbyAssets.owner(uid, sId)
        const id = await tx.get(this.current, owner)
        const stored = id ? await tx.get(this.batches, JSON.stringify([sId, uid, id])) : undefined
        if (id && !stored) throw new Error('alchemy current batch is missing')
        const batch = stored ? validateGameDemoAlchemyBatch(stored.view) : null
        if (batch?.phase === 'running') batch.completed = this.completed(batch, now)
        return {
            assets: await new GameDemoAccount().snapshot(tx, uid, sId),
            revision: (await tx.get(this.versions, owner)) ?? 0,
            serverNow: now,
            batch,
        }
    }
}
