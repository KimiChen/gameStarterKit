import assert from 'node:assert/strict'
import { isToolWriteRequest } from '../../../src/http/security/sso/isToolWriteRequest'

assert.strictEqual(isToolWriteRequest({ method: 'GET', path: '/adjust/get' }), false)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/customFunc/getOptions' }), false)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/config/history' }), false)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/case/tree' }), false)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/env/export' }), false)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/multipleCase/export' }), false)

assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/parseCommitAction' }), true)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/customFunc/commit' }), true)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/config/upload' }), true)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/case/edit' }), true)
assert.strictEqual(isToolWriteRequest({ method: 'POST', path: '/adjust/multipleCase/import' }), true)

assert.strictEqual(
    isToolWriteRequest({
        method: 'POST',
        path: '/adjust/redisCommand',
        body: { command: 'get' },
    }),
    false,
)
assert.strictEqual(
    isToolWriteRequest({
        method: 'POST',
        path: '/adjust/redisCommand',
        body: { command: 'call', params: ['JSON.GET', 'test:key'] },
    }),
    false,
)
assert.strictEqual(
    isToolWriteRequest({
        method: 'POST',
        path: '/adjust/redisCommand',
        body: { command: 'set' },
    }),
    true,
)
assert.strictEqual(
    isToolWriteRequest({
        method: 'POST',
        path: '/adjust/redisCommand',
        body: { command: 'JSON.SET' },
    }),
    true,
)
assert.strictEqual(
    isToolWriteRequest({
        method: 'POST',
        path: '/adjust/redisCommand',
        body: { command: 'flushall' },
    }),
    true,
)

console.log('ok - SSO tool write policy contract')
