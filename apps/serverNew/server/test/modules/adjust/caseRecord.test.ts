import assert from 'node:assert/strict'
import { buildCaseTree, normalizeCaseTypes, serializeCaseField } from '../../../src/modules/adjust/http/caseRecord'

const records = [
    { id: 1, name: 'root', parent_id: 0, type: 0, router: '', content: '', param: '[]', ext: '' },
    { id: 2, name: 'task', parent_id: 1, type: 3, router: '', content: 'LOG(1)', param: '[]', ext: '' },
    { id: 3, name: 'nested', parent_id: 1, type: 0, router: '', content: '', param: '[]', ext: '' },
    { id: 4, name: 'ws', parent_id: 3, type: 2, router: 'ReqEnter', content: '{}', param: '[]', ext: '' },
    { id: 5, name: 'orphan', parent_id: 99, type: 3, router: '', content: '', param: '[]', ext: '' },
]

const tree = buildCaseTree(records)
assert.equal(tree.length, 1)
assert.equal(tree[0].name, 'root')
assert.deepEqual(
    tree[0].children.map((item) => item.name),
    ['task', 'nested'],
)
assert.equal(tree[0].children[1].children[0].name, 'ws')
assert.deepEqual(normalizeCaseTypes([]), [])
assert.deepEqual(normalizeCaseTypes([0, '2', 2, 4, -1, 'invalid']), [0, 2])
assert.equal(serializeCaseField({ value: 1 }), '{"value":1}')
assert.equal(serializeCaseField([], '[]'), '[]')
assert.equal(serializeCaseField(undefined, '[]'), '[]')

console.log('ok - adjust case record contract')
