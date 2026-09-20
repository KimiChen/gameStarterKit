import assert from 'node:assert/strict'
import { buildFuncCaseTree } from '../../../src/modules/adjust/http/funcCaseTree'

const tree = buildFuncCaseTree([
    { id: 1, parent_id: 0, type: 0, name: 'group', sort: 1 },
    { id: 2, parent_id: 1, type: 1, name: 'case', sort: 1 },
    { id: 3, parent_id: 99, type: 1, name: 'orphan', sort: 2 },
])

assert.equal(tree.length, 2)
assert.equal(tree[0].id, 1)
assert.equal(tree[0].children[0].id, 2)
assert.equal(tree[1].id, 3)

console.log('ok - func case tree contract')
