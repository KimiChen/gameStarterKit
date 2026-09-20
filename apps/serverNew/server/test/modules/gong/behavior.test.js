const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('gong skill upgrade behavior', () => {
    it('uses the gong configuration when refreshing level attributes', () => {
        const events = []
        const { GongProgression } = loadProgression(events)
        global.C = {
            gong: (level) => (events.push(`config:${level}`), { id: level }),
            level: () => {
                throw new Error('gong progression must not read player level configuration')
            },
        }
        try {
            GongProgression.levelUp({ id: 1 }, 2)
            GongProgression.sorceryLevelUp({ id: 1 })
        } finally {
            delete global.C
        }

        assert.deepStrictEqual(events, ['config:2', 'attrs:2', 'fp:gong', 'fp:sorcery'])
    })

    it('replaces the stored skill, charges once, and updates progression', async () => {
        const costs = []
        const events = []
        const { ActionGongSkillUp } = loadAction({ costs, events })
        const sorceryList = diffArray([101])
        const action = new ActionGongSkillUp()
        action.user = { gong: { lv: 10, sorceryList } }
        const response = {}

        global.C = {
            gong_sorcery: (id) =>
                id === 101 ? { newId: 102, gongLevel: 10, costPropId: 7, costNum: 3 } : { skillId: 42 },
        }
        try {
            await action.doAction({ sorceryId: 101 }, response)
        } finally {
            delete global.C
        }

        assert.deepStrictEqual(sorceryList.values(), [102])
        assert.deepStrictEqual(costs, [[7, 3]])
        assert.deepStrictEqual(events, ['sorcery'])
        assert.deepStrictEqual(response, { sorceryId: 102 })
    })

    it('charges, awards, stores the next level, and refreshes gong progression', async () => {
        const costs = []
        const awards = []
        const events = []
        const { ActionGongLvUp } = loadAction({ costs, awards, events }, 'ActionGongLvUp.ts')
        const action = new ActionGongLvUp()
        action.user = { lv: 10, gong: { lv: 1 } }
        const response = { awards: [] }

        global.C = {
            gong: (level) =>
                level === 1
                    ? { showLv: 1, costPropId: 7, costNum: 3, propId: 8, num: 2 }
                    : level === 2
                      ? { showLv: 2 }
                      : undefined,
        }
        global.Param = { GongLvLimit: 0 }
        try {
            await action.doAction({}, response)
        } finally {
            delete global.C
            delete global.Param
        }

        assert.deepStrictEqual(costs, [[7, 3]])
        assert.deepStrictEqual(awards, [[8, 2]])
        assert.deepStrictEqual(events, ['level:2'])
        assert.deepStrictEqual(action.user.gong, { lv: 2 })
        assert.deepStrictEqual(response, { awards: [{ propId: 8, num: 2 }], lv: 2 })
    })
})

function diffArray(values) {
    return {
        includes: (value) => values.includes(value),
        length: () => values.length,
        at: (index) => values.at(index),
        set: (index, value) => values.splice(index, 1, value),
        values: () => [...values],
    }
}

function loadAction({ costs, awards = [], events }, actionName = 'ActionGongSkillUp.ts') {
    const filename = path.join(projectRoot, 'src/modules/gong/action', actionName)
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
    const stubs = {
        '../../../runtime/action/GameAction': { GameAction: class GameAction {} },
        '../../../runtime/errors/SystemErrors': { SystemErrors: { SysParamError: new Error('invalid parameter') } },
        '../../props/inventory/Props': {
            Props: {
                costProp: async (_user, id, count) => costs.push([id, count]),
                addProp: async (_user, id, count, responseAwards) => {
                    awards.push([id, count])
                    responseAwards.push({ propId: id, num: count })
                },
            },
        },
        './GongProgression': {
            GongProgression: {
                sorceryLevelUp: () => events.push('sorcery'),
                levelUp: (_user, level) => events.push(`level:${level}`),
            },
        },
        '../GongErrors': {
            GongErrors: {
                GongMaxSkillLv: new Error('max skill level'),
                GongNotEnoughGongLv: new Error('gong level too low'),
                GongMaxLv: new Error('max level'),
                GongNotEnoughLv: new Error('level too low'),
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

function loadProgression(events) {
    const filename = path.join(projectRoot, 'src/modules/gong/action/GongProgression.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const stubs = {
        '../../attr/calculation/Attr': {
            Attr: { updateAttrModItem: (_user, _mod, attrs) => events.push(`attrs:${attrs.id}`) },
        },
        '../../attr/rules/AttrDefine': { AttrDefine: { attrsFromArrOrObj: (config) => config } },
        '../../attr/rules/AttrModDefine': { AttrModDefine: { Gong: 'gong' } },
        '../../user/action/UserFp': { UserFp: { updateUserFp: (_user, type) => events.push(`fp:${type}`) } },
        '../../user/bean/User': { User: class User {} },
        '../../user/rules/PowerScoreRules': { PowerScoreRules: { FP_TYPE_GONG: 'gong', FP_TYPE_SORCERY: 'sorcery' } },
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return loaded.exports
}
