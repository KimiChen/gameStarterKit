const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('shop behavior equivalence', () => {
    it('keeps purchase order: unlock, limit, cost, count, then award', async () => {
        const events = []
        const item = trackedShopItem(1, (value) => events.push(`count:${value}`))
        const shopInfo = { l: new Map([[101, item]]) }
        const Props = {
            async costProp(user, propId, num) {
                events.push(`cost:${propId}:${num}`)
            },
            async addProp(user, propId, num, awards) {
                events.push(`award:${propId}:${num}`)
                awards.awards.push({ propId, num })
            },
        }
        const { ShopPurchase } = loadPurchase(Props)
        const flow = new ShopPurchase(
            { id: 1 },
            new Map([[101, shopItemConfig({ costId: 5, costNum: 5, propId: 9, num: 3 })]]),
            {
                async getShopInfo() {
                    return shopInfo
                },
                getTotalShopInfo() {
                    return undefined
                },
            },
            { isAutoRefresh: false, getItemExpiredTime: () => 123 },
            {
                isUnlocked() {
                    events.push('unlock')
                    return true
                },
            },
        )
        const response = {}

        await flow.buy(101, 2, response)

        assert.deepStrictEqual(events, ['unlock', 'cost:5:10', 'count:3', 'award:9:6'])
        assert.deepStrictEqual(response.awards, { awards: [{ propId: 9, num: 6 }] })
    })

    it('keeps rising cost based on prior purchases and updates permanent limits before award', async () => {
        const events = []
        const totalInfo = { buyInfo: new Map([[201, 2]]) }
        const Props = {
            async costProp(user, propId, num) {
                events.push({ type: 'cost', propId, num })
            },
            async addProp(user, propId, num) {
                events.push({ type: 'award', propId, num, buyNum: totalInfo.buyInfo.get(201) })
            },
        }
        const { ShopPurchase } = loadPurchase(Props)
        const flow = new ShopPurchase(
            { id: 1 },
            new Map([
                [
                    201,
                    shopItemConfig({
                        buyLimitType: 4,
                        costId: 6,
                        costNum: 10,
                        increase: 1000,
                        propId: 10,
                        num: 1,
                    }),
                ],
            ]),
            {
                async getShopInfo() {
                    return undefined
                },
                getTotalShopInfo() {
                    return totalInfo
                },
            },
            { isAutoRefresh: false, getItemExpiredTime: () => 0 },
            { isUnlocked: () => true },
        )

        await flow.buy(201, 2, {})

        assert.deepStrictEqual(events, [
            { type: 'cost', propId: 6, num: 25 },
            { type: 'award', propId: 10, num: 2, buyNum: 4 },
        ])
        assert.strictEqual(totalInfo.buyInfo.get(201), 4)
    })

    it('rejects purchases over the limit before cost or award', async () => {
        const shopNoTimes = new Error('shop no times')
        const calls = []
        const { ShopPurchase } = loadPurchase(
            {
                async costProp() {
                    calls.push('cost')
                },
                async addProp() {
                    calls.push('award')
                },
            },
            { ShopNoTimes: shopNoTimes },
        )
        const totalInfo = { buyInfo: new Map([[301, 3]]) }
        const flow = new ShopPurchase(
            { id: 1 },
            new Map([[301, shopItemConfig({ buyLimitNum: 4, buyLimitType: 4 })]]),
            {
                getTotalShopInfo: () => totalInfo,
                async getShopInfo() {
                    return undefined
                },
            },
            { isAutoRefresh: false, getItemExpiredTime: () => 0 },
            { isUnlocked: () => true },
        )

        await assert.rejects(
            () => flow.buy(301, 2, {}),
            (error) => error === shopNoTimes,
        )
        assert.deepStrictEqual(calls, [])
        assert.strictEqual(totalInfo.buyInfo.get(301), 3)
    })

    it('charges the current refresh tier, increments once, and stores random goods sorted by id', async () => {
        const events = []
        let refreshNum = 0
        const shopInfo = { l: new Map([[999, { id: 999 }]]) }
        Object.defineProperty(shopInfo, 'refreshNum', {
            get: () => refreshNum,
            set(value) {
                refreshNum = value
                events.push(`refresh:${value}`)
            },
        })
        const { ShopRefresh } = loadRefresh({
            Props: {
                async costProp(user, propId, num) {
                    events.push(`cost:${propId}:${num}`)
                },
            },
            GameRandom: {
                randomManyByWeightConfig() {
                    return [{ goodsId: 30 }, { goodsId: 10 }, { goodsId: 20 }]
                },
            },
        })
        const flow = new ShopRefresh(
            { id: 1 },
            {
                showNum: 3,
                autoRefresh: ['12:00:00'],
                manualRefresh: [{ costItem: 7, costNum: 9 }],
            },
            new Map([
                [10, { goodsId: 10 }],
                [20, { goodsId: 20 }],
                [30, { goodsId: 30 }],
            ]),
            {
                async getShopInfo() {
                    return shopInfo
                },
            },
        )

        await flow.manualRefresh()

        assert.deepStrictEqual(events, ['cost:7:9', 'refresh:1'])
        assert.deepStrictEqual([...shopInfo.l.keys()], [10, 20, 30])
        assert.strictEqual(refreshNum, 1)
    })

    it('removes expired entries while retaining future entries during initialization', async () => {
        const shopInfo = {
            l: new Map([
                [1, { expiredTime: 99 }],
                [2, { expiredTime: 100 }],
                [3, { expiredTime: 101 }],
            ]),
        }
        const { ShopStateStore } = loadShopStateStore({ shop: shopInfo }, 100)
        const state = new ShopStateStore({ id: 1 }, 'shop')

        const initialized = await state.initialize()

        assert.strictEqual(initialized, shopInfo)
        assert.deepStrictEqual([...shopInfo.l.keys()], [3])
    })
})

function shopItemConfig(overrides = {}) {
    return {
        buyLimitNum: 10,
        buyLimitType: 1,
        costId: 0,
        costNum: 0,
        increase: 0,
        propId: 1,
        num: 1,
        ...overrides,
    }
}

function trackedShopItem(initialBuyNum, onChange) {
    let buyNum = initialBuyNum
    return {
        id: 0,
        expiredTime: 0,
        get buyNum() {
            return buyNum
        },
        set buyNum(value) {
            buyNum = value
            onChange(value)
        },
    }
}

function loadPurchase(Props, errorOverrides = {}) {
    return loadTypeScriptModule('src/modules/shop/purchase/ShopPurchase.ts', {
        '../../attr/rules/AttributeScale': { AttributeScale: { NUMBER_RATIO: 10000 } },
        '../../props/inventory/Props': { Props },
        '../../user/bean/User': { User: class User {} },
        '../bean/ShopInfoBean': { ShopInfoBean: class ShopInfoBean {} },
        '../bean/ShopItemBean': { ShopItemBean: TestShopItemBean },
        '../rules/ShopConst': {
            ShopConst: { NO_LIMIT: -1, LimitTypeDay: 1, LimitTypeWeek: 2, LimitTypeMonth: 3, LimitTypeTotal: 4 },
        },
        '../ShopErrors': {
            ShopErrors: {
                ShopNoUnlock: new Error('shop no unlock'),
                ShopItemErr: new Error('shop item error'),
                ShopNoTimes: new Error('shop no times'),
                ...errorOverrides,
            },
        },
        '../access/ShopAccessRules': { ShopAccessRules: class ShopAccessRules {} },
        '../refresh/ShopRefresh': { ShopRefresh: class ShopRefresh {} },
        '../state/ShopStateStore': { ShopStateStore: class ShopStateStore {} },
    })
}

function loadRefresh({ Props, GameRandom }) {
    return loadTypeScriptModule('src/modules/shop/refresh/ShopRefresh.ts', {
        '@arthropoda/game-engine': {
            mapValues: (values) => [...values.values()],
            timestamp: () => 100,
            UtilTime: {
                getCurrentResetTime: () => 200,
                getDayStartTime: () => 0,
                getNextWeekDayStartTime: () => 300,
                nextMonthTime: () => 400,
                nextDayTime: () => 500,
            },
        },
        '../../activity/ActivityErrors': { ActivityErrors: { ActivityNotOpen: new Error('activity not open') } },
        '../../props/inventory/Props': { Props },
        '../../user/bean/User': { User: class User {} },
        '../../../runtime/errors/SystemErrors': {
            SystemErrors: { SysParamErr: new Error('param'), SysConfErr: new Error('config') },
        },
        '../../../runtime/random/GameRandom': { GameRandom },
        '../bean/ShopInfoBean': { ShopInfoBean: class ShopInfoBean {} },
        '../bean/ShopItemBean': { ShopItemBean: TestShopItemBean },
        '../rules/ShopConst': {
            ShopConst: {
                LimitTypeDay: 1,
                LimitTypeWeek: 2,
                LimitTypeMonth: 3,
                LimitTypeTotal: 4,
                LimitTypeActivity: 100,
            },
        },
        '../ShopErrors': {
            ShopErrors: { ShopNoRefresh: new Error('no refresh'), ShopNoRefreshTimes: new Error('no refresh times') },
        },
        '../state/ShopStateStore': { ShopStateStore: class ShopStateStore {} },
    })
}

function loadShopStateStore(shopState, now) {
    return loadTypeScriptModule('src/modules/shop/state/ShopStateStore.ts', {
        '@arthropoda/game-engine': { timestamp: () => now },
        '../../user/bean/User': { User: class User {} },
        '../bean/Shop': { Shop: { load: async () => shopState } },
        '../bean/ShopInfoBean': { ShopInfoBean: class ShopInfoBean {} },
        '../bean/TotalShopBean': { TotalShopBean: class TotalShopBean {} },
    })
}

class TestShopItemBean {
    constructor(values = {}) {
        this.id = 0
        this.buyNum = 0
        this.expiredTime = 0
        Object.assign(this, values)
    }
}

function loadTypeScriptModule(relativePath, stubs) {
    const filename = path.join(projectRoot, relativePath)
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            useDefineForClassFields: false,
        },
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
