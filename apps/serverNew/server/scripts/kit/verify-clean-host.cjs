const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { pack } = require('./kit.cjs')

const repositoryRoot = path.resolve(__dirname, '../../../../..')
const serverRoot = path.join(repositoryRoot, 'apps/serverNew/server')
const host = fs.mkdtempSync(path.join(os.tmpdir(), 'servernew-kit-host-'))
const excluded = new Set(['node_modules', 'build', 'dist', 'coverage', 'module-library', 'log', 'logs', 'output'])

function copy(source, destination) {
    fs.cpSync(source, destination, {
        recursive: true,
        filter: (entry) => entry === source || !excluded.has(path.basename(entry)),
    })
}

function run(executable, args, cwd = host) {
    const result = spawnSync(executable, args, { cwd, stdio: 'inherit', env: process.env })
    if (result.error) throw result.error
    assert.equal(result.status, 0, `${executable} ${args.join(' ')} failed`)
}

function rejects(executable, args, pattern) {
    const result = spawnSync(executable, args, { cwd: host, encoding: 'utf8', env: process.env })
    assert.notEqual(result.status, 0, 'command should reject invalid kit state')
    assert.match(result.stderr, pattern)
}

function linkDependency(name, source) {
    const destination = path.join(host, 'node_modules', name)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.symlinkSync(source, destination, 'dir')
}

try {
    copy(serverRoot, path.join(host, 'apps/serverNew/server'))
    copy(path.join(repositoryRoot, 'apps/serverNew/engine'), path.join(host, 'apps/serverNew/engine'))
    copy(path.join(repositoryRoot, 'apps/shared'), path.join(host, 'apps/shared'))
    copy(path.join(repositoryRoot, 'tools/lobby-protocol'), path.join(host, 'tools/lobby-protocol'))
    fs.symlinkSync(path.join(serverRoot, 'node_modules'), path.join(host, 'apps/serverNew/server/node_modules'), 'dir')
    fs.symlinkSync(
        path.join(repositoryRoot, 'apps/serverNew/engine/node_modules'),
        path.join(host, 'apps/serverNew/engine/node_modules'),
        'dir',
    )
    linkDependency('tsx', path.join(repositoryRoot, 'node_modules/tsx'))
    linkDependency('typescript', path.join(repositoryRoot, 'node_modules/typescript'))
    assert.equal(fs.existsSync(path.join(host, 'apps/server')), false, 'legacy server must be absent')

    const artifact = path.join(host, 'kitSample-package')
    pack(path.join(repositoryRoot, 'apps/serverNew/kits/kitSample'), artifact)
    const kit = path.join(host, 'apps/serverNew/server/scripts/kit/kit.cjs')
    const registry = path.join(host, 'apps/shared/src/protocol/lobbyRpc/registry.generated.ts')
    const originalRegistry = fs.readFileSync(registry)
    const schema = path.join(artifact, 'files/apps/shared/schema/protocols/C2S/kitSample.json')
    const originalSchema = fs.readFileSync(schema)
    fs.appendFileSync(schema, '\n')
    rejects('node', [kit, 'install', artifact, '--root', host], /package hashes mismatch/)
    assert.equal(fs.existsSync(path.join(host, 'apps/shared/schema/protocols/C2S/kitSample.json')), false)
    fs.writeFileSync(schema, originalSchema)
    const brokenArtifact = path.join(host, 'invalid-package')
    fs.cpSync(artifact, brokenArtifact, { recursive: true })
    const brokenSchema = path.join(brokenArtifact, 'files/apps/shared/schema/protocols/C2S/kitSample.json')
    const brokenValue = JSON.parse(fs.readFileSync(brokenSchema, 'utf8'))
    brokenValue.types.IKitSamplePingReq.kind = 'invalid'
    const brokenBytes = Buffer.from(JSON.stringify(brokenValue))
    fs.writeFileSync(brokenSchema, brokenBytes)
    const brokenManifest = path.join(brokenArtifact, 'kit.json')
    const brokenLock = JSON.parse(fs.readFileSync(brokenManifest, 'utf8'))
    brokenLock.hashes['apps/shared/schema/protocols/C2S/kitSample.json'] = crypto
        .createHash('sha256')
        .update(brokenBytes)
        .digest('hex')
    fs.writeFileSync(brokenManifest, JSON.stringify(brokenLock))
    rejects('node', [kit, 'install', brokenArtifact, '--root', host], /exited with 1/)
    assert.equal(fs.existsSync(path.join(host, 'apps/shared/schema/protocols/C2S/kitSample.json')), false)
    assert.deepEqual(fs.readFileSync(registry), originalRegistry)
    assert.equal(fs.existsSync(path.join(host, 'apps/serverNew/server/src/modules/kitSample')), false)
    run('node', [kit, 'install', artifact, '--root', host])
    rejects('node', [kit, 'install', artifact, '--root', host], /kit is installed/)
    const installedSchema = path.join(host, 'apps/shared/schema/protocols/C2S/kitSample.json')
    fs.appendFileSync(installedSchema, '\n')
    rejects('node', [kit, 'uninstall', 'kitSample', '--root', host], /installed kit file changed/)
    fs.writeFileSync(installedSchema, originalSchema)
    run('node', [kit, 'check', 'kitSample', '--root', host])
    run('pnpm', ['typecheck'], path.join(host, 'apps/serverNew/server'))
    run('node', ['scripts/kit/verify-kit-sample.cjs'], path.join(host, 'apps/serverNew/server'))
    run('node', [kit, 'uninstall', 'kitSample', '--root', host])
    run('pnpm', ['check:kit-protocol'], path.join(host, 'apps/serverNew/server'))
    assert.deepEqual(fs.readFileSync(registry), originalRegistry)
    run('node', ['scripts/kit/verify-kit-sample.cjs', '--absent'], path.join(host, 'apps/serverNew/server'))
    assert.equal(fs.existsSync(path.join(host, 'apps/serverNew/server/kits-installed/kitSample.lock.json')), false)
    assert.equal(fs.existsSync(path.join(host, 'apps/serverNew/server/src/modules/kitSample')), false)
    console.log('[kit] clean host pack → install → route → start → uninstall → route removal: ok')
} finally {
    fs.rmSync(host, { recursive: true, force: true })
}
