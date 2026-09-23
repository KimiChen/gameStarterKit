import assert from 'node:assert/strict'
import { ActionGuildCreate } from '../../../src/modules/guild/action/ActionGuildCreate'
import { ActionGuildResetGift } from '../../../src/modules/guild/action/ActionGuildResetGift'

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
})
