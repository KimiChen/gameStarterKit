const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('weapon progression', () => {
    it('updates weapon attributes and both activity ranks after a level increase', async () => {
        const events = []
        const { WeaponProgression } = loadProgression(events)
        global.C = { weapon: (level) => ({ showLv: level * 10 }) }
        try {
            await WeaponProgression.levelUp({ id: 1 }, 3)
        } finally {
            delete global.C
        }

        assert.deepStrictEqual(events, ['attrs:30', 'fp:weapon', 'rank:weapon:30', 'rank:weapon-fp:99'])
    })
})

function loadProgression(events) {
    const filename = path.join(projectRoot, 'src/modules/weapon/action/WeaponProgression.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const stubs = {
        '../../activity/rank/ActivityRankUpdate': {
            ActivityRankUpdate: { run: async (_user, [type], value) => events.push(`rank:${type}:${value}`) },
        },
        '../../activity/rules/ActivityDefine': { ActivityDefine: { RankWeapon: 'weapon', RankWeaponFp: 'weapon-fp' } },
        '../../user/access/FeatureAccess': { FeatureAccess: { check: () => false } },
        '../../../runtime/errors/SystemErrors': { SystemErrors: {} },
        '../../../runtime/random/GameRandom': { GameRandom: {} },
        '../../attr/bean/AttrTypeBean': { AttrTypeBean: class AttrTypeBean {} },
        '../../attr/calculation/Attr': {
            Attr: { updateAttrModItem: (_user, _mod, attrs) => events.push(`attrs:${attrs.showLv}`) },
        },
        '../../attr/rules/AttrDefine': { AttrDefine: { attrsFromArrOrObj: (config) => config } },
        '../../attr/rules/AttrModDefine': { AttrModDefine: { Weapon: 'weapon', Soul: 'soul' } },
        '../../attr/rules/AttributeScale': { AttributeScale: {} },
        '../../props/inventory/Props': { Props: {} },
        '../../props/rules/ItemIdDefine': { ItemIdDefine: { ITEM_ID_CLEANSE_NEGTIVE: 1, ITEM_ID_CLEANSE_POSTIVE: 2 } },
        '../../user/access/ModuleOpenType': { ModuleOpenType: {} },
        '../../user/action/UserFp': { UserFp: { updateUserFp: (_user, type) => events.push(`fp:${type}`) } },
        '../../user/bean/User': { User: class User {} },
        '../../user/rules/PowerScoreRules': {
            PowerScoreRules: { FP_TYPE_WEAPON: 'weapon', getActivityRankFp: () => 99 },
        },
        '../WeaponErrors': { WeaponErrors: {} },
        '../bean/RareBean': { RareBean: class RareBean {} },
        '../bean/WeaponSoulBean': { WeaponSoulBean: class WeaponSoulBean {} },
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return loaded.exports
}
