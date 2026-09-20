const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { buildInventory, discoverTestFiles } = require('../run-tests')

const projectRoot = path.resolve(__dirname, '../..')

describe('test directory ownership', () => {
    it('maps every test module directory to a real source module', () => {
        const testModules = fs
            .readdirSync(path.join(projectRoot, 'test/modules'), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()

        for (const moduleName of testModules) {
            assert.ok(fs.existsSync(path.join(projectRoot, 'src/modules', moduleName)), moduleName)
        }
        for (const technicalName of ['base', 'managementHttp', 'operations-cli', 'refView', 'telemetry']) {
            assert.ok(!testModules.includes(technicalName), technicalName)
        }
    })

    it('keeps technical tests out of the modules root', () => {
        const rootFiles = fs
            .readdirSync(path.join(projectRoot, 'test/modules'), { withFileTypes: true })
            .filter((entry) => entry.isFile() && /\.test\.(?:js|ts)$/.test(entry.name))
            .map((entry) => entry.name)

        assert.deepStrictEqual(rootFiles, [])
    })

    it('assigns every test file to exactly one stable suite', () => {
        const inventory = buildInventory()
        assert.deepStrictEqual(inventory.allFiles, discoverTestFiles('test'))
        assert.strictEqual(new Set(inventory.allFiles).size, inventory.allFiles.length)
    })
})
