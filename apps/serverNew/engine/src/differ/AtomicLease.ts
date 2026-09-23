import { AtomicHash, AtomicHashTransaction, atomicJsonCodec, type AtomicReadonly, type AtomicHashWriteGuard } from './AtomicHash'
import { RedisCache } from '../database/RedisCache'

export interface AtomicLeaseToken { owner: string; epoch: number; expiresAt: number }
const codec = atomicJsonCodec<AtomicLeaseToken>((v): v is AtomicLeaseToken => {
    const token = v as AtomicLeaseToken | null
    return !!token && typeof token.owner === 'string' && token.owner.length <= 128
        && Number.isSafeInteger(token.epoch) && token.epoch > 0
        && Number.isSafeInteger(token.expiresAt) && token.expiresAt >= 0
})
export class AtomicLeaseLost extends Error {
    constructor() { super('atomic lease is not current; recover ownership before writing') }
}

/** Durable fencing token. Expiry never deletes the epoch; every takeover increments it. */
export class AtomicLease {
    private readonly leases: AtomicHash<AtomicLeaseToken>
    constructor(key: string, private readonly field: string, redis?: RedisCache, guard?: AtomicHashWriteGuard) {
        this.leases = new AtomicHash(key, codec, redis, guard)
    }
    async acquire(owner: string, ttlMs: number): Promise<AtomicReadonly<AtomicLeaseToken> | undefined> {
        if (!owner || owner.length > 128 || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 60000)
            throw new Error('invalid lease owner or duration')
        return AtomicHashTransaction.run(async tx => {
            const current = await tx.get(this.leases, this.field)
            const now = await tx.time(this.leases)
            if (current && current.expiresAt > now && current.owner !== owner) return undefined
            const token = { owner, epoch: current && current.owner === owner && current.expiresAt > now ? current.epoch : (current?.epoch ?? 0) + 1, expiresAt: now + ttlMs }
            tx.validBefore(token.expiresAt)
            await tx.set(this.leases, this.field, token)
            return (await tx.get(this.leases, this.field))!
        })
    }
    /** Must run inside the very transaction that mutates the protected room state. */
    async assert(tx: AtomicHashTransaction, token: AtomicReadonly<AtomicLeaseToken>): Promise<void> {
        const current = await tx.get(this.leases, this.field)
        const now = await tx.time(this.leases)
        if (!current || current.owner !== token.owner || current.epoch !== token.epoch || current.expiresAt <= now)
            throw new AtomicLeaseLost()
        tx.validBefore(current.expiresAt)
    }
    async release(token: AtomicReadonly<AtomicLeaseToken>): Promise<boolean> {
        return AtomicHashTransaction.run(async tx => {
            const current = await tx.get(this.leases, this.field)
            if (!current || current.owner !== token.owner || current.epoch !== token.epoch) return false
            await tx.set(this.leases, this.field, { owner: '', epoch: current.epoch, expiresAt: 0 })
            return true
        })
    }
}
