const assert = require('assert')
const {
    compareCompatibility,
    semanticFileContent,
    sha256,
} = require('../../scripts/structure-baseline/compatibility-contract')

const beforeMove = JSON.stringify({
    modVersion: 2,
    protocols: {
        C2S: {
            version: 7,
            protocols: {
                user: {
                    relativePath: '/user',
                    apis: {
                        Enter: {
                            serviceType: 'Base',
                            req: { id: 1, package: 'user/', name: 'Enter', version: 1, properties: {} },
                        },
                    },
                    pushs: {},
                    msgs: {},
                },
            },
        },
    },
    beans: {
        'User.ts': {
            sourcePath: 'src/bean/base/User.ts',
            relativePath: '/base/User',
            mtime: 1,
            md5: 'before',
            version: 2,
            className: 'User',
            diffType: 1,
            idFiledType: 'int',
            saveType: 'SaveType.All',
            modType: 'ModType.None',
            modId: 0,
            properties: { id: { id: 1, name: 'id', type: 'int', typeImport: '/base/User' } },
            mods: {},
        },
    },
})
const afterMove = JSON.stringify({
    modVersion: 2,
    protocols: {
        C2S: {
            version: 7,
            protocols: {
                user: {
                    relativePath: '/user',
                    apis: {
                        Enter: {
                            serviceType: 'Base',
                            req: { id: 1, package: 'user/', name: 'Enter', version: 1, properties: {} },
                        },
                    },
                    pushs: {},
                    msgs: {},
                },
            },
        },
    },
    beans: {
        'User.ts': {
            sourcePath: 'src/modules/user/bean/User.ts',
            relativePath: '/user/User',
            mtime: 2,
            md5: 'after',
            version: 2,
            className: 'User',
            diffType: 1,
            idFiledType: 'int',
            saveType: 'SaveType.All',
            modType: 'ModType.None',
            modId: 0,
            properties: { id: { id: 1, name: 'id', type: 'int', typeImport: '/user/User' } },
            mods: {},
        },
    },
})
const changeRecord = (mutate) => {
    const record = JSON.parse(afterMove)
    mutate(record)
    return JSON.stringify(record)
}
const changedField = changeRecord((record) => {
    record.beans['User.ts'].properties.id.id = 2
})
const changedType = changeRecord((record) => {
    record.beans['User.ts'].properties.id.type = 'string'
})
const changedMod = changeRecord((record) => {
    record.beans['User.ts'].mods.user = { name: 'user', id: 3, type: 'User', isMap: false }
})
const changedProtocolVersion = changeRecord((record) => {
    record.protocols.C2S.version = 8
})
const changedRoute = changeRecord((record) => {
    // 旧数字协议号已随 P6 删除；路由级变更改用仍然承重的 serviceType 表达。
    record.protocols.C2S.protocols.user.apis.Enter.serviceType = 'Other'
})
const duplicateRouteName = changeRecord((record) => {
    record.protocols.C2S.protocols.userMirror = {
        relativePath: '/user',
        apis: {
            Enter: { serviceType: 'Base', req: { package: 'user/', name: 'Enter', version: 1, properties: {} } },
        },
        pushs: {},
        msgs: {},
    }
})
const removedBean = changeRecord((record) => {
    delete record.beans['User.ts']
})
const withDeletedHistory = changeRecord((record) => {
    record.beans['Legacy.ts'] = {
        deleted: true,
        className: 'Legacy',
        diffType: 1,
        properties: { obsolete: { id: 1, name: 'obsolete', type: 'int' } },
        mods: {},
    }
})

const semanticHash = (role, content) => sha256(JSON.stringify(semanticFileContent(role, content)))

assert.strictEqual(semanticHash('unifiedRecord', beforeMove), semanticHash('unifiedRecord', afterMove))
assert.strictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', withDeletedHistory))
assert.notStrictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', changedField))
assert.notStrictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', changedType))
assert.notStrictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', changedMod))
assert.notStrictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', changedProtocolVersion))
assert.notStrictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', changedRoute))
assert.throws(() => semanticHash('unifiedRecord', duplicateRouteName), /duplicate protocol name C2S:user\/Enter/)
assert.notStrictEqual(semanticHash('unifiedRecord', afterMove), semanticHash('unifiedRecord', removedBean))

const oldImport = "import { User } from '../../../../src/bean/base/User'\nexport const version = 7\n"
const newImport = "import { User } from '../../../../src/modules/user/bean/User'\nexport const version = 7\n"
const renamedImport =
    "import { RenamedUser } from '../../../../src/runtime/protocol/C2S/base'\nexport const version = 7\n"
const changedVersion = "import { User } from '../../../../src/modules/user/bean/User'\nexport const version = 8\n"
const multilineImport = `import {
    User,
    UserRef,
} from '../../../../src/modules/user/bean/User'
export const version = 7
`

assert.strictEqual(semanticHash('c2sServiceProtocol', oldImport), semanticHash('c2sServiceProtocol', newImport))
assert.strictEqual(semanticHash('c2sServiceProtocol', newImport), semanticHash('c2sServiceProtocol', renamedImport))
assert.strictEqual(semanticHash('c2sServiceProtocol', newImport), semanticHash('c2sServiceProtocol', multilineImport))
assert.notStrictEqual(semanticHash('c2sServiceProtocol', newImport), semanticHash('c2sServiceProtocol', changedVersion))

const expectedEvidence = {
    compatibility: { contract: 1 },
    counts: { contract: 1 },
    semanticArtifacts: { artifact: { path: 'generated/a.ts', semanticSha256: 'same' } },
    physicalArtifacts: { artifact: { path: 'generated/a.ts', sha256: 'before' } },
}
const movedEvidence = {
    ...expectedEvidence,
    physicalArtifacts: { artifact: { path: 'generated/moved/a.ts', sha256: 'after' } },
}
assert.deepStrictEqual(compareCompatibility(expectedEvidence, movedEvidence, { hashes: true }), [])

console.log('compatibility hash normalization passed')
