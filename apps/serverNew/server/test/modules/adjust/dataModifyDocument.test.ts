import assert from 'node:assert/strict'
import { User } from '../../../src/modules/user/bean/User'
import { buildBeanChangeDocument } from '../../../src/modules/adjust/http/buildBeanChangeDocument'

global.ROOT_PATH = process.cwd()

const user = new User(1000001)
const root = buildBeanChangeDocument(user, [])
assert.deepEqual(
    root.children.map((item) => item.route),
    ['User'],
)

const userNode = buildBeanChangeDocument(user, ['User'])
const idNode = userNode.children.find((item) => item.route === 'id')
const levelNode = userNode.children.find((item) => item.route === 'lv')
const bagNode = userNode.children.find((item) => item.route === 'bag')

assert.ok(idNode, 'identity field should remain visible')
assert.equal(idNode.actions.length, 0, 'identity field must stay read-only')
assert.ok(
    levelNode?.actions.some((item) => item.route === 'edit'),
    'persistent scalar field should be editable',
)
assert.equal(bagNode?.ui?.valueType, 'arrayRedis', 'DiffMap should be lazy-loaded as a collection')
console.log('ok - data modify document contract')
