import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { GameDemoShop } from '../../../src/modules/gameDemo/shop/GameDemoShop'
import { NativeLobbyAssets } from '../../../src/runtime/lobby/NativeLobbyAssets'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'

const beforeMidnight = Date.parse('2026-09-22T15:59:59Z')
const afterMidnight = beforeMidnight + 1000

describe('gameDemo material shop', () => {
    it('atomically exchanges coins for materials; replay across midnight preserves the first result', async () => {
        const redis = installFakeCenterRedis()
        await new GameDemoAccount().initialize('shopper', 1, 'init', true)
        const request = { clientReqId: 'buy', product: 'herb' as const, count: 10 }
        const first = await new GameDemoShop().buy('shopper', 1, request, beforeMidnight)
        assert.equal(first.gold, 4900)
        assert.equal(first.items.herb, 10)
        assert.equal(first.revision, 5)
        assert.equal(await redis.hGet('nativeLobby:grants:items:v1', '1:shopper:900001'), '10')
        assert.deepEqual(await new GameDemoShop().buy('shopper', 1, request, afterMidnight), first)
        assert.deepEqual((await new GameDemoShop().read('shopper', 1, afterMidnight)).purchased, { herb: 0, dew: 0 })
        const oldDay = await new GameDemoShop().read('shopper', 1, beforeMidnight)
        assert.equal(oldDay.day, '2026-09-22')
        assert.equal(oldDay.purchased.herb, 10)
        await assert.rejects(
            new GameDemoShop().buy('shopper', 1, { ...request, count: 11 }),
            (error: { code: string }) => error.code === 'OPERATION_CONFLICT',
        )
    })

    it('allows only one of two requests competing for the daily remainder', async () => {
        installFakeCenterRedis()
        await new GameDemoAccount().initialize('competing', 1, 'init', true)
        const results = await Promise.allSettled(
            ['one', 'two'].map((clientReqId) =>
                new GameDemoShop().buy('competing', 1, { clientReqId, product: 'herb', count: 60 }, beforeMidnight),
            ),
        )
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
        const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
        assert.equal(rejected.reason.code, 'GAME_DEMO_LIMIT')
        const state = await new GameDemoShop().read('competing', 1, beforeMidnight)
        assert.equal(state.purchased.herb, 60)
        assert.equal(state.assets.gold, 4400)
        assert.equal(state.assets.items.herb, 60)
    })

    it('does not consume the daily limit or create materials when funds are insufficient', async () => {
        installFakeCenterRedis()
        await new GameDemoAccount().initialize('poor', 1, 'init', true)
        await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeGold(tx, 'poor', 1, -4999))
        await assert.rejects(
            new GameDemoShop().buy('poor', 1, { clientReqId: 'buy', product: 'dew', count: 1 }, beforeMidnight),
            (error: { code: string }) => error.code === 'INSUFFICIENT_BALANCE',
        )
        const state = await new GameDemoShop().read('poor', 1, beforeMidnight)
        assert.equal(state.assets.gold, 1)
        assert.equal(state.assets.items.dew, 0)
        assert.equal(state.purchased.dew, 0)
        assert.equal(state.assets.revision, 4)
    })
})
