const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('shop Actions', () => {
    it('loads the user shop session and delegates a purchase with its request values', async () => {
        const calls = []
        const { ActionShopBuy } = loadActions({
            async getShop(user, shopName) {
                calls.push(['lookup', user.id, shopName])
                return { purchase: { buy: async (id, num, response) => calls.push(['buy', id, num, response]) } }
            },
        })
        const action = new ActionShopBuy()
        action.user = { id: 11 }
        const response = {}

        await action.doAction({ shopName: 'base', id: 9, num: 2 }, response)

        assert.deepStrictEqual(calls, [
            ['lookup', 11, 'base'],
            ['buy', 9, 2, response],
        ])
    })

    it('loads the user shop session and delegates manual refresh', async () => {
        const calls = []
        const { ActionShopRefresh } = loadActions({
            async getShop(user, shopName) {
                calls.push(['lookup', user.id, shopName])
                return { refresh: { manualRefresh: async () => calls.push(['refresh']) } }
            },
        })
        const action = new ActionShopRefresh()
        action.user = { id: 12 }

        await action.doAction({ shopName: 'guild' }, {})

        assert.deepStrictEqual(calls, [['lookup', 12, 'guild'], ['refresh']])
    })
})

function loadActions(ShopRegistry) {
    const actionShop = loadTypeScriptModule('src/modules/shop/action/ActionShop.ts', {
        '../../../runtime/action/GameAction': { GameAction: class GameAction {} },
        '../registry/ShopRegistry': { ShopRegistry },
    })
    return {
        ...loadTypeScriptModule('src/modules/shop/action/ActionShopBuy.ts', {
            '../../../runtime/errors/SystemErrors': { SystemErrors: { SysParamErr: new Error('invalid parameter') } },
            '../ShopC2S': {},
            './ActionShop': actionShop,
        }),
        ...loadTypeScriptModule('src/modules/shop/action/ActionShopRefresh.ts', {
            '../../../runtime/protocol/C2S/default': {},
            '../ShopC2S': {},
            './ActionShop': actionShop,
        }),
    }
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
