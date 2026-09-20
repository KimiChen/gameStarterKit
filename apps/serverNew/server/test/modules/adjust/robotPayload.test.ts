import assert from 'node:assert/strict'
import {
    normalizeBatchPlanPayload,
    normalizeEnvironmentPayload,
    normalizeRobotIds,
    normalizeRobotUsers,
    parseSimpleCsv,
} from '../../../src/modules/adjust/http/robot/robotPayload'

assert.deepEqual(normalizeRobotIds([1, '2', 2, 0]), [1, 2])
assert.equal(
    normalizeEnvironmentPayload({
        name: 'SERVER_URL',
        type: 'string',
        default_value: 'http://127.0.0.1',
        description: 'server',
    }).name,
    'SERVER_URL',
)
assert.throws(() => normalizeEnvironmentPayload({ name: '1bad', type: 'string', default_value: 'x' }))
assert.throws(() => normalizeEnvironmentPayload({ name: 'A', type: 'array', default_value: '{}' }))

const users = normalizeRobotUsers([
    { username: 'robot_1', password: 'Aa123456' },
    { uid: '10001', loginType: 'uid' },
])
assert.equal(users[0].loginType, 'account')
assert.equal(users[1].loginType, 'uid')
assert.throws(() => normalizeRobotUsers([]))

const plan = normalizeBatchPlanPayload({ users, mode: 'browser' })
assert.equal(plan.userCount, 2)
assert.equal(JSON.parse(plan.serialized).mode, 'browser')

assert.deepEqual(parseSimpleCsv('name,type\nA,string\n"B,B",number'), [
    ['name', 'type'],
    ['A', 'string'],
    ['B,B', 'number'],
])

console.log('ok - robot payload contract')
