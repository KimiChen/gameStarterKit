const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('server settings refresh', () => {
    it('persists changed settings before broadcasts and schedules server stop after notification', async () => {
        const events = []
        const { ServerSettingRefresh } = loadRefresh(events)

        await ServerSettingRefresh.refreshAllServerCache([1])

        assert.deepStrictEqual(events, ['notify', 'queue-stop', 'replace', 'broadcast', 'reload-activity'])
    })
})

function loadRefresh(events) {
    const tags = {
        TAG_ACTIVITY: 'activity',
        TAG_MAIL: 'mail',
        TAG_MODULE: 'module',
        TAG_SERVER_STOP: 'server-stop',
        TAG_OPEN_TIME: 'open-time',
        TAG_FIRST_RECHARGE: 'first-recharge',
        TAG_GONGGAO_GAME: 'notice',
        TAG_QUESTION: 'question',
    }
    const filename = path.join(projectRoot, 'src/modules/serverSettings/runtime/ServerSettingRefresh.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const stubs = {
        '@arthropoda/game-engine': { timestamp: () => 100 },
        '../../activity/action/ActionActivityOpenReload': {
            ActionActivityOpenReload: class ActionActivityOpenReload {},
        },
        '../../gm/action/ActionServerStop': { ActionServerStop: class ActionServerStop {} },
        '../../mail/action/ActionMailLoopSendGlobal': { ActionMailLoopSendGlobal: class ActionMailLoopSendGlobal {} },
        '../../../runtime/action/LocalAction': {
            LocalAction: {
                broadcast: () => events.push('broadcast'),
                send: (action) => events.push(action.name === 'ActionActivityOpenReload' ? 'reload-activity' : 'send'),
            },
        },
        '../../../runtime/action/S2S/settingTag/ActionSettingTagRefresh': {
            ActionSettingTagRefresh: class ActionSettingTagRefresh {},
        },
        '../../../runtime/action/QueuedLocalAction': {
            QueuedLocalAction: { rpc: async () => events.push('queue-stop') },
        },
        '../notification/ServerStatusNotifier': {
            ServerStatusNotifier: { pushServerStop: async () => events.push('notify') },
        },
        '../rules/ServerSettingDefine': { ServerSettingDefine: tags },
        './ServerSettingStore': {
            ServerSettingStore: {
                loadAllKeyVal: async () => new Map(),
                loadCurrentSettings: async () =>
                    new Map([
                        [tags.TAG_ACTIVITY, { sVal: 'changed' }],
                        [tags.TAG_SERVER_STOP, { sVal: 'changed', startTime: 90, endTime: 110, detail: 'maintenance' }],
                    ]),
                replace: async () => events.push('replace'),
            },
        },
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return loaded.exports
}
