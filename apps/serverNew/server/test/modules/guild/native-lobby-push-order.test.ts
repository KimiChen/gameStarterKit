import assert from 'node:assert/strict'
import type { LobbyConnectionContext } from '@arthropoda/game-engine'
import { NativeLobbyUserStore } from '../../../src/modules/user/lobby/NativeLobbyUserStore'
import { GuildNativeLobbyStore } from '../../../src/modules/guild/lobby/GuildNativeLobbyStore'
import { installFakeCenterRedis, type FakeCenterRedis } from '../../support/FakeCenterRedis'

const profilesKey = 'nativeLobby:user:profile:v1'

async function seedUser(redis: FakeCenterRedis, uid: string, sId: number): Promise<void> {
    await redis.hSet(
        profilesKey,
        `${sId}:${uid}`,
        JSON.stringify({
            uid,
            nickname: '',
            avatarId: -1,
            province: '',
            star: 0,
            maxRound: 0,
            wins: 0,
            losses: 0,
            stamina: 0,
            lastStaminaRecoverAt: 0,
            musicOn: true,
            sfxOn: true,
            guildId: 0,
            ver: 0,
        }),
    )
}

function context(uid: string): LobbyConnectionContext {
    return { uid, sId: 7, sessionEpoch: 'e1', connectionId: `c-${uid}`, ip: '127.0.0.1' }
}

describe('guild native Lobby push ordering', () => {
    it('appends the durable event before waking members up', async () => {
        const redis = installFakeCenterRedis()
        await seedUser(redis, 'external-1', 7)
        await seedUser(redis, 'external-2', 7)
        const users = new NativeLobbyUserStore(async () => undefined)
        const pushes: Array<{ uid: string; type: string; data: unknown }> = []
        const store = new GuildNativeLobbyStore({
            registerCharacter: async () => undefined,
            pushToUser: async (uid, _sId, type, data) => {
                // 唤醒推送只是提示：事件流必须已经可读，否则掉线玩家永远补不回这条事件。
                const events = await store.events(context(uid), { sinceSeq: 0 })
                const pushed = data as { seq: number; guildId: number }
                assert.ok(
                    events.events.some((event) => event.seq === pushed.seq),
                    'the durable event must exist before the wake-up push',
                )
                assert.equal(events.guildId, pushed.guildId)
                pushes.push({ uid, type, data })
                return true
            },
        })

        await store.join(context('external-1'), { clientReqId: 'req-1', guildId: 1 })
        assert.deepEqual(pushes, [{ uid: 'external-1', type: 'guild.event', data: { seq: 1, guildId: 1 } }])

        pushes.length = 0
        await store.join(context('external-2'), { clientReqId: 'req-2', guildId: 1 })
        assert.deepEqual(pushes.map((push) => push.uid).sort(), ['external-1', 'external-2'])
        for (const push of pushes) assert.equal(push.type, 'guild.event')
    })

    it('rejects an unknown guild and treats a repeat join as a no-op', async () => {
        const redis = installFakeCenterRedis()
        await seedUser(redis, 'external-3', 7)
        const users = new NativeLobbyUserStore(async () => undefined)
        const store = new GuildNativeLobbyStore({
            registerCharacter: async () => undefined,
            pushToUser: async () => true,
        })
        await assert.rejects(
            () => store.join(context('external-3'), { clientReqId: 'req-1', guildId: 99 }),
            (error: { code: string }) => error.code === 'INVALID_PAYLOAD',
        )
        const first = await store.join(context('external-3'), { clientReqId: 'req-1', guildId: 2 })
        const repeat = await store.join(context('external-3'), { clientReqId: 'req-2', guildId: 2 })
        assert.deepEqual(repeat, first)
    })

    it('moves a player out of the old guild and leaves an event behind', async () => {
        const redis = installFakeCenterRedis()
        await seedUser(redis, 'external-4', 7)
        const users = new NativeLobbyUserStore(async () => undefined)
        const store = new GuildNativeLobbyStore({
            registerCharacter: async () => undefined,
            pushToUser: async () => true,
        })
        await store.join(context('external-4'), { clientReqId: 'req-1', guildId: 1 })
        await store.join(context('external-4'), { clientReqId: 'req-2', guildId: 2 })

        const previous = await store.events(context('external-4'), { sinceSeq: 0 })
        assert.deepEqual(
            previous.events.map((event) => (event.data as { uid: string }).uid),
            ['external-4'],
        )
        assert.equal(previous.guildId, 2)
        const profile = await users.require('external-4', 7)
        assert.equal(profile.guildId, 2)
        assert.equal(await redis.sMembers('nativeLobby:guild:members:v1:7:1').then((m) => m.length), 0)
        assert.deepEqual(await redis.sMembers('nativeLobby:guild:members:v1:7:2'), ['external-4'])

        await store.leave(context('external-4'))
        assert.equal((await users.require('external-4', 7)).guildId, 0)
    })
})
