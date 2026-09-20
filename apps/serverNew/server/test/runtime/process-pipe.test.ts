import assert from 'node:assert/strict'
import {
    ContextEngine,
    GameError,
    RedisService,
    RouteAction,
    executeForwardedRoute,
    executeObjectAction,
} from '@arthropoda/game-engine'
import { UserRpc, type LobbyRpcType } from '../../generated/lobby-contract/protocol/lobbyRpc'
import { NativeLobbyProcessRoutes, nativeLobbyProcessRoutes } from '../../src/runtime/lobby/NativeLobbyProcessRoutes'
import { NativeLobbyRouteRegistry } from '../../src/runtime/lobby/NativeLobbyRouteRegistry'
import { installForwardedNativeLobbyRoutes } from '../../src/startup/NativeLobbyRuntime'
import {
    handleProcessPipeRequest,
    isProcessPipeRequest,
    normalizeProcessPipeFailure,
    type LobbyRouteIdentity,
    type ProcessPipeDependencies,
    type ProcessPipeRequest,
} from '../../src/startup/processPipe'

const EXTERNAL_UID = 'external-9007199254740993'
const INTERNAL_UID = 1001
const SID = 7
const BIND_ID = 4242
const TRACE_ID = 90001

interface PipeRecord {
    lobbyRoutes: { route: string; identity: LobbyRouteIdentity; payload: unknown }[]
    internalActions: unknown[]
    lookups: [number, number][]
    pushes: [string, number, string, unknown][]
    kicks: [string, number, string][]
}

/** 目标 worker 侧的依赖替身；`executeLobbyRoute` 默认接到真实进程路由执行点。 */
function makeDeps(routes: NativeLobbyProcessRoutes, overrides: Partial<ProcessPipeDependencies> = {}) {
    const record: PipeRecord = { lobbyRoutes: [], internalActions: [], lookups: [], pushes: [], kicks: [] }
    const deps: ProcessPipeDependencies = {
        async executeLobbyRoute(route, identity, payload) {
            record.lobbyRoutes.push({ route, identity, payload })
            return routes.execute(route, identity, payload)
        },
        async executeInternalAction(payload) {
            record.internalActions.push(payload)
            return { handled: true }
        },
        async lookupUserConnection(uid, sid) {
            record.lookups.push([uid, sid])
            return null
        },
        async pushLobbyConnection(uid, sid, type, data) {
            record.pushes.push([uid, sid, type, data])
            return true
        },
        kickLobbyConnection(uid, sid, reason) {
            record.kicks.push([uid, sid, reason])
            return true
        },
        ...overrides,
    }
    return { deps, record }
}

function routedMessage(route: LobbyRpcType, bindId: number, traceId: number): ProcessPipeRequest {
    return {
        kind: 'routed-lobby-route',
        route,
        payload: { marker: 'payload' },
        uid: EXTERNAL_UID,
        internalUid: INTERNAL_UID,
        sid: SID,
        bindId,
        traceId,
        invokeLayer: 1,
    }
}

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
        resolve = r
    })
    return { promise, resolve }
}

describe('native Lobby process pipe', () => {
    let originalProcessRouter: typeof RouteAction.processRouter
    let originalSave: typeof RedisService.save

    before(() => {
        const noop = () => undefined
        const logger = { debug: noop, info: noop, warn: noop, error: noop, crit: noop }
        global.Log = new Proxy(logger, {
            get: (target, key) => Reflect.get(target, key) ?? logger,
        }) as unknown as typeof Log
        global.PLATFORM = 'bearjoy'
        GameError.logicError = new GameError(500, 'logic')
        GameError.runtimeError = new GameError(501, 'runtime')
        GameError.apiCallQueueTimeout = new GameError(502, 'queue timeout')
        // 进程内没有 DifferCache 注入，提交阶段必须替身掉，否则会因 APP_TYPE 未初始化直接抛错。
        originalSave = RedisService.save
        RedisService.save = async () => undefined
        // 本文件验证的是「目标 worker 就地执行」，必须保证测试进程自身不会再往外转发。
        originalProcessRouter = RouteAction.processRouter
        RouteAction.processRouter = undefined
    })

    after(() => {
        RouteAction.processRouter = originalProcessRouter
        RedisService.save = originalSave
        RouteAction.callGroups.clear()
    })

    it('accepts only known pipe kinds', () => {
        assert.equal(isProcessPipeRequest({ kind: 'lobby-push', uid: 'u', sid: 1, type: 't', data: {} }), true)
        assert.equal(isProcessPipeRequest(routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID)), true)
        assert.equal(isProcessPipeRequest({ kind: 'routed-client-frame', payload: Buffer.from('raw') }), false)
        // 旧二进制协议调用分支已随 P6 删除：它不得再被当成合法管道消息复活。
        assert.equal(isProcessPipeRequest({ kind: 'routed-client-api' }), false)
        assert.equal(isProcessPipeRequest({ kind: 'unknown' }), false)
        assert.equal(isProcessPipeRequest({}), false)
        assert.equal(isProcessPipeRequest('lobby-push'), false)
        assert.equal(isProcessPipeRequest(null), false)
    })

    it('keeps string error codes and never promotes a numeric code to a string code', () => {
        assert.deepEqual(normalizeProcessPipeFailure({ code: 'ROOM_FULL', msg: '房间已满' }), {
            code: 'ROOM_FULL',
            msg: '房间已满',
        })
        // 旧二进制通道已删除，数字错误码不再有 wire 出口；它只能被丢弃，⛔ 不能当成字符串码回传。
        assert.deepEqual(normalizeProcessPipeFailure({ code: 500, message: '内部错误' }), {
            code: 'INTERNAL',
            msg: '内部错误',
            noLogin: false,
        })
        assert.deepEqual(normalizeProcessPipeFailure({ code: 403, message: '未登录', noLogin: true }), {
            code: 'INTERNAL',
            msg: '未登录',
            noLogin: true,
        })
        assert.deepEqual(normalizeProcessPipeFailure(new Error('boom')), {
            code: 'INTERNAL',
            msg: 'boom',
            noLogin: false,
        })
        assert.deepEqual(normalizeProcessPipeFailure(undefined), { code: 'INTERNAL', msg: '服务器内部错误' })
    })

    it('reuses the bindId resolved by the source worker and keeps the nested call in the same group', async () => {
        const registry = new NativeLobbyRouteRegistry()
        const routes = new NativeLobbyProcessRoutes()
        routes.install(registry)

        let getBindIdCalls = 0
        const observed: {
            parentGroupName?: string
            parentExternalUid?: string
            nestedGroupName?: string
            nestedRoutedBindId?: number
            nestedTraceId?: number
            nestedExternalUid?: string
        } = {}
        const order: string[] = []

        registry.register(UserRpc.GetInfo, async (context, payload) => {
            // 目标 worker 拿到的身份：字符串 uid 与内部 uid 都是源 worker 已解析的可信值。
            assert.equal(context.uid, EXTERNAL_UID)
            assert.equal(context.sId, SID)
            const parentCall = ContextEngine.currentCtxEngine!.ctxLogic.call as unknown as {
                groupName?: string
                externalUid?: string
            }
            observed.parentGroupName = parentCall.groupName
            observed.parentExternalUid = parentCall.externalUid
            assert.equal(RouteAction.callGroups.has(`bind:${BIND_ID}`), true)

            const result = await executeObjectAction(
                'user.inner',
                payload,
                { value: 0 },
                {
                    async getBindId() {
                        getBindIdCalls++
                        return 999_999
                    },
                    async doAction(req, res, call) {
                        order.push('inner')
                        observed.nestedGroupName = call.groupName
                        observed.nestedRoutedBindId = call.routedBindId
                        observed.nestedTraceId = call.messageHead.traceId
                        observed.nestedExternalUid = call.externalUid
                        res.value = (req as { marker: string }).marker.length
                    },
                },
                // 故意不传 externalUid / routedBindId / traceId：必须从转发父调用继承。
                { uid: INTERNAL_UID, sId: SID },
            )
            assert.deepEqual(result, { ok: true, data: { value: 7 } })
            order.push('handler')
            return { value: 7 }
        })

        const { deps, record } = makeDeps(routes)
        assert.deepEqual(await handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID)), {
            ok: true,
            res: { value: 7 },
        })

        assert.equal(getBindIdCalls, 0, '目标 worker 不得用 getBindId 重算 bindId')
        assert.equal(observed.parentGroupName, `bind:${BIND_ID}`)
        assert.equal(observed.nestedGroupName, `bind:${BIND_ID}`)
        assert.equal(observed.nestedRoutedBindId, BIND_ID)
        assert.equal(observed.nestedTraceId, TRACE_ID)
        assert.equal(observed.parentExternalUid, EXTERNAL_UID)
        assert.equal(observed.nestedExternalUid, EXTERNAL_UID)
        assert.deepEqual(order, ['inner', 'handler'])
        // 跨进程边界上只传字符串路由、payload 与可信身份，bindId 是源 worker 首次解析的结果。
        assert.equal(record.lobbyRoutes.length, 1)
        assert.equal(record.lobbyRoutes[0].route, UserRpc.GetInfo)
        assert.deepEqual(record.lobbyRoutes[0].identity, {
            uid: EXTERNAL_UID,
            sId: SID,
            internalUid: INTERNAL_UID,
            routedBindId: BIND_ID,
            traceId: TRACE_ID,
            invokeLayer: 1,
        })
        assert.deepEqual(record.lobbyRoutes[0].payload, { marker: 'payload' })
        assert.deepEqual(record.pushes, [])
        assert.deepEqual(record.kicks, [])
        assert.equal(RouteAction.callGroups.size, 0)
    })

    it('returns object results and forwards the raw business error across the pipe', async () => {
        const registry = new NativeLobbyRouteRegistry()
        const routes = new NativeLobbyProcessRoutes()
        routes.install(registry)

        const businessError = { code: 'ROOM_FULL', msg: '房间已满' }
        registry.register(UserRpc.GetInfo, async () => {
            throw businessError
        })
        registry.register(UserRpc.GetUserId, async (context) => {
            const inner = await executeObjectAction(
                'user.failing',
                {},
                {},
                {
                    doAction() {
                        throw new Error('inner exploded')
                    },
                },
                { uid: INTERNAL_UID, sId: SID, externalUid: context.uid },
            )
            assert.equal(inner.ok, false)
            throw inner.ok ? new Error('unreachable') : inner.error
        })

        const { deps } = makeDeps(routes)
        assert.deepEqual(await handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID)), {
            ok: false,
            err: { code: 'ROOM_FULL', msg: '房间已满' },
        })

        const failed = await handleProcessPipeRequest(deps, routedMessage(UserRpc.GetUserId, BIND_ID + 1, TRACE_ID + 1))
        assert.deepEqual(failed, {
            ok: false,
            err: { code: 'INTERNAL', msg: 'inner exploded', noLogin: false },
        })
        assert.equal(RouteAction.callGroups.size, 0)
    })

    it('fails closed when the target process has no routes or the route is unknown', async () => {
        const { deps } = makeDeps(new NativeLobbyProcessRoutes())
        assert.deepEqual(await handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID)), {
            ok: false,
            err: { code: 'INTERNAL', msg: '目标进程未装载原生 Lobby 路由' },
        })

        const registry = new NativeLobbyRouteRegistry()
        const routes = new NativeLobbyProcessRoutes()
        routes.install(registry)
        const installed = makeDeps(routes)
        assert.deepEqual(
            await handleProcessPipeRequest(
                installed.deps,
                routedMessage('user.notRegistered' as LobbyRpcType, BIND_ID, TRACE_ID),
            ),
            { ok: false, err: { code: 'UNKNOWN_TYPE', msg: '未知请求类型' } },
        )
    })

    it('serializes two forwarded requests that share the routed bindId', async () => {
        const registry = new NativeLobbyRouteRegistry()
        const routes = new NativeLobbyProcessRoutes()
        routes.install(registry)

        let active = 0
        let maxActive = 0
        registry.register(UserRpc.GetInfo, async (context) => {
            const inner = await executeObjectAction(
                'user.probe',
                {},
                {},
                {
                    async doAction() {
                        active++
                        maxActive = Math.max(maxActive, active)
                        await new Promise<void>((resolve) => setImmediate(resolve))
                        active--
                    },
                },
                { uid: INTERNAL_UID, sId: SID, externalUid: context.uid },
            )
            assert.equal(inner.ok, true)
            return { ok: true }
        })

        const { deps } = makeDeps(routes)
        // 两个独立客户端请求：同 bindId 必须串行，traceId 不同（不是同一次调用的嵌套）。
        const [first, second] = await Promise.all([
            handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID)),
            handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID + 1)),
        ])
        assert.deepEqual(first, { ok: true, res: { ok: true } })
        assert.deepEqual(second, { ok: true, res: { ok: true } })
        assert.equal(maxActive, 1)
        assert.equal(RouteAction.callGroups.size, 0)
    })

    it('still rejects a same-trace call that loops back into the held group', async () => {
        const registry = new NativeLobbyRouteRegistry()
        const routes = new NativeLobbyProcessRoutes()
        routes.install(registry)

        const entered = deferred()
        const gate = deferred()
        registry.register(UserRpc.GetInfo, async (context) => {
            entered.resolve()
            await gate.promise
            return { uid: context.uid }
        })

        const { deps } = makeDeps(routes)
        const holding = handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID))
        await entered.promise

        // 同 traceId 的调用不可能来自当前分组的嵌套：目标 worker 收到转发请求时处在全新的
        // 进程上下文里。这里必须复现同样的前提，否则断言会退化成「验证嵌套」而不是「验证死锁」。
        assert.equal(ContextEngine.isValid, false, '测试必须运行在分组上下文之外')
        const loopback = await handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID))
        assert.deepEqual(loopback, {
            ok: false,
            err: {
                code: 'INTERNAL',
                msg: 'call_dead_look',
                noLogin: false,
            },
        })

        gate.resolve()
        assert.deepEqual(await holding, { ok: true, res: { uid: EXTERNAL_UID } })
        assert.equal(RouteAction.callGroups.size, 0)
    })

    it('delegates push and kick to the connection-owning process only', async () => {
        const routes = new NativeLobbyProcessRoutes()
        const { deps, record } = makeDeps(routes)

        assert.equal(
            await handleProcessPipeRequest(deps, {
                kind: 'lobby-push',
                uid: EXTERNAL_UID,
                sid: SID,
                type: 'mail.new',
                data: { id: 3 },
            }),
            true,
        )
        assert.equal(
            await handleProcessPipeRequest(deps, { kind: 'lobby-kick', uid: EXTERNAL_UID, sid: SID, reason: 'banned' }),
            true,
        )
        assert.equal(
            await handleProcessPipeRequest(deps, { kind: 'lookup-user-connection', uid: INTERNAL_UID, sid: SID }),
            null,
        )
        assert.deepEqual(await handleProcessPipeRequest(deps, { kind: 'internal-action', payload: { a: 1 } }), {
            handled: true,
        })

        assert.deepEqual(record.pushes, [[EXTERNAL_UID, SID, 'mail.new', { id: 3 }]])
        assert.deepEqual(record.kicks, [[EXTERNAL_UID, SID, 'banned']])
        assert.deepEqual(record.lookups, [[INTERNAL_UID, SID]])
        assert.deepEqual(record.internalActions, [{ a: 1 }])
        // 推送与踢人只经由依赖实现；目标 worker 不在这里写 wire。
        assert.deepEqual(record.lobbyRoutes, [])
    })

    it('propagates the raw business error out of the forwarded parent call', async () => {
        const businessError = { code: 'OPERATION_CONFLICT', msg: '同一 clientReqId 的请求内容不一致' }
        await assert.rejects(
            () =>
                executeForwardedRoute(
                    { uid: INTERNAL_UID, sId: SID, routedBindId: BIND_ID, traceId: TRACE_ID, invokeLayer: 0 },
                    async () => {
                        throw businessError
                    },
                ),
            (error: unknown) => error === businessError,
        )
        assert.equal(RouteAction.callGroups.size, 0)
    })
})

describe('native Lobby role wiring', () => {
    const CONFIG_NAMES = [
        'NATIVE_LOBBY_HOST',
        'NATIVE_LOBBY_PORT',
        'WEBPLATFORM_INTERNAL_ORIGIN',
        'WEBPLATFORM_SERVICE_ID',
        'WEBPLATFORM_SERVICE_SECRET',
    ] as const

    it('loads the complete route set in a forwarding worker and fails closed after unload', async () => {
        const saved = CONFIG_NAMES.map((name) => process.env[name])
        process.env.NATIVE_LOBBY_HOST = '127.0.0.1'
        process.env.NATIVE_LOBBY_PORT = '27199'
        process.env.WEBPLATFORM_INTERNAL_ORIGIN = 'http://127.0.0.1:1'
        process.env.WEBPLATFORM_SERVICE_ID = 'game-test'
        process.env.WEBPLATFORM_SERVICE_SECRET = 'test-secret'
        try {
            const forwarded = installForwardedNativeLobbyRoutes(async () => false)
            assert.ok(forwarded)
            // 非监听 worker 必须装载「全集」：缺一条就等于把该路由的跨进程请求静默漏掉。
            assert.doesNotThrow(() => forwarded.routes.assertComplete())
            assert.equal(nativeLobbyProcessRoutes.installed, true)

            // 关闭后卸载：残留 handler 会在依赖已释放的情况下继续被命中，而不是 fail-closed。
            nativeLobbyProcessRoutes.reset()
            assert.equal(nativeLobbyProcessRoutes.installed, false)
            const { deps } = makeDeps(nativeLobbyProcessRoutes)
            assert.deepEqual(await handleProcessPipeRequest(deps, routedMessage(UserRpc.GetInfo, BIND_ID, TRACE_ID)), {
                ok: false,
                err: { code: 'INTERNAL', msg: '目标进程未装载原生 Lobby 路由' },
            })
            forwarded.stop()
        } finally {
            nativeLobbyProcessRoutes.reset()
            CONFIG_NAMES.forEach((name, index) => {
                const value = saved[index]
                if (value === undefined) delete process.env[name]
                else process.env[name] = value
            })
        }
    })
})
