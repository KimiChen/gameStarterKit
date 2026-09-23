import assert from 'node:assert/strict'
import { LocalAction } from '../../../src/runtime/action/LocalAction'
import { ActionGuild } from '../../../src/modules/guild/action/ActionGuild'
import { ActionGuildCreate } from '../../../src/modules/guild/action/ActionGuildCreate'
import { ActionGuildResetGift } from '../../../src/modules/guild/action/ActionGuildResetGift'
import { GuildDefine } from '../../../src/modules/guild/rules/GuildDefine'

describe('guild action routing', () => {
    it('keeps player-owned creation on the player Worker', async () => {
        const action = new ActionGuildCreate()
        const call = { uId: 1001 } as never

        assert.equal(await action.getTaskGroupId(call), undefined)
        assert.equal(await action.getBindId(call), 1001)
    })

    it('routes the background reset by the guild resource in both dimensions', async () => {
        const action = new ActionGuildResetGift()
        const call = { uId: 0, req: { guildId: 2001 } } as never

        assert.equal(await action.getTaskGroupId(call), 2001)
        assert.equal(await action.getBindId(call), 2001)
    })

    it('updates the old and new leader player records separately', async () => {
        const calls: Array<{ req: { uId: number; data: Array<{ field: string; val: string }> }; uId: number }> = []
        const originalSend = LocalAction.send
        LocalAction.send = ((
            _action: unknown,
            req: { uId: number; data: Array<{ field: string; val: string }> },
            uId: number,
        ) => calls.push({ req, uId })) as typeof LocalAction.send

        try {
            const oldLeaderId = 1001
            const newLeaderId = 2001
            const guild = {
                leaderId: oldLeaderId,
                members: new Map([
                    [oldLeaderId, { role: GuildDefine.ROLE_LEADER }],
                    [newLeaderId, { role: GuildDefine.ROLE_MEMBER }],
                ]),
            }

            await ActionGuild.memberAssign(guild as never, oldLeaderId, newLeaderId, GuildDefine.ROLE_LEADER)

            assert.deepEqual(
                calls.map(({ req, uId }) => ({ reqUserId: req.uId, routedUserId: uId, role: req.data[0]?.val })),
                [
                    {
                        reqUserId: oldLeaderId,
                        routedUserId: oldLeaderId,
                        role: GuildDefine.ROLE_MEMBER.toString(),
                    },
                    {
                        reqUserId: newLeaderId,
                        routedUserId: newLeaderId,
                        role: GuildDefine.ROLE_LEADER.toString(),
                    },
                ],
            )
        } finally {
            LocalAction.send = originalSend
        }
    })
})
