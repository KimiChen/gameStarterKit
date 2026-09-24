import assert from 'node:assert/strict'
import {
    forwardLobbyKick,
    forwardLobbyPush,
    lobbyRoleOf,
    schedulerOwner,
    workerRole,
} from '../../src/startup/lobbyRole'
import { ForceLogoutReason } from '../../generated/lobby-contract/protocol/lobbyRpc'
import type { RuntimeServerLike } from '../../src/startup/runtimeTypes'

/**
 * 多进程原生 Lobby 的**角色判定**测试（P5 验收：「禁止静默降级单进程掩盖问题」）。
 *
 * 判定错了的两种表现都不在本地可见：
 * - 0 个监听进程：配置齐全、进程都起来了，但没有任何进程绑定端点，原生入口静默缺席；
 * - 2 个监听进程：多个进程抢同一个端口，后绑定的那个必然失败，表现成随机的 worker 崩溃。
 *
 * 所以这条判定必须被直接验证，而不是靠「起一次多进程看看」——那两种失败恰恰是多进程
 * 最难复现的形态。
 */

/** 生产拓扑：worker 0..3 + task worker 4..5 + user task worker 6 + master。 */
const PRODUCTION_SETTING: RuntimeServerLike['setting'] = { worker_num: 4, task_worker_num: 2, user_task_worker_num: 1 }

const CONFIG_NAMES = [
    'NATIVE_LOBBY_HOST',
    'NATIVE_LOBBY_PORT',
    'WEBPLATFORM_INTERNAL_ORIGIN',
    'WEBPLATFORM_SERVICE_ID',
    'WEBPLATFORM_SERVICE_SECRET',
] as const

function stubRuntime(
    workerId: number | null,
    setting: RuntimeServerLike['setting'] = PRODUCTION_SETTING,
    overrides: Partial<RuntimeServerLike> = {},
): RuntimeServerLike {
    const runtime: RuntimeServerLike = {
        worker_id: workerId,
        taskworker: false,
        setting,
        stopped: Promise.resolve(),
        start: async () => runtime,
        dispose: async () => undefined,
        push: () => false,
        close: () => false,
        exist: () => false,
        requestMessage: async () => undefined,
        connection_owner: () => false,
        workers: () => [],
        addStat: () => 0,
        snapshotStats: () => [],
    }
    return Object.assign(runtime, overrides)
}

/** 生产拓扑里的每个进程；`null` 是 master。 */
function productionWorkerIds(): Array<number | null> {
    return [null, 0, 1, 2, 3, 4, 5, 6]
}

function withNativeLobbyEnvironment(names: readonly string[], run: () => void): void {
    const saved = CONFIG_NAMES.map((name) => process.env[name])
    CONFIG_NAMES.forEach((name) => delete process.env[name])
    for (const name of names) process.env[name] = 'set'
    try {
        run()
    } finally {
        CONFIG_NAMES.forEach((name, index) => {
            const value = saved[index]
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
        })
    }
}

describe('native Lobby worker role assignment', () => {
    it('classifies every process in the production topology', () => {
        assert.equal(workerRole(stubRuntime(null)), 'MASTER')
        for (const workerId of [0, 1, 2, 3]) assert.equal(workerRole(stubRuntime(workerId)), 'WORKER')
        for (const workerId of [4, 5]) assert.equal(workerRole(stubRuntime(workerId)), 'TASK_WORKER')
        for (const workerId of [6, 7]) assert.equal(workerRole(stubRuntime(workerId)), 'USER_TASK_WORKER')
    })

    it('binds the endpoint in exactly one process and forwards from all the others', () => {
        const assignments = productionWorkerIds().map((workerId) => {
            const runtime = stubRuntime(workerId)
            const role = workerRole(runtime)
            return {
                workerId,
                role,
                assignment: lobbyRoleOf(runtime, role, { pipeTimeoutMs: 1234, hasEnvironment: true }),
            }
        })

        // 恰好一个监听进程。0 个 = 原生入口静默缺席；2 个 = 抢端口。
        const listeners = assignments.filter((entry) => entry.assignment?.role === 'listen')
        assert.deepEqual(
            listeners.map((entry) => entry.workerId),
            [0],
        )

        for (const entry of assignments) {
            if (entry.workerId === 0) continue
            assert.equal(entry.assignment?.role, 'forward', `worker ${entry.workerId} 必须只转发`)
            const forwardPush = (entry.assignment as { forwardPush?: unknown } | undefined)?.forwardPush
            assert.equal(typeof forwardPush, 'function', `worker ${entry.workerId} 缺少跨进程推送出口`)
        }
        // 监听进程自己就是推送出口，多挂一条跨进程链路只会绕远。
        assert.equal('forwardPush' in (listeners[0]!.assignment as object), false)
    })

    it('never assigns the listen role to a master or a non-event worker', () => {
        // 非 WORKER 进程即使 worker_id 是 0 也不能监听：master 不跑业务，task worker 没有连接。
        assert.equal(workerRole(stubRuntime(null, { worker_num: 0, task_worker_num: 2 })), 'MASTER')
        assert.equal(
            lobbyRoleOf(stubRuntime(null, { worker_num: 0, task_worker_num: 2 }), 'MASTER', {
                pipeTimeoutMs: 1,
                hasEnvironment: true,
            })?.role,
            'forward',
        )
        for (const role of ['TASK_WORKER', 'USER_TASK_WORKER'] as const) {
            const assignment = lobbyRoleOf(stubRuntime(0), role, { pipeTimeoutMs: 1, hasEnvironment: true })
            assert.equal(assignment?.role, 'forward', `${role} 不得绑定端点`)
        }
    })

    it('assigns no role at all when the native entry is not configured', () => {
        withNativeLobbyEnvironment([], () => {
            for (const workerId of productionWorkerIds()) {
                const runtime = stubRuntime(workerId)
                // 不注入 hasEnvironment 时走真实环境探测：未配置就是未参与，而不是「悄悄当监听」。
                assert.equal(lobbyRoleOf(runtime, workerRole(runtime), { pipeTimeoutMs: 1 }), undefined)
            }
        })
    })

    it('treats a partially configured native entry as configured, not as absent', () => {
        // 只给一半变量时 `hasNativeLobbyEnvironment` 必须为真：否则不完整配置会被当成「没配」而
        // 静默跳过原生入口；判为「已配置」之后，后续的装配会因缺变量直接报错（fail-closed）。
        withNativeLobbyEnvironment(['NATIVE_LOBBY_HOST'], () => {
            assert.equal(lobbyRoleOf(stubRuntime(0), 'WORKER', { pipeTimeoutMs: 1 })?.role, 'listen')
            assert.equal(lobbyRoleOf(stubRuntime(1), 'WORKER', { pipeTimeoutMs: 1 })?.role, 'forward')
        })
    })

    it('only reports a forwarded push as delivered when the listener explicitly confirms it', async () => {
        const seen: Array<{ message: unknown; targetWorkerId: number; timeoutMs: number | undefined }> = []
        const runtime = stubRuntime(2, PRODUCTION_SETTING, {
            requestMessage: async (message, targetWorkerId, timeoutMs) => {
                seen.push({ message, targetWorkerId, timeoutMs })
                return true
            },
        })

        assert.equal(await forwardLobbyPush(runtime, 4321)('external-uid', 7, 'mail.new', { id: 3 }), true)
        // 只发给监听进程，且只带字符串路由与 payload——目标身份不能被省略或改写。
        assert.deepEqual(seen, [
            {
                message: { kind: 'lobby-push', uid: 'external-uid', sid: 7, type: 'mail.new', data: { id: 3 } },
                targetWorkerId: 0,
                timeoutMs: 4321,
            },
        ])
    })

    it('never turns a missing or malformed listener reply into a successful push', async () => {
        for (const reply of [false, undefined, null, 0, 1, '', 'true', 'false', {}, [], { ok: true }]) {
            const runtime = stubRuntime(2, PRODUCTION_SETTING, { requestMessage: async () => reply })
            assert.equal(
                await forwardLobbyPush(runtime, 1)('u', 7, 't', {}),
                false,
                `回包 ${JSON.stringify(reply)} 不得被当成送达`,
            )
        }
    })

    it('forwards an operator force logout to the listener with the reason intact', async () => {
        const seen: Array<{ message: unknown; targetWorkerId: number; timeoutMs: number | undefined }> = []
        const runtime = stubRuntime(2, PRODUCTION_SETTING, {
            requestMessage: async (message, targetWorkerId, timeoutMs) => {
                seen.push({ message, targetWorkerId, timeoutMs })
                return true
            },
        })

        assert.equal(await forwardLobbyKick(runtime, 4321)('external-uid', 7, ForceLogoutReason.Revoked), true)
        // 只发给监听进程（只有它持有连接）；原因必须原样带上——目标进程用 `isForceLogoutReason`
        // 再校验一次，改写成别的值或省略都会在那里被直接拒绝。
        assert.deepEqual(seen, [
            {
                message: { kind: 'lobby-kick', uid: 'external-uid', sid: 7, reason: ForceLogoutReason.Revoked },
                targetWorkerId: 0,
                timeoutMs: 4321,
            },
        ])
    })

    it('never turns a missing or malformed listener reply into a successful kick', async () => {
        for (const reply of [false, undefined, null, 0, 1, '', 'true', 'false', {}, [], { ok: true }]) {
            const runtime = stubRuntime(2, PRODUCTION_SETTING, { requestMessage: async () => reply })
            assert.equal(
                await forwardLobbyKick(runtime, 1)('u', 7, ForceLogoutReason.Revoked),
                false,
                `回包 ${JSON.stringify(reply)} 不得被当成「已踢掉」`,
            )
        }
    })

    it('surfaces a pipe failure instead of swallowing it into a silent success', async () => {
        const failing = stubRuntime(2, PRODUCTION_SETTING, {
            requestMessage: async () => {
                throw new Error('pipe timeout')
            },
        })
        // 吞错返回 false 会把「不知道有没有送到」伪装成「没送到」，两者对调用方的含义不同。
        await assert.rejects(() => forwardLobbyPush(failing, 1)('u', 7, 't', {}), /pipe timeout/)
    })

    it('lets exactly one process own the schedulers', () => {
        const owners = (setting: RuntimeServerLike['setting']) =>
            productionWorkerIds().filter((workerId) => schedulerOwner(stubRuntime(workerId, setting)))
        // task worker 池非空：调度落在第一个 task worker，而不是 event worker。
        assert.deepEqual(owners(PRODUCTION_SETTING), [4])
        // 没有 task worker 池：落在 worker 0。
        assert.deepEqual(owners({ worker_num: 4, task_worker_num: 0 }), [0])
    })
})
