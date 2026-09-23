import assert from 'node:assert/strict'
import { AtomicHashTransaction } from '@arthropoda/game-engine'
import { GameDemoBossRooms } from '../../../src/modules/gameDemo/boss/GameDemoBossRooms'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { GameDemoHero } from '../../../src/modules/gameDemo/hero/GameDemoHero'
import { GameDemoMailbox } from '../../../src/modules/gameDemo/rewards/GameDemoMailbox'
import { NativeLobbyAssets } from '../../../src/runtime/lobby/NativeLobbyAssets'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'
const bossIds = ['tiger', 'dragon', 'phoenix'] as const
async function ready(rooms: GameDemoBossRooms) {
    for (const bossId of bossIds) await rooms.tick(1, bossId)
}
const initialized = async (uid: string) => new GameDemoAccount().initialize(uid, 1, 'init', true)
const errorCode = (code: string) => (e: { code: string }) => e.code === code

describe('gameDemo durable Boss rooms', () => {
    it('keeps three independent rooms and rejects old selection generations without losing damage', async () => {
        installFakeCenterRedis()
        const pushes: Array<{ uid: string; data: unknown }> = []
        const rooms = new GameDemoBossRooms(
            async (uid, _sid, _type, data) => {
                pushes.push({ uid, data })
                return true
            },
            () => true,
        )
        await ready(rooms)
        for (const bossId of bossIds) {
            await initialized(bossId)
            const entered = await rooms.enter(bossId, 1, { clientReqId: 'enter', bossId })
            assert.equal(entered.room.maxHp, { tiger: 2000, dragon: 4000, phoenix: 6000 }[bossId])
            const req = { clientReqId: 'attack', bossId, runId: entered.room.runId, generation: entered.generation }
            const hit = await rooms.attack(bossId, 1, req)
            assert.equal(hit.room.hp, entered.room.maxHp - 10)
            assert.equal(hit.myDamage, 10)
            assert.deepEqual(await rooms.attack(bossId, 1, req), hit)
            await assert.rejects(
                rooms.attack(bossId, 1, { ...req, clientReqId: 'cooldown' }),
                errorCode('GAME_DEMO_BOSS_COOLDOWN'),
            )
        }
        const old = await rooms.read('tiger', 1, 'tiger')
        const switched = await rooms.enter('tiger', 1, { clientReqId: 'switch', bossId: 'dragon' })
        assert.ok(switched.generation > old.generation)
        await assert.rejects(
            rooms.attack('tiger', 1, {
                clientReqId: 'late',
                bossId: 'tiger',
                runId: old.room.runId,
                generation: old.generation,
            }),
            errorCode('GAME_DEMO_BOSS_STALE'),
        )
        await assert.rejects(
            rooms.leave('tiger', 1, { clientReqId: 'late-leave', bossId: 'tiger', generation: old.generation }),
            errorCode('GAME_DEMO_BOSS_STALE'),
        )
        await rooms.tick(1, 'tiger')
        assert.equal(
            pushes.some((p) => p.uid === 'tiger'),
            false,
        )
        assert.equal((await rooms.read('tiger', 1, 'tiger')).myDamage, 10)
        assert.equal((await rooms.list('tiger', 1)).currentBossId, 'dragon')
    })

    it('recovers the same run, health and damage, fences old owners and applies training to the next attack', async () => {
        const redis = installFakeCenterRedis()
        const original = Date.now
        let now = 1000
        Date.now = () => now
        try {
            const before = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            await ready(before)
            await initialized('hero')
            const entered = await before.enter('hero', 1, { clientReqId: 'enter', bossId: 'tiger' })
            const req = {
                clientReqId: 'hit',
                bossId: 'tiger' as const,
                runId: entered.room.runId,
                generation: entered.generation,
            }
            const hit = await before.attack('hero', 1, req)
            const after = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            await assert.rejects(after.read('hero', 1, 'tiger'), errorCode('GAME_DEMO_BOSS_RECOVERING'))
            now += 5001
            const recovered = await after.read('hero', 1, 'tiger')
            assert.equal(recovered.room.runId, hit.room.runId)
            assert.equal(recovered.room.hp, hit.room.hp)
            assert.deepEqual(recovered.room.damage, hit.room.damage)
            assert.ok(recovered.room.ownerEpoch > hit.room.ownerEpoch)
            await assert.rejects(
                before.attack('hero', 1, { ...req, clientReqId: 'old-owner' }),
                errorCode('GAME_DEMO_BOSS_RECOVERING'),
            )
            await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeItem(tx, 'hero', 1, 900004, 1))
            await new GameDemoHero().upgrade('hero', 1, { clientReqId: 'upgrade', pill: 'fine', count: 1 })
            const trained = await after.attack('hero', 1, { ...req, clientReqId: 'new-hit' })
            assert.equal(trained.appliedDamage, 15)
            assert.equal(trained.room.hp, 1975)
            const stored = JSON.parse((await redis.hGet('kt:gameDemo:boss-runs:v1', '[1,"tiger",1]'))!)
            assert.equal(stored.damage[0].heroRevision, 1)
            assert.deepEqual(await after.attack('hero', 1, req), hit)
            assert.equal((await after.read('hero', 1, 'tiger')).room.hp, 1975)
        } finally {
            Date.now = original
        }
    })

    it('caps the last hit, resumes partial rewards and creates the next run once at the original respawn time', async () => {
        const redis = installFakeCenterRedis()
        const original = Date.now
        let now = 1000
        Date.now = () => now
        try {
            const rooms = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            await ready(rooms)
            const requests = []
            for (const uid of ['a', 'b']) {
                await initialized(uid)
                await AtomicHashTransaction.run((tx) => NativeLobbyAssets.changeItem(tx, uid, 1, 900004, 20))
                for (let i = 0; i < 2; i++)
                    await new GameDemoHero().upgrade(uid, 1, { clientReqId: `train${i}`, pill: 'fine', count: 10 })
                const entered = await rooms.enter(uid, 1, { clientReqId: 'enter', bossId: 'tiger' })
                requests.push({
                    uid,
                    req: {
                        clientReqId: '',
                        bossId: 'tiger' as const,
                        runId: entered.room.runId,
                        generation: entered.generation,
                    },
                })
            }
            for (let i = 0; i < 12; i++) {
                now += 1000
                const actor = requests[i % 2]
                await rooms.attack(actor.uid, 1, { ...actor.req, clientReqId: `hit${i}` })
            }
            now += 1000
            const last = await Promise.allSettled(
                requests.map((a) => rooms.attack(a.uid, 1, { ...a.req, clientReqId: 'last' })),
            )
            assert.equal(last.filter((r) => r.status === 'fulfilled').length, 1)
            const dead = await rooms.read('a', 1, 'tiger')
            assert.equal(dead.room.hp, 0)
            assert.equal(
                dead.room.damage.reduce((n, d) => n + d.damage, 0),
                2000,
            )
            assert.equal(dead.room.phase, 'settling')
            const respawnAt = dead.room.respawnAt
            // Commit the first mail and cursor, then lose the reply before the room finishes its tick.
            const originalClient = redis.client.bind(redis)
            let lost = false
            redis.client = () => {
                const client = originalClient()
                const evaluate = client.eval
                return {
                    ...client,
                    eval: async (script, options) => {
                        const result = await evaluate(script, options)
                        if (!lost && script.includes('-- atomic-hash-fields-v1') && Number(result) === 1) {
                            const record = JSON.parse((await redis.hGet('kt:gameDemo:boss-runs:v1', '[1,"tiger",1]'))!)
                            if (record.rewardCursor === 1) {
                                lost = true
                                throw new Error('reply lost during reward')
                            }
                        }
                        return result
                    },
                }
            }
            try {
                await assert.rejects(rooms.tick(1, 'tiger'), /reply lost/)
            } finally {
                redis.client = originalClient
            }
            assert.equal(JSON.parse((await redis.hGet('kt:gameDemo:boss-runs:v1', '[1,"tiger",1]'))!).rewardCursor, 1)
            now += 5001
            const recovered = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            await recovered.tick(1, 'tiger')
            const settled = await recovered.read('a', 1, 'tiger')
            assert.equal(settled.room.phase, 'settled')
            assert.equal(settled.room.respawnAt, respawnAt)
            for (const uid of ['a', 'b'])
                assert.equal(
                    (await new GameDemoMailbox().read(uid, 1)).mails.filter((m) => m.title.startsWith('山君')).length,
                    1,
                )
            now = respawnAt
            await recovered.tick(1, 'tiger')
            await recovered.tick(1, 'tiger')
            const next = await recovered.read('a', 1, 'tiger')
            assert.equal(next.room.runNumber, 2)
            assert.equal(next.room.hp, 2000)
            assert.equal(next.room.damage.length, 0)
            await assert.rejects(
                recovered.attack('a', 1, { ...requests[0].req, clientReqId: 'old-run' }),
                errorCode('GAME_DEMO_BOSS_STALE'),
            )
        } finally {
            Date.now = original
        }
    })
})

describe('gameDemo authoritative automatic combat', () => {
    it('persists auto selection, death and revive deadline across ownership recovery without replaying offline hits', async () => {
        installFakeCenterRedis()
        const original = Date.now
        let now = 1000
        Date.now = () => now
        try {
            const rooms = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            await ready(rooms)
            await initialized('fighter')
            const entered = await rooms.enter('fighter', 1, { clientReqId: 'enter', bossId: 'tiger' })
            const request = {
                clientReqId: 'auto',
                bossId: 'tiger' as const,
                runId: entered.room.runId,
                generation: entered.generation,
                autoAttack: true,
            }
            const selected = await rooms.attack('fighter', 1, request)
            assert.equal(selected.room.hp, 2000, 'selection itself is not a hit')
            assert.deepEqual(await rooms.attack('fighter', 1, request), selected)
            for (; now <= 10000; now += 1000) await rooms.tick(1, 'tiger')
            const dead = await rooms.read('fighter', 1, 'tiger')
            const player = dead.room.battle!.players[0]
            assert.equal(player.hp, 0)
            assert.equal(player.reviveAt, 15000)
            assert.equal(dead.myDamage, 100)
            await assert.rejects(
                rooms.attack('fighter', 1, { ...request, clientReqId: 'dead-hit', autoAttack: undefined }),
                errorCode('GAME_DEMO_BOSS_DEAD'),
            )
            // A restart loads exact HP and logs before advancing the combat clock.
            now = 16001
            const recovered = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            const snapshot = await recovered.read('fighter', 1, 'tiger')
            assert.equal(snapshot.room.hp, dead.room.hp)
            assert.deepEqual(snapshot.room.damage, dead.room.damage)
            assert.deepEqual(snapshot.room.battle, dead.room.battle)
            await recovered.tick(1, 'tiger')
            const revived = await recovered.read('fighter', 1, 'tiger')
            assert.equal(revived.room.battle!.players[0].hp, 150)
            assert.equal(revived.room.battle!.players[0].reviveAt, 0)
            assert.equal(revived.myDamage, dead.myDamage, 'no catch-up burst or attack on revive frame')
            now += 1000
            await recovered.tick(1, 'tiger')
            assert.equal((await recovered.read('fighter', 1, 'tiger')).myDamage, 110)
            await recovered.attack('fighter', 1, { ...request, clientReqId: 'pause', autoAttack: false })
            now += 1000
            await recovered.tick(1, 'tiger')
            assert.equal((await recovered.read('fighter', 1, 'tiger')).myDamage, 110)
        } finally {
            Date.now = original
        }
    })
    it('keeps damage and player HP on leave/re-enter and stops stale room combat after switching', async () => {
        installFakeCenterRedis()
        const original = Date.now
        let now = 1000
        Date.now = () => now
        try {
            const rooms = new GameDemoBossRooms(
                async () => true,
                () => true,
            )
            await ready(rooms)
            await initialized('switcher')
            const entered = await rooms.enter('switcher', 1, { clientReqId: 'enter', bossId: 'tiger' })
            const req = {
                clientReqId: 'auto',
                bossId: 'tiger' as const,
                runId: entered.room.runId,
                generation: entered.generation,
                autoAttack: true,
            }
            await rooms.attack('switcher', 1, req)
            for (; now <= 4000; now += 1000) await rooms.tick(1, 'tiger')
            const damaged = await rooms.read('switcher', 1, 'tiger')
            assert.equal(damaged.room.battle!.players[0].hp, 95)
            await rooms.leave('switcher', 1, { clientReqId: 'leave', bossId: 'tiger', generation: entered.generation })
            const again = await rooms.enter('switcher', 1, { clientReqId: 'again', bossId: 'tiger' })
            assert.equal(again.room.battle!.players[0].hp, 95)
            assert.equal(again.room.battle!.players[0].autoAttack, false)
            await rooms.attack('switcher', 1, { ...req, clientReqId: 'again-auto', generation: again.generation })
            await rooms.enter('switcher', 1, { clientReqId: 'dragon', bossId: 'dragon' })
            now += 1000
            await rooms.tick(1, 'tiger')
            const stale = await rooms.read('switcher', 1, 'tiger')
            assert.equal(stale.myDamage, damaged.myDamage)
            assert.equal(stale.room.battle!.players[0].active, false)
            assert.equal(stale.room.battle!.players[0].autoAttack, false)
            assert.equal((await rooms.read('switcher', 1, 'dragon')).room.hp, 4000)
        } finally {
            Date.now = original
        }
    })
})
