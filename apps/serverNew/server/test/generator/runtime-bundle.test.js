const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

describe('runtime bundle preparation', () => {
    let prepareRuntime
    let temporary
    before(async () => {
        ;({ prepareRuntime } = await import(
            pathToFileURL(path.resolve(__dirname, '../../scripts/build/build-alloy-core-runtime.mjs')).href
        ))
    })
    beforeEach(() => {
        temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-build-test-'))
    })
    afterEach(() => {
        fs.rmSync(temporary, { recursive: true, force: true })
    })

    function source(script) {
        const core = path.join(temporary, 'core')
        fs.mkdirSync(path.join(core, 'tools'), { recursive: true })
        fs.writeFileSync(path.join(core, 'tools/build-runtime-bundle.mjs'), script)
        return { ...process.env, ALLOY_CORE_ROOT: core, ALLOY_CORE_RUNTIME_PREBUILT: '0' }
    }

    it('uses the explicit source root and passes the correct build destination', () => {
        const env = source(
            "import fs from 'node:fs'; fs.writeFileSync('arguments.json',JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));",
        )
        prepareRuntime(temporary, 'development', env)
        const recorded = JSON.parse(fs.readFileSync(path.join(env.ALLOY_CORE_ROOT, 'arguments.json')))
        assert.equal(fs.realpathSync(recorded.cwd), fs.realpathSync(env.ALLOY_CORE_ROOT))
        assert.deepEqual(recorded.args, ['--outdir', path.join(temporary, 'build/alloy-core')])
        prepareRuntime(temporary, 'production', env)
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.ALLOY_CORE_ROOT, 'arguments.json'))).args, [
            '--outdir',
            path.join(temporary, 'dist/app/runtime'),
        ])
    })

    it('reports a failed builder instead of accepting stale artifacts', () => {
        assert.throws(() => prepareRuntime(temporary, 'development', source('process.exit(17)')), /exit=17/)
    })

    it('reports missing source and requires both explicitly selected prebuilt artifacts', () => {
        assert.throws(() => prepareRuntime(temporary, 'development', { ALLOY_CORE_ROOT: temporary }), /ALLOY_CORE_ROOT/)
        const env = { ...process.env, ALLOY_CORE_RUNTIME_PREBUILT: '1' }
        assert.throws(() => prepareRuntime(temporary, 'development', env), /index\.mjs/)
        fs.mkdirSync(path.join(temporary, 'build/alloy-core'), { recursive: true })
        fs.writeFileSync(path.join(temporary, 'build/alloy-core/index.mjs'), 'export class RuntimeServer {}')
        assert.throws(() => prepareRuntime(temporary, 'development', env), /ts_swoole_runtime_state\.node/)
    })

    it('never accepts prebuilt mode for a production build', () => {
        assert.throws(() => prepareRuntime(temporary, 'production', { ALLOY_CORE_RUNTIME_PREBUILT: '1' }), /production/)
    })
})
