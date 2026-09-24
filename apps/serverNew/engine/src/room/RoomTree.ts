import { ServerHash } from '../bean/redis/serverRedis'
import { ModType } from '../differ/diff'

export interface RoomSession {
    /** Internal numeric uid used by ModSync. */
    uid: number
    /** Unique connection identity; an old close must not remove its replacement. */
    connectionId: string
}

export type RoomSnapshot = unknown
export interface RoomNodeOptions {
    /** Reads an authoritative membership record. A subscription never creates membership. */
    isMember: (uid: number) => Promise<boolean> | boolean
    snapshot: (uid: number) => Promise<RoomSnapshot> | RoomSnapshot
}

export interface RoomTimerOptions {
    intervalMs: number
    schedule: 'fixedRate' | 'fixedDelay'
    overrun: 'skip' | 'coalesce'
    /** Durable deadline may be supplied by the business when the process restarts. */
    firstAt?: number
    run: () => Promise<void>
}

export interface RoomTreeOptions {
    /** Awaits the complete Action/commit lifecycle and rejects on business or save failure. */
    execute?: <T>(work: () => Promise<T>) => Promise<T>
    /** Optional fixed process placement. The host routes commands here; this is not a lease fence. */
    isLocalOwner?: () => boolean
    maxPending?: number
    snapshotTimeoutMs?: number
}

export interface RoomWork {
    /** Schedule a typed business notification after the enclosing Action has committed. */
    notify(node: RoomNode, selected: readonly number[], send: (session: RoomSession) => Promise<void>): void
    /** Apply process-local subscription changes only after the business save succeeds. */
    afterCommit(work: () => void): void
}

interface Subscription { connectionId: string }
interface RoomClock { start(): void; stop(): void }

/** A node is a visibility scope. Only the root owns execution and timers. */
export class RoomNode {
    private readonly children = new Map<string, RoomNode>()
    private readonly subscriptions = new Map<number, Subscription>()

    constructor(
        readonly tree: RoomTree,
        readonly path: string,
        readonly parent: RoomNode | undefined,
        private readonly options: RoomNodeOptions,
    ) {}

    child(id: string, options: RoomNodeOptions): RoomNode {
        if (!id || id.includes('/') || id === '.' || id === '..') throw new Error('invalid child room id')
        if (this.children.has(id)) throw new Error(`duplicate child room: ${id}`)
        const path = this.path ? `${this.path}/${id}` : id
        const node = new RoomNode(this.tree, path, this, options)
        this.children.set(id, node)
        return node
    }

    getChild(id: string): RoomNode | undefined { return this.children.get(id) }

    /** A child subscription also resumes every ancestor, but never a sibling. */
    async resume(session: RoomSession, sendFull: (path: string, snapshot: RoomSnapshot) => Promise<void>): Promise<void> {
        this.tree.checkSession(session)
        await this.tree.run(async () => {
            const lineage: RoomNode[] = []
            for (let node: RoomNode | undefined = this; node; node = node.parent) lineage.unshift(node)
            for (const node of lineage) {
                if (!(await node.options.isMember(session.uid))) throw new Error(`room membership denied: ${node.path}`)
            }
            // Sending the full snapshots inside the root FIFO gives them a strict boundary before later commits.
            // The transport must bound this wait; one slow initial sync cannot hold the room forever.
            for (const node of lineage) {
                await this.tree.deliverFull(async () => sendFull(node.path, await node.options.snapshot(session.uid)))
            }
            for (const node of lineage) node.subscriptions.set(session.uid, { connectionId: session.connectionId })
        })
    }

    /** Detach keeps durable membership; an ancestor detach also pauses its descendants. */
    detach(session: RoomSession): void {
        this.tree.checkSession(session)
        this.walk(node => {
            if (node.subscriptions.get(session.uid)?.connectionId === session.connectionId)
                node.subscriptions.delete(session.uid)
        })
    }

    /** Business calls this after a committed quit or group change. */
    revoke(uid: number): void {
        this.tree.checkUid(uid)
        this.walk(node => node.subscriptions.delete(uid))
    }

    recipients(): number[] { return [...this.subscriptions.keys()] }

    subscription(uid: number): RoomSession | undefined {
        const subscription = this.subscriptions.get(uid)
        return subscription ? { uid, connectionId: subscription.connectionId } : undefined
    }

    /** Stable key for a Bean instance; the slot allows several independent Beans on one node. */
    beanId(slot = 'state'): string {
        if (!slot) throw new Error('room Bean slot required')
        return JSON.stringify([this.tree.id, this.path, slot])
    }

    /** Bind an existing Bean; its storage key remains owned by the business module. */
    bind(bean: ServerHash, expectedId: string | number = this.beanId()): void {
        if (bean.getKeyId() !== expectedId) throw new Error('room Bean key does not match node')
        const modType = bean.getClassInfo()?.modType
        if (modType !== ModType.ModMap && modType !== ModType.ModBean)
            throw new Error('room Bean must be a network Mod')
        bean.setNotifyUidsResolver(() => this.recipients())
    }

    private walk(visit: (node: RoomNode) => void): void {
        visit(this)
        for (const child of this.children.values()) child.walk(visit)
    }
}

/** One root serializes commands and timers for the entire nested room tree. */
export class RoomTree {
    readonly root: RoomNode
    private tail: Promise<unknown> = Promise.resolve()
    private pending = 0
    private closed = false
    private timersStarted = false
    private readonly timers = new Map<string, RoomClock>()

    constructor(readonly id: string, root: RoomNodeOptions, private readonly options: RoomTreeOptions = {}) {
        if (!id) throw new Error('room id required')
        this.root = new RoomNode(this, '', undefined, root)
    }

    checkUid(uid: number): void {
        if (!Number.isSafeInteger(uid) || uid < 1) throw new Error('invalid room uid')
    }

    checkSession(session: RoomSession): void {
        this.checkUid(session.uid)
        if (!session.connectionId) throw new Error('invalid room connection')
    }

    async deliverFull(work: () => Promise<void>): Promise<void> {
        const timeoutMs = this.options.snapshotTimeoutMs ?? 5000
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('invalid room snapshot timeout')
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('room full snapshot timed out')), timeoutMs)
            void Promise.resolve().then(work).then(
                () => { clearTimeout(timeout); resolve() },
                error => { clearTimeout(timeout); reject(error) },
            )
        })
    }

    run<T>(work: (ctx: RoomWork) => Promise<T>): Promise<T> {
        if (this.closed) return Promise.reject(new Error('room closed'))
        if (this.options.isLocalOwner && !this.options.isLocalOwner()) return Promise.reject(new Error('room is not hosted here'))
        if (this.pending >= (this.options.maxPending ?? 256)) return Promise.reject(new Error('room queue full'))
        this.pending++
        const job = this.tail.then(async () => {
            if (this.options.isLocalOwner && !this.options.isLocalOwner()) throw new Error('room owner changed')
            const notifications: Array<() => Promise<void>> = []
            const afterCommit: Array<() => void> = []
            const ctx: RoomWork = {
                notify: (node, selected, send) => {
                    if (!this.options.execute) throw new Error('room notifications require an Action execution adapter')
                    if (node.tree !== this) throw new Error('notification target belongs to another room')
                    for (const uid of new Set(selected)) {
                        this.checkUid(uid)
                        notifications.push(async () => {
                            const session = node.subscription(uid)
                            if (session) await send(session)
                        })
                    }
                },
                afterCommit: work => {
                    if (!this.options.execute) throw new Error('room post-commit work requires an Action execution adapter')
                    afterCommit.push(work)
                },
            }
            const result = await (this.options.execute ? this.options.execute(() => work(ctx)) : work(ctx))
            for (const action of afterCommit) {
                try { action() }
                catch (error) { console.error(`room post-commit action failed: ${this.id}`, error) }
            }
            // Network sends do not occupy the room FIFO. An unsuccessful Action never reaches this point.
            for (const send of notifications) void send().catch(error => console.error(`room notification failed: ${this.id}`, error))
            return result
        })
        this.tail = job.catch(() => undefined)
        return job.finally(() => { this.pending-- })
    }

    /** Timers are root-only and use the same queue as player commands. */
    registerTimer(name: string, options: RoomTimerOptions): void {
        if (this.closed) throw new Error('room closed')
        if (!name || this.timers.has(name)) throw new Error(`duplicate room timer: ${name}`)
        if (!Number.isInteger(options.intervalMs) || options.intervalMs < 10 || options.intervalMs > 3600000)
            throw new Error('invalid room timer interval')
        const timer = new RoomTimer(this, options)
        this.timers.set(name, timer)
        if (this.timersStarted) timer.start()
    }

    /** Supply a persisted deadline again when reconstructing the room after a restart. */
    scheduleOnce(name: string, at: number, run: () => Promise<void>): void {
        if (this.closed) throw new Error('room closed')
        if (!name || this.timers.has(name)) throw new Error(`duplicate room timer: ${name}`)
        if (!Number.isSafeInteger(at) || at < 0) throw new Error('invalid room deadline')
        const timer = new RoomOnce(this, at, run)
        this.timers.set(name, timer)
        if (this.timersStarted) timer.start()
    }

    cancelTimer(name: string): void {
        this.timers.get(name)?.stop()
        this.timers.delete(name)
    }

    startTimers(): void {
        if (this.closed) throw new Error('room closed')
        if (this.options.isLocalOwner && !this.options.isLocalOwner()) throw new Error('room is not hosted here')
        this.timersStarted = true
        for (const timer of this.timers.values()) timer.start()
    }

    /** Stop triggers first, then drain all queued/in-flight work. */
    async close(): Promise<void> {
        if (this.closed) return this.tail.then(() => undefined)
        this.closed = true
        for (const timer of this.timers.values()) timer.stop()
        await this.tail
    }
}

class RoomTimer {
    private timeout?: ReturnType<typeof setTimeout>
    private started = false
    private stopped = false
    private busy = false
    private missed = false
    private nextAt = 0

    constructor(private readonly tree: RoomTree, private readonly options: RoomTimerOptions) {}

    start(): void {
        if (this.started || this.stopped) return
        this.started = true
        this.nextAt = performance.now() + Math.max(0, (this.options.firstAt ?? Date.now() + this.options.intervalMs) - Date.now())
        this.schedule()
    }

    stop(): void {
        this.stopped = true
        if (this.timeout) clearTimeout(this.timeout)
    }

    private schedule(): void {
        if (this.stopped) return
        this.timeout = setTimeout(() => this.fire(true), Math.max(0, this.nextAt - performance.now()))
    }

    private fire(scheduled: boolean): void {
        if (this.stopped) return
        if (scheduled && this.options.schedule === 'fixedRate') {
            const now = performance.now()
            this.nextAt += this.options.intervalMs
            if (this.nextAt <= now) this.nextAt += Math.ceil((now - this.nextAt + 1) / this.options.intervalMs) * this.options.intervalMs
            this.schedule()
        }
        if (this.busy) {
            if (this.options.overrun === 'coalesce') this.missed = true
            return
        }
        this.busy = true
        void this.tree.run(this.options.run).catch(error => {
            // The host can observe errors through its execute adapter; prevent unhandled timer rejection.
            console.error(`room timer failed: ${this.tree.id}`, error)
        }).finally(() => {
            this.busy = false
            if (this.stopped) return
            if (this.missed) {
                this.missed = false
                this.fire(false)
            } else if (this.options.schedule === 'fixedDelay') {
                this.nextAt = performance.now() + this.options.intervalMs
                this.schedule()
            }
        })
    }
}

class RoomOnce implements RoomClock {
    private timeout?: ReturnType<typeof setTimeout>
    private stopped = false
    private started = false

    constructor(private readonly tree: RoomTree, private readonly at: number, private readonly run: () => Promise<void>) {}

    start(): void {
        if (this.started || this.stopped) return
        this.started = true
        this.timeout = setTimeout(() => {
            if (this.stopped) return
            void this.tree.run(this.run).catch(error => console.error(`room timer failed: ${this.tree.id}`, error))
        }, Math.max(0, this.at - Date.now()))
    }

    stop(): void {
        this.stopped = true
        if (this.timeout) clearTimeout(this.timeout)
    }
}
