const assert = require('assert')
const childProcess = require('child_process')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

describe('module library', () => {
    it('reads archived package payload without loading its active source', () => {
        const result = childProcess.spawnSync(
            'pnpm',
            [
                'exec',
                'ts-node',
                '--project',
                'scripts/tsconfig.json',
                'scripts/modules/ModuleLibraryCommand.ts',
                'audit',
                'test',
                '--json',
            ],
            { cwd: projectRoot, encoding: 'utf8' },
        )

        assert.strictEqual(result.status, 0, result.stderr)
        const [plan] = JSON.parse(result.stdout)
        assert.deepStrictEqual(plan.memberReferences, [])
        assert.deepStrictEqual(plan.incomingReferences, [])
        assert.ok(plan.files.includes('test/bean-compile/runtime-equivalence.test.ts'))
    })
})
