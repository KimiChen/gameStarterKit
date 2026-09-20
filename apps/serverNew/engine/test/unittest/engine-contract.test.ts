import assert from 'node:assert/strict'
import {
    AsyncReturn,
    ClassInfo,
    Bean,
    DiffArray,
    DiffMap,
    EventArgs,
    EventCalculate,
    EventHandler,
    EventSystem,
    FieldInfo,
    FieldStatus,
    GameError,
    HashJson,
    IActionLogic,
    MessageHelper,
    ReadonlyBean,
    SaveType,
} from '../../src'
import { ModSync } from '../../src/mod/ModSync'
import { RedisService } from '../../src/differ/RedisService'
import { ApiCall } from '../../src/net/client/base/ApiCall'
import { ServerTask } from '../../src/task/ServerTask'

describe('engine business contracts', () => {
    it('preserves Bean persistence aliases without initializing a wire schema', () => {
        class PersistedProbe extends Bean {
            _score = 0
            _enabled = false
            _transient = 0
        }
        const schema = new ClassInfo('PersistedProbe', PersistedProbe)
        PersistedProbe._class_info = schema
        const score = new FieldInfo(schema, 'score', 7, 'int', 0)
        const enabled = new FieldInfo(schema, 'enabled', 8, 'boolean', false)
        schema.addField(score)
        schema.addField(enabled)
        schema.addField(new FieldInfo(schema, 'transient', 9, 'int', 0, undefined, SaveType.ForNet))
        const bean = new PersistedProbe()
        bean.parseFromData({ [score.aliasName]: 17, [enabled.aliasName]: 'true' })
        assert.equal(bean._score, 17)
        assert.equal(bean._enabled, true)
        bean._transient = 99
        assert.deepEqual(bean.toSaveData(), { [score.aliasName]: 17, [enabled.aliasName]: 'true' })
        assert.equal(schema.fieldMap.score, score)
        assert.equal(schema.aliasFieldMap[score.aliasName], score)
        // 两份独立字段描述允许同名；不能再注册到全局 PB Root 并因名称重复失败。
        const independent = new ClassInfo('PersistedProbe', PersistedProbe)
        assert.equal(independent.fields.length, 0)
        assert.equal(schema.fields.length, 3)
    })

    it('waits for synchronous events and runs each deferred handler exactly once', async () => {
        const calls: string[] = []
        class Args extends EventArgs {}
        class Immediate extends EventHandler<Args> {
            async handler() {
                calls.push('immediate')
            }
        }
        class Deferred extends EventHandler<Args> {
            isSync = false

            async handler() {
                calls.push('deferred')
            }
        }

        const events = new EventSystem()
        events.subscribe(Args, Immediate, Deferred)
        const { ContextEngine } = require('../../src/context/ContextEngine')
        await ContextEngine.asyncLocalStorage.run(new ContextEngine(), async () => {
            await events.publish(new Args())
            assert.deepEqual(calls, ['immediate'])
            await events.triggerAsync()
        })
        assert.deepEqual(calls, ['immediate', 'deferred'])
    })

    it('keeps deferred events in their publishing Action context', async () => {
        const calls: number[] = []
        class Args extends EventArgs {}
        class Deferred extends EventHandler<Args> {
            isSync = false

            handler() {
                calls.push(ContextEngine.currentCtxEngine!.ctxId)
                return
            }
        }
        const { ContextEngine } = require('../../src/context/ContextEngine')
        const events = new EventSystem()
        events.subscribe(Args, Deferred)
        const publishingContext = new ContextEngine()
        await ContextEngine.asyncLocalStorage.run(publishingContext, async () => events.publish(new Args()))
        await ContextEngine.asyncLocalStorage.run(new ContextEngine(), async () => events.triggerAsync())
        assert.deepEqual(calls, [])
        await ContextEngine.asyncLocalStorage.run(publishingContext, async () => events.triggerAsync())
        assert.deepEqual(calls, [publishingContext.ctxId])
    })

    it('awaits calculation-event aggregation within the current Action context', async () => {
        const calls: string[] = []
        class Args extends EventArgs {}
        class Calculate extends EventCalculate<Args> {
            async preHandler() {
                calls.push('prepare')
            }

            async handler() {
                calls.push('commit')
            }
        }
        const events = new EventSystem()
        events.subscribe(Args, Calculate)
        const { ContextEngine } = require('../../src/context/ContextEngine')
        await ContextEngine.asyncLocalStorage.run(new ContextEngine(), async () => {
            await events.publish(new Args())
            assert.deepEqual(calls, ['prepare'])
            await events.handlerCalculate()
        })
        assert.deepEqual(calls, ['prepare', 'commit'])
    })

    it('rejects runtime writes to read-only collections and returns independent copies', () => {
        const array = new DiffArray<number>()
        array.parseFromData([1, 2], false)
        assert.throws(() => array.clear(), /cannot be written/)
        assert.throws(() => array.init([]), /cannot be written/)
        assert.throws(() => array.parseFromData([3]), /cannot be written/)
        array.forEach((_value, _index, raw) => (raw as number[]).push(3))
        assert.equal(array.length(), 2)

        const map = new DiffMap<number, number>({ collectionType: ['int', 'number'] } as FieldInfo)
        map.parseFromData({ 1: 10 }, false)
        assert.throws(() => map.set(2, 20), /cannot be written/)
        assert.throws(() => map.init(new Map()), /cannot be written/)
        assert.throws(() => map.parseFromData({ 2: 20 }), /cannot be written/)
        map.forEach((_value, _key, raw) => (raw as Map<number, number>).clear())
        assert.equal(map.get(1), 10)

        class ReadonlyChild extends Bean {
            score = 0
        }
        const childInfo = new ClassInfo('ReadonlyChild', ReadonlyChild)
        ;(ReadonlyChild as any)._class_info = childInfo
        const childMap = new DiffMap<number, ReadonlyChild>({
            collectionType: ['int', childInfo],
        } as unknown as FieldInfo)
        childMap.parseFromData({ 1: { score: 10 } }, false)
        const child = childMap.get(1)
        assert(child)
        assert.throws(() => child.onChange('score', FieldStatus.Update), /cannot be written/)

        const writableMap = new DiffMap<number, number>({ collectionType: ['int', 'number'] } as FieldInfo)
        writableMap.set(1, 10)
        const copied = writableMap.copy()
        copied.set(1, 99)
        assert.equal(writableMap.get(1), 10)
    })

    it('does not mutate HashJson load ids and makes read-only data non-writable', async () => {
        class ProbeHashJson extends HashJson {
            static _class_info = new ClassInfo('ProbeHashJson', this)

            static getRedis() {
                return {
                    hmGet: async (_key: string, ids: number[]) => ids.map(() => JSON.stringify({})),
                } as any
            }
        }
        const ids = [1, 2]
        const values = await ProbeHashJson.loadOnlyReadIds(ids)
        assert.deepEqual(ids, [1, 2])
        const first = values.get(1) as ReadonlyBean<ProbeHashJson>
        assert(first)
        assert.equal((first as any).writable, false)
    })

    it('does not report success when Redis commit fails', async () => {
        const originalSave = RedisService.save
        const originalMods = ModSync.autoGetModChanged
        const originalLog = global.Log
        const originalLogicError = GameError.logicError
        const originalLoadApiHandler = ApiCall.prototype.loadApiHandler
        const calls: string[] = []

        class Handler implements IActionLogic {
            async getBindId() {
                return 0
            }

            async actionBefore() {
                return
            }

            async doAction() {
                calls.push('action')
            }
        }

        global.Log = { error: () => undefined, exception: { info: () => undefined } } as unknown as typeof Log
        GameError.logicError = new GameError(1, 'logic error')
        ModSync.autoGetModChanged = () => undefined
        ApiCall.prototype.loadApiHandler = () => Handler
        RedisService.save = async () => {
            calls.push('save')
            throw new Error('commit failed')
        }
        try {
            await assert.rejects(() =>
                MessageHelper.syncDoFunc(async () => {
                    calls.push('function')
                }),
            )
        } finally {
            RedisService.save = originalSave
            ModSync.autoGetModChanged = originalMods
            global.Log = originalLog
            GameError.logicError = originalLogicError
            ApiCall.prototype.loadApiHandler = originalLoadApiHandler
        }
        assert.deepEqual(calls, ['function', 'save'])
    })

    it('keeps a committed Action successful when a post-commit task fails', async () => {
        const originalSave = RedisService.save
        const originalMods = ModSync.autoGetModChanged
        const originalLog = global.Log
        const originalLogicError = GameError.logicError
        const calls: string[] = []
        class ThrowAfterCommit {
            async onStart() {
                return
            }
            async onDoAction() {
                return
            }
            async onEngineEnd() {
                calls.push('post-commit')
                throw new Error('post-commit failed')
            }
        }

        global.Log = { error: () => undefined, exception: { info: () => undefined } } as unknown as typeof Log
        GameError.logicError = new GameError(1, 'logic error')
        ModSync.autoGetModChanged = () => undefined
        RedisService.save = async () => {
            calls.push('save')
        }
        ServerTask.addActionAttackTask(ThrowAfterCommit)
        const task = new ServerTask()
        task.call = {
            protocol: { name: 'probe' },
            messageHead: { uId: 0, serverId: 0 },
            actionBefore: async () => undefined,
            doAction: async () => ({}),
            succ: async () => calls.push('success'),
            error: async () => calls.push('error'),
            getApiName: () => 'probe',
            getMsgType: () => 0,
        } as unknown as ApiCall
        try {
            const { ContextEngine } = require('../../src/context/ContextEngine')
            await ContextEngine.asyncLocalStorage.run(task.ctx, async () => task.doAction())
        } finally {
            RedisService.save = originalSave
            ModSync.autoGetModChanged = originalMods
            global.Log = originalLog
            GameError.logicError = originalLogicError
            ServerTask.templateActionAttackTasks.pop()
        }
        assert.deepEqual(calls, ['save', 'success', 'post-commit'])
    })

    it('never attaches framework-side _mod to the business response', async () => {
        const originalSave = RedisService.save
        const originalChanged = ModSync.autoGetModChanged
        const originalLog = global.Log
        const originalLogicError = GameError.logicError
        const responses: unknown[] = []
        let consultedChangedMods = 0

        global.Log = { error: () => undefined, exception: { info: () => undefined } } as unknown as typeof Log
        GameError.logicError = new GameError(1, 'logic error')
        RedisService.save = async () => undefined
        // 模拟本次 Action 变更了一个跨玩家 Bean：框架不得把它读进响应路径。
        ModSync.autoGetModChanged = () => {
            consultedChangedMods++
            return { 42: { versions: { user: 3 } } }
        }
        const task = new ServerTask()
        task.call = {
            protocol: { name: 'probe' },
            messageHead: { uId: 7, serverId: 1 },
            res: { value: 1 },
            actionBefore: async () => undefined,
            doAction: async () => ({ value: 1 }),
            succ: async (res: unknown) => responses.push(res),
            error: async () => undefined,
            getApiName: () => 'probe',
            getMsgType: () => 0,
        } as unknown as ApiCall
        try {
            const { ContextEngine } = require('../../src/context/ContextEngine')
            await ContextEngine.asyncLocalStorage.run(task.ctx, async () => task.doAction())
        } finally {
            RedisService.save = originalSave
            ModSync.autoGetModChanged = originalChanged
            global.Log = originalLog
            GameError.logicError = originalLogicError
        }
        // 响应体只带业务声明的字段：不能再出现框架自动附加的 _mod。
        assert.deepEqual(responses, [{ value: 1 }])
        assert.equal(Object.prototype.hasOwnProperty.call(responses[0] as object, '_mod'), false)
        // 框架也不再为了响应去读 Bean 变更；变更数据的通知只由所属模块的领域推送负责。
        assert.equal(consultedChangedMods, 0)
    })
})

function assertReadOnlyType(bean: ReadonlyBean<{ score: number }>) {
    // @ts-expect-error read-only loads cannot assign business fields
    bean.score = 1
}

function assertAsyncReturnType(result: AsyncReturn<{ score: number }>) {
    if (result.isSucc) {
        result.res.score
        return
    }
    result.errMsg
    // @ts-expect-error failed calls do not expose a business response
    result.res.score
}
