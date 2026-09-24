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
