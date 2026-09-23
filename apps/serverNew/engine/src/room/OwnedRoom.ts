import { AtomicLease, AtomicLeaseLost, type AtomicLeaseToken } from '../differ/AtomicLease'
import { AtomicHashTransaction, type AtomicReadonly } from '../differ/AtomicHash'

export interface RoomSubscriber { uid: string; generation: number }
export class OwnedRoomUnavailable extends Error {
    constructor() { super('room is recovering or its local queue is full') }
}

/** One room instance owns one FIFO, fenced lease, recovered snapshot and bounded subscription set. */
export class OwnedRoom<State> {
    private tail: Promise<unknown> = Promise.resolve()
    private pending = 0
    private token?: AtomicReadonly<AtomicLeaseToken>
    private readonly subscribers = new Map<string, number>()
    private snapshot?: State
    private watchCursor = 0
    constructor(
        readonly id: string,
        private readonly lease: AtomicLease,
        private readonly owner: string,
        private readonly recover: (tx: AtomicHashTransaction, token: AtomicReadonly<AtomicLeaseToken>) => Promise<State>,
        private readonly ttlMs = 5000,
    ) {}
    get state(): State | undefined { return this.snapshot }
    get ownershipEpoch(): number | undefined { return this.token?.epoch }
    remember(state: State): void { this.snapshot = state }
    subscribe(uid: string, generation: number): void {
        if (!uid || !Number.isSafeInteger(generation) || generation < 1) throw new Error('invalid room subscriber')
        if (!this.subscribers.has(uid) && this.subscribers.size >= 200) throw new OwnedRoomUnavailable()
        this.subscribers.set(uid, generation)
    }
    unsubscribe(uid: string, generation?: number): void {
        if (generation === undefined || this.subscribers.get(uid) === generation) this.subscribers.delete(uid)
    }
    /** Rotating bounded slices prevent slow or large rooms from monopolizing a tick. */
    watchers(limit = 20): RoomSubscriber[] {
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('invalid subscriber batch')
        const all = [...this.subscribers].map(([uid, generation]) => ({ uid, generation }))
        if (!all.length) { this.watchCursor = 0; return [] }
        const count = Math.min(limit, all.length)
        const result = Array.from({ length: count }, (_, index) => all[(this.watchCursor + index) % all.length])
        this.watchCursor = (this.watchCursor + count) % all.length
        return result
    }
    async assert(tx: AtomicHashTransaction, token: AtomicReadonly<AtomicLeaseToken>): Promise<void> {
        await this.lease.assert(tx, token)
    }
    run<T>(work: (token: AtomicReadonly<AtomicLeaseToken>) => Promise<T>): Promise<T> {
        if (this.pending >= 256) return Promise.reject(new OwnedRoomUnavailable())
        this.pending++
        const job = this.tail.then(async () => {
            const token = await this.lease.acquire(this.owner, this.ttlMs)
            if (!token) throw new OwnedRoomUnavailable()
            if (this.token?.epoch !== token.epoch) {
                // Recovery itself is fenced: old process snapshots cannot become new authority.
                this.snapshot = await AtomicHashTransaction.run(async tx => {
                    await this.lease.assert(tx, token)
                    return this.recover(tx, token)
                })
                this.subscribers.clear()
            }
            this.token = token
            try { return await work(token) }
            catch (error) {
                if (error instanceof AtomicLeaseLost) { this.token = undefined; this.snapshot = undefined; this.subscribers.clear() }
                throw error
            }
        })
        this.tail = job.catch(() => undefined)
        return job.finally(() => { this.pending-- })
    }
}
