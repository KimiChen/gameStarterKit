import { RedisInstance as RealRedisInstance } from '../../../engine/src/database/RedisInstance'

/**
 * 原生 Lobby 测试用的中心 Redis 假体。
 *
 * 默认测试套件不得依赖真实 Redis，而各 store 直接调用 `RedisInstance.getCenterRedis()`，
 * 因此这里在进程内替换引擎的静态实例。注意引擎公开入口导出的是 `RedisInstanceExport` 门面，
 * 而 `RedisLock` 用的是真实 `RedisInstance`——两者共用同一个 `centerRedis` 字段，替换它即可同时生效。
 */
export class FakeCenterRedis {
    getId(): string {
        return 'fake-center'
    }
    private readonly hashes = new Map<string, Map<string, string>>()
    private readonly lists = new Map<string, string[]>()
    private readonly sets = new Map<string, Set<string>>()
    private readonly strings = new Map<string, string>()
    private readonly zsets = new Map<string, Map<string, number>>()
    private readonly expiries = new Map<string, number>()
    /**
     * 通用幂等闸用 `SET … PX` 写的毫秒级过期。
     * 与 `expiries`（秒级 `EXPIRE`）分开：两套 TTL 语义不同，混用会让「结果窗口过期后重试
     * 应重新执行 handler」这条断言在假体上变成随机结果。
     */
    private readonly millisecondExpiries = new Map<string, number>()
    /** `failNextCommand` 注入的一次性失败（命令名 → 下一次调用抛错）。 */
    private readonly pendingFailures = new Set<string>()
    /** `failNextScript` 注入的一次性失败（脚本标记 → 下一条命中该标记的脚本抛错）。 */
    private readonly pendingScriptFailures = new Set<string>()

    hGet(key: string, field: string): Promise<string | null> {
        this.takeFailure('hGet')
        return Promise.resolve(this.hash(key)?.get(field) ?? null)
    }

    hGetAll(key: string): Promise<Record<string, string>> {
        return Promise.resolve(Object.fromEntries(this.hash(key) ?? new Map()))
    }

    hmGet(key: string, fields: Array<string | number>): Promise<Record<string, string>> {
        const hash = this.hash(key)
        const result: Record<string, string> = {}
        for (const value of fields) {
            const field = String(value)
            const item = hash?.get(field)
            if (item !== undefined) result[field] = item
        }
        return Promise.resolve(result)
    }

    hmGetToMap(key: string, fields: Array<string | number>): Promise<Record<string, string>> {
        return this.hmGet(key, fields)
    }

    hSet(key: string, field: string, value: string): Promise<number> {
        const hash = this.hash(key, true)!
        const created = hash.has(field) ? 0 : 1
        hash.set(field, value)
        return Promise.resolve(created)
    }

    hSetNX(key: string, field: string, value: string): Promise<number> {
        const hash = this.hash(key, true)!
        if (hash.has(field)) return Promise.resolve(0)
        hash.set(field, value)
        return Promise.resolve(1)
    }

    hIncrBy(key: string, field: string, increment: number): Promise<number> {
        const hash = this.hash(key, true)!
        const next = Number(hash.get(field) ?? 0) + increment
        hash.set(field, String(next))
        return Promise.resolve(next)
    }

    hDel(key: string, field: string): Promise<number> {
        return Promise.resolve(this.hash(key)?.delete(field) ? 1 : 0)
    }

    hExists(key: string, field: string): Promise<boolean> {
        return Promise.resolve(this.hash(key)?.has(field) ?? false)
    }

    sAdd(key: string, members: string | string[]): Promise<number> {
        const set = this.memberSet(key, true)!
        let added = 0
        for (const member of Array.isArray(members) ? members : [members]) {
            if (!set.has(member)) {
                set.add(member)
                added += 1
            }
        }
        return Promise.resolve(added)
    }

    sRem(key: string, members: string | string[]): Promise<number> {
        const set = this.memberSet(key)
        let removed = 0
        for (const member of Array.isArray(members) ? members : [members]) if (set?.delete(member)) removed += 1
        return Promise.resolve(removed)
    }

    sMembers(key: string): Promise<string[]> {
        return Promise.resolve([...(this.memberSet(key) ?? [])])
    }

    rPush(key: string, elements: string[]): Promise<number> {
        const list = this.list(key, true)!
        list.push(...elements)
        return Promise.resolve(list.length)
    }

    lRange(key: string, start: number, stop: number): Promise<string[]> {
        const list = this.list(key) ?? []
        const end = stop < 0 ? list.length + stop + 1 : stop + 1
        return Promise.resolve(list.slice(start < 0 ? list.length + start : start, end))
    }

    lTrim(key: string, start: number, stop: number): Promise<string> {
        const list = this.list(key)
        if (list) {
            const end = stop < 0 ? list.length + stop + 1 : stop + 1
            const kept = list.slice(start < 0 ? list.length + start : start, end)
            this.lists.set(key, kept)
        }
        return Promise.resolve('OK')
    }

    setnx(key: string, value: string): Promise<boolean> {
        if (this.strings.has(key)) return Promise.resolve(false)
        this.strings.set(key, value)
        return Promise.resolve(true)
    }

    /**
     * 字符串命令。真实身份分配链（`NativeLobbyIdentityMap` → `GameIdGenerator`）必须用
     * `get`/`set`/`exists`/`incr` 才能被驱动；缺了它们，测试只能替身掉身份解析，
     * 于是「内部 uid 由中心 Redis 原子分配」这条路径永远没有证据。
     */
    get(key: string): Promise<string | null> {
        this.takeFailure('get')
        return Promise.resolve(this.strings.get(key) ?? null)
    }

    set(key: string, value: string | number): Promise<string> {
        this.strings.set(key, String(value))
        return Promise.resolve('OK')
    }

    /** 与 Redis 一致：只统计存在的键，返回命中数而不是布尔值。 */
    exists(key: string): Promise<number> {
        return Promise.resolve(this.strings.has(key) ? 1 : 0)
    }

    incr(key: string): Promise<number> {
        return this.incrBy(key, 1)
    }

    incrBy(key: string, decrement: number): Promise<number> {
        const next = Number(this.strings.get(key) ?? 0) + decrement
        this.strings.set(key, String(next))
        return Promise.resolve(next)
    }

    delete(key: string): Promise<number> {
        return Promise.resolve(this.strings.delete(key) ? 1 : 0)
    }

    expire(key: string, seconds: number): Promise<number> {
        this.expiries.set(key, Date.now() + seconds * 1000)
        return Promise.resolve(1)
    }

    /**
     * 原始客户端（node-redis）面：只镜像生产代码**直接**使用的那几个命令。
     *
     * Lua 入口按**脚本身份标记**分派，而不是猜语义：每条被镜像的脚本都有独占标记，
     * 未镜像的脚本直接抛错——脚本改了而假体没跟上时必须是响亮的失败，不能静默返回错值。
     * 镜像对象：通用幂等闸的 acquire / complete / release、私房 creation ticket 的配额签发
     * （与 GameRoom 侧同一条 Lua）、引擎锁 `RedisLock.unLock`、SLG 到期索引的有界读取、
     * 以及私房 ticket 记录的 `SET … PX`（毫秒级 TTL 没有等价的 `RedisCache` 包装）。
     */
    client(): {
        hScan: (
            key: string,
            cursor: number,
            options: { COUNT: number },
        ) => Promise<{ cursor: number; tuples: { field: string; value: string }[] }>
        eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>
        set: (key: string, value: string, options?: { PX?: number }) => Promise<string>
        zRangeByScore: (
            key: string,
            min: string | number,
            max: string | number,
            options: { LIMIT: { offset: number; count: number } },
        ) => Promise<string[]>
    } {
        return {
            hScan: async (key, cursor, options) => {
                const entries = [...(this.hash(key) ?? new Map())]
                const end = Math.min(entries.length, cursor + options.COUNT)
                return {
                    cursor: end >= entries.length ? 0 : end,
                    tuples: entries.slice(cursor, end).map(([field, value]) => ({ field, value })),
                }
            },
            eval: (script, options) => Promise.resolve(this.evalScript(script, options)),
            set: (key, value, options) => {
                this.takeFailure('set')
                this.strings.set(key, value)
                if (options?.PX !== undefined) this.millisecondExpiries.set(key, Date.now() + options.PX)
                return Promise.resolve('OK')
            },
            zRangeByScore: (key, min, max, options) => Promise.resolve(this.zRangeByScore(key, min, max, options)),
        }
    }

    /** 有序集合基数；配额类断言需要读和 Lua 同一个结构，而不是另建一份计数。 */
    zCard(key: string): number {
        return this.zset(key)?.size ?? 0
    }

    zAdd(key: string, score: number, member: string): number {
        const members = this.zset(key, true)!
        const created = members.has(member) ? 0 : 1
        members.set(member, score)
        return created
    }

    zRem(key: string, member: string): number {
        return this.zset(key)?.delete(member) ? 1 : 0
    }

    zRange(key: string, start: number, stop: number, isRev = false): Promise<string[]> {
        const members = [...(this.zset(key) ?? [])].sort(
            (left, right) => left[1] - right[1] || left[0].localeCompare(right[0]),
        )
        if (isRev) members.reverse()
        const end = stop < 0 ? members.length + stop + 1 : stop + 1
        return Promise.resolve(members.slice(start, end).map(([member]) => member))
    }

    /**
     * 与真实 `ZRANGEBYSCORE` **同形**：`LIMIT` 是下推给存储层的条数上限，
     * 用于「多读一条判断是否还有积压」。⛔ 不做成「先取全量再切片」——
     * 那样假体会替生产代码掩盖无界读取，而假体的职责恰恰是暴露它。
     */
    zRangeByScore(
        key: string,
        min: string | number,
        max: string | number,
        options?: { LIMIT?: { offset: number; count: number } },
    ): string[] {
        const members = this.zset(key)
        if (!members) return []
        const lower = min === '-inf' ? Number.NEGATIVE_INFINITY : Number(min)
        const upper = max === '+inf' ? Number.POSITIVE_INFINITY : Number(max)
        const hits = [...members]
            .filter(([, score]) => score >= lower && score <= upper)
            .sort((left, right) => left[1] - right[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
            .map(([member]) => member)
        const limit = options?.LIMIT
        return limit ? hits.slice(limit.offset, limit.offset + limit.count) : hits
    }

    /** 测试 seam：把幂等记录改写成非法 JSON，模拟外部篡改/存储腐坏。 */
    corruptIdempotency(): void {
        for (const key of this.millisecondExpiries.keys()) this.strings.set(key, '{not json')
    }

    /** 测试 seam：把已有记录改写成非法 JSON，模拟存储腐坏。 */
    corruptHash(key: string): void {
        for (const field of this.hash(key)?.keys() ?? []) this.hSet(key, field, '{not json')
    }

    /**
     * 测试 seam：让**下一次**指定命令抛错（一次性），用于验证「基础设施失败 ≠ 确定性结论」——
     * 例如 resolve 读不到邀请码时必须是可重试的 `ROOM_SERVICE_UNAVAILABLE`，
     * ⛔ 不能降级成「码不存在」这类把抖动说成事实的结论。
     */
    failNextCommand(command: 'get' | 'hGet' | 'set'): void {
        this.pendingFailures.add(command)
    }

    /**
     * 测试 seam：让**下一条含该标记的 Lua 脚本**抛错（一次性）。
     *
     * 按脚本内容定位而不是「下一次 eval」：一条业务调用会先经通用幂等闸的 acquire 脚本，
     * 「下一次 eval 失败」打到的是闸而不是被测脚本，测出来的就不是你以为的那条路径。
     */
    failNextScript(marker: string): void {
        this.pendingScriptFailures.add(marker)
    }

    private takeFailure(command: string): void {
        if (!this.pendingFailures.delete(command)) return
        throw new Error(`FakeCenterRedis: 注入的 ${command} 失败`)
    }

    private evalScript(script: string, options: { keys: string[]; arguments: string[] }): unknown {
        this.takeFailure('eval')
        for (const marker of this.pendingScriptFailures) {
            if (!script.includes(marker)) continue
            this.pendingScriptFailures.delete(marker)
            throw new Error(`FakeCenterRedis: 注入的脚本失败（标记 ${marker}）`)
        }
        if (script.includes('-- atomic-hash-time-v1')) return Date.now()
        if (script.includes('-- atomic-hash-fields-v1')) {
            const deadline = Number(options.arguments[1] ?? 0)
            if (deadline > 0 && Date.now() >= deadline) return 0
            const entries = JSON.parse(options.arguments[0]) as Array<[number, string, string | null, string | null]>
            for (const key of options.keys) {
                if (this.strings.has(key) || this.lists.has(key) || this.sets.has(key) || this.zsets.has(key))
                    throw new Error('WRONGTYPE atomic hash')
            }
            for (const [keyIndex, field, before] of entries) {
                if ((this.hash(options.keys[keyIndex - 1])?.get(field) ?? null) !== before) return 0
            }
            for (const [keyIndex, field, before, after] of entries) {
                if (before === after) continue
                if (after === null) this.hash(options.keys[keyIndex - 1])?.delete(field)
                else this.hash(options.keys[keyIndex - 1], true)!.set(field, after)
            }
            return 1
        }
        if (script.includes("return {'acquired'}")) return this.idempotencyAcquire(options.keys, options.arguments)
        if (script.includes('done-oversize')) return this.idempotencyComplete(options.keys, options.arguments)
        if (script.includes('record.leaseId == ARGV[1]'))
            return this.idempotencyRelease(options.keys, options.arguments)
        if (script.includes('user-online-replace')) return this.userOnlineReplace(options.keys, options.arguments)
        if (script.includes('user-online-delete-if-current'))
            return this.userOnlineDeleteIfCurrent(options.keys, options.arguments)
        if (script.includes('user-online-set-worker-owner'))
            return this.userOnlineSetWorkerOwner(options.keys, options.arguments)
        if (script.includes('player-worker-owner-claim'))
            return this.playerWorkerOwnerClaim(options.keys, options.arguments)
        if (script.includes('queued-local-action-enqueue-v2'))
            return this.queuedActionEnqueue(options.keys, options.arguments)
        if (script.includes('queued-local-action-claim-v2'))
            return this.queuedActionClaim(options.keys, options.arguments)
        if (script.includes('queued-local-action-ack-v2')) return this.queuedActionAck(options.keys, options.arguments)
        if (script.includes('queued-local-action-fail-v2'))
            return this.queuedActionFail(options.keys, options.arguments)
        if (script.includes('queued-local-action-renew-v2'))
            return this.queuedActionRenew(options.keys, options.arguments)
        if (script.includes('queued-local-action-cancel-v2'))
            return this.queuedActionCancel(options.keys, options.arguments)
        if (script.includes("'t:' .. ARGV[3]")) return this.creationTicketIssue(options.keys, options.arguments)
        if (script.includes('redis.call("GET", KEYS[1]) == ARGV[1]'))
            return this.lockRelease(options.keys, options.arguments)
        throw new Error('FakeCenterRedis: 未镜像的 Lua 脚本（脚本已变而假体未跟上）')
    }

    private userOnlineReplace(keys: string[], args: string[]): string {
        const [key] = keys
        const [field, next] = args
        const hash = this.hash(key, true)!
        const previous = hash.get(field) ?? ''
        hash.set(field, next)
        return previous
    }

    private userOnlineDeleteIfCurrent(keys: string[], args: string[]): number {
        const [key] = keys
        const [field, expectedConnectionId] = args
        const hash = this.hash(key)
        const raw = hash?.get(field)
        if (!raw) return 0
        const current = JSON.parse(raw) as { connectionId?: number }
        if (Number(current.connectionId) !== Number(expectedConnectionId)) return 0
        return hash!.delete(field) ? 1 : 0
    }

    private userOnlineSetWorkerOwner(keys: string[], args: string[]): number {
        const [key] = keys
        const [field, expectedConnectionId, workerId] = args
        const hash = this.hash(key)
        const raw = hash?.get(field)
        if (!raw) return 0
        const current = JSON.parse(raw) as { connectionId?: number; workerId?: number }
        if (Number(current.connectionId) !== Number(expectedConnectionId)) return 0
        current.workerId = Number(workerId)
        hash!.set(field, JSON.stringify(current))
        return 1
    }

    private playerWorkerOwnerClaim(keys: string[], args: string[]): number {
        const [key] = keys
        const [field, workerNum, candidate] = args
        const hash = this.hash(key, true)!
        const current = Number(hash.get(field))
        if (Number.isInteger(current) && current >= 0 && current < Number(workerNum)) return current
        hash.set(field, candidate)
        return Number(candidate)
    }

    private queuedActionEnqueue(keys: string[], args: string[]): [string, string] {
        const [tasksKey, readyKey] = keys
        const [taskId, fingerprint, raw, availableAt] = args
        const tasks = this.hash(tasksKey, true)!
        const existing = tasks.get(taskId)
        if (existing) {
            const record = JSON.parse(existing) as { fingerprint?: string }
            return record.fingerprint === fingerprint ? ['existing', existing] : ['conflict', existing]
        }
        tasks.set(taskId, raw)
        this.zset(readyKey, true)!.set(taskId, Number(availableAt))
        return ['enqueued', raw]
    }

    private queuedActionClaim(keys: string[], args: string[]): string | null {
        const [tasksKey, readyKey, inflightKey, failedKey, legacyKey] = keys
        const [readyNowRaw, leaseNowRaw, leaseUntilRaw, owner, maxAttemptsRaw, legacyTaskId, legacyFingerprint] = args
        const readyNow = Number(readyNowRaw)
        const leaseNow = Number(leaseNowRaw)
        const leaseUntil = Number(leaseUntilRaw)
        const maxAttempts = Number(maxAttemptsRaw)
        const tasks = this.hash(tasksKey, true)!
        const ready = this.zset(readyKey, true)!
        const inflight = this.zset(inflightKey, true)!
        const failed = this.zset(failedKey, true)!

        const storeFailed = (taskId: string, record: Record<string, unknown>, reason: string) => {
            Object.assign(record, {
                state: 'failed',
                failedAt: readyNow,
                updatedAt: readyNow,
                lastError: reason,
            })
            delete record.leaseOwner
            delete record.leaseUntil
            tasks.set(taskId, JSON.stringify(record))
            failed.set(taskId, readyNow)
        }
        const claim = (taskId: string, record: Record<string, unknown>) => {
            record.attempts = Number(record.attempts ?? 0) + 1
            Object.assign(record, { state: 'running', leaseOwner: owner, leaseUntil, updatedAt: readyNow })
            tasks.set(taskId, JSON.stringify(record))
            ready.delete(taskId)
            inflight.set(taskId, leaseUntil)
            return JSON.stringify(record)
        }

        for (const [taskId, score] of [...inflight].sort((left, right) => left[1] - right[1])) {
            if (score > leaseNow) break
            inflight.delete(taskId)
            const raw = tasks.get(taskId)
            if (!raw) continue
            const record = JSON.parse(raw) as Record<string, unknown>
            if (record.state !== 'running') continue
            if (Number(record.attempts ?? 0) >= maxAttempts) {
                storeFailed(taskId, record, 'execution lease expired after final attempt')
                continue
            }
            return claim(taskId, record)
        }

        for (const [taskId, score] of [...ready].sort((left, right) => left[1] - right[1])) {
            if (score > readyNow) break
            ready.delete(taskId)
            const raw = tasks.get(taskId)
            if (!raw) continue
            const record = JSON.parse(raw) as Record<string, unknown>
            if (record.state === 'pending') return claim(taskId, record)
        }

        const legacy = this.zset(legacyKey)
        const legacyEntry = legacy
            ? [...legacy].sort((left, right) => left[1] - right[1]).find(([, score]) => score <= readyNow)
            : undefined
        if (!legacyEntry) return null
        legacy!.delete(legacyEntry[0])
        let item: Record<string, unknown>
        try {
            item = JSON.parse(legacyEntry[0]) as Record<string, unknown>
        } catch {
            storeFailed(
                legacyTaskId,
                { version: 2, taskId: legacyTaskId, attempts: maxAttempts },
                'corrupt legacy task record',
            )
            return null
        }
        const record: Record<string, unknown> = {
            version: 2,
            taskId: legacyTaskId,
            fingerprint: legacyFingerprint,
            apiName: item.apiName,
            uId: Number(item.uId ?? 0),
            sId: Number(item.sId ?? 0),
            req: item.req,
            createdAt: readyNow,
            availableAt: legacyEntry[1],
            attempts: 0,
            state: 'pending',
        }
        tasks.set(legacyTaskId, JSON.stringify(record))
        return claim(legacyTaskId, record)
    }

    private queuedActionAck(keys: string[], args: string[]): number {
        const [tasksKey, inflightKey] = keys
        const [taskId, owner, now] = args
        const tasks = this.hash(tasksKey)
        const raw = tasks?.get(taskId)
        if (!raw) return 0
        const record = JSON.parse(raw) as Record<string, unknown>
        if (record.state !== 'running' || record.leaseOwner !== owner) return 0
        Object.assign(record, { state: 'done', completedAt: Number(now), updatedAt: Number(now) })
        delete record.leaseOwner
        delete record.leaseUntil
        tasks!.set(taskId, JSON.stringify(record))
        this.zset(inflightKey)?.delete(taskId)
        return 1
    }

    private queuedActionFail(keys: string[], args: string[]): string {
        const [tasksKey, readyKey, inflightKey, failedKey] = keys
        const [taskId, owner, nowRaw, error, maxAttemptsRaw, retryDelayRaw] = args
        const tasks = this.hash(tasksKey)
        const raw = tasks?.get(taskId)
        if (!raw) return 'lost'
        const record = JSON.parse(raw) as Record<string, unknown>
        if (record.state !== 'running' || record.leaseOwner !== owner) return 'lost'
        const now = Number(nowRaw)
        const maxAttempts = Number(maxAttemptsRaw)
        this.zset(inflightKey)?.delete(taskId)
        Object.assign(record, { lastError: error, updatedAt: now })
        delete record.leaseOwner
        delete record.leaseUntil
        if (Number(record.attempts ?? 0) < maxAttempts) {
            Object.assign(record, { state: 'pending', availableAt: now + Number(retryDelayRaw) })
            tasks!.set(taskId, JSON.stringify(record))
            this.zset(readyKey, true)!.set(taskId, Number(record.availableAt))
            return 'retry'
        }
        Object.assign(record, { state: 'failed', failedAt: now })
        tasks!.set(taskId, JSON.stringify(record))
        this.zset(failedKey, true)!.set(taskId, now)
        return 'failed'
    }

    private queuedActionRenew(keys: string[], args: string[]): number {
        const [tasksKey, inflightKey] = keys
        const [taskId, owner, leaseUntilRaw] = args
        const tasks = this.hash(tasksKey)
        const raw = tasks?.get(taskId)
        if (!raw) return 0
        const record = JSON.parse(raw) as Record<string, unknown>
        if (record.state !== 'running' || record.leaseOwner !== owner) return 0
        record.leaseUntil = Number(leaseUntilRaw)
        tasks!.set(taskId, JSON.stringify(record))
        this.zset(inflightKey, true)!.set(taskId, Number(leaseUntilRaw))
        return 1
    }

    private queuedActionCancel(keys: string[], args: string[]): number {
        const [tasksKey, readyKey] = keys
        const [taskId] = args
        const tasks = this.hash(tasksKey)
        const raw = tasks?.get(taskId)
        if (!raw) return 0
        const record = JSON.parse(raw) as { state?: string }
        if (record.state !== 'pending') return 0
        tasks!.delete(taskId)
        this.zset(readyKey)?.delete(taskId)
        return 1
    }

    private lockRelease(keys: string[], args: string[]): unknown {
        const [key] = keys
        if (key !== undefined && this.strings.get(key) === args[0]) {
            this.strings.delete(key)
            return 1
        }
        return 0
    }

    /**
     * 镜像私房 creation ticket 的配额签发脚本——**与 GameRoom 侧 `TICKET_ISSUE_CREATION`
     * 逐字一致**（Lobby 与 GameRoom 共用这一条 Lua，两侧必须同时改）：
     * 过期配额成员先按 score 剪除 → 配额检查 → 写 `t:<jti>` 成员 + ticket 记录（任一失败整体不生效）。
     * 时钟对齐 Lua 的 `TIME`（取当前时刻）。
     */
    private creationTicketIssue(keys: string[], args: string[]): unknown {
        const [quotaKey, ticketKey] = keys as [string, string]
        const [max, ttl, jti, record] = args as [string, string, string, string]
        const now = Date.now()
        this.purgePending(quotaKey, now)
        if ((this.zset(quotaKey)?.size ?? 0) >= Number(max)) return ['quota']
        if (this.strings.has(ticketKey)) return ['dup']
        this.zset(quotaKey, true)!.set(`t:${jti}`, now + Number(ttl))
        this.strings.set(ticketKey, record)
        return ['ok']
    }

    /**
     * 镜像 `NativeLobbyIdempotency.ACQUIRE_SCRIPT`：
     * 过期清理 → 冲突 → 契约版本 fail-closed → pending/done → 容量闸 → 原子占位。
     */
    private idempotencyAcquire(keys: string[], args: string[]): unknown {
        const [recordKey, pendingKey] = keys as [string, string]
        const [now, pendingTtl, maxPending, member, pendingJson, hash, contractVersion] = args as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
        ]
        this.purgePending(pendingKey, Number(now))
        const raw = this.liveString(recordKey)
        if (raw !== null) {
            const record = decodeRecord(raw)
            if (!record) return ['corrupt']
            if (record.hash !== hash) return ['conflict']
            if (record.contractVersion !== Number(contractVersion)) {
                return record.state === 'pending' ? ['in_progress'] : ['expired']
            }
            if (record.state === 'pending') return ['in_progress']
            if (record.state === 'done-oversize') return ['expired']
            return ['done', record.resultJson]
        }
        if ((this.zset(pendingKey)?.size ?? 0) >= Number(maxPending)) return ['busy']
        this.strings.set(recordKey, pendingJson)
        this.millisecondExpiries.set(recordKey, Number(now) + Number(pendingTtl))
        this.zset(pendingKey, true)!.set(member, Number(now) + Number(pendingTtl))
        return ['acquired']
    }

    /** 镜像 `COMPLETE_SCRIPT`：只有仍持有 lease 的 pending 才能提升为 done / done-oversize。 */
    private idempotencyComplete(keys: string[], args: string[]): unknown {
        const [recordKey, pendingKey] = keys as [string, string]
        const [leaseId, resultJson, maxBytes, resultTtl, member] = args as [string, string, string, string, string]
        const raw = this.liveString(recordKey)
        if (raw === null) return 0
        const record = decodeRecord(raw)
        if (!record || record.state !== 'pending' || record.leaseId !== leaseId) return 0
        const next =
            Buffer.byteLength(resultJson, 'utf8') > Number(maxBytes)
                ? { v: 2, state: 'done-oversize', hash: record.hash, contractVersion: record.contractVersion }
                : {
                      v: 2,
                      state: 'done',
                      hash: record.hash,
                      resultJson,
                      contractVersion: record.contractVersion,
                  }
        this.strings.set(recordKey, JSON.stringify(next))
        this.millisecondExpiries.set(recordKey, Date.now() + Number(resultTtl))
        this.zset(pendingKey)?.delete(member)
        return 1
    }

    /** 镜像 `RELEASE_SCRIPT`：只删自己的 pending，绝不删除后来者的占位。 */
    private idempotencyRelease(keys: string[], args: string[]): unknown {
        const [recordKey, pendingKey] = keys as [string, string]
        const [leaseId, member] = args as [string, string]
        const raw = this.liveString(recordKey)
        if (raw !== null) {
            const record = decodeRecord(raw)
            if (record && record.state === 'pending' && record.leaseId === leaseId) this.strings.delete(recordKey)
        }
        this.zset(pendingKey)?.delete(member)
        return 1
    }

    /** `GET` 的幂等记录视角：先按 PX 判过期，再返回。 */
    private liveString(key: string): string | null {
        const expiry = this.millisecondExpiries.get(key)
        if (expiry !== undefined && expiry <= Date.now()) {
            this.strings.delete(key)
            this.millisecondExpiries.delete(key)
            return null
        }
        return this.strings.get(key) ?? null
    }

    private purgePending(key: string, now: number): void {
        const members = this.zset(key)
        if (!members) return
        for (const [member, score] of members) if (score <= now) members.delete(member)
    }

    private zset(key: string, create = false): Map<string, number> | undefined {
        let value = this.zsets.get(key)
        if (!value && create) {
            value = new Map()
            this.zsets.set(key, value)
        }
        return value
    }

    private hash(key: string, create = false): Map<string, string> | undefined {
        let hash = this.hashes.get(key)
        if (!hash && create) {
            hash = new Map()
            this.hashes.set(key, hash)
        }
        return hash
    }

    private list(key: string, create = false): string[] | undefined {
        let list = this.lists.get(key)
        if (!list && create) {
            list = []
            this.lists.set(key, list)
        }
        return list
    }

    private memberSet(key: string, create = false): Set<string> | undefined {
        let value = this.sets.get(key)
        if (!value && create) {
            value = new Set()
            this.sets.set(key, value)
        }
        return value
    }
}

/** 与 Lua 的 `pcall(cjson.decode, ...)` 对齐：腐坏记录必须能被识别，而不是当成未执行。 */
interface StoredIdemRecord {
    readonly state: 'pending' | 'done' | 'done-oversize'
    readonly hash: string
    readonly contractVersion: number
    readonly leaseId?: string
    readonly resultJson?: string
}

function decodeRecord(raw: string): StoredIdemRecord | null {
    try {
        const value = JSON.parse(raw) as StoredIdemRecord
        return typeof value?.state === 'string' && typeof value?.hash === 'string' ? value : null
    } catch {
        return null
    }
}

export interface FakeRedisInstallOptions {
    /**
     * 同时把**玩家档 Redis**（`userRedis`）与区服 Redis（`serverRedis`）指向同一个假体。
     *
     * 走 `User` Bean 的路径（`UserHash.getRedis()` → `RedisInstance.getUserRedis()`）必须有它，
     * 否则 `User.load` 会在 `undefined.hGetAll` 上抛 TypeError。只装中心 Redis 的夹具在
     * 「认证成功后的 Action 会加载 User Bean」这类链路上跑不通 —— 那是夹具缺口，
     * ⛔ 不要为了绕开它在生产代码里吞掉玩家档 Redis 的缺失。
     */
    readonly player?: boolean
}

/** 安装假体并关闭引擎调试开关（锁会读该全局，未定义时会抛错）。 */
export function installFakeCenterRedis(options?: FakeRedisInstallOptions): FakeCenterRedis {
    const fake = new FakeCenterRedis()
    const instance = RealRedisInstance as unknown as {
        centerRedis: unknown
        userRedis?: unknown
        serverRedis?: unknown
    }
    instance.centerRedis = fake
    if (options?.player === true) {
        instance.userRedis = fake
        instance.serverRedis = fake
    }
    ;(globalThis as unknown as { ADJUST_OPEN: boolean }).ADJUST_OPEN = false
    return fake
}
