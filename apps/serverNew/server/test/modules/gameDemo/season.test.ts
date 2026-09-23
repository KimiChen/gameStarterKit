import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoSeason } from '../../../src/modules/gameDemo/season/GameDemoSeason'
import { GameDemoScoreEvents } from '../../../src/modules/gameDemo/season/GameDemoScoreEvents'
import { GameDemoMailbox } from '../../../src/modules/gameDemo/rewards/GameDemoMailbox'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'

const append = (uid: string, score: number, id = uid, sid = 1) =>
    AtomicHashTransaction.run((tx) => new GameDemoScoreEvents().append(tx, sid, { uid, batchId: id, score, at: 0 }))

describe('gameDemo season settlement', () => {
    it('orders ties by reaching sequence, drains the frozen stream, and delivers offline mail exactly once', async () => {
        installFakeCenterRedis()
        const season = new GameDemoSeason()
        const first = await season.read('a', 1)
        for (const uid of ['a', 'b', 'c', 'd']) await new GameDemoAccount().initialize(uid, 1, 'init', true)
        await append('a', 10)
        await append('b', 10)
        await append('c', 11)
        await append('d', 1)
        await append('a', 1, 'a-2')
        const req = { clientReqId: 'end', seasonId: first.id }
        await assert.rejects(
            season.end('a', 1, req, false),
            (e: { code: string }) => e.code === 'GAME_DEMO_DEV_DISABLED',
        )
        const ended = await season.end('a', 1, req, true)
        assert.equal(ended.phase, 'settling')
        // New facts still grant pills, but cannot enter a frozen ranking.
        await append('d', 100, 'late')
        await Promise.all([season.tick(1), new GameDemoSeason().tick(1), new GameDemoSeason().tick(1)])
        const final = await new GameDemoSeason().read('a', 1)
        assert.equal(final.phase, 'settled')
        assert.deepEqual(
            final.top.map((row) => [row.uid, row.score]),
            [
                ['c', 11],
                ['a', 11],
                ['b', 10],
                ['d', 1],
            ],
        )
        assert.equal(final.myRank, 2)
        assert.equal(final.deliveredRewards, 3)
        assert.deepEqual(await season.end('a', 1, req, true), ended)
        await season.end('b', 1, { ...req, clientReqId: 'other' }, true)
        for (const [uid, amount] of [
            ['c', 1000],
            ['a', 500],
            ['b', 200],
        ] as const) {
            const mails = await new GameDemoMailbox().read(uid, 1)
            const reward = mails.mails.filter((mail) => mail.title.startsWith('炼丹榜'))
            assert.equal(reward.length, 1)
            assert.equal(reward[0].gold, amount)
            const claim = { clientReqId: 'claim', mailId: reward[0].id }
            const result = await new GameDemoMailbox().claim(uid, 1, claim)
            assert.equal(result.assets.gold, 5000 + amount)
            assert.deepEqual(await new GameDemoMailbox().claim(uid, 1, claim), result)
        }
        assert.equal((await new GameDemoMailbox().read('d', 1)).mails.length, 1)
    })

    it('rechecks a delayed score commit at the deadline and continues settlement after reconstruction', async () => {
        const redis = installFakeCenterRedis()
        const originalNow = Date.now
        let now = 1000
        Date.now = () => now
        try {
            const season = new GameDemoSeason()
            const first = await season.read('late', 1)
            let attempts = 0
            await AtomicHashTransaction.run(async (tx) => {
                attempts++
                await new GameDemoScoreEvents().append(tx, 1, { uid: 'late', batchId: 'delayed', score: 50, at: 1000 })
                now = first.endsAt
            })
            assert.equal(attempts, 2)
            assert.equal(JSON.parse((await redis.hGet('kt:gameDemo:score-events:v1', '[1,1]'))!).seasonId, null)
            await new GameDemoSeason().tick(1)
            const final = await season.read('late', 1)
            assert.equal(final.phase, 'settled')
            assert.equal(final.myScore, 0)
            assert.equal(final.top.length, 0)
            now += 5000
            await new GameDemoSeason().tick(1)
            const next = await season.read('late', 1)
            assert.notEqual(next.id, first.id)
            assert.equal(next.endsAt - next.startedAt, 600000)
            await assert.rejects(
                season.end('late', 1, { clientReqId: 'old', seasonId: first.id }, true),
                (e: { code: string }) => e.code === 'GAME_DEMO_SEASON_CHANGED',
            )
        } finally {
            Date.now = originalNow
        }
    })

    it('retries a full mailbox without advancing its reward cursor or issuing other duplicate rewards', async () => {
        const redis = installFakeCenterRedis()
        const season = new GameDemoSeason()
        const initial = await season.read('winner', 1)
        for (let i = 0; i < 100; i++)
            await AtomicHashTransaction.run((tx) =>
                new GameDemoMailbox().deliver(tx, 'winner', 1, `full:${i}`, '测试邮件', 1, 1),
            )
        await append('winner', 2)
        await season.end('winner', 1, { clientReqId: 'end', seasonId: initial.id }, true)
        await assert.rejects(season.tick(1), (e: { code: string }) => e.code === 'GAME_DEMO_MAILBOX_FULL')
        const pending = await season.read('winner', 1)
        assert.equal(pending.phase, 'settling')
        assert.equal(pending.deliveredRewards, 0)
        const mail = (await new GameDemoMailbox().read('winner', 1)).mails[0]
        await new GameDemoMailbox().claim('winner', 1, { clientReqId: 'space', mailId: mail.id })
        redis.failNextScript('-- atomic-hash-fields-v1')
        await assert.rejects(new GameDemoSeason().step(1), /注入/)
        await new GameDemoSeason().tick(1)
        assert.equal((await season.read('winner', 1)).phase, 'settled')
        const rewards = (await new GameDemoMailbox().read('winner', 1)).mails.filter((mail) =>
            mail.title.startsWith('炼丹榜'),
        )
        assert.equal(rewards.length, 1)
    })

    it('resumes from a persisted partial reward cursor without replaying the first recipient', async () => {
        installFakeCenterRedis()
        const initial = await new GameDemoSeason().read('a', 1)
        await append('a', 3)
        await append('b', 2)
        await append('c', 1)
        await new GameDemoSeason().end('a', 1, { clientReqId: 'end', seasonId: initial.id }, true)
        // Three reducer steps plus one reward, then abandon the process-local service instance.
        for (let i = 0; i < 4; i++) await new GameDemoSeason().step(1)
        assert.equal((await new GameDemoSeason().read('a', 1)).deliveredRewards, 1)
        assert.equal((await new GameDemoMailbox().read('a', 1)).mails.length, 1)
        assert.equal((await new GameDemoMailbox().read('b', 1)).mails.length, 0)
        await new GameDemoSeason().tick(1)
        assert.equal((await new GameDemoSeason().read('a', 1)).phase, 'settled')
        for (const uid of ['a', 'b', 'c']) assert.equal((await new GameDemoMailbox().read(uid, 1)).mails.length, 1)
    })

    it('keeps only top 20, retains personal scores, and isolates realms', async () => {
        installFakeCenterRedis()
        const season = new GameDemoSeason()
        await season.read('low', 1)
        await season.read('elsewhere', 2)
        for (let i = 1; i <= 24; i++) await append(`u${i}`, i)
        await append('elsewhere', 999, 's2', 2)
        for (let i = 0; i < 4; i++) await season.tick(1)
        const low = await season.read('u1', 1)
        assert.equal(low.top.length, 20)
        assert.equal(low.top[0].uid, 'u24')
        assert.equal(low.myScore, 1)
        assert.equal(low.myRank, null)
        await season.tick(2)
        assert.equal((await season.read('elsewhere', 2)).top[0].score, 999)
    })
})
