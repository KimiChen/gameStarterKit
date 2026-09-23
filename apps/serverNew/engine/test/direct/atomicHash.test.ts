import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
    AtomicHash, AtomicHashTransaction, AtomicHashConflict, atomicCounterCodec, atomicJsonCodec,
    RedisCache, AtomicLease, AtomicLeaseLost, OwnedRoom, AtomicOperation, AtomicOperationConflict, atomicStringCodec, type AtomicReadonly,
} from '../../src'

const port = Number(process.env.ATOMIC_HASH_REDIS_PORT)
if (!Number.isSafeInteger(port) || port < 1) throw new Error('set ATOMIC_HASH_REDIS_PORT to an isolated Redis')
const redis = new RedisCache({ host: '127.0.0.1', port, database: 9, secret: '' })
const prefix = process.argv[2] ?? `atomic-contract:${randomUUID()}`
const wallet = new AtomicHash(`${prefix}:wallet`, atomicCounterCodec, redis)
const receipt = new AtomicHash(`${prefix}:receipts`, atomicCounterCodec, redis)
const keys = [`${prefix}:wallet`, `${prefix}:receipts`, `${prefix}:document`, `${prefix}:wrong`, `${prefix}:operations`]

async function spend(id: string) {
    return AtomicHashTransaction.run(async tx => {
        const prior = await tx.get(receipt, id)
        if (prior !== undefined) return prior
        const balance = (await tx.get(wallet, 'user')) ?? 0
        if (balance < 1) throw new Error('insufficient')
        await tx.set(wallet, 'user', balance - 1)
        await tx.set(receipt, id, balance - 1)
        return balance - 1
    }, 64)
}

async function main() {
    await redis.connect()
    try {
        if (process.argv[3] === 'child') {
            for (let i = 0; i < 20; i++) await spend(`child-${process.argv[4]}-${i}`)
            return
        }
        await AtomicHashTransaction.run(async tx => { await tx.set(wallet, 'user', 100) })
        await assert.rejects(AtomicHashTransaction.run(async tx => {
            await tx.set(wallet, 'user', 0)
            throw new Error('abort before commit')
        }), /abort before commit/)
        assert.equal(await wallet.read('user'), 100)
        const values = await Promise.all(Array.from({ length: 16 }, () => spend('same-id')))
        assert.ok(values.every(value => value === 99))
        assert.equal(await wallet.read('user'), 99)

        // Independent OS processes, independent clients, same authoritative data.
        await Promise.all(['a', 'b'].map(id => new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, [...process.execArgv, __filename, prefix, 'child', id], {
                env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
            })
            let output = ''
            child.stdout.on('data', value => { output += value })
            child.stderr.on('data', value => { output += value })
            child.on('error', reject)
            child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)))
        })))
        assert.equal(await wallet.read('user'), 59)

        let attempts = 0
        await assert.rejects(AtomicHashTransaction.run(async tx => {
            attempts++
            const current = await tx.get(wallet, 'user')
            await redis.hSet(keys[0], 'user', String(current! + 1))
            await tx.set(receipt, 'must-not-write', 1)
        }, 2), AtomicHashConflict)
        assert.equal(attempts, 2)
        assert.equal(await receipt.read('must-not-write'), undefined)

        const document = new AtomicHash(keys[2], atomicJsonCodec<{ nested: { count: number }; items: number[] }>(
            (value): value is { nested: { count: number }; items: number[] } => {
                const v = value as { nested?: { count?: unknown }; items?: unknown } | null
                return !!v && typeof v.nested?.count === 'number' && Array.isArray(v.items) && v.items.every(Number.isSafeInteger)
            }), redis)
        await AtomicHashTransaction.run(async tx => { await tx.set(document, 'one', { nested: { count: 1 }, items: [2] }) })
        const value = (await document.read('one'))!
        assert.throws(() => { (value as { nested: { count: number } }).nested.count = 2 }, TypeError)
        assert.throws(() => { (value.items as number[]).push(3) }, TypeError)
        function readonlyContract(readonlyValue: AtomicReadonly<{ nested: { count: number }; items: number[] }>) {
            // @ts-expect-error nested readonly is part of the public contract
            readonlyValue.nested.count = 2
            // @ts-expect-error collection writes are forbidden
            readonlyValue.items.push(3)
        }
        void readonlyContract

        let escaped: AtomicHashTransaction | undefined
        await AtomicHashTransaction.run(async tx => { escaped = tx; await tx.get(wallet, 'user') })
        await assert.rejects(escaped!.set(wallet, 'user', 0), /ended/)
        const secondDb = new RedisCache({ host: '127.0.0.1', port, database: 8, secret: '' })
        await assert.rejects(AtomicHashTransaction.run(async tx => {
            await tx.get(wallet, 'user')
            await tx.get(new AtomicHash('other', atomicCounterCodec, secondDb), 'user')
        }), /cross-Redis/)

        const wrong = new AtomicHash(keys[3], atomicCounterCodec, redis)
        await assert.rejects(AtomicHashTransaction.run(async tx => {
            await tx.get(wrong, 'field')
            await tx.set(wallet, 'user', 0)
            await redis.set(keys[3], 'not-a-hash')
        }), /WRONGTYPE/)
        assert.equal(await wallet.read('user'), 61)
        await redis.hSet(keys[0], 'corrupt', '-5')
        await assert.rejects(wallet.read('corrupt'), /corrupt/)
        await assert.rejects(AtomicHashTransaction.run(async tx => { await tx.set(wallet, 'user', -1) }), /invalid/)
        await assert.rejects(AtomicHashTransaction.run(async tx => {
            for (let i = 0; i < 257; i++) await tx.set(wallet, `bound-${i}`, 1)
        }), /256 fields/)
        assert.equal(await wallet.read('bound-0'), undefined)
        await assert.rejects(AtomicHashTransaction.run(async tx => {
            await tx.set(new AtomicHash(keys[2], atomicStringCodec, redis), 'large', 'x'.repeat(1024 * 1024 + 1))
        }), /1 MiB/)

        const operation = new AtomicOperation<number>(keys[4], (value): value is number => Number.isSafeInteger(value), redis)
        let executed = 0
        const charge = () => operation.run('durable', 'amount:5', async tx => {
            executed++
            const balance = (await tx.get(wallet, 'user'))!
            await tx.set(wallet, 'user', balance - 5)
            return balance - 5
        })
        assert.equal(await charge(), 56)
        assert.equal(await charge(), 56)
        assert.equal(executed, 1)
        await assert.rejects(operation.run('durable', 'amount:6', async () => 0), AtomicOperationConflict)
        assert.equal(await wallet.read('user'), 56)

        // Simulate a connection failing AFTER Redis executed the commit, BEFORE the reply arrives.
        const client = redis.client()
        const evaluate = client.eval.bind(client)
        client.eval = (async (...args: Parameters<typeof evaluate>) => {
            const result = await evaluate(...args)
            if (Number(result) === 1) throw new Error('reply lost after commit')
            return result
        }) as typeof client.eval
        try {
            await assert.rejects(operation.run('lost-reply', 'amount:5', async tx => {
                await tx.set(wallet, 'user', 51)
                return 51
            }), /reply lost/)
        } finally { client.eval = evaluate as typeof client.eval }
        assert.equal(await operation.run('lost-reply', 'amount:5', async () => { throw new Error('must not repeat') }), 51)
        assert.equal(await wallet.read('user'), 51)
        const readHash = redis.hGet.bind(redis)
        let releaseRead: (() => void) | undefined
        const blockedRead = new Promise<void>(resolve => { releaseRead = resolve })
        redis.hGet = async (key, field) => { await blockedRead; return readHash(key, field) }
        let unfinished: Promise<unknown> | undefined
        try {
            await assert.rejects(AtomicHashTransaction.run(async tx => {
                unfinished = tx.set(wallet, 'forgotten-await', 1).catch(error => error)
            }), /must be awaited/)
        } finally {
            redis.hGet = readHash
            releaseRead!()
        }
        assert.match(String(await unfinished), /ended/)
        assert.equal(await wallet.read('forgotten-await'), undefined)
        // A paused request must not commit an eligibility decision made before a deadline.
        let deadlineAttempts = 0
        let deadline = 0
        await AtomicHashTransaction.run(async tx => {
            deadlineAttempts++
            const now = await tx.time(wallet)
            if (!deadline) deadline = now + 40
            if (now < deadline) {
                tx.validBefore(deadline)
                await tx.set(receipt, 'late-reward', 1)
                await new Promise(resolve => setTimeout(resolve, 60))
            } else {
                await tx.set(receipt, 'closed', 1)
            }
        })
        assert.equal(deadlineAttempts, 2)
        assert.equal(await receipt.read('late-reward'), undefined)
        assert.equal(await receipt.read('closed'), 1)
        await assert.rejects(escaped!.time(wallet), /ended/)
        const leaseKey = `${prefix}:leases`
        keys.push(leaseKey)
        const lease = new AtomicLease(leaseKey, 'room', redis)
        const tokenA = (await lease.acquire('process-a', 1000))!
        assert.equal(await lease.acquire('process-b', 1000), undefined)
        let readFence!: () => void
        const observed = new Promise<void>(resolve => { readFence = resolve })
        let resume!: () => void
        const paused = new Promise<void>(resolve => { resume = resolve })
        const staleWrite = AtomicHashTransaction.run(async tx => {
            await lease.assert(tx, tokenA)
            await tx.set(wallet, 'stale-room-write', 1)
            readFence()
            await paused
        })
        const deniedStaleWrite = assert.rejects(staleWrite, AtomicLeaseLost)
        await observed
        await new Promise(resolve => setTimeout(resolve, 1100))
        const tokenB = (await lease.acquire('process-b', 1000))!
        assert.ok(tokenB.epoch > tokenA.epoch)
        resume()
        await deniedStaleWrite
        assert.equal(await wallet.read('stale-room-write'), undefined)
        assert.equal(await lease.release(tokenA), false)
        await AtomicHashTransaction.run(async tx => { await lease.assert(tx, tokenB); await tx.set(wallet, 'new-room-write', 1) })
        assert.equal(await wallet.read('new-room-write'), 1)

        const r1 = new OwnedRoom('one', new AtomicLease(leaseKey, 'one', redis), 'host', async () => ({ hp: 10 }))
        const r2 = new OwnedRoom('two', new AtomicLease(leaseKey, 'two', redis), 'host', async () => ({ hp: 20 }))
        let releaseFirst!: () => void
        let startedFirst!: () => void
        const firstStarted = new Promise<void>(resolve => { startedFirst = resolve })
        const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve })
        const order: string[] = []
        const firstRoomJob = r1.run(async () => { startedFirst(); await holdFirst; order.push('first') })
        await firstStarted
        const queuedRoomJob = r1.run(async () => { order.push('queued') })
        await r2.run(async () => { order.push('independent') })
        assert.deepEqual(order, ['independent'])
        releaseFirst()
        await Promise.all([firstRoomJob, queuedRoomJob])
        assert.deepEqual(order, ['independent', 'first', 'queued'])
        assert.equal(r1.state!.hp, 10)
        assert.equal(r2.state!.hp, 20)
        r1.subscribe('a', 1); r1.subscribe('b', 2)
        assert.deepEqual(r1.watchers(1), [{ uid: 'a', generation: 1 }])
        assert.deepEqual(r1.watchers(1), [{ uid: 'b', generation: 2 }])
        r1.unsubscribe('a', 2)
        assert.equal(r1.watchers().length, 2)
        r1.unsubscribe('a', 1)
        assert.deepEqual(r1.watchers(), [{ uid: 'b', generation: 2 }])
        const control = new AtomicHash(`${prefix}:guard-control`, atomicCounterCodec, redis)
        const guardedKey = `${prefix}:guarded`
        keys.push(`${prefix}:guard-control`, guardedKey, `${prefix}:guarded-op`, `${prefix}:guarded-lease`)
        const guard = async (tx: AtomicHashTransaction) => {
            if (await tx.get(control, 'phase') !== 1) throw new Error('closed write scope')
        }
        const guarded = new AtomicHash(guardedKey, atomicCounterCodec, redis, guard)
        await AtomicHashTransaction.run(tx => tx.set(control, 'phase', 1))
        let guardObserved!: () => void, releaseGuard!: () => void
        const guardReady = new Promise<void>(r => { guardObserved = r })
        const guardHeld = new Promise<void>(r => { releaseGuard = r })
        const beforeDrain = AtomicHashTransaction.run(async tx => {
            await tx.set(wallet, 'must-rollback-with-scope', 1)
            await tx.set(guarded, 'business', 1)
            guardObserved(); await guardHeld
        })
        const rejectedDrain = assert.rejects(beforeDrain, /closed write scope/)
        await guardReady
        await AtomicHashTransaction.run(tx => tx.set(control, 'phase', 2))
        releaseGuard(); await rejectedDrain
        assert.equal(await guarded.read('business'), undefined)
        assert.equal(await wallet.read('must-rollback-with-scope'), undefined)
        await assert.rejects(AtomicHashTransaction.run(tx => tx.delete(guarded, 'business')), /closed write scope/)
        const guardedOp = new AtomicOperation(`${prefix}:guarded-op`, (v): v is number => typeof v === 'number', redis, guard)
        await assert.rejects(guardedOp.run('one', 'one', async tx => { await tx.set(wallet, 'op-rollback', 1); return 1 }), /closed write scope/)
        assert.equal(await wallet.read('op-rollback'), undefined)
        await assert.rejects(new AtomicLease(`${prefix}:guarded-lease`, 'room', redis, guard).acquire('host', 1000), /closed write scope/)
        await assert.rejects(wallet.scan(0, 1000), /corrupt/)
        await redis.client().hDel(keys[0], 'corrupt')
        const scanned = new Map<string, number>()
        let cursor = 0
        do {
            const page = await wallet.scan(cursor, 2)
            for (const entry of page.entries) scanned.set(entry.field, entry.value)
            cursor = page.cursor
        } while (cursor !== 0)
        assert.equal(scanned.get('user'), await wallet.read('user'))
        assert.equal(scanned.has('must-rollback-with-scope'), false)
        await assert.rejects(wallet.scan(-1), /invalid atomic hash scan/)
        console.log('atomic hash contracts passed: cross-process CAS, receipts, abort, wrong-type preflight, readonly, scope, bounds')
    } finally {
        if (process.argv[3] !== 'child') await redis.client().del(keys)
        await redis.disconnect()
    }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
