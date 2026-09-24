import assert from 'node:assert/strict'
import { ClassInfo, ModType, RoomTree, SaveType, ServerHash } from '../../src'

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe('nested room demo', () => {
    function demo() {
        const members = {
            root: new Set([1, 2, 3]),
            red: new Set([1, 2]),
            squad: new Set([1]),
            blue: new Set([3]),
        }
        const room = new RoomTree('boss:1', {
            isMember: uid => members.root.has(uid),
            snapshot: () => ({ hp: 100 }),
        })
        const red = room.root.child('red', {
            isMember: uid => members.red.has(uid),
            snapshot: () => ({ tactic: 'flank' }),
        })
        const squad = red.child('squad:1', {
            isMember: uid => members.squad.has(uid),
            snapshot: () => ({ marker: 5 }),
        })
        const blue = room.root.child('blue', {
            isMember: uid => members.blue.has(uid),
            snapshot: () => ({ tactic: 'defend' }),
        })
        return { room, members, red, squad, blue }
    }

    it('restores root and eligible ancestors, then synchronizes each Bean to its own active scope', async () => {
        const { room, squad, red, blue, members } = demo()
        const full: string[] = []
        const old = { uid: 1, connectionId: 'old' }
        await squad.resume(old, async (path, snapshot) => {
            full.push(`${path || 'root'}:${JSON.stringify(snapshot)}`)
        })
        assert.deepEqual(full, ['root:{"hp":100}', 'red:{"tactic":"flank"}', 'red/squad:1:{"marker":5}'])
        assert.deepEqual(room.root.recipients(), [1])
        assert.deepEqual(red.recipients(), [1])
        assert.deepEqual(squad.recipients(), [1])
        assert.deepEqual(blue.recipients(), [])

        class DemoRoomBean extends ServerHash {}
        DemoRoomBean._class_info = new ClassInfo('DemoRoomBean', DemoRoomBean, 1, SaveType.All, ModType.ModMap)
        const bean = new DemoRoomBean(squad.beanId(), undefined, true)
        squad.bind(bean)
        assert.deepEqual(bean.getNotifyUids(), [1])

        squad.detach(old)
        assert.deepEqual(bean.getNotifyUids(), [])
        // Membership survives a temporary leave, so re-entry sends full state again.
        assert.equal(members.squad.has(1), true)
        const fresh = { uid: 1, connectionId: 'new' }
        const restored: string[] = []
        await squad.resume(fresh, async path => { restored.push(path) })
        squad.detach(old)
        assert.deepEqual(restored, ['', 'red', 'red/squad:1'])
        assert.deepEqual(bean.getNotifyUids(), [1])

        members.squad.delete(1)
        squad.revoke(1)
        await assert.rejects(squad.resume(fresh, async () => {}), /membership denied/)
        assert.deepEqual(bean.getNotifyUids(), [])
        assert.deepEqual(red.recipients(), [1])
        await room.close()
    })

    it('serializes commands with timers, coalesces overdue ticks, and drains before close', async () => {
        const { room } = demo()
        let active = 0
        let maxActive = 0
        let ticks = 0
        room.registerTimer('battle', {
            intervalMs: 15,
            schedule: 'fixedRate',
            overrun: 'coalesce',
            run: async () => {
                active++
                maxActive = Math.max(maxActive, active)
                ticks++
                await delay(35)
                active--
            },
        })
        room.startTimers()
        await delay(115)
        await room.close()
        assert.equal(maxActive, 1)
        assert.ok(ticks >= 2)
        const stoppedAt = ticks
        await delay(40)
        assert.equal(ticks, stoppedAt)
        await assert.rejects(room.run(async () => undefined), /room closed/)
    })

    it('delivers selected business notices only after successful execution', async () => {
        const room = new RoomTree('notice', { isMember: () => true, snapshot: () => ({}) }, {
            execute: work => work(),
        })
        const red = room.root.child('red', { isMember: () => true, snapshot: () => ({}) })
        const blue = room.root.child('blue', { isMember: () => true, snapshot: () => ({}) })
        await red.resume({ uid: 1, connectionId: 'a' }, async () => {})
        await red.resume({ uid: 2, connectionId: 'b' }, async () => {})
        await blue.resume({ uid: 3, connectionId: 'c' }, async () => {})
        const sent: number[] = []
        let committed = false
        await assert.rejects(room.run(async ctx => {
            ctx.notify(red, [1, 2, 3], async session => { sent.push(session.uid) })
            ctx.afterCommit(() => { committed = true })
            throw new Error('transaction failed')
        }), /transaction failed/)
        assert.equal(sent.length, 0)
        assert.equal(committed, false)
        await room.run(async ctx => {
            ctx.notify(red, [1, 1, 3], async session => { sent.push(session.uid) })
            ctx.afterCommit(() => { committed = true })
        })
        await delay(0)
        assert.equal(committed, true)
        assert.deepEqual(sent, [1])
        await room.close()
    })

    it('releases the room queue when a full snapshot delivery stalls', async () => {
        const room = new RoomTree('timeout', {
            isMember: () => true,
            snapshot: () => ({ value: 1 }),
        }, { snapshotTimeoutMs: 15 })
        await assert.rejects(room.root.resume({ uid: 1, connectionId: 'a' }, async () => new Promise<void>(() => {})), /timed out/)
        assert.deepEqual(room.root.recipients(), [])
        assert.equal(await room.run(async () => 42), 42)
        await room.close()
    })

    it('refuses post-commit notifications without an Action execution adapter', async () => {
        const { room } = demo()
        await assert.rejects(room.run(async ctx => {
            ctx.afterCommit(() => {})
        }), /Action execution adapter/)
        await room.close()
    })

    it('runs a root deadline once and cancels a replaced deadline', async () => {
        const { room } = demo()
        const fired: string[] = []
        room.scheduleOnce('phase', Date.now() + 15, async () => { fired.push('old') })
        room.cancelTimer('phase')
        room.startTimers()
        room.scheduleOnce('phase', Date.now() + 15, async () => { fired.push('new') })
        await delay(45)
        await room.close()
        assert.deepEqual(fired, ['new'])
    })

    it('allows an ownerless room and rejects commands on a non-host worker when placement is configured', async () => {
        const local = new RoomTree('local', { isMember: () => true, snapshot: () => ({}) })
        assert.equal(await local.run(async () => 1), 1)
        await local.close()
        let hosted = false
        const placed = new RoomTree('placed', { isMember: () => true, snapshot: () => ({}) }, {
            isLocalOwner: () => hosted,
        })
        await assert.rejects(placed.run(async () => 1), /not hosted/)
        assert.throws(() => placed.startTimers(), /not hosted/)
        hosted = true
        assert.equal(await placed.run(async () => 2), 2)
        await placed.close()
    })
})
