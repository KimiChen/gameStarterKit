import assert from 'node:assert/strict'
import RouteAction from '../../src/task/RouteAction'
import { ContextEngine } from '../../src/context/ContextEngine'
import { GameError } from '../../src/error/GameError'

/**
 * RouteAction 串行分组的行为测试。
 *
 * 只依赖 Log / GameError 两个全局，不碰 Redis / DB，也不需要真的网络连接：
 * RouteAction.doAction 被替换成可观测的桩，用它记录并发度与执行顺序。
 *
 * 运行：
 *   TS_NODE_PROJECT=test/tsconfig.json TS_NODE_TRANSPILE_ONLY=true \
 *     node -r ts-node/register test/direct/routeActionSerial.test.ts
 */

function configureGlobals() {
    const noop = () => undefined
    const logger = { debug: noop, info: noop, warn: noop, error: noop, crit: noop }
    const logProxy = new Proxy(logger as any, {
        get(target, property) {
            return property in target ? (target as any)[property] : logger
        },
    })
    Object.assign(global, { Log: logProxy })
}

interface CallOptions {
    name: string
    traceId: number
    uId?: number
    /** 不传表示 action 没有实现 getBindId（actionHandler 为空） */
    getBindId?: (call: any) => Promise<number | null | undefined>
    getTaskGroupId?: (call: any) => Promise<number | null | undefined>
    /** doAction 期间额外执行的逻辑，用来模拟嵌套调用 / 绕回调用 */
    body?: (call: any) => Promise<void>
}

function makeCall(options: CallOptions) {
    const errors: any[] = []
    return {
        messageHead: { traceId: options.traceId, invokeLayer: 0, uId: options.uId ?? 0 },
        uId: options.uId ?? 0,
        req: {},
        errors,
        body: options.body,
        getApiName: () => options.name,
        error: async (errOrMsg: any) => {
            errors.push(errOrMsg)
        },
        actionHandler: { getBindId: options.getBindId, getTaskGroupId: options.getTaskGroupId },
    } as any
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** 观测到的并发度与执行顺序 */
let active = 0
let maxActive = 0
const order: string[] = []

function resetTrace() {
    active = 0
    maxActive = 0
    order.length = 0
}

/** 把 RouteAction.doAction 换成可观测的桩：记录并发度、写回上下文、按 delayMs 模拟耗时 */
function stubDoAction(delayMs = 10) {
    RouteAction.doAction = async (call: any) => {
        active++
        maxActive = Math.max(maxActive, active)
        order.push(call.getApiName())
        // 模拟 ServerTask.doAction 把当前调用写进上下文，嵌套调用判断依赖它
        if (ContextEngine.isValid) {
            ContextEngine.currentCtxEngine!.ctxLogic.call = call
        }
        try {
            await call.body?.(call)
            await sleep(delayMs)
        } finally {
            active--
        }
    }
}

async function runTest(name: string, test: () => Promise<void> | void) {
    const startedAt = Date.now()
    resetTrace()
    RouteAction.callGroups.clear()
    RouteAction.processRouter = undefined
    RouteAction.queueWaitSeconds = 0.5
    stubDoAction()
    try {
        await test()
    } catch (error) {
        console.error(`FAIL ${name}`)
        throw error
    } finally {
        RouteAction.callGroups.clear()
        RouteAction.processRouter = undefined
    }
    console.log(`PASS ${name} (${Date.now() - startedAt}ms)`)
}

async function main() {
    configureGlobals()
    GameError.runtimeError = new GameError(500, 'runtime error')
    GameError.logicError = new GameError(501, 'logic error')
    GameError.apiCallQueueTimeout = new GameError(504, 'queue timeout')

    await runTest('同分组的请求串行执行，并保持投递顺序', async () => {
        const calls = ['a', 'b', 'c'].map((name, index) =>
            makeCall({
                name,
                traceId: 100 + index,
                uId: 7,
                getBindId: async () => 42,
            }),
        )

        await Promise.all(calls.map((call) => RouteAction.onApiCall(call)))

        assert.equal(maxActive, 1, '同分组的请求不应并发执行')
        assert.deepEqual(order, ['a', 'b', 'c'])
        assert.equal(RouteAction.callGroups.size, 0, '执行完必须释放分组')
    })

    await runTest('不同分组的请求可以并发', async () => {
        const calls = [
            makeCall({ name: 'guild', traceId: 1, uId: 7, getBindId: async () => 42 }),
            makeCall({ name: 'room', traceId: 2, uId: 8, getBindId: async () => 43 }),
        ]

        await Promise.all(calls.map((call) => RouteAction.onApiCall(call)))

        assert.equal(maxActive, 2, '不同分组之间不应互相阻塞')
        assert.equal(RouteAction.callGroups.size, 0)
    })

    await runTest('bindId 为 0 是有效组，空值或未声明才默认按 uid 分组', async () => {
        const zero = makeCall({ name: 'zero', traceId: 1, uId: 7, getBindId: async () => 0 })
        await RouteAction.onApiCall(zero)
        assert.equal(zero.bindId, 0)

        const unset = makeCall({ name: 'unset', traceId: 2, uId: 9, getBindId: async () => undefined })
        await RouteAction.onApiCall(unset)
        assert.equal(unset.bindId, 9)

        const empty = makeCall({ name: 'null', traceId: 3, uId: 10, getBindId: async () => null })
        await RouteAction.onApiCall(empty)
        assert.equal(empty.bindId, 10)

        const noHandler = makeCall({ name: 'noHandler', traceId: 3, uId: 11 })
        await RouteAction.onApiCall(noHandler)
        assert.equal(noHandler.bindId, 11)
    })

    await runTest('既没有 bindId 也没有 uid 的请求不分组，直接执行', async () => {
        const call = makeCall({ name: 'anon', traceId: 1 })

        await RouteAction.onApiCall(call)

        assert.equal(call.bindId, undefined)
        assert.deepEqual(order, ['anon'])
        assert.equal(RouteAction.callGroups.size, 0)
    })

    await runTest('同分组内的同步嵌套调用就地执行，不会自我死锁', async () => {
        const nested = makeCall({ name: 'nested', traceId: 555, uId: 7, getBindId: async () => 42 })
        const outer = makeCall({
            name: 'outer',
            traceId: 555,
            uId: 7,
            getBindId: async () => 42,
            body: async () => {
                // 模拟 api 内部 await 调用本地 action：同分组、同 traceId
                await RouteAction.onApiCall(nested)
            },
        })

        const ctx: any = {
            ctxId: 1,
            expired: false,
            ctxLogic: {},
            loadedHash: new Map(),
            loadedHashJson: new Map(),
            eventCalcs: {},
            cacheVars: {},
        }
        await ContextEngine.asyncLocalStorage.run(ctx, async () => {
            await RouteAction.onApiCall(outer)
        })

        assert.equal(nested.bindId, 42)
        assert.equal(nested.errors.length, 0, '嵌套调用不应被判定为死锁')
        assert.deepEqual(order, ['outer', 'nested'])
    })

    await runTest('跨进程绕回同一分组时报死锁错误，而不是静默排队', async () => {
        const reentrant = makeCall({ name: 'reentrant', traceId: 555, uId: 7, getBindId: async () => 42 })
        const outer = makeCall({
            name: 'outer',
            traceId: 555,
            uId: 7,
            getBindId: async () => 42,
            body: async () => {
                // 不带上下文调用：模拟 HTTP / IPC 入口绕回同一分组
                await RouteAction.onApiCall(reentrant)
            },
        })

        await RouteAction.onApiCall(outer)

        assert.equal(reentrant.errors.length, 1, '绕回同一分组必须报错')
        assert.deepEqual(order, ['outer'], '报错的请求不应被执行')
        assert.equal(RouteAction.callGroups.size, 0)
    })

    await runTest('排队超过 queueWaitSeconds 仍未轮到的请求直接报错返回', async () => {
        RouteAction.queueWaitSeconds = 0.05
        stubDoAction(200)

        const first = makeCall({ name: 'first', traceId: 1, uId: 7, getBindId: async () => 42 })
        const queued = makeCall({ name: 'queued', traceId: 2, uId: 7, getBindId: async () => 42 })
        const all = Promise.all([RouteAction.onApiCall(first), RouteAction.onApiCall(queued)])

        await sleep(120)
        assert.equal(queued.errors.length, 1, '排队请求应被超时放弃')

        await all
        assert.deepEqual(order, ['first'], '被超时放弃的请求不应执行')
        assert.equal(RouteAction.callGroups.size, 0)
    })

    await runTest('空 bindId 的同 uid 请求仍然串行', async () => {
        await Promise.all(
            ['a', 'b'].map((name, i) => RouteAction.onApiCall(makeCall({ name, traceId: i + 1, uId: 7 }))),
        )
        assert.equal(maxActive, 1)
        assert.deepEqual(order, ['a', 'b'])
    })

    await runTest('taskGroupId 仅用于路由，转发发生在本地排队和业务之前', async () => {
        const routed: unknown[] = []
        RouteAction.processRouter = async (_call, routing) => {
            routed.push(routing)
            assert.equal(RouteAction.callGroups.size, 0)
            assert.deepEqual(order, [])
            return true
        }
        for (const taskGroupId of [undefined, null, -1, 0, 7]) {
            await RouteAction.onApiCall(
                makeCall({
                    name: 'routed',
                    traceId: 1,
                    uId: 42,
                    getTaskGroupId: async () => taskGroupId,
                }),
            )
        }
        assert.deepEqual(
            routed,
            [undefined, undefined, undefined, 0, 7].map((taskGroupId) => ({ taskGroupId, bindId: 42 })),
        )
        assert.deepEqual(order, [])
    })

    await runTest('相同 taskGroupId 不会串行不同 bindId；同进程相同 bindId 才串行', async () => {
        await Promise.all(
            [1, 2].map((bindId) =>
                RouteAction.onApiCall(
                    makeCall({
                        name: String(bindId),
                        traceId: bindId,
                        uId: 7,
                        getTaskGroupId: async () => 100,
                        getBindId: async () => bindId,
                    }),
                ),
            ),
        )
        assert.equal(maxActive, 2)
        resetTrace()
        await Promise.all(
            [1, 2].map((taskGroupId) =>
                RouteAction.onApiCall(
                    makeCall({
                        name: String(taskGroupId),
                        traceId: taskGroupId,
                        uId: 7,
                        getTaskGroupId: async () => taskGroupId,
                        getBindId: async () => 42,
                    }),
                ),
            ),
        )
        assert.equal(maxActive, 1)
    })

    await runTest('解析失败和非法 ID 不得回退后执行业务', async () => {
        for (const id of [NaN, Infinity, -2, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
            await assert.rejects(
                RouteAction.onApiCall(
                    makeCall({
                        name: 'bad-task',
                        traceId: 1,
                        uId: 7,
                        getTaskGroupId: async () => id,
                    }),
                ),
                /invalid taskGroupId/,
            )
        }
        await assert.rejects(
            RouteAction.onApiCall(
                makeCall({
                    name: 'bad-bind',
                    traceId: 1,
                    uId: 7,
                    getBindId: async () => NaN,
                }),
            ),
            /invalid bindId/,
        )
        await assert.rejects(
            RouteAction.onApiCall(
                makeCall({
                    name: 'broken',
                    traceId: 1,
                    uId: 7,
                    getBindId: async () => {
                        throw new Error('lookup failed')
                    },
                }),
            ),
            /lookup failed/,
        )
        assert.deepEqual(order, [])
        assert.equal(RouteAction.callGroups.size, 0)
    })

    await runTest('已经转发的空调度值不得重新解析', async () => {
        const call = makeCall({
            name: 'forwarded',
            traceId: 1,
            uId: 0,
            getTaskGroupId: async () => {
                throw new Error('must not resolve taskGroupId')
            },
            getBindId: async () => {
                throw new Error('must not resolve bindId')
            },
        })
        call.routingResolved = true
        await RouteAction.onApiCall(call)
        assert.equal(call.bindId, undefined)
        assert.equal(call.taskGroupId, undefined)
        assert.deepEqual(order, ['forwarded'])
    })
}

main().catch((error) => {
    console.error('FAIL route action serial tests')
    console.error(error)
    process.exitCode = 1
})
