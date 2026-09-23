import assert from 'node:assert/strict'
import { Actions } from '../../../generated/protocol/server/S2S/actions'
import { LocalAction } from '../../../src/runtime/action/LocalAction'
import { QueuedLocalAction } from '../../../src/runtime/action/QueuedLocalAction'
import { QueuedLocalActionRecord, QueuedLocalActionStore } from '../../../src/runtime/action/QueuedLocalActionStore'
import { FakeCenterRedis, installFakeCenterRedis } from '../../support/FakeCenterRedis'

const SID = 7

function record(taskId: string, availableAt = 100, fingerprint = `fp:${taskId}`): QueuedLocalActionRecord {
    return {
        version: 2,
        taskId,
        fingerprint,
        apiName: 'fixture/run',
        uId: 42,
        sId: SID,
        req: { value: taskId },
        createdAt: 90,
        availableAt,
        attempts: 0,
        state: 'pending',
    }
}

describe('queued local action reliable store', () => {
    let redis: FakeCenterRedis

    beforeEach(() => {
        redis = installFakeCenterRedis()
    })

    it('persists immediate calls first and reuses a caller supplied taskId across producer retries', async () => {
        LocalAction.registerAction2ApiName(Actions)
        const action = Actions['default/Default']

        assert.deepEqual(
            await QueuedLocalAction.rpc(action, {}, 42, SID, 0, {
                taskId: 'stable-producer-id',
            }),
            ['stable-producer-id'],
        )
        assert.deepEqual(
            await QueuedLocalAction.rpc(action, {}, 42, SID, 0, {
                taskId: 'stable-producer-id',
            }),
            ['stable-producer-id'],
        )
        const records = await redis.hGetAll(QueuedLocalActionStore.keys(SID).tasks)
        assert.deepEqual(Object.keys(records), ['stable-producer-id'])
        assert.equal((JSON.parse(records['stable-producer-id']) as QueuedLocalActionRecord).state, 'pending')
    })

    it('keeps identical payloads as separate tasks and makes producer retries idempotent by taskId', async () => {
        const first = record('task-a', 100, 'same-payload')
        const second = record('task-b', 100, 'same-payload')
        assert.equal(await QueuedLocalActionStore.enqueue(first), 'enqueued')
        assert.equal(await QueuedLocalActionStore.enqueue(second), 'enqueued')
        assert.equal(await QueuedLocalActionStore.enqueue(first), 'existing')
        await assert.rejects(
            QueuedLocalActionStore.enqueue({ ...first, fingerprint: 'changed-payload' }),
            /taskId conflict/,
        )

        const claimedA = await QueuedLocalActionStore.claim(SID, 'owner-a', 'legacy-a', 'legacy-fp-a', 100, 1_000)
        assert.equal(claimedA?.taskId, 'task-a')
        assert.equal(claimedA?.attempts, 1)
        assert.equal(await QueuedLocalActionStore.ack(claimedA!, 'owner-a', 101), true)

        const claimedB = await QueuedLocalActionStore.claim(SID, 'owner-a', 'legacy-b', 'legacy-fp-b', 101, 2_000)
        assert.equal(claimedB?.taskId, 'task-b')
        assert.equal(await QueuedLocalActionStore.ack(claimedB!, 'owner-a', 102), true)
        assert.equal(
            await QueuedLocalActionStore.claim(SID, 'owner-a', 'legacy-c', 'legacy-fp-c', 102, 3_000),
            undefined,
        )
    })

    it('lets a replacement owner reclaim a task whose worker died after claim', async () => {
        await QueuedLocalActionStore.enqueue(record('crash-window'))
        const first = await QueuedLocalActionStore.claim(SID, 'owner-old', 'legacy-a', 'legacy-a', 100, 1_000)
        assert.equal(first?.attempts, 1)

        const beforeExpiry = await QueuedLocalActionStore.claim(
            SID,
            'owner-new',
            'legacy-b',
            'legacy-b',
            100,
            1_000 + QueuedLocalActionStore.LEASE_MS - 1,
        )
        assert.equal(beforeExpiry, undefined)

        const reclaimed = await QueuedLocalActionStore.claim(
            SID,
            'owner-new',
            'legacy-c',
            'legacy-c',
            100,
            1_000 + QueuedLocalActionStore.LEASE_MS,
        )
        assert.equal(reclaimed?.taskId, 'crash-window')
        assert.equal(reclaimed?.attempts, 2)
        assert.equal(await QueuedLocalActionStore.ack(first!, 'owner-old', 101), false)
        assert.equal(await QueuedLocalActionStore.ack(reclaimed!, 'owner-new', 101), true)
    })

    it('retries a failed action once and then keeps it in the failed list', async () => {
        await QueuedLocalActionStore.enqueue(record('retry-once'))
        const first = await QueuedLocalActionStore.claim(SID, 'owner', 'legacy-a', 'legacy-a', 100, 1_000)
        assert.equal(await QueuedLocalActionStore.fail(first!, 'owner', new Error('first'), 100), 'retry')
        assert.equal(await QueuedLocalActionStore.claim(SID, 'owner', 'legacy-b', 'legacy-b', 100, 2_000), undefined)

        const second = await QueuedLocalActionStore.claim(SID, 'owner', 'legacy-c', 'legacy-c', 101, 3_000)
        assert.equal(second?.attempts, 2)
        assert.equal(await QueuedLocalActionStore.fail(second!, 'owner', new Error('second'), 101), 'failed')
        assert.equal(await QueuedLocalActionStore.claim(SID, 'owner', 'legacy-d', 'legacy-d', 200, 100_000), undefined)
        const failed = await QueuedLocalActionStore.failed(SID)
        assert.deepEqual(
            failed.map((item) => [item.taskId, item.attempts, item.state, item.lastError]),
            [['retry-once', 2, 'failed', 'Error: second']],
        )
    })

    it('migrates a due legacy zset member into the claimed v2 record without a delete gap', async () => {
        redis.zAdd(
            QueuedLocalActionStore.keys(SID).legacy,
            100,
            JSON.stringify({ apiName: 'fixture/legacy', uId: 9, sId: SID, req: { legacy: true } }),
        )
        const claimed = await QueuedLocalActionStore.claim(
            SID,
            'owner',
            'legacy-migrated',
            'legacy-fingerprint',
            100,
            1_000,
        )
        assert.deepEqual(
            [claimed?.taskId, claimed?.apiName, claimed?.attempts, claimed?.state],
            ['legacy-migrated', 'fixture/legacy', 1, 'running'],
        )
        assert.equal(redis.zCard(QueuedLocalActionStore.keys(SID).legacy), 0)
    })
})
