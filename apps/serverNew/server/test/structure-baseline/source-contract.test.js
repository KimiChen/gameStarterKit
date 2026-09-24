const assert = require('assert')
const path = require('path')
const {
    exportedClassNameMismatch,
    normalizeRedisSourceName,
    normalizeTypeScriptWithoutImports,
} = require('../../scripts/structure-baseline/source-contract')

assert.deepStrictEqual(
    exportedClassNameMismatch(path.resolve('src/modules/test/action/ActionExpected.ts'), 'export class ActionOther {}'),
    {
        file: 'src/modules/test/action/ActionExpected.ts',
        expected: 'ActionExpected',
        exports: ['ActionOther'],
    },
)
assert.strictEqual(
    normalizeTypeScriptWithoutImports(
        "import {\n  User,\n  UserRef,\n} from '../../../../src/modules/user/bean/User'\nexport const version = 7\n",
    ),
    'export const version = 7;',
)
assert.strictEqual(normalizeRedisSourceName('RankAccess.formatRankKey.key'), 'RankHelper.formatRankKey.key')
assert.strictEqual(normalizeRedisSourceName('OtherStore.key'), 'OtherStore.key')

console.log('source contract helpers passed')

// Optional kit data declarations are a separate exact contract, not additions to the host baseline.
const fs = require('fs')
const os = require('os')
const { nativeKitStorageContracts, collectRedisKeys } = require('../../scripts/structure-baseline/source-contract')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'native-kit-storage-'))
try {
    const kitRoot = path.join(temporary, 'nativefix')
    fs.mkdirSync(kitRoot)
    fs.writeFileSync(path.join(kitRoot, 'kit.json'), JSON.stringify({ id: 'nativefix', serverRuntime: 'serverNew' }))
    assert.equal(nativeKitStorageContracts(temporary).get('nativefix').expected.size, 0)
    const descriptor = {
        schemaVersion: 1,
        dataVersion: 1,
        minSupported: 1,
        retention: 'preserve',
        keys: ['kt:nativefix:accounts:v1'],
    }
    const write = (value) => fs.writeFileSync(path.join(kitRoot, 'native-data.json'), JSON.stringify(value))
    write(descriptor)
    assert.deepStrictEqual([...nativeKitStorageContracts(temporary).get('nativefix').expected], descriptor.keys)
    for (const bad of [
        null,
        false,
        { ...descriptor, minSupported: 2 },
        { ...descriptor, keys: ['nativeLobby:assets'] },
        { ...descriptor, keys: [...descriptor.keys, ...descriptor.keys] },
    ]) {
        write(bad)
        assert.throws(() => nativeKitStorageContracts(temporary), /invalid native kit data contract/)
    }
} finally {
    fs.rmSync(temporary, { recursive: true, force: true })
}
const hostKeys = collectRedisKeys()
assert.ok(hostKeys.some((entry) => entry.value === 'nativeLobby:identity:v1'))
assert.ok(hostKeys.every((entry) => !entry.value.startsWith('kt:gameDemo:')))
const descriptorPath = path.resolve(__dirname, '../../../../kits/gameDemo/native-data.json')
if (fs.existsSync(descriptorPath)) {
    const originalRead = fs.readFileSync
    try {
        fs.readFileSync = function (file, ...args) {
            const result = originalRead.call(this, file, ...args)
            if (path.resolve(String(file)) !== descriptorPath) return result
            const descriptor = JSON.parse(String(result))
            descriptor.keys.pop()
            return JSON.stringify(descriptor)
        }
        assert.throws(() => collectRedisKeys(), /Redis keys differ/)
    } finally {
        fs.readFileSync = originalRead
    }
}
console.log('native kit storage declaration checks passed')
