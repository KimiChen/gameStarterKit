import assert from 'node:assert/strict'
import {
    ActionEventArgs, ActionEventHandlerBase, ActionEventSystem, ContextEngine,
    EngineInitHelper, GameError, RedisService, RouteAction, executeObjectAction,
    type IActionAttachTask,
} from '../../src'

async function main() {
    const noop = () => undefined
    const logger = { debug: noop, info: noop, warn: noop, error: noop, crit: noop }
    global.Log = new Proxy(logger, { get: (target, key) => Reflect.get(target, key) ?? logger }) as unknown as typeof Log
    global.PLATFORM = 'bearjoy'
    GameError.logicError = new GameError(500, 'logic')
    GameError.runtimeError = new GameError(501, 'runtime')
    GameError.apiCallQueueTimeout = new GameError(502, 'queue timeout')
    const identity = { uid: 123, sId: 7 }
    const trace: string[] = []
    const mark = (name: string) => trace.push(`${ContextEngine.currentCtxEngine!.ctxLogic.apiName}:${name}`)
    class LifecycleProbe implements IActionAttachTask {
        async onStart() { mark('start') }
        async onDoAction() { mark('prepare') }
        async onEngineEnd() {
            mark('after')
            if (ContextEngine.currentCtxEngine!.ctxLogic.apiName === 'test.afterFails') throw new Error('after commit')
        }
    }
    class NextProbe implements IActionAttachTask {
        async onStart() {}
        async onDoAction() {}
        async onEngineEnd() { mark('next-after') }
    }
    EngineInitHelper.addActionAttackTask(LifecycleProbe)
    EngineInitHelper.addActionAttackTask(NextProbe)
    class ProbeEvent extends ActionEventHandlerBase {
        async handler(args: ActionEventArgs) {
            assert.equal(args.ctx.uid, identity.uid)
            assert.equal(args.ctx.sid, identity.sId)
            mark('event')
        }
    }
    ActionEventSystem.subscribe('test.query', ProbeEvent)

    const originalSave = RedisService.save
    const commitFailure = new Error('commit failed')
    RedisService.save = async () => {
        mark('save')
        if (ContextEngine.currentCtxEngine!.ctxLogic.apiName === 'test.commitFails') throw commitFailure
    }
    try {
        const result = await executeObjectAction('test.query', { marker: 'req' }, { marker: '' }, {
            async doAction(req, res, call) {
                assert.equal(call.uId, identity.uid)
                assert.equal(call.getApiType(), 'test')
                mark('action')
                res.marker = req.marker
            },
        }, identity)
        assert.deepEqual(result, { ok: true, data: { marker: 'req' } })
        assert.deepEqual(trace, ['test.query:start', 'test.query:action', 'test.query:event',
            'test.query:prepare', 'test.query:save', 'test.query:after', 'test.query:next-after'])
        assert.equal(ContextEngine.isValid, false)

        trace.length = 0
        const failed = await executeObjectAction('test.commitFails', {}, { ok: true }, { doAction() {} }, identity)
        assert.equal(failed.ok, false)
        if (!failed.ok) assert.equal(failed.error, commitFailure)
        assert.deepEqual(trace, ['test.commitFails:start', 'test.commitFails:prepare', 'test.commitFails:save'])

        trace.length = 0
        const committed = await executeObjectAction('test.afterFails', {}, { ok: true }, { doAction() {} }, identity)
        assert.deepEqual(committed, { ok: true, data: { ok: true } })
        assert.deepEqual(trace.slice(-2), ['test.afterFails:after', 'test.afterFails:next-after'])

        const businessError = new Error('domain failure')
        const rejected = await executeObjectAction('test.businessFails', {}, {}, {
            doAction() { throw businessError },
        }, identity)
        assert.equal(rejected.ok, false)
        if (!rejected.ok) assert.equal(rejected.error, businessError)

        let active = 0
        let maxActive = 0
        const run = () => executeObjectAction('test.serial', {}, {}, {
            async doAction() {
                active++
                maxActive = Math.max(maxActive, active)
                await new Promise<void>((resolve) => setImmediate(resolve))
                active--
            },
        }, identity)
        const serial = await Promise.all([run(), run(), run()])
        assert(serial.every((item) => item.ok))
        assert.equal(maxActive, 1)
        assert.equal(RouteAction.callGroups.size, 0)

        const nested = await executeObjectAction('test.outer', {}, {}, {
            async doAction() {
                const inner = await executeObjectAction('test.inner', {}, { value: 3 }, { doAction() {} }, identity)
                assert.deepEqual(inner, { ok: true, data: { value: 3 } })
                assert.equal(ContextEngine.currentCtxEngine!.ctxLogic.apiName, 'test.outer')
            },
        }, identity)
        assert.equal(nested.ok, true)
        await assert.rejects(() => executeObjectAction('test.invalid', {}, {}, { doAction() {} }, { uid: NaN, sId: 7 }))
        console.log('Object Action: identity, events, commit boundary, callback isolation, serialization and nesting passed')
    } finally {
        RedisService.save = originalSave
    }
}

// 未完成 Promise 不能让 Node 以 0 退出而被误判通过（调度器排队 timer 可 unref）。
const watchdog = setTimeout(() => { throw new Error('object action tests did not complete') }, 10_000)
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).finally(() => clearTimeout(watchdog))
