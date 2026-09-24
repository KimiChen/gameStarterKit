import assert from 'node:assert/strict'
import { GameDemoGuildDirectory } from '../../../src/modules/gameDemo/bean/GameDemoGuildDirectory'
import { GameDemoGuildRoster } from '../../../src/modules/gameDemo/rules/GameDemoGuildRoster'

function directory(): GameDemoGuildDirectory {
    const bean = new GameDemoGuildDirectory(1)
    bean.id = 1
    return bean
}

const code = (expected: string) => (error: { code?: string }) => error.code === expected

describe('gameDemo guild roster', () => {
    it('invites by player ID, deduplicates outstanding invites and joins on accept', () => {
        const bean = directory()
        GameDemoGuildRoster.create(bean, 1, ' 青云 ')
        assert.throws(() => GameDemoGuildRoster.invite(bean, 2, 3, true), code('GAME_DEMO_GUILD_OWNER_ONLY'))
        assert.throws(() => GameDemoGuildRoster.invite(bean, 1, 2, false), code('GAME_DEMO_TARGET_NOT_READY'))
        GameDemoGuildRoster.invite(bean, 1, 2, true)
        GameDemoGuildRoster.invite(bean, 1, 2, true)
        const pending = GameDemoGuildRoster.view(bean, 2).invitations
        assert.deepEqual(pending, [{ id: 1, guildId: 1, guildName: '青云', inviter: 1 }])
        GameDemoGuildRoster.respond(bean, 2, pending[0].id, true)
        assert.deepEqual(GameDemoGuildRoster.view(bean, 2).guild, { id: 1, name: '青云', owner: 1, members: [1, 2] })
        assert.deepEqual(GameDemoGuildRoster.view(bean, 2).invitations, [])
    })

    it('rejects, enforces capacity and transfers ownership in join order', () => {
        const bean = directory()
        GameDemoGuildRoster.create(bean, 1, '天衍')
        for (const uid of [2, 3, 4]) GameDemoGuildRoster.invite(bean, 1, uid, true)
        const inviteOf = (uid: number) => GameDemoGuildRoster.view(bean, uid).invitations[0].id
        GameDemoGuildRoster.respond(bean, 4, inviteOf(4), false)
        assert.deepEqual(GameDemoGuildRoster.view(bean, 4).invitations, [])
        GameDemoGuildRoster.respond(bean, 2, inviteOf(2), true)
        GameDemoGuildRoster.respond(bean, 3, inviteOf(3), true)
        GameDemoGuildRoster.invite(bean, 1, 5, true)
        GameDemoGuildRoster.leave(bean, 3)
        GameDemoGuildRoster.respond(bean, 5, inviteOf(5), true)
        GameDemoGuildRoster.invite(bean, 1, 6, true)
        assert.throws(() => GameDemoGuildRoster.respond(bean, 6, inviteOf(6), true), code('GAME_DEMO_GUILD_FULL'))

        GameDemoGuildRoster.leave(bean, 1)
        assert.deepEqual(GameDemoGuildRoster.view(bean, 2).guild?.owner, 2)
        assert.deepEqual(GameDemoGuildRoster.view(bean, 6).invitations, [], '原盟主的邀请随转交失效')
    })

    it('dissolves the guild when the last member leaves and invalidates its invites', () => {
        const bean = directory()
        GameDemoGuildRoster.create(bean, 1, '孤峰')
        GameDemoGuildRoster.invite(bean, 1, 2, true)
        const inviteId = GameDemoGuildRoster.view(bean, 2).invitations[0].id
        GameDemoGuildRoster.leave(bean, 1)
        assert.equal(bean.guilds!.size(), 0)
        assert.throws(() => GameDemoGuildRoster.respond(bean, 2, inviteId, true), code('GAME_DEMO_INVITE_INVALID'))
        GameDemoGuildRoster.create(bean, 2, '新盟')
        assert.throws(() => GameDemoGuildRoster.create(bean, 2, '再建'), code('GAME_DEMO_GUILD_JOINED'))
    })
})
