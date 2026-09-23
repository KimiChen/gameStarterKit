import assert from 'node:assert/strict'
import { UserOnlineMgr } from '@arthropoda/game-engine'
import { installFakeCenterRedis } from '../support/FakeCenterRedis'

describe('user online worker ownership', () => {
    beforeEach(() => {
        installFakeCenterRedis()
        ;(UserOnlineMgr as unknown as { _redis?: unknown })._redis = undefined
    })

    afterEach(() => {
        ;(UserOnlineMgr as unknown as { _redis?: unknown })._redis = undefined
    })

    it('records the native Lobby Event Worker even without a numeric connection id', async () => {
        await UserOnlineMgr.replace(101, 7, 0, 0)

        const online = await UserOnlineMgr.get(101, 7)
        assert.deepEqual(online && { ...online, activityTime: 0 }, {
            uId: 101,
            connectionId: 0,
            workerId: 0,
            sid: 7,
            activityTime: 0,
        })
        assert.equal(await UserOnlineMgr.isOnline(101, 7), true)

        await UserOnlineMgr.del(101, 7)
        assert.equal(await UserOnlineMgr.get(101, 7), null)
    })

    it('backfills a shared connection owner without overwriting a newer connection', async () => {
        await UserOnlineMgr.replace(102, 7, 9001)

        assert.equal(await UserOnlineMgr.setWorkerOwner(102, 7, 9001, 2), true)
        assert.equal((await UserOnlineMgr.get(102, 7))?.workerId, 2)

        await UserOnlineMgr.replace(102, 7, 9002)
        assert.equal(await UserOnlineMgr.setWorkerOwner(102, 7, 9001, 3), false)
        assert.equal((await UserOnlineMgr.get(102, 7))?.workerId, undefined)
        assert.equal((await UserOnlineMgr.get(102, 7))?.connectionId, 9002)
    })
})
