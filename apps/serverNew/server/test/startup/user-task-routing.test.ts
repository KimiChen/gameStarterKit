import assert from 'node:assert/strict'
import { RouteAction } from '@arthropoda/game-engine'
import { installNativeLobbyProcessRouter } from '../../src/startup/installNativeLobbyProcessRouter'
import type { RuntimeServerLike } from '../../src/startup/runtimeTypes'

describe('user task worker routing boundary', () => {
    it('executes a user-task local action in its assigned user worker instead of re-routing it as an object call', async () => {
        const previous = RouteAction.processRouter
        let forwarded = 0
        const runtime = {
            worker_id: 3,
            taskworker: true,
            setting: { worker_num: 1, task_worker_num: 2, user_task_worker_num: 1 },
            requestMessage: async () => {
                forwarded += 1
                return undefined
            },
        } as unknown as RuntimeServerLike
        try {
            installNativeLobbyProcessRouter(runtime, 1000)
            const routed = await RouteAction.processRouter!(
                { getApiName: () => 'user/UserFieldValUpdate', responseTransport: undefined } as never,
                1001,
            )
            assert.equal(routed, false)
            assert.equal(forwarded, 0)
        } finally {
            RouteAction.processRouter = previous
        }
    })
})
