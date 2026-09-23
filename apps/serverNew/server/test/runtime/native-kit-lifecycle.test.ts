import assert from 'node:assert/strict'
import { AtomicHash, AtomicHashTransaction, atomicCounterCodec } from '@arthropoda/game-engine'
import { NativeKitLifecycle, NativeKitMaintenance } from '../../src/runtime/kit/NativeKitLifecycle'
import { installFakeCenterRedis } from '../support/FakeCenterRedis'

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

describe('native kit persistent write barrier', () => {
    it('rejects a held pre-drain write and all its unguarded asset changes in the same commit', async () => {
        installFakeCenterRedis()
        const worker = new NativeKitLifecycle('fixture', 1)
        const operator = new NativeKitLifecycle('fixture', 1)
        await worker.initialize()
        const assets = new AtomicHash('test:assets', atomicCounterCodec)
        const business = new AtomicHash('test:business', atomicCounterCodec, undefined, (tx) =>
            worker.assertWritable(tx),
        )
        await AtomicHashTransaction.run(async (tx) => {
            await tx.set(assets, 'u', 100)
            await tx.set(business, 'u', 1)
        })
        const observed = deferred(),
            held = deferred()
        const pending = AtomicHashTransaction.run(async (tx) => {
            await tx.set(assets, 'u', 0)
            await tx.set(business, 'u', 2)
            observed.resolve()
            await held.promise
        })
        const rejected = assert.rejects(pending, NativeKitMaintenance)
        await observed.promise
        const token = await operator.beginDrain('operator')
        held.resolve()
        await rejected
        assert.equal(await assets.read('u'), 100)
        assert.equal(await business.read('u'), 1)
        // Valid maintenance context is local to this async chain, never a process-global bypass.
        const entered = deferred(),
            release = deferred()
        const maintenance = worker.drainWork(token, async () => {
            entered.resolve()
            await release.promise
            await AtomicHashTransaction.run((tx) => tx.set(business, 'u', 3))
        })
        await entered.promise
        await assert.rejects(
            AtomicHashTransaction.run((tx) => tx.delete(business, 'u')),
            NativeKitMaintenance,
        )
        release.resolve()
        await maintenance
        await assert.rejects(
            operator.finishDrain(token, async () => {
                throw new Error('rewards still pending')
            }),
            /rewards still pending/,
        )
        assert.equal((await AtomicHashTransaction.run((tx) => operator.state(tx)))?.phase, 'draining')
        await operator.finishDrain(token, async (tx) => {
            assert.equal(await tx.get(business, 'u'), 3)
        })
        assert.equal(await worker.runnable(), false)
        // Restart/bootstrap cannot silently reopen a drained kit.
        await new NativeKitLifecycle('fixture', 1).initialize()
        await assert.rejects(
            AtomicHashTransaction.run((tx) => tx.set(business, 'u', 4)),
            NativeKitMaintenance,
        )
        await operator.resume()
        await AtomicHashTransaction.run((tx) => tx.set(business, 'u', 4))
        assert.equal(await business.read('u'), 4)
    })

    it('keeps data closed for incompatible code and invalidates an old maintenance token', async () => {
        installFakeCenterRedis()
        const life = new NativeKitLifecycle('fixture', 2)
        await life.initialize()
        await assert.rejects(new NativeKitLifecycle('fixture', 1).initialize(), /outside 1..1/)
        const first = await life.beginDrain('operator')
        await assert.rejects(life.beginDrain('other'), NativeKitMaintenance)
        await life.finishDrain(first, async () => undefined)
        await life.resume()
        const second = await life.beginDrain('operator')
        assert.ok(second.epoch > first.epoch)
        await assert.rejects(
            life.drainWork(first, () => AtomicHashTransaction.run((tx) => life.assertWritable(tx))),
            NativeKitMaintenance,
        )
        await assert.rejects(life.resume(), NativeKitMaintenance)
        await life.finishDrain(second, async () => undefined)
    })
    it('requires stopped workers, latches code mutation, and fences an expired old process after reinstall', async () => {
        installFakeCenterRedis()
        const worker = new NativeKitLifecycle('fixture', 1)
        const operator = new NativeKitLifecycle('fixture', 1)
        const originalNow = Date.now
        let now = 1_900_000_000_000
        Date.now = () => now
        try {
            await worker.initialize()
            await worker.startRuntime()
            const token = await operator.beginDrain('operator')
            await operator.finishDrain(token, async () => undefined)
            await assert.rejects(operator.detach(), /stop all kit workers/)
            await assert.rejects(new NativeKitLifecycle('fixture', 1).startRuntime(), NativeKitMaintenance)
            now += 10001
            await operator.detach()
            await assert.rejects(operator.resume(), NativeKitMaintenance)
            await assert.rejects(operator.beginDrain('operator'), /detached/)
            await operator.attach()
            await operator.resume()
            await assert.rejects(
                AtomicHashTransaction.run((tx) => worker.assertWritable(tx)),
                NativeKitMaintenance,
            )
            const replacement = new NativeKitLifecycle('fixture', 1)
            await replacement.startRuntime()
            await AtomicHashTransaction.run((tx) => replacement.assertWritable(tx))
            await replacement.stopRuntime()
            await assert.rejects(
                AtomicHashTransaction.run((tx) => replacement.assertWritable(tx)),
                NativeKitMaintenance,
            )
        } finally {
            await worker.stopRuntime()
            Date.now = originalNow
        }
    })

    it('cancel reopens normal writes but invalidates the abandoned operator chain', async () => {
        installFakeCenterRedis()
        const life = new NativeKitLifecycle('fixture', 1)
        await life.initialize()
        const token = await life.beginDrain('operator')
        await life.cancelDrain(token)
        await AtomicHashTransaction.run((tx) => life.assertWritable(tx))
        await assert.rejects(
            life.drainWork(token, () => AtomicHashTransaction.run((tx) => life.assertWritable(tx))),
            NativeKitMaintenance,
        )
    })
    it('retains the key footprint after code removal and refuses unsupported data migrations', async () => {
        installFakeCenterRedis()
        const life = new NativeKitLifecycle('fixture', 1)
        await life.detach(['kt:fixture:records:v1'])
        await assert.rejects(
            new NativeKitLifecycle('fixture', 2, 1).detach(['kt:fixture:records:v1']),
            /requires a migration/,
        )
        await assert.rejects(life.detach([]), /requires a migration/)
        await life.attach()
        await life.resume()
        const token = await life.beginDrain('operator')
        await life.finishDrain(token, async () => undefined)
        await assert.rejects(life.detach([]), /requires a migration/)
    })
})
