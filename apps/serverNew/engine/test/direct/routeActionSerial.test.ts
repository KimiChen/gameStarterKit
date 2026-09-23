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
    getBindId?: (call: any) => Promise<number | undefined>
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
        actionHandler: options.getBindId ? { getBindId: options.getBindId } : undefined,
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
    RouteAction.queueWaitSeconds = 0.5
    stubDoAction()
    try {
        await test()
    } catch (error) {
        console.error(`FAIL ${name}`)
        throw error
    } finally {
        RouteAction.callGroups.clear()
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

    await runTest('bindId 为 0 或未声明时退化为按 uid 分组', async () => {
        const zero = makeCall({ name: 'zero', traceId: 1, uId: 7, getBindId: async () => 0 })
        await RouteAction.onApiCall(zero)
        assert.equal(zero.groupName, 'bind:7', 'bindId=0 时必须退化到玩家 uid Owner')

        const unset = makeCall({ name: 'unset', traceId: 2, uId: 9, getBindId: async () => undefined })
        await RouteAction.onApiCall(unset)
        assert.equal(unset.groupName, 'bind:9')

        const noHandler = makeCall({ name: 'noHandler', traceId: 3, uId: 11 })
        await RouteAction.onApiCall(noHandler)
        assert.equal(noHandler.groupName, 'bind:11')
    })

    await runTest('既没有 bindId 也没有 uid 的请求不分组，直接执行', async () => {
        const call = makeCall({ name: 'anon', traceId: 1 })

        await RouteAction.onApiCall(call)

        assert.equal(call.groupName, undefined)
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

        assert.equal(nested.groupName, 'bind:42')
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
}

main().catch((error) => {
    console.error('FAIL route action serial tests')
    console.error(error)
    process.exitCode = 1
})
