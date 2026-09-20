const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')

describe('GM native Lobby kick bridge', () => {
    const savedCP = global.CP

    before(() => {
        global.CP = { platform: { gmSecret: 'gm-secret' } }
    })

    after(() => {
        if (savedCP === undefined) delete global.CP
        else global.CP = savedCP
    })

    it('converts the existing role_id into a signed internal action without exposing external uid', async () => {
        const calls = []
        const messages = []
        const { ActionPlayerKickOnline } = loadAction({
            postJson: async (...args) => {
                calls.push(args)
                return { status: 200, data: { code: 0, data: { json: { kicked: true } } } }
            },
        })
        const context = { setGmMsg: (...args) => messages.push(args) }
        const action = new ActionPlayerKickOnline(context)
        const roleId = 10_002_000_123
        assert.deepStrictEqual(await action.doAction({ role_id: roleId, sid: 2 }), {
            role_id: roleId,
            sId: 2,
            kicked: true,
        })
        assert.deepStrictEqual(messages, [])
        assert.deepStrictEqual(calls, [
            [
                'http://127.0.0.1:30002/internal/action',
                {
                    type: 'lobbyKickByRoleId',
                    actionParams: { roleId, sId: 2, reason: 'revoked' },
                },
                undefined,
                { 'x-internal-secret': 'gm-secret' },
            ],
        ])
    })

    it('rejects an invalid role_id or a caller-supplied mismatched sid before sending anything', async () => {
        const calls = []
        const messages = []
        const { ActionPlayerKickOnline } = loadAction({
            postJson: async (...args) => {
                calls.push(args)
                return { status: 200, data: { code: 0, data: { json: { kicked: true } } } }
            },
        })
        const action = new ActionPlayerKickOnline({ setGmMsg: (...args) => messages.push(args) })
        assert.strictEqual(await action.doAction({ role_id: 'not-a-number' }), false)
        assert.strictEqual(await action.doAction({ role_id: 10_002_000_123, sid: 3 }), false)
        assert.deepStrictEqual(calls, [])
        assert.strictEqual(messages.length, 2)
    })
})

function loadAction({ postJson }) {
    const filename = path.join(projectRoot, 'src/modules/user/http/gm/ActionPlayerKickOnline.ts')
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText
    class Player {
        constructor(gmContext) {
            this.gmContext = gmContext
        }
    }
    const stubs = {
        '@arthropoda/game-engine': {
            Url: { postJson },
            getServerIdByUid: (roleId) => Math.trunc((roleId % 10_000_000_000) / 1_000_000),
        },
        '../../../../http/FixedServerEndpoint': {
            FixedServerEndpoint: { internalActionUrl: (sid) => `http://127.0.0.1:${30000 + sid}/internal/action` },
        },
        '../../../../runtime/lobby/NativeLobbyForceLogout': {
            OPS_FORCE_LOGOUT_REASON: 'revoked',
            OPS_ROLE_FORCE_LOGOUT_TYPE: 'lobbyKickByRoleId',
        },
        './Player': { Player },
    }
    const loaded = new Module(filename, module)
    loaded.filename = filename
    const defaultRequire = loaded.require.bind(loaded)
    loaded.require = (request) => (Object.hasOwn(stubs, request) ? stubs[request] : defaultRequire(request))
    loaded._compile(output, filename)
    return loaded.exports
}
