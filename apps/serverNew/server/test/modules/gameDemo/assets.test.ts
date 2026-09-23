import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { NativeLobbyAssets } from '../../../src/runtime/lobby/NativeLobbyAssets'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'

describe('gameDemo asset authority', () => {
    it('reads without creating data; disabled development tools cannot grant', async () => {
        const redis = installFakeCenterRedis()
        const account = new GameDemoAccount()
        assert.deepEqual(await account.read('reader', 1), {
            initialized: false,
            revision: 0,
            gold: 0,
            items: { herb: 0, dew: 0, pill: 0, finePill: 0 },
        })
        await assert.rejects(
            account.initialize('reader', 1, 'denied', false),
            (error: { code: string }) => error.code === 'GAME_DEMO_DEV_DISABLED',
        )
        assert.equal(await redis.hExists('kt:gameDemo:accounts:v1', '1:reader'), false)
        assert.equal(await redis.hExists('nativeLobby:shop:balance:v1', '1:reader'), false)
    })

    it('initializes once across concurrent calls and retains the existing host balance', async () => {
        const redis = installFakeCenterRedis()
        await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeGold(tx, 'existing', 1, 123))
        const results = await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                new GameDemoAccount().initialize('existing', 1, `init-${index}`, true),
            ),
        )
        assert.ok(results.every((result) => result.gold === 5123 && result.initialized && result.items.pill === 100 && result.items.finePill === 100))
        assert.equal(await redis.hGet('nativeLobby:shop:balance:v1', '1:existing'), '5123')
        await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeGold(tx, 'existing', 1, -100))
        const restarted = new GameDemoAccount()
        assert.equal((await restarted.initialize('existing', 1, 'init-0', true)).gold, 5123)
        assert.equal((await restarted.read('existing', 1)).gold, 5023)
        assert.equal((await restarted.initialize('existing', 2, 'init-0', true)).gold, 5000)
    })

    it('backfills legacy accounts once, preserves inventory, and never replenishes consumed pills', async () => {
        const redis = installFakeCenterRedis()
        await redis.hSet('kt:gameDemo:accounts:v1', '1:legacy', JSON.stringify({ schemaVersion: 1, revision: 1 }))
        await AtomicHashTransaction.run(async (tx) => {
            await NativeLobbyAssets.changeGold(tx, 'legacy', 1, 321)
            await NativeLobbyAssets.changeItem(tx, 'legacy', 1, 900003, 7)
        })
        await Promise.all(Array.from({ length: 12 }, (_, i) =>
            new GameDemoAccount().initialize('legacy', 1, `backfill-${i}`, true)))
        const granted = await new GameDemoAccount().read('legacy', 1)
        assert.equal(granted.gold, 321)
        assert.deepEqual(granted.items, { herb: 0, dew: 0, pill: 107, finePill: 100 })
        await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeItem(tx, 'legacy', 1, 900003, -107))
        const login = await new GameDemoAccount().initialize('legacy', 1, 'next-login', true)
        assert.equal(login.items.pill, 0)
        assert.equal(login.items.finePill, 100)
        assert.equal(login.gold, 321)
    })

    it('rolls back the pill gift and grant marker together on a failed transaction', async () => {
        const redis = installFakeCenterRedis()
        const account = new GameDemoAccount()
        redis.failNextScript('-- atomic-hash-fields-v1')
        await assert.rejects(account.initialize('retry', 1, 'grant', true), /注入的脚本失败/)
        const failed = await account.read('retry', 1)
        assert.equal(failed.initialized, false)
        assert.equal(failed.gold, 0)
        assert.deepEqual(failed.items, { herb: 0, dew: 0, pill: 0, finePill: 0 })
        const granted = await account.initialize('retry', 1, 'grant', true)
        assert.equal(granted.items.pill, 100)
        assert.equal(granted.items.finePill, 100)
        assert.deepEqual(await account.initialize('retry', 1, 'grant', true), granted)
    })

    it('aborts all resource changes on insufficient materials', async () => {
        const redis = installFakeCenterRedis()
        await new GameDemoAccount().initialize('buyer', 1, 'first', true)
        await assert.rejects(
            AtomicHashTransaction.run(async (tx) => {
                await NativeLobbyAssets.changeGold(tx, 'buyer', 1, -100)
                await NativeLobbyAssets.changeItem(tx, 'buyer', 1, 900001, -1)
            }),
            (error: { code: string }) => error.code === 'INSUFFICIENT_BALANCE',
        )
        assert.equal(await redis.hGet('nativeLobby:shop:balance:v1', '1:buyer'), '5000')
        assert.equal(await redis.hExists('nativeLobby:grants:items:v1', '1:buyer:900001'), false)
    })
})
