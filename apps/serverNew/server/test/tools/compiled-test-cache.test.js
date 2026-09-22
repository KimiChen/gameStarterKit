const assert = require('assert')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const { compilationInputs, compilationSignature } = require('../../scripts/bean-compile/run-compiled-tests')

describe('compiled test cache', () => {
    it('invalidates when the Bean compatibility record changes', () => {
        const recordPath = path.join(projectRoot, 'generated/records/record.json')
        const originalReadFile = fs.readFileSync
        const before = compilationSignature('test/bean-compile/tsconfig.json', [
            'test/bean-compile/runtime-equivalence.test.ts',
        ])

        fs.readFileSync = (filePath, ...args) => {
            const content = originalReadFile(filePath, ...args)
            return path.resolve(filePath) === recordPath
                ? Buffer.concat([Buffer.from(content), Buffer.from('\n')])
                : content
        }
        try {
            const after = compilationSignature('test/bean-compile/tsconfig.json', [
                'test/bean-compile/runtime-equivalence.test.ts',
            ])
            assert.notStrictEqual(after, before)
        } finally {
            fs.readFileSync = originalReadFile
        }
    })

    it('signs every file that the selected TypeScript project compiles', () => {
        const inputs = compilationInputs('test/tsconfig.json')
        assert.ok(
            inputs.some((filePath) => filePath.endsWith('/src/modules/income/action/ActionIncomeClaimOffline.ts')),
        )
        assert.ok(inputs.some((filePath) => filePath.endsWith('/test/modules/adjust/aiCodeContext.test.ts')))
        assert.ok(inputs.some((filePath) => filePath.endsWith('/engine/src/event/EventSystem.ts')))
        assert.ok(inputs.some((filePath) => filePath.endsWith('/engine/src/typings/types.d.ts')))
    })
})
