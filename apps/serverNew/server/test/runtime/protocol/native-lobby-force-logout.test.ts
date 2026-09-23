import assert from 'node:assert/strict'
import { ForceLogoutReason } from '../../../generated/lobby-contract/native/lobbyRpc/index.generated'
import { executeInternalAction } from '../../../src/runtime/action/executeInternalAction'
import {
    OPS_FORCE_LOGOUT_REASON,
    OPS_FORCE_LOGOUT_TYPE,
    OPS_ROLE_FORCE_LOGOUT_TYPE,
    parseOpsForceLogout,
    parseOpsRoleForceLogout,
    revokeOpsOnline,
    revokeOpsRoleOnline,
    routeOpsForceLogout,
} from '../../../src/runtime/lobby/NativeLobbyForceLogout'
import type { NativeLobbyRuntime } from '../../../src/startup/NativeLobbyRuntime'
import type { RuntimeServerLike } from '../../../src/startup/runtimeTypes'

/**
 * 运营强制下线（4903）对外入口的契约测试（P8-②）。
 *
 * 这条入口的失败形态都不显眼，因此每一类都必须被直接钉住：
 * - 入口是**唯一**允许 4903 的地方，若它也能指定 `banned`/`replaced`，就等于允许伪造「谁触发的下线」；
 * - 请求带的是**外部字符串 uid**（原生 Lobby 全部以外部 uid 为键，内部数值 uid 没有反查索引），
 *   若这里接受数字或做 `Number(uid)` 猜测，会把「查不到」变成「踢错人」；
 * - 「本进程没有原生入口」与「配了原生入口但请求被路由到了非监听进程」必须给出**不同**结论：
 *   前者是诚实的 `false`，后者是路由错误，必须响亮失败而不是假装成功。
 *
 * 真实进程上的 4903 观测（真 ws 客户端收到 `auth.forceLogout{revoked}` 并被 4903 关闭）
 * 由 `scripts/verify/native-lobby-live.cjs` 承担，本文件不重复那条链路。
 */

const SID = 7
const EXTERNAL_UID = 'external-uid-ops'

const CONFIG_NAMES = [
    'NATIVE_LOBBY_HOST',
    'NATIVE_LOBBY_PORT',
    'WEBPLATFORM_INTERNAL_ORIGIN',
    'WEBPLATFORM_SERVICE_ID',
    'WEBPLATFORM_SERVICE_SECRET',
] as const

describe('operator force logout entry', () => {
    let savedGlobals: Record<string, unknown> = {}
    let savedEnv: Record<string, string | undefined> = {}

    before(() => {
        const noop = () => undefined
        const logger = { debug: noop, info: noop, warn: noop, error: noop, crit: noop }
        savedGlobals = {
            Log: (globalThis as Record<string, unknown>).Log,
            SERVER_ID: (globalThis as Record<string, unknown>).SERVER_ID,
            CP: (globalThis as Record<string, unknown>).CP,
        }
        ;(globalThis as Record<string, unknown>).Log = new Proxy(logger, {
            get: (target, key) => Reflect.get(target, key) ?? logger,
        })
        ;(globalThis as Record<string, unknown>).SERVER_ID = SID
        ;(globalThis as Record<string, unknown>).CP = { platform: { gmSecret: 'gm-secret' } }

        // 未配置原生入口是这些用例的默认前提；需要时由单个用例临时打开。
        savedEnv = {}
        for (const name of CONFIG_NAMES) {
            savedEnv[name] = process.env[name]
            delete process.env[name]
        }
    })

    after(() => {
        for (const name of CONFIG_NAMES) {
            const value = savedEnv[name]
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
        }
        for (const [name, value] of Object.entries(savedGlobals)) {
            if (value === undefined) delete (globalThis as Record<string, unknown>)[name]
            else (globalThis as Record<string, unknown>)[name] = value
        }
    })

    it('only accepts the operator reason, and treats an omitted reason as that same reason', () => {
        assert.equal(OPS_FORCE_LOGOUT_REASON, ForceLogoutReason.Revoked)
        const expected = { uid: EXTERNAL_UID, sId: SID }
        assert.deepEqual(parseOpsForceLogout(lobbyKick({ uid: EXTERNAL_UID, sId: SID })), expected)
        assert.deepEqual(
            parseOpsForceLogout(lobbyKick({ uid: EXTERNAL_UID, sId: SID, reason: OPS_FORCE_LOGOUT_REASON })),
            expected,
        )
    })

    it('rejects anything that is not a well-formed operator force logout request', () => {
        const rejected: unknown[] = [
            undefined,
            null,
            {},
            'lobbyKick',
            { type: 'lobbyKick' },
            { type: 'lobbyKick', actionParams: {} },
            lobbyKick({}),
            lobbyKick({ uid: '', sId: SID }),
            // 数字 uid 必须被拒：外部身份是不透明字符串，`Number(uid)` 会静默指向另一个账号。
            lobbyKick({ uid: 12345, sId: SID }),
            lobbyKick({ uid: EXTERNAL_UID, sId: 0 }),
            lobbyKick({ uid: EXTERNAL_UID, sId: 1.5 }),
            // 错区：本进程只服务一个区服，他区请求必须被拒而不是「查不到就返回 false」。
            lobbyKick({ uid: EXTERNAL_UID, sId: SID + 1 }),
            // 4901/4902 有各自的权威来源，运营入口不得伪造。
            lobbyKick({ uid: EXTERNAL_UID, sId: SID, reason: ForceLogoutReason.Banned }),
            lobbyKick({ uid: EXTERNAL_UID, sId: SID, reason: ForceLogoutReason.Replaced }),
            lobbyKick({ uid: EXTERNAL_UID, sId: SID, reason: 'whatever' }),
        ]
        for (const payload of rejected) {
            assert.throws(() => parseOpsForceLogout(payload), `不得接受 ${JSON.stringify(payload) ?? String(payload)}`)
        }
    })

    it('accepts the GM role_id bridge only with a positive internal id in this server', () => {
        assert.deepEqual(parseOpsRoleForceLogout(roleKick({ roleId: 1234, sId: SID })), { roleId: 1234, sId: SID })
        for (const payload of [
            roleKick({}),
            roleKick({ roleId: 0, sId: SID }),
            roleKick({ roleId: 1.5, sId: SID }),
            roleKick({ roleId: '1234', sId: SID }),
            roleKick({ roleId: 1234, sId: SID + 1 }),
            roleKick({ roleId: 1234, sId: SID, reason: ForceLogoutReason.Banned }),
        ]) {
            assert.throws(() => parseOpsRoleForceLogout(payload))
        }
    })

    it('reports a plain miss when this process has no native Lobby entry at all', () => {
        // 没配原生入口 = 本进程没有原生连接可踢。这是结论，不是错误。
        assert.equal(
            revokeOpsOnline({ uid: EXTERNAL_UID, sId: SID }, () => undefined),
            false,
        )
    })

    it('fails loudly when a native Lobby is configured but this process does not hold it', () => {
        // 配置了原生入口却没有运行时，只可能是请求被交给了非监听进程（多进程路由错误）。
        // 这时返回 false 会把「路由错了」伪装成「该用户不在线」，所以必须抛错。
        process.env.NATIVE_LOBBY_HOST = '127.0.0.1'
        try {
            assert.throws(
                () => revokeOpsOnline({ uid: EXTERNAL_UID, sId: SID }, () => undefined),
                /must be executed in the native Lobby listener process/,
            )
        } finally {
            delete process.env.NATIVE_LOBBY_HOST
        }
    })

    it('delegates to the listener runtime with the exact external identity and reports its verdict', () => {
        const calls: Array<[string, number]> = []
        let kicked = true
        const runtime = {
            revoke: (uid: string, sId: number) => {
                calls.push([uid, sId])
                return kicked
            },
            kick: () => false,
            push: async () => false,
            stop: async () => undefined,
        } as unknown as NativeLobbyRuntime

        assert.equal(
            revokeOpsOnline({ uid: EXTERNAL_UID, sId: SID }, () => runtime),
            true,
        )
        // 该 uid 当时不在线时，运行时回 false，入口必须原样回 false（不猜成功）。
        kicked = false
        assert.equal(
            revokeOpsOnline({ uid: EXTERNAL_UID, sId: SID }, () => runtime),
            false,
        )
        assert.deepEqual(calls, [
            [EXTERNAL_UID, SID],
            [EXTERNAL_UID, SID],
        ])
    })

    it('delegates the GM bridge to the listener runtime by internal role_id', () => {
        const calls: Array<[number, number]> = []
        const runtime = {
            revokeByInternalUid: (roleId: number, sId: number) => {
                calls.push([roleId, sId])
                return true
            },
            revoke: () => false,
            kick: () => false,
            push: async () => false,
            stop: async () => undefined,
        } as unknown as NativeLobbyRuntime
        assert.equal(
            revokeOpsRoleOnline({ roleId: 1234, sId: SID }, () => runtime),
            true,
        )
        assert.deepEqual(calls, [[1234, SID]])
    })

    it('routes the internal lobbyKick action through the same entry and never falls through', async () => {
        // 未配置原生入口时是诚实的 false；关键在于形状是 `{ kicked }`，说明它没有掉进
        // `ProtocolConfigMgr.execAction` 的兜底分支（那会把运营下线当成一条普通业务路由）。
        assert.deepEqual(await executeInternalAction(lobbyKick({ uid: EXTERNAL_UID, sId: SID })), { kicked: false })
        // 非法 payload 必须抛错，而不是回一个「没踢到」的假结论。
        await assert.rejects(
            () => executeInternalAction(lobbyKick({ uid: EXTERNAL_UID, sId: SID + 1 })),
            /sid mismatch/,
        )
        assert.deepEqual(await executeInternalAction(roleKick({ roleId: 1234, sId: SID })), { kicked: false })
    })

    it('hands the multi-process request to the listener instead of claiming a local kick', async () => {
        const seen: Array<{ message: unknown; targetWorkerId: number; timeoutMs: number | undefined }> = []
        const runtime = stubRuntime({
            requestMessage: async (message, targetWorkerId, timeoutMs) => {
                seen.push({ message, targetWorkerId, timeoutMs })
                return true
            },
        })

        // 本进程不持有原生 Lobby 运行时（`() => undefined`）：它没有在线表，必须把请求改写成
        // `lobby-kick` 交给监听进程，而不是就地返回 false。显式注入解析器，避免依赖模块级状态。
        assert.deepEqual(
            await routeOpsForceLogout(runtime, lobbyKick({ uid: EXTERNAL_UID, sId: SID }), 4321, () => undefined),
            {
                kicked: true,
            },
        )
        assert.deepEqual(seen, [
            {
                message: { kind: 'lobby-kick', uid: EXTERNAL_UID, sid: SID, reason: OPS_FORCE_LOGOUT_REASON },
                targetWorkerId: 0,
                timeoutMs: 4321,
            },
        ])

        // 监听进程回 false（该 uid 不在线）时原样回 false，不猜成功。
        assert.deepEqual(
            await routeOpsForceLogout(
                stubRuntime({ requestMessage: async () => false }),
                lobbyKick({ uid: EXTERNAL_UID, sId: SID }),
                4321,
                () => undefined,
            ),
            { kicked: false },
        )
    })

    it('executes locally when the request already landed in the listener process', async () => {
        // 多进程下内部 HTTP 端点由**监听进程**承载（alloy-core 的 worker 侧不接受主控发起的
        // 进程请求），所以生产路径走的是这一支。判据必须是「本进程持有连接」而不是「本进程是主控」。
        const calls: Array<[string, number]> = []
        const listener = {
            revoke: (uid: string, sId: number) => {
                calls.push([uid, sId])
                return true
            },
            kick: () => false,
            push: async () => false,
            stop: async () => undefined,
        } as unknown as NativeLobbyRuntime
        let piped = 0
        const runtime = stubRuntime({
            requestMessage: async () => {
                piped += 1
                return true
            },
        })

        assert.deepEqual(
            await routeOpsForceLogout(runtime, lobbyKick({ uid: EXTERNAL_UID, sId: SID }), 4321, () => listener),
            { kicked: true },
        )
        assert.deepEqual(calls, [[EXTERNAL_UID, SID]], '必须用外部字符串 uid 就地踢人')
        assert.equal(piped, 0, '监听进程不得再绕一圈管道请求')

        // 该 uid 不在线时原样回 false，不猜成功。
        assert.deepEqual(
            await routeOpsForceLogout(
                runtime,
                lobbyKick({ uid: EXTERNAL_UID, sId: SID }),
                4321,
                () => ({ ...listener, revoke: () => false }) as unknown as NativeLobbyRuntime,
            ),
            { kicked: false },
        )
        assert.equal(piped, 0)
    })

    it('leaves every other internal action to its own routing', async () => {
        let asked = 0
        const runtime = stubRuntime({
            requestMessage: async () => {
                asked += 1
                return true
            },
        })
        // 非运营下线的 payload 必须原样返回 undefined：调用方要继续走它原来的路由，
        // 而不是被这条分支吞掉（吞掉等于把其它内部动作变成静默 no-op）。
        for (const payload of [undefined, null, {}, { type: 'localAction' }, { type: 'adjust' }, 'lobbyKick']) {
            assert.equal(await routeOpsForceLogout(runtime, payload, 1), undefined)
        }
        assert.equal(asked, 0, '非运营下线请求不得碰管道')
    })
})

function lobbyKick(actionParams: Record<string, unknown>): Record<string, unknown> {
    return { type: OPS_FORCE_LOGOUT_TYPE, actionParams }
}

function roleKick(actionParams: Record<string, unknown>): Record<string, unknown> {
    return { type: OPS_ROLE_FORCE_LOGOUT_TYPE, actionParams }
}

function stubRuntime(overrides: Partial<RuntimeServerLike> = {}): RuntimeServerLike {
    const runtime: RuntimeServerLike = {
        worker_id: 1,
        taskworker: false,
        setting: { worker_num: 2, task_worker_num: 0 },
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
