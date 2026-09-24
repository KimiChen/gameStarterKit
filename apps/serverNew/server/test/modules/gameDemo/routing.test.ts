import assert from 'node:assert/strict'
import { Actions as C2SActions } from '../../../generated/protocol/server/C2S/actions'
import { Actions as S2SActions } from '../../../generated/protocol/server/S2S/actions'
import { ActionGameDemoAlchemyStart } from '../../../src/modules/gameDemo/action/ActionGameDemoAlchemyStart'
import { GameDemoPlayer } from '../../../src/modules/gameDemo/bean/GameDemoPlayer'
import { QueuedLocalAction } from '../../../src/runtime/action/QueuedLocalAction'
import type { User } from '../../../src/modules/user/bean/User'

const SID = 3
const BIND_BASE = 7_000_000_000_000 + SID * 1000
const SHARED: Record<string, number> = {
    'gameDemo.seasonEnd': 1,
    'gameDemo/GameDemoSeasonScore': 1,
    'gameDemo/GameDemoSeasonTick': 1,
    'gameDemo.guildCreate': 2,
    'gameDemo.guildInvite': 2,
    'gameDemo.guildRespond': 2,
    'gameDemo.guildLeave': 2,
    'gameDemo.bossEnter': 3,
    'gameDemo.bossLeave': 3,
    'gameDemo.bossAttack': 3,
    'gameDemo/GameDemoBossTick': 3,
}

type Routed = {
    getTaskGroupId?: (call: unknown) => Promise<number | undefined>
    getBindId?: (call: unknown) => Promise<number | undefined>
}

describe('gameDemo action routing', () => {
    let savedSid: unknown
    before(() => {
        savedSid = (globalThis as Record<string, unknown>).SERVER_ID
        ;(globalThis as Record<string, unknown>).SERVER_ID = SID
    })
    after(() => {
        ;(globalThis as Record<string, unknown>).SERVER_ID = savedSid
    })

    const routes = Object.entries({ ...C2SActions, ...S2SActions }).filter(([route]) => route.startsWith('gameDemo'))

    it('keeps player-owned routes on the player Owner, serialized by uid', async () => {
        const player = routes.filter(([route]) => !(route in SHARED))
        assert.ok(player.length >= 13)
        for (const [route, actionClass] of player) {
            const action = new (actionClass as new () => Routed)()
            assert.equal(await action.getTaskGroupId?.({ uId: 42 }), undefined, route)
            assert.equal(await action.getBindId?.({ uId: 42 }), 42, route)
        }
    })

    it('routes every entry of a shared resource to the same Task Worker group and serial key', async () => {
        const shared = routes.filter(([route]) => route in SHARED)
        assert.deepEqual(shared.map(([route]) => route).sort(), Object.keys(SHARED).sort())
        for (const [route, actionClass] of shared) {
            const action = new (actionClass as new () => Routed)()
            assert.equal(await action.getTaskGroupId?.({ uId: 42 }), SHARED[route], route)
            assert.equal(await action.getBindId?.({ uId: 42 }), BIND_BASE + SHARED[route], route)
        }
    })

    it('posts the batch score through the reliable queue and re-registers the previous batch', async () => {
        const posted: Array<{ req: unknown; uid: number; taskId?: string }> = []
        const savedRpc = QueuedLocalAction.rpc
        QueuedLocalAction.rpc = (async (
            _action: unknown,
            req: unknown,
            uid: number,
            _sid: number,
            _time: number,
            options?: { taskId?: string },
        ) => {
            posted.push({ req, uid, taskId: options?.taskId })
            return []
        }) as typeof QueuedLocalAction.rpc
        try {
            const player = new GameDemoPlayer(42)
            Object.assign(player, { id: 42, initialized: true, herb: 20, dew: 10 })
            player.batchSeq = 4
            player.batchScore = 3
            player.batchStartedAt = 100
            class TestAction extends ActionGameDemoAlchemyStart {
                constructor() {
                    super()
                    this._user = { id: 42, copper: 0 } as User
                }
                protected async loadPlayer() {
                    return player
                }
            }
            const res = {} as never
            await new TestAction().doAction({ clientReqId: 'a', count: 2 }, res)
            assert.deepEqual(
                posted.map((item) => item.taskId),
                ['gameDemo:score:42:4', 'gameDemo:score:42:5'],
            )
            assert.deepEqual(posted[0].req, { uid: 42, batchId: 4, score: 3, at: 100 })
            assert.equal((posted[1].req as { batchId: number }).batchId, 5)
        } finally {
            QueuedLocalAction.rpc = savedRpc
        }
    })
})
