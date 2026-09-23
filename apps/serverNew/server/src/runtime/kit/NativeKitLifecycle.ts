import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { AtomicHash, AtomicHashTransaction, atomicJsonCodec, type AtomicReadonly } from '@arthropoda/game-engine'

export interface NativeKitControl {
    schemaVersion: 1
    dataVersion: number
    phase: 'active' | 'draining' | 'drained' | 'detached'
    epoch: number
    owner: string
    expiresAt: number
    storageKeys?: readonly string[]
}
export interface NativeKitDrainToken {
    readonly owner: string
    readonly epoch: number
}
const lifecycleKey = 'nativeKit:lifecycle:v1'
const runtimesKey = 'nativeKit:runtimes:v1'
const runtimeCodec = atomicJsonCodec<Record<string, number>>(
    (value): value is Record<string, number> =>
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length <= 128 &&
        Object.entries(value).every(
            ([id, expiresAt]) =>
                /^[a-f0-9-]{36}$/.test(id) && Number.isSafeInteger(expiresAt) && (expiresAt as number) > 0,
        ),
)
const codec = atomicJsonCodec<NativeKitControl>((value): value is NativeKitControl => {
    const v = value as NativeKitControl | null
    return (
        !!v &&
        v.schemaVersion === 1 &&
        Number.isSafeInteger(v.dataVersion) &&
        v.dataVersion > 0 &&
        ['active', 'draining', 'drained', 'detached'].includes(v.phase) &&
        Number.isSafeInteger(v.epoch) &&
        v.epoch > 0 &&
        typeof v.owner === 'string' &&
        v.owner.length <= 128 &&
        Number.isSafeInteger(v.expiresAt) &&
        v.expiresAt >= 0 &&
        (v.storageKeys === undefined ||
            (Array.isArray(v.storageKeys) &&
                v.storageKeys.length <= 1000 &&
                v.storageKeys.every((key) => typeof key === 'string' && key.length <= 256))) &&
        (v.phase === 'draining' ? !!v.owner && v.expiresAt > 0 : v.owner === '' && v.expiresAt === 0)
    )
})
export class NativeKitMaintenance extends Error {
    readonly code = 'IN_PROGRESS'
    readonly msg = '玩法正在维护，请稍后重试同一操作'
    constructor() {
        super('native kit is closed for maintenance or its runtime lease expired')
    }
}

/** A durable write barrier shared by RPC, background workers and maintenance commands. */
export class NativeKitLifecycle {
    private static readonly running = new Set<NativeKitLifecycle>()
    private runtimeId: string | undefined
    private runtimeTimer: ReturnType<typeof setTimeout> | undefined
    private runtimePending: Promise<void> | undefined
    private runtimeStopped = false
    private readonly maintenance = new AsyncLocalStorage<NativeKitDrainToken>()
    constructor(
        readonly id: string,
        readonly dataVersion: number,
        readonly minSupported = dataVersion,
    ) {
        if (
            !/^[a-z][A-Za-z0-9]{0,63}$/.test(id) ||
            !Number.isSafeInteger(dataVersion) ||
            dataVersion < 1 ||
            !Number.isSafeInteger(minSupported) ||
            minSupported < 1 ||
            minSupported > dataVersion
        )
            throw new Error('invalid native kit lifecycle declaration')
    }
    private controls() {
        return new AtomicHash(lifecycleKey, codec)
    }
    private runtimes() {
        return new AtomicHash(runtimesKey, runtimeCodec)
    }

    /** Every business worker registers before accepting work. An expired process can never re-register itself. */
    async startRuntime(): Promise<void> {
        if (this.runtimeId) throw new Error('native kit runtime already started')
        const id = randomUUID()
        await AtomicHashTransaction.run(async (tx) => {
            const state = await this.state(tx)
            if (state && state.phase !== 'active') throw new NativeKitMaintenance()
            const now = await tx.time(this.runtimes())
            const current = (await tx.get(this.runtimes(), this.id)) ?? {}
            const live = Object.fromEntries(Object.entries(current).filter(([, expiresAt]) => expiresAt > now))
            if (Object.keys(live).length >= 128) throw new Error('native kit runtime capacity reached')
            await tx.set(this.runtimes(), this.id, { ...live, [id]: now + 10000 })
        })
        this.runtimeId = id
        this.runtimeStopped = false
        NativeKitLifecycle.running.add(this)
        const heartbeat = () => {
            if (this.runtimeStopped) return
            this.runtimePending = this.renewRuntime()
                .catch(() => {
                    // Fail closed: lost connectivity or an expired lease requires a new process.
                    this.runtimeStopped = true
                })
                .finally(() => {
                    if (!this.runtimeStopped) {
                        this.runtimeTimer = setTimeout(heartbeat, 2000)
                        this.runtimeTimer.unref()
                    }
                })
        }
        this.runtimeTimer = setTimeout(heartbeat, 2000)
        this.runtimeTimer.unref()
    }
    private async renewRuntime(): Promise<void> {
        await AtomicHashTransaction.run(async (tx) => {
            const now = await tx.time(this.runtimes())
            const current = (await tx.get(this.runtimes(), this.id)) ?? {}
            if (!this.runtimeId || (current[this.runtimeId] ?? 0) <= now) throw new NativeKitMaintenance()
            tx.validBefore(current[this.runtimeId])
            await tx.set(this.runtimes(), this.id, { ...current, [this.runtimeId]: now + 10000 })
        })
    }
    private async assertRuntime(tx: AtomicHashTransaction): Promise<void> {
        if (!this.runtimeId) return // Operator commands and isolated domain tests do not start a service worker.
        if (this.runtimeStopped) throw new NativeKitMaintenance()
        const current = await tx.get(this.runtimes(), this.id)
        const expiresAt = current?.[this.runtimeId] ?? 0
        if (expiresAt <= (await tx.time(this.runtimes()))) throw new NativeKitMaintenance()
        tx.validBefore(expiresAt)
    }
    async stopRuntime(): Promise<void> {
        this.runtimeStopped = true
        clearTimeout(this.runtimeTimer)
        await this.runtimePending
        if (this.runtimeId)
            await AtomicHashTransaction.run(async (tx) => {
                const current = { ...(await tx.get(this.runtimes(), this.id)) }
                delete current[this.runtimeId!]
                await tx.set(this.runtimes(), this.id, current)
            })
        NativeKitLifecycle.running.delete(this)
    }
    static async stopRuntimes(): Promise<void> {
        await Promise.all([...this.running].map((runtime) => runtime.stopRuntime()))
    }
    /** Close code replacement against concurrent resume/startup, and reject any surviving worker. */
    async detach(storageKeys?: readonly string[]): Promise<void> {
        if (
            storageKeys &&
            (storageKeys.length > 1000 ||
                new Set(storageKeys).size !== storageKeys.length ||
                storageKeys.some((key) => !key.startsWith(`kt:${this.id}:`) || key.length > 256 || /\s/.test(key)))
        )
            throw new Error('invalid native kit storage keys')
        await AtomicHashTransaction.run(async (tx) => {
            const state = await this.state(tx)
            if (
                state &&
                (state.dataVersion !== this.dataVersion ||
                    (storageKeys && state.storageKeys?.some((key) => !storageKeys.includes(key))))
            )
                throw new Error('retained data version/key removal requires a migration')
            if (state && !['drained', 'detached'].includes(state.phase))
                throw new Error('drain kit before code mutation')
            const now = await tx.time(this.runtimes())
            const current = (await tx.get(this.runtimes(), this.id)) ?? {}
            if (Object.values(current).some((expiresAt) => expiresAt > now))
                throw new Error('stop all kit workers before code mutation')
            if (
                state?.phase === 'detached' &&
                (!storageKeys || JSON.stringify(state.storageKeys) === JSON.stringify(storageKeys))
            )
                return
            await tx.set(this.controls(), this.id, {
                schemaVersion: 1,
                dataVersion: state?.dataVersion ?? this.dataVersion,
                ...(storageKeys || state?.storageKeys ? { storageKeys: storageKeys ?? state!.storageKeys } : {}),
                phase: 'detached',
                epoch: (state?.epoch ?? 0) + 1,
                owner: '',
                expiresAt: 0,
            })
        })
    }
    /** Called only after the installed tree and generated registries have passed installer checks. */
    async attach(): Promise<void> {
        await AtomicHashTransaction.run(async (tx) => {
            const state = await this.state(tx)
            if (!state || state.phase !== 'detached') throw new Error('kit is not detached')
            await tx.set(this.controls(), this.id, { ...state, phase: 'drained', epoch: state.epoch + 1 })
        })
    }
    private compatible(state: AtomicReadonly<NativeKitControl>): void {
        if (state.dataVersion < this.minSupported || state.dataVersion > this.dataVersion)
            throw new Error(
                `native kit ${this.id} data version ${state.dataVersion} outside ${this.minSupported}..${this.dataVersion}`,
            )
    }
    async state(tx: AtomicHashTransaction): Promise<AtomicReadonly<NativeKitControl> | undefined> {
        const state = await tx.get(this.controls(), this.id)
        if (state) this.compatible(state)
        return state
    }
    async initialize(): Promise<void> {
        await AtomicHashTransaction.run(async (tx) => {
            if (await this.state(tx)) return
            await tx.set(this.controls(), this.id, {
                schemaVersion: 1,
                dataVersion: this.dataVersion,
                phase: 'active',
                epoch: 1,
                owner: '',
                expiresAt: 0,
            })
        })
    }
    async assertWritable(tx: AtomicHashTransaction): Promise<void> {
        const state = await this.state(tx)
        const token = this.maintenance.getStore()
        if (!token) await this.assertRuntime(tx)
        if (!state) {
            await tx.set(this.controls(), this.id, {
                schemaVersion: 1,
                dataVersion: this.dataVersion,
                phase: 'active',
                epoch: 1,
                owner: '',
                expiresAt: 0,
            })
            return
        }
        if (state.phase === 'active' && !token) return
        if (!token || state.phase !== 'draining' || state.owner !== token.owner || state.epoch !== token.epoch)
            throw new NativeKitMaintenance()
        const now = await tx.time(this.controls())
        if (now >= state.expiresAt) throw new NativeKitMaintenance()
        tx.validBefore(state.expiresAt)
    }
    async runnable(): Promise<boolean> {
        const state = await AtomicHashTransaction.run((tx) => this.state(tx))
        return !state || state.phase === 'active' || !!this.maintenance.getStore()
    }
    async beginDrain(owner: string): Promise<NativeKitDrainToken> {
        if (!owner || owner.length > 128) throw new Error('invalid drain owner')
        return AtomicHashTransaction.run(async (tx) => {
            const state = await this.state(tx)
            if (state?.phase === 'detached') throw new Error('kit code is detached; install and attach before draining')
            const now = await tx.time(this.controls())
            if (state?.phase === 'draining' && state.owner !== owner && state.expiresAt > now)
                throw new NativeKitMaintenance()
            const epoch =
                (state?.epoch ?? 0) +
                (state?.phase === 'draining' && state.owner === owner && state.expiresAt > now ? 0 : 1)
            await tx.set(this.controls(), this.id, {
                schemaVersion: 1,
                dataVersion: state?.dataVersion ?? this.dataVersion,
                ...(state?.storageKeys ? { storageKeys: state.storageKeys } : {}),
                phase: 'draining',
                epoch,
                owner,
                expiresAt: now + 60000,
            })
            return { owner, epoch }
        })
    }
    async drainWork<T>(token: NativeKitDrainToken, work: () => Promise<T>): Promise<T> {
        return this.maintenance.run(token, work)
    }
    async finishDrain(token: NativeKitDrainToken, verify: (tx: AtomicHashTransaction) => Promise<void>): Promise<void> {
        await this.drainWork(token, () =>
            AtomicHashTransaction.run(async (tx) => {
                const state = await this.state(tx)
                if (!state || state.phase !== 'draining' || state.owner !== token.owner || state.epoch !== token.epoch)
                    throw new NativeKitMaintenance()
                await this.assertWritable(tx)
                await verify(tx)
                await tx.set(this.controls(), this.id, { ...state, phase: 'drained', owner: '', expiresAt: 0 })
            }),
        )
    }
    /** Explicitly abandon drain when operator intervention is needed (for example, a full mailbox). */
    async cancelDrain(token: NativeKitDrainToken): Promise<void> {
        await this.drainWork(token, () =>
            AtomicHashTransaction.run(async (tx) => {
                await this.assertWritable(tx)
                const state = (await this.state(tx))!
                await tx.set(this.controls(), this.id, {
                    ...state,
                    phase: 'active',
                    epoch: state.epoch + 1,
                    owner: '',
                    expiresAt: 0,
                })
            }),
        )
    }

    async resume(): Promise<void> {
        await AtomicHashTransaction.run(async (tx) => {
            const state = await this.state(tx)
            if (!state || state.phase === 'active') return
            if (state.phase !== 'drained') throw new NativeKitMaintenance()
            await tx.set(this.controls(), this.id, { ...state, phase: 'active', epoch: state.epoch + 1 })
        })
    }
}
