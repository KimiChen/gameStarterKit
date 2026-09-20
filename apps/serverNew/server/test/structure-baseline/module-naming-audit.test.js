const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const {
    auditModuleNames,
    compatibilityAllowlist,
    declaredPrimaryNames,
    discoverModuleNames,
    exportedPrimaryNames,
    sourceRoots,
} = require('../../scripts/naming-audit/audit-module-names')

const report = auditModuleNames()

assert.deepStrictEqual(report.violations, [])
assert.deepStrictEqual(
    report.compatibility,
    [...compatibilityAllowlist]
        .filter(([filePath]) => fs.existsSync(path.resolve(__dirname, '../..', filePath)))
        .flatMap(([filePath, allowance]) =>
            allowance.names.map((name) => `${filePath} -> ${name}: ${allowance.reason}`),
        )
        .sort(),
)
assert.deepStrictEqual(report.coverage.roots, sourceRoots)
assert.deepStrictEqual(report.coverage.modules, discoverModuleNames())
for (const requiredPath of [
    'src/modules/adjust/http/ChangeDocument.ts',
    'src/modules/user/telemetry/UserTelemetryContext.ts',
    'scripts/naming-audit/audit-module-names.js',
    'tools/operations/main.ts',
]) {
    assert.ok(report.coverage.files.includes(requiredPath), `missing naming coverage: ${requiredPath}`)
}

const multiExportSource = ts.createSourceFile(
    'ExampleC2S.ts',
    'export interface ReqOne {}\nexport interface ReqTwo {}',
    ts.ScriptTarget.Latest,
    true,
)
assert.deepStrictEqual(exportedPrimaryNames(multiExportSource), ['ReqOne', 'ReqTwo'])

const localDeclarationSource = ts.createSourceFile(
    'LocalDeclarations.ts',
    [
        'class LocalHelper {}',
        'interface LocalData {}',
        'type LocalInfo = string',
        'function buildCommon() {}',
        'enum LocalBase {}',
        'const SharedLoader = () => undefined',
        'class CleanCapability { runBaseMethod() {} }',
    ].join('\n'),
    ts.ScriptTarget.Latest,
    true,
)
assert.deepStrictEqual(declaredPrimaryNames(localDeclarationSource), [
    'LocalHelper',
    'LocalData',
    'LocalInfo',
    'buildCommon',
    'LocalBase',
    'SharedLoader',
    'CleanCapability',
])

console.log(
    `module naming audit passed across ${report.coverage.files.length} files and ${report.coverage.modules.length} modules with ${report.compatibility.length} explicit compatibility names`,
)
