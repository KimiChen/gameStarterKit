import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import json5 from 'json5'
import {
    buildCustomFunctionTree,
    formatCustomFunctionResult,
} from '../../../src/modules/adjust/http/customFunctionTree'
import { ChangeDocument } from '../../../src/modules/adjust/http/ChangeDocument'

const filePath = path.resolve(process.cwd(), 'generated/adjust/change_document.json5')
const document = json5.parse(fs.readFileSync(filePath, 'utf8')) as ChangeDocument
const groups = buildCustomFunctionTree(document)
const functions = groups.flatMap((group) => group.children)

assert.ok(groups.length > 0, 'custom function groups should not be empty')
assert.ok(functions.length > 0, 'custom function list should not be empty')
assert.ok(functions.every((item) => item.isLeaf && ['api', 'notice'].includes(item.flag)))
assert.ok(functions.every((item) => item.route && item.uniq))
assert.equal(
    functions.some((item) => item.route === 'addTime'),
    false,
    'non-custom actions must stay hidden',
)

const addProp = functions.find((item) => item.route === 'addProp')
assert.ok(addProp, 'addProp should be exposed as a custom function')
assert.deepEqual(
    addProp.fields.map((field) => field.name),
    ['propId', 'num'],
)
assert.equal(addProp.fields[0].selectOptions, 'getPropsIdList')

assert.deepEqual(formatCustomFunctionResult({ ok: true }), {
    prints: '',
    downloadFileName: '',
    fullscreen: false,
    type: 'json',
    data: { ok: true },
    download: true,
})
console.log('ok - custom function tree contract')
