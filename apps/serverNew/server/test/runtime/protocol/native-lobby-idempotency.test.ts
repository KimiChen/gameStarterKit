import assert from 'node:assert/strict'
import {
    NativeLobbyIdempotency,
    lobbyIdempotencyHash,
    type NativeLobbyIdempotencyRedis,
} from '../../../src/runtime/lobby/NativeLobbyIdempotency'

/**
 * 内存假体：**逐条镜像** `NativeLobbyIdempotency` 中三个 Lua 脚本的判定顺序
 * （过期清理 → 冲突 → 契约版本 fail-closed → pending/done → 容量闸 → 原子占位）。
 * 默认测试套件不得依赖真实 Redis，因此这里不接真实实例。
 */
class FakeIdemRedis implements NativeLobbyIdempotencyRedis {
    private readonly records = new Map<string, { value: string; expireAt: number }>()
    private readonly pending = new Map<string, Map<string, number>>()

    eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown> {
        if (script.includes('ZREMRANGEBYSCORE')) return Promise.resolve(this.acquire(options.keys, options.arguments))
        if (script.includes('done-oversize')) return Promise.resolve(this.complete(options.keys, options.arguments))
        return Promise.resolve(this.release(options.keys, options.arguments))
    }

    /** 测试 seam：把已有记录改写成非法 JSON，模拟外部篡改/存储腐坏。 */
    corruptAll(): void {
        for (const record of this.records.values()) record.value = '{not json'
    }

    private decode(raw: string): Record<string, unknown> | null {
        try {
            return JSON.parse(raw) as Record<string, unknown>
        } catch {
            // 与 Lua 的 `pcall(cjson.decode, ...)` 对齐：腐坏记录必须能被识别，而不是当成未执行。
            return null
        }
    }

    private get(key: string): string | null {
        const record = this.records.get(key)
        if (!record) return null
        if (record.expireAt <= Date.now()) {
            this.records.delete(key)
            return null
        }
        return record.value
    }

    private set(key: string, value: string, ttlMs: number): void {
        this.records.set(key, { value, expireAt: Date.now() + ttlMs })
    }

    private zcard(key: string): number {
        this.purge(key)
        return this.pending.get(key)?.size ?? 0
    }

    private purge(key: string): void {
        const members = this.pending.get(key)
        if (!members) return
        const now = Date.now()
        for (const [member, score] of members) if (score <= now) members.delete(member)
    }

    private acquire(keys: string[], args: string[]): string[] {
        const [recordKey, pendingKey] = keys
        const [now, pendingTtl, maxPending, member, pendingJson, hash, contractVersion] = args
        this.purge(pendingKey)
        const raw = this.get(recordKey)
        if (raw) {
            const record = this.decode(raw)
            if (!record) return ['corrupt']
            if (record.hash !== hash) return ['conflict']
            if (record.contractVersion !== Number(contractVersion)) {
                return record.state === 'pending' ? ['in_progress'] : ['expired']
            }
            if (record.state === 'pending') return ['in_progress']
            if (record.state === 'done-oversize') return ['expired']
            return ['done', record.resultJson as string]
        }
        if (this.zcard(pendingKey) >= Number(maxPending)) return ['busy']
        this.set(recordKey, pendingJson, Number(pendingTtl))
        const members = this.pending.get(pendingKey) ?? new Map<string, number>()
        members.set(member, Number(now) + Number(pendingTtl))
        this.pending.set(pendingKey, members)
        return ['acquired']
    }

    private complete(keys: string[], args: string[]): number {
        const [recordKey, pendingKey] = keys
        const [leaseId, resultJson, maxBytes, resultTtl, member] = args
        const raw = this.get(recordKey)
        if (!raw) return 0
        const record = this.decode(raw)
        if (!record) return 0
        if (record.state !== 'pending' || record.leaseId !== leaseId) return 0
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
        this.set(recordKey, JSON.stringify(next), Number(resultTtl))
        this.pending.get(pendingKey)?.delete(member)
        return 1
    }

    private release(keys: string[], args: string[]): number {
        const [recordKey, pendingKey] = keys
        const [leaseId, member] = args
        const raw = this.get(recordKey)
        if (raw) {
            const record = this.decode(raw)
            if (record && record.state === 'pending' && record.leaseId === leaseId) this.records.delete(recordKey)
        }
        this.pending.get(pendingKey)?.delete(member)
        return 1
    }
}

interface Deferred<T> {
    readonly promise: Promise<T>
    resolve(value: T): void
    reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

const identity = (route: string, result: unknown) => result

/** 让出事件循环，等 `run()` 真正走到 handler 之后再发下一个请求。 */
function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

function runInput(redis: FakeIdemRedis, overrides: Partial<Parameters<NativeLobbyIdempotency['run']>[0]> = {}) {
    return {
        route: 'shop.purchase',
        uid: 'external-1',
        sId: 7,
        clientReqId: 'req-1',
        payload: { clientReqId: 'req-1', sku: 'shop.frag29x10' },
        contractVersion: 1,
        validate: identity,
        ...overrides,
    } as Parameters<NativeLobbyIdempotency['run']>[0]
}

describe('native Lobby generic idempotency gate', () => {
    it('excludes clientReqId from the payload digest so key identity alone separates requests', () => {
        const a = lobbyIdempotencyHash('shop.purchase', { clientReqId: 'req-1', sku: 'x' })
        const b = lobbyIdempotencyHash('shop.purchase', { clientReqId: 'req-2', sku: 'x' })
        assert.equal(a, b)
        assert.notEqual(a, lobbyIdempotencyHash('shop.purchase', { clientReqId: 'req-1', sku: 'y' }))
        assert.notEqual(a, lobbyIdempotencyHash('shop.queryOp', { clientReqId: 'req-1', sku: 'x' }))
    })

    it('executes once and replays the stored result for a retry with the same clientReqId', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis)
        let executions = 0
        const execute = async () => {
            executions++
            return { opId: 'op-1', status: 'done', balance: 10 }
        }
        const first = await gate.run(runInput(redis, { execute }))
        const second = await gate.run(runInput(redis, { execute }))
        assert.deepEqual(first, { opId: 'op-1', status: 'done', balance: 10 })
        assert.deepEqual(second, first)
        assert.equal(executions, 1)
    })

    it('rejects a reused clientReqId that carries a different payload', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis)
        await gate.run(runInput(redis, { execute: async () => ({ ok: true }) }))
        await assert.rejects(
            () =>
                gate.run(
                    runInput(redis, {
                        payload: { clientReqId: 'req-1', sku: 'shop.frag17x10' },
                        execute: async () => ({ ok: true }),
                    }),
                ),
            (error: { code: string }) => error.code === 'OPERATION_CONFLICT',
        )
    })

    it('answers IN_PROGRESS while the lease is held and never runs the handler twice', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis)
        const inFlight = deferred<{ ok: boolean }>()
        let executions = 0
        const first = gate.run(
            runInput(redis, {
                execute: async () => {
                    executions++
                    return inFlight.promise
                },
            }),
        )
        await flush()
        await assert.rejects(
            () => gate.run(runInput(redis, { execute: async () => ({ ok: true }) })),
            (error: { code: string }) => error.code === 'IN_PROGRESS',
        )
        inFlight.resolve({ ok: true })
        assert.deepEqual(await first, { ok: true })
        assert.equal(executions, 1)
    })

    it('releases the lease when the handler fails so a retry can run', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis)
        let executions = 0
        await assert.rejects(() =>
            gate.run(
                runInput(redis, {
                    execute: async () => {
                        executions++
                        throw { code: 'INSUFFICIENT_BALANCE', msg: '余额不足' }
                    },
                }),
            ),
        )
        const retried = await gate.run(
            runInput(redis, {
                execute: async () => {
                    executions++
                    return { ok: true }
                },
            }),
        )
        assert.deepEqual(retried, { ok: true })
        assert.equal(executions, 2)
    })

    it('keeps a done-oversize tombstone instead of caching an oversized response', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis, { resultMaxBytes: 16 })
        let executions = 0
        const execute = async () => {
            executions++
            return { opId: 'x'.repeat(64), status: 'done', balance: 1 }
        }
        await gate.run(runInput(redis, { execute }))
        await assert.rejects(
            () => gate.run(runInput(redis, { execute })),
            (error: { code: string }) => error.code === 'OPERATION_RESULT_EXPIRED',
        )
        assert.equal(executions, 1)
    })

    it('fails closed on a contract version change instead of re-executing the handler', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis)
        let executions = 0
        const execute = async () => {
            executions++
            return { ok: true }
        }
        await gate.run(runInput(redis, { execute }))
        await assert.rejects(
            () => gate.run(runInput(redis, { execute, contractVersion: 2 })),
            (error: { code: string }) => error.code === 'OPERATION_RESULT_EXPIRED',
        )
        assert.equal(executions, 1)
    })

    it('caps concurrent pending operations per uid with BUSY', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis, { maxPendingPerUser: 2 })
        const inFlight = deferred<{ ok: boolean }>()
        const blocking = async () => inFlight.promise
        const pending = [
            gate.run(runInput(redis, { clientReqId: 'req-a', payload: { clientReqId: 'req-a' }, execute: blocking })),
            gate.run(runInput(redis, { clientReqId: 'req-b', payload: { clientReqId: 'req-b' }, execute: blocking })),
        ]
        await flush()
        await assert.rejects(
            () =>
                gate.run(
                    runInput(redis, { clientReqId: 'req-c', payload: { clientReqId: 'req-c' }, execute: blocking }),
                ),
            (error: { code: string }) => error.code === 'BUSY',
        )
        inFlight.resolve({ ok: true })
        await Promise.all(pending)
    })

    it('treats a corrupted idempotency record as an internal fault, never as "not executed"', async () => {
        const redis = new FakeIdemRedis()
        const gate = new NativeLobbyIdempotency(() => redis)
        await gate.run(runInput(redis, { execute: async () => ({ ok: true }) }))
        redis.corruptAll()
        // 记录被外部改写为非法 JSON：必须 fail-closed，不能当成未执行重新跑 handler。
        await assert.rejects(
            () => gate.run(runInput(redis, { execute: async () => ({ ok: false }) })),
            (error: { code: string }) => error.code === 'INTERNAL',
        )
    })
})
