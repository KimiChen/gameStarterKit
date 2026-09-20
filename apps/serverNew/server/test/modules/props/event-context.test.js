const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('prop change event context', () => {
    it('uses the event owner and response without a global request context', async () => {
        const calls = []
        const { PropChangeEventHandler } = loadHandlers(calls)
        const user = { id: 42 }
        const response = { award: { awards: [] } }

        await new PropChangeEventHandler().handler({ user, response, cId: 2, num: 7, reason: 'test', params: {} })

        assert.deepStrictEqual(calls, [[user, response]])
    })

    it('writes telemetry from the event owner rather than global Ctx.user', async () => {
        const calls = []
        const { Ta_PropChangeEventHander } = loadHandlers(calls)
        const user = { id: 99 }

        await new Ta_PropChangeEventHander().handler({ user, cId: 9, num: 3, reason: '广告奖励', params: {} })

        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0][0], user)
        assert.strictEqual(calls[0][1].after, 12)
        assert.strictEqual(calls[0][1].reason, '广告奖励')
    })
})

function loadHandlers(calls) {
    const filename = path.join(projectRoot, 'src/modules/props/event/propEvent.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const stubs = {
        '@arthropoda/game-engine': {
            EventArgs: class EventArgs {},
            EventHandler: class EventHandler {},
            Event: () => (target) => target,
            EventCalculate: class EventCalculate {},
        },
        '../rules/ItemIdDefine': { ItemIdDefine: { ITEM_ID_GC: 1, ITEM_ID_EXP: 2 } },
        '../../user/action/UserLevelProgression': {
            UserLevelProgression: { autoLevelUp: async (user, response) => calls.push([user, response]) },
        },
        '../../../../generated/telemetry/item/itemChange': {
            taItem_itemChange: (user, data) => calls.push([user, data]),
        },
        '../inventory/Props': { Props: { getHasNum: () => 12 } },
        '../../scene/telemetry/SceneTelemetryContext': {
            SceneTelemetryContext: { moduleNameAndReason: () => ['ads'] },
        },
        '../../user/bean/User': { User: class User {} },
        '../../../runtime/protocol/C2S/commom': {},
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    global.C = { item: (id) => ({ id, type: 7, name: `item-${id}` }) }
    return loaded.exports
}
