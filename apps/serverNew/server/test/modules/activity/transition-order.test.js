const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('activity transitions', () => {
    it('stores activity configuration, publishes its schedule version, then queues a future reload', async () => {
        const events = []
        const { ActivityRefresh } = loadRefresh(events)
        global.C = { list: () => ({ fromDB: 1, crossType: 0 }) }
        try {
            const changed = await ActivityRefresh.refreshActivitiesCache(1)
            assert.strictEqual(changed, true)
        } finally {
            delete global.C
        }

        assert.deepStrictEqual(events, ['cache', 'version', 'queue'])
    })

    it('runs each stage handler through the scheduler', async () => {
        const { ActivityStageScheduler } = loadScheduler()
        const events = []
        const operator = {
            onActivityStart: async () => events.push('start'),
            onActivityEnd: async () => events.push('end'),
            onActivityAwardEnd: async () => events.push('award-end'),
            onActivityClose: async () => events.push('close'),
        }
        const listConfig = { fromDB: 0 }

        await ActivityStageScheduler.doActivityStageTask(
            listConfig,
            ActivityStageScheduler.ACTIVITY_STAGE_START,
            operator,
        )
        await ActivityStageScheduler.doActivityStageTask(
            listConfig,
            ActivityStageScheduler.ACTIVITY_STAGE_END,
            operator,
        )
        await ActivityStageScheduler.doActivityStageTask(
            listConfig,
            ActivityStageScheduler.ACTIVITY_STAGE_AWARD_END,
            operator,
        )
        await ActivityStageScheduler.doActivityStageTask(
            listConfig,
            ActivityStageScheduler.ACTIVITY_STAGE_CLOSE,
            operator,
        )

        assert.deepStrictEqual(events, ['start', 'end', 'award-end', 'close'])
    })
})

function loadRefresh(events) {
    class StageBean {
        static async load() {
            return undefined
        }

        static async loadAll() {
            return [[1, { openInfo: { openTs: 10 } }]]
        }

        constructor() {
            this.sIds = { init() {} }
        }
    }
    return loadTypeScriptModule('src/modules/activity/refresh/ActivityRefresh.ts', {
        '@arthropoda/game-engine': {
            RedisInstance: {
                getServerRedis: () => ({ set: async () => events.push('cache') }),
                getCenterRedis: () => ({ hSet: async () => events.push('version') }),
            },
            timestamp: () => 100,
        },
        '@arthropoda/typeorm': { MoreThan: (value) => value },
        '../../../../generated/persistence/ServerActivityModel': {
            ServerActivityModel: {
                find: async () => [
                    {
                        id: 1,
                        sid: 1,
                        name: 'test',
                        salt: 'salt',
                        openTs: 10,
                        closeTs: 200,
                        activityConf: '{}',
                        serverId: '[]',
                    },
                    {
                        id: 2,
                        sid: 1,
                        name: 'test',
                        salt: 'future',
                        openTs: 120,
                        closeTs: 200,
                        activityConf: '{}',
                        serverId: '[]',
                    },
                ],
            },
        },
        '../../../runtime/action/QueuedLocalAction': { QueuedLocalAction: { rpc: async () => events.push('queue') } },
        '../../serverSettings/runtime/ServerSettingStore': {
            ServerSettingStore: { loadSettingValue: async () => 'activity-tag' },
        },
        '../../serverSettings/rules/ServerSettingDefine': { ServerSettingDefine: { TAG_ACTIVITY: 'activity' } },
        '../action/ActionActivityOpenReload': { ActionActivityOpenReload: class ActionActivityOpenReload {} },
        '../bean/ActivityItemBean': {
            ActivityItemBean: class ActivityItemBean {
                constructor(values) {
                    Object.assign(this, values)
                }
            },
        },
        '../bean/ActivityStageBean': { ActivityStageBean: StageBean },
        '../config/ActivityConfigCache': {
            ActivityConfigCache: { ACTIVITY_CACHE_EXPIRE_TS: 1, getConfCacheKey: () => 'cache-key' },
        },
        '../rules/ActivityDefine': { ActivityDefine: { CROSS_TYPE_CROSS: 1 } },
        '../rules/ActivityStateKeys': { ActivityStateKeys: { ActivitySyncTimeVer: 'version-key' } },
        '../scheduling/ActivityScheduleStore': {
            ActivityScheduleStore: { loadActivityTimeVer: async () => 'old-version' },
        },
        '../scheduling/ActivityStageScheduler': { ActivityStageScheduler: { ACTIVITY_STAGE_START_BEFORE: 0 } },
    })
}

function loadScheduler() {
    return loadTypeScriptModule('src/modules/activity/scheduling/ActivityStageScheduler.ts', {
        '@arthropoda/game-engine': { RedisInstance: {}, timestamp: () => 0, UtilTime: { DAY_SECOND: 86400 } },
        '../../../../generated/persistence/ServerActivityModel': { ServerActivityModel: {} },
        '../../../runtime/action/LocalAction': { LocalAction: {} },
        '../../../runtime/action/QueuedLocalAction': { QueuedLocalAction: {} },
        '../action/ActionActivityStageTask': { ActionActivityStageTask: class ActionActivityStageTask {} },
        '../bean/ActivityStageBean': { ActivityStageBean: class ActivityStageBean {} },
        '../client/ActivityClientAssembler': { ActivityClientAssembler: {} },
        '../config/ActivityConfigCache': { ActivityConfigCache: {} },
        '../operation/ActivityOperator': { ActivityOperator: class ActivityOperator {} },
        '../operation/ActivityOperatorRegistry': { ActivityOperatorRegistry: {} },
        '../refresh/ActivityRefresh': { ActivityRefresh: {} },
        './ActivitySchedule': { ActivitySchedule: class ActivitySchedule {} },
        './ActivityScheduleResolver': { ActivityScheduleResolver: {} },
    })
}

function loadTypeScriptModule(relativePath, stubs) {
    const filename = path.join(projectRoot, relativePath)
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return loaded.exports
}
