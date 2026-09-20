const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('mail delivery', () => {
    it('updates an online mailbox before persisting the batch', async () => {
        const events = []
        const mails = new Map()
        const { ActionMail } = loadAction(events, mails)
        global.Ctx = {
            mailRecords: {
                count: 1,
                uIds: { 101: true },
                mails: [
                    {
                        uIds: [101],
                        mail: { mTitle: 'title', mContent: 'content', mDateline: 10, mPastTime: 20 },
                        awards: [{ propId: 7, num: 2 }],
                    },
                ],
            },
        }
        try {
            await ActionMail.endAction()
        } finally {
            delete global.Ctx
        }

        assert.deepStrictEqual(events, ['localize:title', 'localize:content', 'mailbox:1', 'insert:1'])
        assert.strictEqual(mails.get(1).mTitle, 'title')
        assert.strictEqual(mails.get(1).awards.get(1).propId, 7)
    })
})

function loadAction(events, mails) {
    const filename = path.join(projectRoot, 'src/modules/mail/action/ActionMail.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    const stubs = {
        '@arthropoda/game-engine': {
            getServerIdByUid: () => 1,
            RedisInstance: { getServerRedis: () => ({ incrBy: async () => 1 }) },
            timestamp: () => 10,
            UserOnlineMgr: { getUsers: async () => ({ 101: { uId: 101 } }) },
            UtilTime: { DAY_SECOND: 86400 },
        },
        '../../../../generated/persistence/MailModel': {
            MailModel: {
                createQueryBuilder: () => ({
                    insert: () => ({
                        values: (values) => ({ execute: async () => events.push(`insert:${values.length}`) }),
                    }),
                }),
            },
        },
        '../../../runtime/action/GameAction': { GameAction: class GameAction {} },
        '../../../runtime/protocol/S2S/commom': {},
        '../../user/bean/User': {
            User: { load: async () => ({ language: 'zh', mail: { mails: trackedMap(mails, events) } }) },
        },
        '../bean/BPropBean': {
            BPropBean: class BPropBean {
                constructor(values) {
                    Object.assign(this, values)
                }
            },
        },
        '../bean/MailItemBean': {
            MailItemBean: class MailItemBean {
                constructor(values) {
                    Object.assign(this, values)
                    this.awards = new Map()
                    this.awards.maxKey = () => (this.awards.size === 0 ? 0 : Math.max(...this.awards.keys()))
                }
            },
        },
        '../language/MailLocalization': {
            MailLocalization: {
                getValueByUserLanguage: (_language, value) => (events.push(`localize:${value}`), value),
            },
        },
        '../rules/MailDefine': { MailDefine: { TYPE_DEFAULT: 0, TYPE_PAY_NOTICE: 1 } },
        '../rules/MailStateKeys': { MailStateKeys: { MAIL_INCR_ID_KEY: 'mail-id' } },
        '../state/MailStateAccess': { MailStateAccess: {} },
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return loaded.exports
}

function trackedMap(values, events) {
    return {
        set(key, value) {
            values.set(key, value)
            events.push(`mailbox:${key}`)
        },
    }
}
