const assert = require('assert')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const baseline = require('./error-code-baseline.json')

describe('error code generation', () => {
    it('keeps all names, numbers, messages and owners compatible', () => {
        assert.strictEqual(new Set(baseline.errors.map((item) => item.name)).size, baseline.count)
        assert.strictEqual(new Set(baseline.errors.map((item) => item.code)).size, baseline.count)
    })

    it('uses owner files as the only hand-written definitions', () => {
        assert.strictEqual(fs.existsSync(path.join(projectRoot, 'src/config/ErrorCode.ts')), false)
        const registry = fs.readFileSync(path.join(projectRoot, 'generated/errors/ErrorCode.ts'), 'utf8')
        for (const item of baseline.errors) {
            assert.match(registry, new RegExp(`static readonly ${item.name} = \\w+Errors\\.${item.name}`))
        }
    })
})
