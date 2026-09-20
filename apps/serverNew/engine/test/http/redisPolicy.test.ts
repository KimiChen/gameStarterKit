import assert from 'node:assert/strict'
import {
    AdjustRedisPolicyError,
    getAdjustRedisCommandAccess,
    resolveAdjustRedisCommand,
} from '../../src/http/controllers/adjust/redisPolicy'

const limits = {
    maxArgumentCount: 10,
    maxArgumentBytes: 1024,
    maxScanCount: 200,
    maxRangeItems: 100,
}

assert.equal(getAdjustRedisCommandAccess('GET'), 'read')
assert.equal(getAdjustRedisCommandAccess('call', ['JSON.GET', 'test:key']), 'read')
assert.equal(getAdjustRedisCommandAccess('JSON.SET'), 'write')
assert.equal(getAdjustRedisCommandAccess('FLUSHALL'), 'denied')
assert.equal(getAdjustRedisCommandAccess('EVAL'), 'denied')
assert.equal(getAdjustRedisCommandAccess('KEYS'), 'denied')

assert.deepEqual(resolveAdjustRedisCommand('call', ['MEMORY USAGE', 'test:key'], limits), {
    access: 'read',
    command: 'MEMORY USAGE',
    redisCommand: 'MEMORY',
    args: ['USAGE', 'test:key'],
})
assert.deepEqual(resolveAdjustRedisCommand('JSON SET', ['test:key', '.', '{}'], limits), {
    access: 'write',
    command: 'JSON.SET',
    redisCommand: 'JSON.SET',
    args: ['test:key', '.', '{}'],
})

assert.throws(
    () => resolveAdjustRedisCommand('SCAN', ['0', 'COUNT', '201'], limits),
    (error: unknown) => error instanceof AdjustRedisPolicyError && /SCAN COUNT/.test(error.message),
)
assert.throws(
    () => resolveAdjustRedisCommand('LRANGE', ['test:key', '0', '100'], limits),
    (error: unknown) => error instanceof AdjustRedisPolicyError && /最多返回/.test(error.message),
)
assert.throws(
    () => resolveAdjustRedisCommand('CONFIG', ['GET', '*'], limits),
    (error: unknown) => error instanceof AdjustRedisPolicyError && error.statusCode === 403,
)

console.log('ok - adjust Redis command policy')
