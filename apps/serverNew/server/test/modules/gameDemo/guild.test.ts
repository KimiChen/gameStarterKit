import assert from 'node:assert/strict'
import { GameDemoAccount } from '../../../src/modules/gameDemo/growth/GameDemoAccount'
import { GameDemoGuild } from '../../../src/modules/gameDemo/guild/GameDemoGuild'
import { installFakeCenterRedis } from '../../support/FakeCenterRedis'
const guild = () => new GameDemoGuild()
async function init(...uids: string[]) {
    for (const uid of uids) await new GameDemoAccount().initialize(uid, 1, 'init', true)
}
async function invite(owner: string, uid: string) {
    await guild().invite(owner, 1, { clientReqId: `invite-${uid}`, targetUid: uid })
    return (await guild().read(uid, 1)).invitations.find((i) => i.inviter === owner)!.id
}
describe('gameDemo guild membership', () => {
    it('reserves capacity atomically across players and transfers ownership to the earliest remaining member', async () => {
        installFakeCenterRedis()
        await init('owner', 'a', 'b', 'c')
        const created = await guild().create('owner', 1, { clientReqId: 'create', name: '仙盟' })
        assert.deepEqual(await guild().create('owner', 1, { clientReqId: 'create', name: '仙盟' }), created)
        const ids = await Promise.all(['a', 'b', 'c'].map((uid) => invite('owner', uid)))
        const results = await Promise.allSettled(
            ['a', 'b', 'c'].map((uid, i) =>
                guild().respond(uid, 1, { clientReqId: 'accept', inviteId: ids[i], accept: true }),
            ),
        )
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2)
        const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
        assert.equal(failure.reason.code, 'GAME_DEMO_GUILD_FULL')
        const beforeLeave = (await guild().read('owner', 1)).guild!
        assert.equal(beforeLeave.members.length, 3)
        await guild().leave('owner', 1, { clientReqId: 'leave' })
        const successor = beforeLeave.members[1]
        const changed = (await guild().read(successor, 1)).guild!
        assert.equal(changed.owner, successor)
        assert.equal(changed.members.length, 2)
        await guild().leave(successor, 1, { clientReqId: 'leave' })
        const last = changed.members[1]
        assert.equal((await guild().read(last, 1)).guild!.owner, last)
        await guild().leave(last, 1, { clientReqId: 'leave' })
        assert.equal((await guild().read(last, 1)).guild, null)
        const loser = ['a', 'b', 'c'].find((uid, i) => results[i].status === 'rejected')!
        assert.equal((await guild().read(loser, 1)).invitations.length, 0)
    })

    it('allows only one of simultaneous invitations from two guilds and rejects invitation impersonation', async () => {
        installFakeCenterRedis()
        await init('o1', 'o2', 'target', 'intruder')
        await guild().create('o1', 1, { clientReqId: 'create', name: '一盟' })
        await guild().create('o2', 1, { clientReqId: 'create', name: '二盟' })
        const ids = await Promise.all(['o1', 'o2'].map((owner) => invite(owner, 'target')))
        await assert.rejects(
            guild().respond('intruder', 1, { clientReqId: 'steal', inviteId: ids[0], accept: true }),
            (e: { code: string }) => e.code === 'GAME_DEMO_INVITE_INVALID',
        )
        const results = await Promise.allSettled(
            ids.map((inviteId, i) =>
                guild().respond('target', 1, { clientReqId: `join-${i}`, inviteId, accept: true }),
            ),
        )
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
        const state = await guild().read('target', 1)
        assert.equal(state.invitations.length, 0)
        const owners = await Promise.all(['o1', 'o2'].map((uid) => guild().read(uid, 1)))
        assert.equal(owners.filter((o) => o.guild!.members.includes('target')).length, 1)
        assert.equal((await guild().read('target', 2)).guild, null)
    })

    it('supports reject/reinvite and invalidates dissolved guilds, preserving membership after write failure', async () => {
        const redis = installFakeCenterRedis()
        await init('owner', 'target')
        await guild().create('owner', 1, { clientReqId: 'create', name: '仙盟' })
        const first = await invite('owner', 'target')
        const rejected = await guild().respond('target', 1, { clientReqId: 'reject', inviteId: first, accept: false })
        assert.equal(rejected.invitations.length, 0)
        await guild().invite('owner', 1, { clientReqId: 'reinvite', targetUid: 'target' })
        const second = (await guild().read('target', 1)).invitations[0].id
        assert.notEqual(first, second)
        redis.failNextScript('-- atomic-hash-fields-v1')
        await assert.rejects(
            guild().respond('target', 1, { clientReqId: 'join', inviteId: second, accept: true }),
            /注入/,
        )
        assert.equal((await guild().read('target', 1)).guild, null)
        assert.equal((await guild().read('owner', 1)).guild!.members.length, 1)
        await guild().leave('owner', 1, { clientReqId: 'leave' })
        await assert.rejects(
            guild().respond('target', 1, { clientReqId: 'join', inviteId: second, accept: true }),
            (e: { code: string }) => e.code === 'GAME_DEMO_INVITE_INVALID',
        )
        assert.equal((await guild().read('target', 1)).invitations.length, 0)
    })

    it('requires the current leader and an initialized target, deduplicating outstanding invites', async () => {
        installFakeCenterRedis()
        await init('owner', 'target')
        await guild().create('owner', 1, { clientReqId: 'create', name: '仙盟' })
        await assert.rejects(
            guild().invite('target', 1, { clientReqId: 'invite', targetUid: 'owner' }),
            (e: { code: string }) => e.code === 'GAME_DEMO_GUILD_OWNER_ONLY',
        )
        await assert.rejects(
            guild().invite('owner', 1, { clientReqId: 'unknown', targetUid: 'unknown' }),
            (e: { code: string }) => e.code === 'GAME_DEMO_TARGET_NOT_READY',
        )
        await invite('owner', 'target')
        await guild().invite('owner', 1, { clientReqId: 'duplicate', targetUid: 'target' })
        assert.equal((await guild().read('target', 1)).invitations.length, 1)
    })
})
