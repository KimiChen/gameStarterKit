const assert = require('assert')
const childProcess = require('child_process')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

describe('module query', () => {
    it('locates a protocol Action with bounded business context and its validation command', () => {
        const result = childProcess.spawnSync(
            'pnpm',
            [
                'exec',
                'ts-node',
                '--project',
                'scripts/tsconfig.json',
                'scripts/modules/ListModules.ts',
                '--action',
                'income/IncomeClaimOffline',
                '--json',
            ],
            { cwd: projectRoot, encoding: 'utf8' },
        )

        assert.strictEqual(result.status, 0, result.stderr)
        const action = JSON.parse(result.stdout)
        assert.strictEqual(action.route, 'income/IncomeClaimOffline')
        assert.strictEqual(action.request, 'IIncomeClaimOfflineReq')
        assert.strictEqual(action.action, 'src/modules/income/action/ActionIncomeClaimOffline.ts')
        assert.ok(action.directDependencies.includes('src/modules/user/action/CopperIncome.ts'))
        assert.ok(action.dependencies.includes('src/modules/user/action/CopperIncome.ts'))
        assert.deepStrictEqual(action.tests, ['test/modules/income/copper-income.test.ts'])
        assert.strictEqual(action.readme, 'README.md')
        assert.deepStrictEqual(action.framework, ['engine/docs/development.md#Action 和本地调用'])
        assert.strictEqual(action.verify, 'pnpm verify:module -- income')
        assert.deepStrictEqual(action.unresolvedImports, [])
    })
})
