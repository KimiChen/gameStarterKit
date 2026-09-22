import assert from 'node:assert/strict'
import type { LobbyConnectionContext } from '@arthropoda/game-engine'
import { NativeLobbyUserStore } from '../../../src/modules/user/lobby/NativeLobbyUserStore'
import { GuildNativeLobbyStore } from '../../../src/modules/guild/lobby/GuildNativeLobbyStore'
import { installFakeCenterRedis, type FakeCenterRedis } from '../../support/FakeCenterRedis'
import { runInObjectCall } from '../../support/objectCallContext'

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

/** 测试里外部字符串 uid 对应的内部身份；store 的变更就登记在这个内部 uid 下。 */
function internalUid(uid: string): number {
    return Number(uid.split('-')[1])
}

/**
 * store 的写路径要求「对象调用」上下文（框架对缺上下文是 fail-fast 的）。
 * 这里只补上下文、不走 Action 调度，让 store 自己抛出的领域错误（`{ code }`）原样穿透。
 */
function inObjectCall<T>(uid: string, run: () => Promise<T>) {
    return runInObjectCall({ uid: internalUid(uid), sId: 7 }, run)
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

        const first = await inObjectCall('external-1', () =>
            store.join(context('external-1'), { clientReqId: 'req-1', guildId: 1 }),
        )
        assert.deepEqual(first.value, { ok: true, seq: 1 })
        // join 顺带改了 user 档的 guildId：这个变更必须登记在本次对象调用上，
        // 否则玩家会看到 join 成功而本地 guildId 停在旧值（数据已提交、客户端永远不知道）。
        const registered = first.syncChanges[internalUid('external-1')] as
            { versions?: { nativeUser?: number }; nativeUser?: { guildId?: number } } | undefined
        assert.equal(registered?.nativeUser?.guildId, 1)
        assert.ok((registered?.versions?.nativeUser ?? 0) > 0)
        assert.deepEqual(pushes, [{ uid: 'external-1', type: 'guild.event', data: { seq: 1, guildId: 1 } }])

        pushes.length = 0
        await inObjectCall('external-2', () => store.join(context('external-2'), { clientReqId: 'req-2', guildId: 1 }))
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
            () =>
                inObjectCall('external-3', () =>
                    store.join(context('external-3'), { clientReqId: 'req-1', guildId: 99 }),
                ),
            (error: { code: string }) => error.code === 'INVALID_PAYLOAD',
        )
        const first = await inObjectCall('external-3', () =>
            store.join(context('external-3'), { clientReqId: 'req-1', guildId: 2 }),
        )
        const repeat = await inObjectCall('external-3', () =>
            store.join(context('external-3'), { clientReqId: 'req-2', guildId: 2 }),
        )
        assert.deepEqual(repeat.value, first.value)
        // 重复 join 是 no-op：不该再登记一次 user 变更，否则客户端会收到无意义的版本推进。
        assert.deepEqual(repeat.syncChanges, {})
    })

    it('moves a player out of the old guild and leaves an event behind', async () => {
        const redis = installFakeCenterRedis()
        await seedUser(redis, 'external-4', 7)
        const users = new NativeLobbyUserStore(async () => undefined)
        const store = new GuildNativeLobbyStore({
            registerCharacter: async () => undefined,
            pushToUser: async () => true,
        })
        await inObjectCall('external-4', () => store.join(context('external-4'), { clientReqId: 'req-1', guildId: 1 }))
        await inObjectCall('external-4', () => store.join(context('external-4'), { clientReqId: 'req-2', guildId: 2 }))

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

        const left = await inObjectCall('external-4', () => store.leave(context('external-4')))
        assert.deepEqual(left.value, { ok: true })
        assert.equal((await users.require('external-4', 7)).guildId, 0)
    })
})
