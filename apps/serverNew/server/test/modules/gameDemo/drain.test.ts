import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'
import { GameDemoDrain } from '../../../src/modules/gameDemo/GameDemoDrain'
import { gameDemoLifecycle } from '../../../src/modules/gameDemo/GameDemoPersistence'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { GameDemoShop } from '../../../src/modules/gameDemo/shop/GameDemoShop'
import { GameDemoAlchemy } from '../../../src/modules/gameDemo/alchemy/GameDemoAlchemy'
import { GameDemoBossRooms } from '../../../src/modules/gameDemo/boss/GameDemoBossRooms'
import { GameDemoBossStore } from '../../../src/modules/gameDemo/boss/GameDemoBossStore'
import { GameDemoMailbox } from '../../../src/modules/gameDemo/rewards/GameDemoMailbox'
import { NativeKitMaintenance } from '../../../src/runtime/kit/NativeKitLifecycle'

describe('gameDemo lifecycle drain', () => {
    it('waits for room owners after instant production, delivers pending rewards, and checkpoints live HP for resume', async () => {
        installFakeCenterRedis()
        const originalNow = Date.now
        let now = 1_900_000_000_000
        Date.now = () => now
        try {
            await new GameDemoAccount().initialize('u', 1, 'init', true)
            const shop = new GameDemoShop()
            await shop.buy('u', 1, { clientReqId: 'herb', product: 'herb', count: 2 })
            await shop.buy('u', 1, { clientReqId: 'dew', product: 'dew', count: 1 })
            const alchemy = new GameDemoAlchemy()
            const batch = (await alchemy.start('u', 1, { clientReqId: 'batch', count: 1 })).batch!
            const rooms = new GameDemoBossRooms(
                async () => false,
                () => true,
            )
            const joined = await rooms.enter('u', 1, { clientReqId: 'enter', bossId: 'tiger' })
            const attack = {
                clientReqId: 'hit',
                bossId: 'tiger' as const,
                runId: joined.room.runId,
                generation: joined.generation,
            }
            const hit = await rooms.attack('u', 1, attack)
            await rooms.read('u', 1, 'dragon')
            await rooms.read('u', 1, 'phoenix')
            const drain = new GameDemoDrain()
            const waiting = await drain.pass('operator')
            assert.equal(waiting.phase, 'draining')
            assert.equal(waiting.waitingBatches, 0)
            assert.equal(waiting.waitingOwners, 3)
            await assert.rejects(
                shop.buy('u', 1, { clientReqId: 'late', product: 'herb', count: 1 }),
                NativeKitMaintenance,
            )
            now += 10001
            const completed = await drain.pass('operator')
            assert.equal(completed.phase, 'drained')
            assert.equal(completed.checkpointedBosses, 3)
            const produced = await alchemy.read('u', 1)
            assert.equal(produced.batch!.id, batch.id)
            assert.equal(produced.batch!.phase, 'claimed')
            assert.equal(produced.assets.items.pill + produced.assets.items.finePill, 201)
            const rewards = (await new GameDemoMailbox().read('u', 1)).mails.filter((m) => m.title.startsWith('炼丹榜'))
            assert.equal(rewards.length, 1)
            const stored = await AtomicHashTransaction.run((tx) => new GameDemoBossStore().load(tx, 1, 'tiger'))
            assert.equal(stored!.runId, hit.room.runId)
            assert.equal(stored!.hp, hit.room.hp)
            assert.equal(stored!.damage[0].damage, 10)
            assert.equal(stored!.phase, 'running')
            await assert.rejects(rooms.attack('u', 1, { ...attack, clientReqId: 'closed-hit' }), NativeKitMaintenance)
            await gameDemoLifecycle.resume()
            const continued = await rooms.attack('u', 1, { ...attack, clientReqId: 'continued' })
            assert.equal(continued.room.runId, hit.room.runId)
            assert.equal(continued.room.hp, hit.room.hp - 10)
            assert.equal(continued.myDamage, 20)
            const repeat = await alchemy.finish('u', 1, {
                clientReqId: 'claim-after-resume',
                batchId: batch.id,
                early: false,
            })
            assert.deepEqual(repeat.assets, produced.assets)
        } finally {
            Date.now = originalNow
        }
    })
})
