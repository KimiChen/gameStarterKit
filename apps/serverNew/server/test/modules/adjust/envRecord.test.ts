import assert from 'node:assert/strict'
import { adjustEnvRecord, normalizeAdjustEnvInput, positiveEnvIds } from '../../../src/modules/adjust/http/envRecord'

assert.deepEqual(
    adjustEnvRecord({
        id: 3,
        name: 'apiHost',
        type: 'string',
        defaultValue: 'http://127.0.0.1',
        description: 'API host',
    }),
    {
        id: 3,
        name: 'apiHost',
        type: 'string',
        default_value: 'http://127.0.0.1',
        description: 'API host',
    },
)

assert.deepEqual(normalizeAdjustEnvInput({ name: ' count ', type: 'number', default_value: '1' }), {
    value: { name: 'count', type: 'number', default_value: '1', description: '' },
})
assert.equal(
    normalizeAdjustEnvInput({ name: '', type: 'string', default_value: '' }).error,
    '变量名长度必须为1到64个字符',
)
assert.equal(normalizeAdjustEnvInput({ name: 'bad', type: 'date', default_value: '' }).error, '变量类型无效')
assert.deepEqual(positiveEnvIds([1, '2', 2, 0, -1, 'invalid']), [1, 2])

console.log('ok - adjust env record contract')
