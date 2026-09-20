const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('practice NPC breakthrough', () => {
    it('charges and advances when the next breakthrough level is configured', async () => {
        const costs = []
        const { ActionPracticeNpcBreakUp } = loadAction(costs)
        const action = new ActionPracticeNpcBreakUp()
        action.user = { practice: { practiceNpcBreakLv: 1, practiceNpcLv: 10 } }

        global.C = {
            sterious_man_through: (level) => (level === 1 ? { level: 10, costPropId: 7, costNum: 3 } : { level: 20 }),
        }
        try {
            await action.doAction({}, {})
        } finally {
            delete global.C
        }

        assert.deepStrictEqual(costs, [[7, 3]])
        assert.strictEqual(action.user.practice.practiceNpcBreakLv, 2)
    })

    it('rejects the maximum breakthrough level before charging', async () => {
        const costs = []
        const { ActionPracticeNpcBreakUp, maxLevelError } = loadAction(costs)
        const action = new ActionPracticeNpcBreakUp()
        action.user = { practice: { practiceNpcBreakLv: 1, practiceNpcLv: 10 } }

        global.C = {
            sterious_man_through: (level) => (level === 1 ? { level: 10, costPropId: 7, costNum: 3 } : undefined),
        }
        try {
            await assert.rejects(
                () => action.doAction({}, {}),
                (error) => error === maxLevelError,
            )
        } finally {
            delete global.C
        }

        assert.deepStrictEqual(costs, [])
        assert.strictEqual(action.user.practice.practiceNpcBreakLv, 1)
    })
})

function loadAction(costs) {
    const filename = path.join(projectRoot, 'src/modules/practice/action/ActionPracticeNpcBreakUp.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const maxLevelError = new Error('invalid parameter')
    const stubs = {
        '../../../runtime/action/GameAction': { GameAction: class GameAction {} },
        '../../../runtime/errors/SystemErrors': { SystemErrors: { SysParamError: maxLevelError } },
        '../../../runtime/protocol/C2S/default': {},
        '../../props/inventory/Props': { Props: { costProp: async (_user, id, count) => costs.push([id, count]) } },
        '../PracticeC2S': {},
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return { ...loaded.exports, maxLevelError }
}
