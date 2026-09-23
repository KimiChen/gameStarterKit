import assert from 'node:assert/strict'
import { PlayerWorkerOwner, RdKey_PlayerWorkerOwner, UserOnlineMgr } from '@arthropoda/game-engine'
import { resolvePlayerWorker } from '../../src/startup/resolvePlayerWorker'
import type { RuntimeServerLike } from '../../src/startup/runtimeTypes'
import { installFakeCenterRedis, type FakeCenterRedis } from '../support/FakeCenterRedis'

const SID = 7
const UID = 1001

describe('player Event Worker routing', () => {
    let redis: FakeCenterRedis

    beforeEach(() => {
        redis = installFakeCenterRedis()
        ;(UserOnlineMgr as unknown as { _redis?: unknown })._redis = undefined
    })

    afterEach(() => {
        ;(UserOnlineMgr as unknown as { _redis?: unknown })._redis = undefined
    })

    it('seeds the player owner from the shared connection owner and then keeps it stable', async () => {
        await UserOnlineMgr.replace(UID, SID, 9001)
        let sharedOwner = 2
        const runtime = stubRuntime(3, () => sharedOwner)

        assert.equal(await resolvePlayerWorker(runtime, UID, SID), 2)
        assert.equal(await PlayerWorkerOwner.get(UID, SID), 2)
        assert.equal((await UserOnlineMgr.get(UID, SID))?.workerId, 2)

        sharedOwner = 1
        assert.equal(await resolvePlayerWorker(runtime, UID, SID), 2, '已登记 Owner 不随连接探测漂移')
    })

    it('claims an offline owner and resets an owner outside the current Event Worker pool', async () => {
        const runtime = stubRuntime(4, () => false)
        const first = await resolvePlayerWorker(runtime, UID, SID)
        assert.equal(first, PlayerWorkerOwner.preferred(UID, 4))
        assert.equal(await resolvePlayerWorker(runtime, UID, SID), first)

        await redis.hSet(RdKey_PlayerWorkerOwner(SID), String(UID), '9')
        assert.equal(
            await resolvePlayerWorker(
                stubRuntime(1, () => false),
                UID,
                SID,
            ),
            0,
        )
        assert.equal(await PlayerWorkerOwner.get(UID, SID), 0)
    })
})

function stubRuntime(workerNum: number, connectionOwner: (connectionId: number) => number | false) {
    return {
        worker_id: 0,
        taskworker: false,
        setting: { worker_num: workerNum, task_worker_num: 2, user_task_worker_num: 1 },
        connection_owner: connectionOwner,
    } as unknown as RuntimeServerLike
}
