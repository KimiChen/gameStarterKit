const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { stripCompiledSourceMaps } = require('../../scripts/bean-compile/stripCompiledSourceMaps')

describe('stripCompiledSourceMaps', () => {
    let outputRoot

    beforeEach(() => {
        outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-compiled-source-maps-'))
    })

    afterEach(() => {
        fs.rmSync(outputRoot, { recursive: true, force: true })
    })

    it('removes maps and JavaScript mapping comments', () => {
        const javaScriptFile = path.join(outputRoot, 'main.js')
        const orphanJavaScriptFile = path.join(outputRoot, 'orphan.js')
        fs.writeFileSync(javaScriptFile, 'module.exports = {}\n//# sourceMappingURL=main.js.map\n')
        fs.writeFileSync(javaScriptFile + '.map', '{}')
        fs.writeFileSync(orphanJavaScriptFile, 'module.exports = {}\n//# sourceMappingURL=missing.js.map\n')

        assert.deepStrictEqual(stripCompiledSourceMaps(outputRoot), {
            removedMaps: 1,
            strippedJavaScriptFiles: 2,
        })
        assert.strictEqual(fs.existsSync(javaScriptFile + '.map'), false)
        assert.strictEqual(fs.readFileSync(javaScriptFile, 'utf8'), 'module.exports = {}\n')
        assert.strictEqual(fs.readFileSync(orphanJavaScriptFile, 'utf8'), 'module.exports = {}\n')
    })

    it('keeps compiled JavaScript commands source-map-free', () => {
        const scripts = require('../../package.json').scripts

        assert.ok(scripts['编译js'].includes('stripCompiledSourceMaps.js'))
        assert.ok(scripts['编译operations'].includes('stripCompiledSourceMaps.js'))
        assert.ok(!scripts['启动service-js'].includes('--enable-source-maps'))
        assert.ok(!scripts['启动http-js'].includes('--enable-source-maps'))
    })
})
