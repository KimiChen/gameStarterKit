import assert from 'node:assert/strict'
import { buildRobotCaseTree, filterRobotCaseTree } from '../../../src/modules/adjust/http/robot/robotCaseTree'

const tree = buildRobotCaseTree([
    { id: 1, parent_id: 0, type: 0, name: 'group', router: '', content: '', param: [], ext: '' },
    { id: 2, parent_id: 1, type: 2, name: 'ws', router: 'User.login', content: '{}', param: [], ext: '' },
    { id: 3, parent_id: 1, type: 3, name: 'task', router: '', content: 'LOG(1)', param: [], ext: '' },
    { id: 4, parent_id: 99, type: 1, name: 'orphan', router: 'grant', content: '{}', param: [], ext: '' },
])

assert.equal(tree.length, 2)
assert.equal(tree[0].children?.length, 2)
assert.equal(tree[1].id, 4)

const wsOnly = filterRobotCaseTree(tree, new Set([2]))
assert.equal(wsOnly.length, 1)
assert.equal(wsOnly[0].type, 0)
assert.equal(wsOnly[0].children?.length, 1)
assert.equal(wsOnly[0].children?.[0].id, 2)

console.log('ok - robot case tree contract')
