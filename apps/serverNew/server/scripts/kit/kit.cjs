const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDefault = path.resolve(__dirname, '../../../../..')
const lockRoot = 'apps/serverNew/server/kits-installed'
const schemaRoot = 'apps/shared/schema/protocols/C2S'
const moduleRoot = 'apps/serverNew/server/src/modules'

function safePath(root, relative) {
    if (path.isAbsolute(relative) || relative.split('/').some((part) => part === '..' || part === '.' || !part)) {
        throw new Error(`invalid package path: ${relative}`)
    }
    const base = path.resolve(root)
    let current = base
    for (const part of relative.split('/').slice(0, -1)) {
        current = path.join(current, part)
        if (!fs.existsSync(current)) continue
        const stat = fs.lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe package parent: ${current}`)
    }
    return path.join(base, relative)
}

function requireRegularFile(file) {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`regular file required: ${file}`)
    return fs.readFileSync(file)
}

function digest(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex')
}

function removeOwnedFile(root, relative) {
    const target = safePath(root, relative)
    fs.rmSync(target)
    const boundary = path.join(root, relative.startsWith(`${moduleRoot}/`) ? moduleRoot : schemaRoot)
    for (let directory = path.dirname(target); directory !== boundary; directory = path.dirname(directory)) {
        try {
            fs.rmdirSync(directory)
        } catch (error) {
            if (error.code === 'ENOTEMPTY' || error.code === 'ENOENT') break
            throw error
        }
    }
}

function readManifest(source) {
    const manifest = JSON.parse(requireRegularFile(path.join(source, 'kit.json')))
    if (!/^[a-z][A-Za-z0-9]{0,63}$/.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        throw new Error('invalid kit identity or version')
    }
    if (manifest.domain !== manifest.id || manifest.module !== manifest.id) {
        throw new Error('kit domain and module must match its id')
    }
    if (
        !Array.isArray(manifest.files) ||
        manifest.files.length < 3 ||
        new Set(manifest.files).size !== manifest.files.length
    ) {
        throw new Error('kit files must be a nonempty unique list')
    }
    validateOwnedPaths(manifest.id, manifest.files)
    for (const relative of manifest.files) requireRegularFile(safePath(path.join(source, 'files'), relative))
    const expectedSchema = `${schemaRoot}/${manifest.id}.json`
    const schema = JSON.parse(requireRegularFile(safePath(path.join(source, 'files'), expectedSchema)))
    if (
        schema.domain !== manifest.domain ||
        !Array.isArray(schema.apis) ||
        schema.apis.length === 0 ||
        schema.apis.some(
            (api) =>
                api.ownerModule !== manifest.module ||
                !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(api.name) ||
                !api.route?.startsWith(`${manifest.domain}.`) ||
                !manifest.files.includes(`${moduleRoot}/${manifest.id}/action/Action${api.name}.ts`),
        )
    ) {
        throw new Error('kit schema domain, Action owner or packaged Action mismatch')
    }
    return manifest
}

function validateOwnedPaths(id, files) {
    const expectedSchema = `${schemaRoot}/${id}.json`
    const expectedModule = `${moduleRoot}/${id}/${id[0].toUpperCase()}${id.slice(1)}Module.ts`
    if (!files.includes(expectedSchema) || !files.includes(expectedModule)) {
        throw new Error('kit must own its schema and module descriptor')
    }
    for (const relative of files) {
        if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || relative.includes('//')) {
            throw new Error(`invalid package path: ${relative}`)
        }
        if (relative !== expectedSchema && !relative.startsWith(`${moduleRoot}/${id}/`)) {
            throw new Error(`kit cannot own host path: ${relative}`)
        }
    }
}

function inventory(source, manifest) {
    return Object.fromEntries(
        manifest.files.map((relative) => [
            relative,
            digest(requireRegularFile(safePath(path.join(source, 'files'), relative))),
        ]),
    )
}

function run(root, executable, args, cwd = root) {
    const result = spawnSync(executable, args, { cwd, stdio: 'inherit', env: process.env })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${executable} ${args.join(' ')} exited with ${result.status}`)
}

function refresh(root, removedDomain) {
    run(root, 'node', [
        '--import',
        'tsx',
        'tools/lobby-protocol/cli.ts',
        ...(removedDomain ? ['--allow-delete', removedDomain] : []),
    ])
    run(root, 'pnpm', ['generate'], path.join(root, 'apps/serverNew/server'))
}

function pack(source, destination) {
    const manifest = readManifest(source)
    if (fs.existsSync(destination)) throw new Error(`output already exists: ${destination}`)
    const temporary = `${destination}.tmp-${process.pid}`
    try {
        fs.mkdirSync(temporary, { recursive: true })
        for (const relative of manifest.files) {
            const target = path.join(temporary, 'files', relative)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(safePath(path.join(source, 'files'), relative), target)
        }
        fs.writeFileSync(
            path.join(temporary, 'kit.json'),
            JSON.stringify({ ...manifest, hashes: inventory(source, manifest) }, null, 2) + '\n',
        )
        fs.renameSync(temporary, destination)
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
    }
}

function installedLock(root, id) {
    if (!/^[a-z][A-Za-z0-9]{0,63}$/.test(id)) throw new Error(`invalid kit id: ${id}`)
    return path.join(root, lockRoot, `${id}.lock.json`)
}

function install(root, source) {
    const manifest = readManifest(source)
    const lockPath = installedLock(root, manifest.id)
    if (fs.existsSync(lockPath)) throw new Error(`kit is installed: ${manifest.id}`)
    const hashes = inventory(source, manifest)
    if (JSON.stringify(hashes) !== JSON.stringify(manifest.hashes))
        throw new Error('package hashes mismatch; pack the kit first')
    for (const relative of manifest.files) {
        if (fs.existsSync(safePath(root, relative))) throw new Error(`host path already exists: ${relative}`)
    }
    const copied = []
    try {
        for (const relative of manifest.files) {
            const target = safePath(root, relative)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(safePath(path.join(source, 'files'), relative), target, fs.constants.COPYFILE_EXCL)
            copied.push(relative)
        }
        refresh(root)
        fs.mkdirSync(path.dirname(lockPath), { recursive: true })
        fs.writeFileSync(
            lockPath,
            JSON.stringify({ id: manifest.id, version: manifest.version, files: hashes }, null, 2) + '\n',
            { flag: 'wx' },
        )
    } catch (error) {
        for (const relative of copied.reverse()) removeOwnedFile(root, relative)
        try {
            refresh(root, manifest.domain)
        } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'kit install rollback failed')
        }
        throw error
    }
}

function check(root, id) {
    const lock = JSON.parse(requireRegularFile(installedLock(root, id)))
    if (lock.id !== id || !lock.files || typeof lock.files !== 'object') throw new Error('invalid installed lock')
    validateOwnedPaths(id, Object.keys(lock.files))
    for (const [relative, hash] of Object.entries(lock.files)) {
        if (digest(requireRegularFile(safePath(root, relative))) !== hash)
            throw new Error(`installed kit file changed: ${relative}`)
    }
    run(root, 'node', ['--import', 'tsx', 'tools/lobby-protocol/cli.ts', '--check'])
    run(root, 'pnpm', ['gen:modules:check'], path.join(root, 'apps/serverNew/server'))
    run(root, 'pnpm', ['check:lobby-contract'], path.join(root, 'apps/serverNew/server'))
}

function uninstall(root, id) {
    check(root, id)
    const lockPath = installedLock(root, id)
    const lock = JSON.parse(requireRegularFile(lockPath))
    const originals = new Map(
        Object.keys(lock.files).map((relative) => [relative, requireRegularFile(safePath(root, relative))]),
    )
    try {
        for (const relative of [...originals.keys()].reverse()) removeOwnedFile(root, relative)
        refresh(root, id)
        fs.rmSync(lockPath)
    } catch (error) {
        for (const [relative, content] of originals) {
            const target = safePath(root, relative)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.writeFileSync(target, content)
        }
        try {
            refresh(root)
        } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'kit uninstall rollback failed')
        }
        throw error
    }
}

function main(args) {
    const [command, ...rest] = args
    const rootIndex = rest.indexOf('--root')
    if (rootIndex >= 0 && (!rest[rootIndex + 1] || rest[rootIndex + 1].startsWith('--'))) {
        throw new Error('--root requires a path')
    }
    const root = rootIndex < 0 ? rootDefault : path.resolve(rest.splice(rootIndex, 2)[1])
    const value = rest[0]
    if (!value || rest.length !== (command === 'pack' ? 3 : 1)) {
        throw new Error(
            'usage: kit <pack <source> --out-dir <destination>|install <artifact>|check <id>|uninstall <id>> [--root <host>]',
        )
    }
    if (command === 'pack' && rest[1] === '--out-dir') pack(path.resolve(value), path.resolve(rest[2]))
    else if (command === 'install') install(root, path.resolve(value))
    else if (command === 'check') check(root, value)
    else if (command === 'uninstall') uninstall(root, value)
    else throw new Error(`unknown kit command: ${command}`)
    console.log(`[kit] ${command} ${value}: ok`)
}

if (require.main === module) {
    try {
        main(process.argv.slice(2))
    } catch (error) {
        console.error(error)
        process.exitCode = 1
    }
}

module.exports = { pack, install, check, uninstall }
