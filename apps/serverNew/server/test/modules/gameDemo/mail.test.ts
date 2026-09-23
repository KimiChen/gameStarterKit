import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { GameDemoMailbox } from '../../../src/modules/gameDemo/rewards/GameDemoMailbox'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'

describe('gameDemo reward mail', () => {
    it('delivers offline once and rejects a changed award with the same source', async () => {
        installFakeCenterRedis()
        const first = await AtomicHashTransaction.run((tx) =>
            new GameDemoMailbox().deliver(tx, 'offline', 1, 'season:1:rank:1', '榜奖', 1000, 1),
        )
        const replay = await AtomicHashTransaction.run((tx) =>
            new GameDemoMailbox().deliver(tx, 'offline', 1, 'season:1:rank:1', '榜奖', 1000, 2),
        )
        assert.equal(replay, first)
        const mailbox = await new GameDemoMailbox().read('offline', 1)
        assert.equal(mailbox.mails.length, 1)
        assert.equal(mailbox.mails[0].createdAt, 1)
        assert.equal((await new GameDemoAccount().read('offline', 1)).gold, 0)
        await assert.rejects(
            AtomicHashTransaction.run((tx) =>
                new GameDemoMailbox().deliver(tx, 'offline', 1, 'season:1:rank:1', '榜奖', 1001, 3),
            ),
            (error: { code: string }) => error.code === 'OPERATION_CONFLICT',
        )
    })

    it('reads and claims a single attachment exactly once under concurrent requests and retries', async () => {
        const redis = installFakeCenterRedis()
        await new GameDemoAccount().initialize('reader', 1, 'init', true)
        const first = await new GameDemoMailbox().read('reader', 1)
        assert.equal(first.mails.length, 1)
        const mailId = first.mails[0].id
        const read = await new GameDemoMailbox().markRead('reader', 1, { clientReqId: 'read', mailId })
        assert.equal(read.mails[0].read, true)
        assert.equal(read.mails[0].claimed, false)
        const claims = await Promise.all(
            Array.from({ length: 10 }, (_, index) =>
                new GameDemoMailbox().claim('reader', 1, { clientReqId: `claim-${index}`, mailId }),
            ),
        )
        assert.ok(claims.every((value) => value.assets.gold === 5100 && value.mailbox.mails[0].claimed))
        assert.equal(await redis.hGet('nativeLobby:shop:balance:v1', '1:reader'), '5100')
        const replay = await new GameDemoMailbox().claim('reader', 1, { clientReqId: 'claim-0', mailId })
        assert.deepEqual(replay, claims[0])
        await assert.rejects(
            new GameDemoMailbox().claim('stranger', 1, { clientReqId: 'stolen', mailId }),
            (error: { code: string }) => error.code === 'GAME_DEMO_MAIL_NOT_FOUND',
        )
        assert.equal((await new GameDemoAccount().read('stranger', 1)).gold, 0)
    })

    it('aborts grant and mail flags together when receipt persistence fails', async () => {
        const redis = installFakeCenterRedis()
        await new GameDemoAccount().initialize('failure', 1, 'init', true)
        const mailId = (await new GameDemoMailbox().read('failure', 1)).mails[0].id
        redis.failNextScript('-- atomic-hash-fields-v1')
        await assert.rejects(
            new GameDemoMailbox().claim('failure', 1, { clientReqId: 'claim', mailId }),
            /注入的脚本失败/,
        )
        assert.equal((await new GameDemoAccount().read('failure', 1)).gold, 5000)
        assert.equal((await new GameDemoMailbox().read('failure', 1)).mails[0].claimed, false)
        const result = await new GameDemoMailbox().claim('failure', 1, { clientReqId: 'claim', mailId })
        assert.equal(result.assets.gold, 5100)
        assert.equal(result.mailbox.mails[0].claimed, true)
    })

    it('bounds the visible inbox without dropping unclaimed rewards or forgetting delivery receipts', async () => {
        installFakeCenterRedis()
        for (let index = 0; index < 100; index++) {
            await AtomicHashTransaction.run((tx) =>
                new GameDemoMailbox().deliver(tx, 'full', 1, `mail-${index}`, '奖励', 1, index),
            )
        }
        await assert.rejects(
            AtomicHashTransaction.run((tx) => new GameDemoMailbox().deliver(tx, 'full', 1, 'overflow', '奖励', 1, 101)),
            (error: { code: string }) => error.code === 'GAME_DEMO_MAILBOX_FULL',
        )
        const first = (await new GameDemoMailbox().read('full', 1)).mails[0]
        await new GameDemoMailbox().claim('full', 1, { clientReqId: 'claim', mailId: first.id })
        await AtomicHashTransaction.run((tx) =>
            new GameDemoMailbox().deliver(tx, 'full', 1, 'overflow', '奖励', 1, 101),
        )
        await AtomicHashTransaction.run((tx) => new GameDemoMailbox().deliver(tx, 'full', 1, 'mail-0', '奖励', 1, 102))
        const inbox = await new GameDemoMailbox().read('full', 1)
        assert.equal(inbox.mails.length, 100)
        assert.ok(inbox.mails.every((mail) => mail.id !== first.id))
        assert.equal((await new GameDemoAccount().read('full', 1)).gold, 1)
    })
})
