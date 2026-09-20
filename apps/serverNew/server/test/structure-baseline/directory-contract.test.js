const assert = require('assert')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const audit = require('../../scripts/structure-baseline/directory-contract.json')

assert.strictEqual(audit.schemaVersion, 2)

const actualSourceDirectories = fs
    .readdirSync(path.join(projectRoot, 'src'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `src/${entry.name}`)
    .sort()
assert.deepStrictEqual(actualSourceDirectories, [...audit.sourceLayout.directories].sort())

for (const relativePath of audit.sourceLayout.entryFiles) requireProjectPath(relativePath, 'file')
for (const relativePath of audit.rootBoundaries.requiredDirectories) requireProjectPath(relativePath, 'directory')
for (const relativePath of audit.rootBoundaries.generatedTruth) requireProjectPath(relativePath, 'directory')
requireProjectPath(audit.rootBoundaries.operationsTruth, 'directory')
const packageScripts = require('../../package.json').scripts
const buildScript = fs.readFileSync(path.join(projectRoot, 'scripts/build/package-release.sh'), 'utf8')
const rootTsconfig = readJson('tsconfig.json')
const operationsTsconfig = readJson(audit.buildContracts.operationsTsconfig)

assert.match(packageScripts['编译js'], /tspc --incremental false/)
assert.match(packageScripts['编译operations'], /tools\/operations\/tsconfig\.json/)
assert.match(packageScripts.operations, /tools\/operations\/main\.ts/)
assert.ok(
    !rootTsconfig.include.some((entry) => entry.startsWith('tools/')),
    'service/http tsconfig must not scan root tools',
)
assert.strictEqual(operationsTsconfig.extends, '../../tsconfig.json')
assert.ok(operationsTsconfig.include.includes('./**/*.ts'))
assert.match(buildScript, new RegExp(`${escapeRegExp(audit.buildContracts.operationsEntry)} -o dist/tool`))
assert.ok(!buildScript.includes('build/compiled/alloy-server/src/operations/'))

console.log('directory contract valid')

function requireProjectPath(relativePath, type) {
    const stats = fs.statSync(path.join(projectRoot, relativePath), { throwIfNoEntry: false })
    assert.ok(stats, `missing ${type}: ${relativePath}`)
    assert.strictEqual(
        type === 'file' ? stats.isFile() : stats.isDirectory(),
        true,
        `expected ${type}: ${relativePath}`,
    )
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'))
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
