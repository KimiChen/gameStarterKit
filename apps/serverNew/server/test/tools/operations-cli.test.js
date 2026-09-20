const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const root = path.resolve(__dirname, '../..')

describe('operations CLI compatibility', () => {
    it('keeps the current operations entry initialization and command dispatch behavior', () => {
        const source = fs.readFileSync(path.join(root, 'tools/operations/main.ts'), 'utf8')

        assert.match(source, /await initializeApplication\(\{ appType: E_APP_TYPE\.DEFAULT \}\)/)
        assert.match(source, /await \(commands as any\)\[functionName\]\(\)/)
    })

    it('keeps the operations command names stable', () => {
        const source = fs.readFileSync(path.join(root, 'tools/operations/commands.ts'), 'utf8')
        const sourceFile = ts.createSourceFile('commands.ts', source, ts.ScriptTarget.Latest, true)
        const commandNames = sourceFile.statements
            .filter(
                (statement) =>
                    ts.isFunctionDeclaration(statement) &&
                    statement.name &&
                    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
            )
            .map((statement) => statement.name.text)

        assert.deepStrictEqual(commandNames, ['migrationRun', 'errorLogPush', 'repair'])
    })

    it('runs migrations from the current application config', () => {
        const commands = fs.readFileSync(path.join(root, 'tools/operations/commands.ts'), 'utf8')
        const runner = fs.readFileSync(path.join(root, 'src/runtime/persistence/DatabaseMigrationRunner.ts'), 'utf8')

        assert.match(commands, /await ensureDatabaseMigrations\(\)/)
        assert.doesNotMatch(commands, /mysql-tool|config_platform/)
        assert.match(runner, /DB\.client\.client\(\)/)
        assert.match(runner, /dataSource\.migrations\.splice/)
        assert.match(runner, /dataSource\.runMigrations\(\)/)
        assert.doesNotMatch(runner, /config_platform/)
    })

    it('keeps repair and error-log execution contracts stable', () => {
        const repair = fs.readFileSync(path.join(root, 'tools/operations/repair/RepairRunner.ts'), 'utf8')
        const errorLog = fs.readFileSync(path.join(root, 'tools/operations/error-log/ErrorLogMonitor.ts'), 'utf8')

        assert.match(repair, /QueuedLocalAction\.rpc\(\s*ActionRepairScript/)
        assert.match(repair, /sIdsParam\.split\(','\)\.map/)
        assert.match(errorLog, /class ErrorLogMonitor/)
        assert.match(errorLog, /await this\.scanAllInfo\(\)/)
        assert.match(errorLog, /UtilWeixinRobot\.sendWithQueue/)
    })

    it('uses an independent TypeScript project for operations', () => {
        const packageJson = require(path.join(root, 'package.json'))
        const config = JSON.parse(fs.readFileSync(path.join(root, 'tools/operations/tsconfig.json'), 'utf8'))

        assert.match(packageJson.scripts.operations, /tools\/operations\/tsconfig\.json.*tools\/operations\/main\.ts/)
        assert.match(packageJson.scripts['编译operations'], /tools\/operations\/tsconfig\.json/)
        assert.strictEqual(config.extends, '../../tsconfig.json')
        assert.ok(config.include.includes('./**/*.ts'))
    })
})
