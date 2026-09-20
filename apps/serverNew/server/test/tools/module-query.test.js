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
                'gong/GongSkillUp',
                '--json',
            ],
            { cwd: projectRoot, encoding: 'utf8' },
        )

        assert.strictEqual(result.status, 0, result.stderr)
        const action = JSON.parse(result.stdout)
        assert.strictEqual(action.route, 'gong/GongSkillUp')
        assert.strictEqual(action.action, 'src/modules/gong/action/ActionGongSkillUp.ts')
        assert.ok(action.directDependencies.includes('src/modules/gong/action/GongProgression.ts'))
        assert.ok(action.dependencies.includes('src/modules/gong/action/GongProgression.ts'))
        assert.ok(action.configTables.includes('gong_sorcery'))
        assert.deepStrictEqual(action.tests, ['test/modules/gong/behavior.test.js'])
        assert.strictEqual(action.readme, 'README.md')
        assert.deepStrictEqual(action.framework, [
            'engine/docs/development.md#Action 和本地调用',
            'engine/docs/development.md#Redis Bean 和 Ref',
            'engine/docs/development.md#Change 和持久化',
        ])
        assert.strictEqual(action.verify, 'pnpm verify:module -- gong')
        assert.deepStrictEqual(action.unresolvedImports, [])
    })
})
