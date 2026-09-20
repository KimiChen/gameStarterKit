const assert = require('assert')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

describe('module registration boundary', () => {
    it('keeps the generated registry as the only business module import list', () => {
        const generatedRegistry = read('generated/modules/GameModuleRegistry.ts')
        assert.match(generatedRegistry, /src\/modules\//)
        for (const file of [
            'src/main.ts',
            'src/startup/GameModuleCatalog.ts',
            'src/startup/GameRuntimeInitializer.ts',
            'src/startup/initializeApplication.ts',
            'src/http/app.ts',
            'src/http/initializeManagementHttp.ts',
            'scripts/errorcode/ErrorCodeModel.ts',
        ]) {
            const source = read(file)
            assert.doesNotMatch(source, /from\s+['"][^'"]*(?:\.\.\/modules\/|src\/modules\/)/, file)
            assert.doesNotMatch(
                source,
                /configurationModules|protocolActionModules|telemetryModules|managementHttpModules|modulePrefixes/,
                file,
            )
        }
    })

    it('uses static imports and generated JSON instead of runtime source discovery', () => {
        const registry = read('generated/modules/GameModuleRegistry.ts')
        assert.doesNotMatch(registry, /readdir|glob|import\(/)
        assert.match(registry, /import \{ .*Module \} from/)
        assert.ok(fs.existsSync(path.join(projectRoot, 'generated/modules/module-catalog.json')))
    })
})

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}
