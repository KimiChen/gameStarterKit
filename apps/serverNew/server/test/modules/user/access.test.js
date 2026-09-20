const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('feature access', () => {
    it('recognizes active and permanent user forbids', () => {
        const { FeatureAccess } = loadFeatureAccess(100)

        assert.strictEqual(FeatureAccess.checkUserForbid({ refuse: new Map([[1, { endTime: 101 }]]) }, 1), true)
        assert.strictEqual(FeatureAccess.checkUserForbid({ refuse: new Map([[1, { endTime: -1 }]]) }, 1), true)
        assert.strictEqual(FeatureAccess.checkUserForbid({ refuse: new Map([[1, { endTime: 100 }]]) }, 1), false)
        assert.strictEqual(FeatureAccess.checkUserForbid({ refuse: new Map() }, 1), false)
    })

    it('blocks currency spending for its specific and general forbid types', () => {
        const { FeatureAccess, forbidError } = loadFeatureAccess(100)

        assert.throws(
            () => FeatureAccess.checkCostPropForbid({ refuse: new Map([[3, { endTime: 101 }]]) }, 1001),
            (error) => error === forbidError,
        )
        assert.throws(
            () => FeatureAccess.checkCostPropForbid({ refuse: new Map([[5, { endTime: -1 }]]) }, 10202),
            (error) => error === forbidError,
        )
        assert.doesNotThrow(() => FeatureAccess.checkCostPropForbid({ refuse: new Map() }, 1001))
    })
})

function loadFeatureAccess(now) {
    const filename = path.join(projectRoot, 'src/modules/user/access/FeatureAccess.ts')
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const forbidError = new Error('forbidden')
    const stubs = {
        '@arthropoda/game-engine': { timestamp: () => now },
        '../bean/User': { User: class User {} },
        '../../gm/rules/UserForbidType': {
            UserForbidType: { FORBID_TIME: -1, FORBID_GC: 3, FORBID_SC: 4, FORBID_CASH: 5 },
        },
        '../../props/rules/ItemIdDefine': { ItemIdDefine: { ITEM_ID_GC: 1001, ITEM_ID_SC: 10202 } },
        '../../../runtime/errors/SystemErrors': { SystemErrors: { ForbidBase: forbidError } },
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return { ...loaded.exports, forbidError }
}
