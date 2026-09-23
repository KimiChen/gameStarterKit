import { AtomicHash, AtomicHashTransaction, atomicJsonCodec, type AtomicReadonly, type AtomicHashWriteGuard } from './AtomicHash'
import { RedisCache } from '../database/RedisCache'

interface Receipt<T> { fingerprint: string; result: T }

export class AtomicOperationConflict extends Error {
    readonly code = 'OPERATION_CONFLICT'
    readonly msg = '幂等请求参数不一致'
    constructor() { super('operation id already belongs to different parameters') }
}

/** Durable business receipt committed in the same transaction as its effects. */
export class AtomicOperation<T> {
    private readonly receipts: AtomicHash<Receipt<T>>

    constructor(key: string, validateResult: (value: unknown) => value is T, redis?: RedisCache, guard?: AtomicHashWriteGuard) {
        this.receipts = new AtomicHash(key, atomicJsonCodec<Receipt<T>>((value): value is Receipt<T> => {
            const receipt = value as Receipt<T> | null
            return !!receipt && typeof receipt.fingerprint === 'string' && validateResult(receipt.result)
        }), redis, guard)
    }

    async run(id: string, fingerprint: string, work: (tx: AtomicHashTransaction) => Promise<T>): Promise<AtomicReadonly<T>> {
        if (!fingerprint || fingerprint.length > 4096) throw new Error('invalid operation fingerprint')
        return AtomicHashTransaction.run(async tx => {
            const prior = await tx.get(this.receipts, id)
            if (prior) {
                if (prior.fingerprint !== fingerprint) throw new AtomicOperationConflict()
                return prior.result
            }
            const result = await work(tx)
            await tx.set(this.receipts, id, { fingerprint, result })
            return (await tx.get(this.receipts, id))!.result
        })
    }
}
