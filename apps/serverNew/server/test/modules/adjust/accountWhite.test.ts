import assert from 'assert'
import { getAccountSetDigest, normalizeAccountBatch } from '../../../src/modules/adjust/http/accountWhite.controller'
import { isToolWriteRequest } from '../../../src/http/security/sso/isToolWriteRequest'

const batch = normalizeAccountBatch([' user-a ', 'user-b', 'user-a', '', 'x'.repeat(65), 123])
assert.deepStrictEqual(batch.accounts, ['user-a', 'user-b'])
assert.strictEqual(batch.requestedCount, 6)
assert.strictEqual(batch.duplicateCount, 1)
assert.strictEqual(batch.invalidCount, 3)

assert.strictEqual(getAccountSetDigest(['user-a', 'user-b']), getAccountSetDigest(['user-b', 'user-a']))
assert.notStrictEqual(getAccountSetDigest(['user-a']), getAccountSetDigest(['user-b']))
assert.strictEqual(getAccountSetDigest([]), '')

assert.strictEqual(isToolWriteRequest({ method: 'GET', path: '/adjust/account/white/list' }), false)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/account/white/add' }), true)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/account/white/del' }), true)

assert.throws(
    () => normalizeAccountBatch('user-a'),
    (error: any) => error?.msg === 'accounts 必须是数组',
)
assert.throws(
    () => normalizeAccountBatch(Array.from({ length: 501 }, () => 'user-a')),
    (error: any) => error?.msg === '单次最多处理 500 个账号',
)

console.log('accountWhite tests passed')
