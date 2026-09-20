import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import json5 from 'json5'
import { filterCustomFunctionDocument } from '../../../src/modules/adjust/http/filterCustomFunctionDocument'
import { ChangeDocument, ChangeDocumentTreeNode } from '../../../src/modules/adjust/http/ChangeDocument'

const filePath = path.resolve(process.cwd(), 'generated/adjust/change_document.json5')
const source = json5.parse(fs.readFileSync(filePath, 'utf8')) as ChangeDocument
const before = JSON.stringify(source)
const filtered = filterCustomFunctionDocument(source)

function walk(node: ChangeDocumentTreeNode) {
    for (const action of node.actions) {
        if ('canCustom' in action) {
            assert.equal(action.canCustom, true, `${node.route} retained a disabled custom action`)
        }
    }
    node.children.forEach(walk)
}

filtered.nodes.forEach(walk)
assert.equal(
    filtered.nodes.some((node) => node.route === '@canCustom'),
    false,
)
assert.deepEqual(
    filtered.root.children.map((node) => node.route),
    filtered.nodes.map((node) => node.route),
)
assert.equal(JSON.stringify(source), before, 'filter mutated the generated change document')
console.log('ok - custom function document filtering')
