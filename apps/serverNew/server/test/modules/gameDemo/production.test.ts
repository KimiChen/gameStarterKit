import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { GameDemoAlchemy } from '../../../src/modules/gameDemo/alchemy/GameDemoAlchemy'
import { GameDemoHero } from '../../../src/modules/gameDemo/hero/GameDemoHero'
import { GameDemoShop } from '../../../src/modules/gameDemo/shop/GameDemoShop'
import { GameDemoScoreEvents } from '../../../src/modules/gameDemo/season/GameDemoScoreEvents'
import { NativeLobbyAssets } from '../../../src/runtime/lobby/NativeLobbyAssets'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'

async function prepare(uid: string) {
    await new GameDemoAccount().initialize(uid, 1, 'init', true)
    await new GameDemoShop().buy(uid, 1, { clientReqId: 'herb', product: 'herb', count: 20 })
    await new GameDemoShop().buy(uid, 1, { clientReqId: 'dew', product: 'dew', count: 10 })
}

describe('gameDemo alchemy and hero', () => {
    for (const count of [1, 5, 10]) {
        it(`settles ${count} units immediately, survives reconstruction and retries without duplicate rewards`, async () => {
            const redis = installFakeCenterRedis()
            const uid = `batch-${count}`
            await prepare(uid)
            const req = { clientReqId: 'start', count }
            const [first, duplicate] = await Promise.all([
                new GameDemoAlchemy().start(uid, 1, req, 1000, { batchId: 'batch', seed: '0'.repeat(32) }),
                new GameDemoAlchemy().start(uid, 1, req, 1000, { batchId: 'reroll', seed: 'f'.repeat(32) }),
            ])
            assert.deepEqual(duplicate, first)
            assert.equal(first.batch!.durationMs, 0)
            assert.equal(first.batch!.endsAt, first.batch!.startedAt)
            assert.equal(first.batch!.phase, 'claimed')
            assert.equal(first.batch!.completed, count)
            assert.equal(first.assets.items.herb, 20 - 2 * count)
            assert.equal(first.assets.items.dew, 10 - count)
            assert.equal(first.assets.items.pill + first.assets.items.finePill, 200 + count)
            const restored = await new GameDemoAlchemy().read(uid, 1, 1000)
            assert.deepEqual(restored.assets, first.assets)
            assert.deepEqual(restored.batch, first.batch)
            const stored = JSON.parse(
                (await redis.hGet('kt:gameDemo:alchemy-batches:v1', JSON.stringify([1, uid, first.batch!.id])))!,
            )
            assert.equal(stored.outcomes.length, count)
            await AtomicHashTransaction.run(async (tx) => {
                assert.equal(await new GameDemoScoreEvents().latest(tx, 1), 1)
                assert.equal((await new GameDemoScoreEvents().get(tx, 1, 1))!.score, first.batch!.score)
            })
            const finish = await new GameDemoAlchemy().finish(
                uid,
                1,
                { clientReqId: 'legacy-finish', batchId: first.batch!.id, early: false },
                1000,
            )
            assert.deepEqual(finish.assets, first.assets)
        })
    }

    it('rolls back material costs, outcomes and score together when the submission fails', async () => {
        const redis = installFakeCenterRedis()
        await prepare('failure')
        const req = { clientReqId: 'start', count: 5 }
        redis.failNextScript('-- atomic-hash-fields-v1')
        await assert.rejects(new GameDemoAlchemy().start('failure', 1, req, 1000), /注入的脚本失败/)
        const unchanged = await new GameDemoAlchemy().read('failure', 1, 1000)
        assert.equal(unchanged.batch, null)
        assert.equal(unchanged.assets.items.herb, 20)
        assert.equal(unchanged.assets.items.dew, 10)
        assert.equal(unchanged.assets.items.pill + unchanged.assets.items.finePill, 200)
        assert.equal(await AtomicHashTransaction.run((tx) => new GameDemoScoreEvents().latest(tx, 1)), 0)
        const retry = await new GameDemoAlchemy().start('failure', 1, req, 1000)
        assert.equal(retry.assets.items.pill + retry.assets.items.finePill, 205)
    })

    it('serializes competing submissions against inventory without overspending', async () => {
        installFakeCenterRedis()
        await prepare('race')
        const results = await Promise.allSettled(
            ['a', 'b'].map((clientReqId) => new GameDemoAlchemy().start('race', 1, { clientReqId, count: 10 }, 1000)),
        )
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
        const state = await new GameDemoAlchemy().read('race', 1, 1000)
        assert.equal(state.assets.items.herb, 0)
        assert.equal(state.assets.items.dew, 0)
        assert.equal(state.assets.items.pill + state.assets.items.finePill, 210)
    })

    it('keeps pre-v4 batch timers, partial refunds and idempotent legacy collection', async () => {
        const redis = installFakeCenterRedis()
        await prepare('legacy')
        // Persist the exact v3 record shape, representing a batch created before the upgrade.
        const view = {
            id: 'old',
            configVersion: 3,
            count: 3,
            startedAt: 1000,
            durationMs: 2000,
            endsAt: 7000,
            phase: 'running',
            completed: 0,
            pill: 0,
            finePill: 0,
            refundedHerb: 0,
            refundedDew: 0,
            score: 0,
        }
        await AtomicHashTransaction.run(async (tx) => {
            await NativeLobbyAssets.changeItem(tx, 'legacy', 1, 900001, -6)
            await NativeLobbyAssets.changeItem(tx, 'legacy', 1, 900002, -3)
        })
        await redis.hSet('kt:gameDemo:alchemy-current:v1', '1:legacy', 'old')
        await redis.hSet(
            'kt:gameDemo:alchemy-batches:v1',
            '[1,"legacy","old"]',
            JSON.stringify({
                schemaVersion: 1,
                view,
                seed: '0'.repeat(32),
                outcomes: [0, 1, 0],
                herbCost: 2,
                dewCost: 1,
                normalScore: 1,
                fineScore: 3,
            }),
        )
        const restored = await new GameDemoAlchemy().read('legacy', 1, 4000)
        assert.equal(restored.batch!.endsAt, 7000)
        assert.equal(restored.batch!.completed, 1)
        await assert.rejects(
            new GameDemoAlchemy().start('legacy', 1, { clientReqId: 'overlap', count: 1 }, 4000),
            (error: { code: string }) => error.code === 'GAME_DEMO_BATCH_RUNNING',
        )
        await assert.rejects(
            new GameDemoAlchemy().finish('legacy', 1, { clientReqId: 'too-early', batchId: 'old', early: false }, 4000),
            (error: { code: string }) => error.code === 'GAME_DEMO_BATCH_NOT_READY',
        )
        const req = { clientReqId: 'finish', batchId: 'old', early: true }
        const finished = await new GameDemoAlchemy().finish('legacy', 1, req, 4000)
        assert.equal(finished.batch!.pill + finished.batch!.finePill, 1)
        assert.equal(finished.batch!.refundedHerb, 4)
        assert.equal(finished.batch!.refundedDew, 2)
        assert.deepEqual(await new GameDemoAlchemy().finish('legacy', 1, req, 99999), finished)
    })

    it('supports partial ten-pill training and caps the hero without overcharging', async () => {
        const redis = installFakeCenterRedis()
        await new GameDemoAccount().initialize('hero', 1, 'init', true)
        await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeItem(tx, 'hero', 1, 900003, -97))
        const req = { clientReqId: 'train', pill: 'normal' as const, count: 10 as const }
        const trained = await new GameDemoHero().upgrade('hero', 1, req)
        assert.equal(trained.consumed, 3)
        assert.equal(trained.hero.level, 2)
        assert.equal(trained.hero.exp, 10)
        assert.equal(trained.hero.attack, 15)
        assert.equal(trained.assets.items.pill, 0)
        assert.deepEqual(await new GameDemoHero().upgrade('hero', 1, req), trained)
        for (let i = 0; i < 6; i++)
            await new GameDemoHero().upgrade('hero', 1, { clientReqId: `fine-${i}`, pill: 'fine', count: 10 })
        const capped = await new GameDemoHero().upgrade('hero', 1, { clientReqId: 'fine-two', pill: 'fine', count: 10 })
        assert.equal(capped.hero.level, 100)
        assert.equal(capped.hero.exp, 0)
        assert.equal(capped.hero.attack, 505)
        assert.equal(capped.consumed, 5)
        assert.equal(capped.assets.items.finePill, 35)
        await assert.rejects(
            new GameDemoHero().upgrade('hero', 1, { clientReqId: 'max', pill: 'fine', count: 1 }),
            (error: { code: string }) => error.code === 'GAME_DEMO_HERO_MAX',
        )
        assert.equal(await redis.hGet('nativeLobby:grants:items:v1', '1:hero:900004'), '35')
    })
})
