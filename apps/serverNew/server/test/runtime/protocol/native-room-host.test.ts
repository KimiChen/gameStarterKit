import assert from 'node:assert/strict'
import { MessageHelper } from '@arthropoda/game-engine'
import {
    NativeLobbyRoomHost,
    hostsObjectBinding,
    nativeObjectBinding,
    nativeObjectTaskGroup,
} from '../../../src/runtime/lobby/NativeLobbyRoomHost'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
describe('native room loop lifecycle', () => {
    it('runs independent Action contexts and drains in-flight ticks before stopping', async () => {
        const original = MessageHelper.syncDoFunc
        let actions = 0
        MessageHelper.syncDoFunc = (async (fn: () => Promise<unknown>) => {
            actions++
            return fn()
        }) as typeof original
        let release!: () => void
        const blocked = new Promise<void>((resolve) => {
            release = resolve
        })
        let firstStarted!: () => void
        const started = new Promise<void>((resolve) => {
            firstStarted = resolve
        })
        let fastTicks = 0
        try {
            NativeLobbyRoomHost.start(
                'slow',
                async () => {
                    firstStarted()
                    await blocked
                },
                100,
            )
            NativeLobbyRoomHost.start(
                'fast',
                async () => {
                    fastTicks++
                },
                100,
            )
            await started
            for (let i = 0; i < 30 && fastTicks < 2; i++) await sleep(10)
            assert.ok(fastTicks >= 2)
            assert.ok(actions >= 3)
            let stopped = false
            const drain = NativeLobbyRoomHost.stop().then(() => {
                stopped = true
            })
            await sleep(20)
            assert.equal(stopped, false)
            release()
            await drain
            const count = fastTicks
            await sleep(150)
            assert.equal(fastTicks, count)
        } finally {
            release()
            await NativeLobbyRoomHost.stop()
            MessageHelper.syncDoFunc = original
        }
    })
    it('assigns rooms to the existing task pool and avoids binding to an absent pool', () => {
        const info = globalThis as unknown as Record<string, unknown>
        const names = ['WORKER_ID', 'WORKER_NUM', 'TASK_WORKER_NUM', 'USER_TASK_WORKER_NUM']
        const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(info, name))
        try {
            Object.assign(info, { WORKER_NUM: 1, TASK_WORKER_NUM: 2, USER_TASK_WORKER_NUM: 2 })
            for (let worker = 0; worker < 5; worker++) {
                info.WORKER_ID = worker
                assert.equal(hostsObjectBinding(100), worker === 1)
                assert.equal(hostsObjectBinding(101), worker === 2)
            }
            assert.equal(nativeObjectBinding(101), 101)
            assert.equal(nativeObjectTaskGroup(101), 101)
            info.TASK_WORKER_NUM = 0
            info.WORKER_ID = 0
            assert.equal(hostsObjectBinding(101), true)
            assert.equal(nativeObjectBinding(101), undefined)
            assert.equal(nativeObjectTaskGroup(101), undefined)
            info.WORKER_ID = null
            assert.equal(hostsObjectBinding(101), false)
        } finally {
            names.forEach((name, index) => {
                if (descriptors[index]) Object.defineProperty(info, name, descriptors[index]!)
                else delete info[name]
            })
        }
    })
})
