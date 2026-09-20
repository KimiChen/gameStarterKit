const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const distRoot = path.join(projectRoot, 'dist')
const mode = process.argv[2] ?? 'all'
const packageScripts = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts ?? {}
const buildScriptPath = 'scripts/build/package-release.sh'
const dockerfilePath = 'deploy/docker/Dockerfile'
const dockerignorePath = 'deploy/docker/Dockerfile.dockerignore'
const pm2ConfigPath = 'deploy/pm2/development.config.cjs'

if (!['service', 'http', 'all'].includes(mode)) {
    throw new Error(`unsupported build mode: ${mode}`)
}

for (const projectFile of [
    buildScriptPath,
    dockerfilePath,
    dockerignorePath,
    pm2ConfigPath,
    'deploy/pm2/service-control.sh',
    'deploy/pm2/management-http-control.sh',
]) {
    requireProjectFile(projectFile)
}
const gitlabCi = fs.readFileSync(path.join(projectRoot, '.gitlab-ci.yml'), 'utf8')
if (!gitlabCi.includes(`DOCKERFILE_PATH: ./${dockerfilePath}`)) {
    throw new Error(`GitLab CI must use ${dockerfilePath}`)
}
if (!packageScripts.build?.includes(buildScriptPath)) {
    throw new Error(`build script must launch ${buildScriptPath}`)
}
if (!packageScripts['pm2启动service,http服务']?.includes(pm2ConfigPath)) {
    throw new Error(`PM2 script must launch ${pm2ConfigPath}`)
}

const entries = []
if (mode === 'service' || mode === 'all') entries.push('app/index.js')
if (mode === 'http' || mode === 'all') entries.push('http/index.js', 'tool/index.js')

for (const entry of entries) {
    const entryPath = requireFile(entry)
    const result = childProcess.spawnSync(process.execPath, ['--check', entryPath], {
        cwd: projectRoot,
        encoding: 'utf8',
    })
    if (result.status !== 0) {
        process.stderr.write(result.stderr)
        throw new Error(`bundle syntax check failed: ${entry}`)
    }
}

if (mode === 'http' || mode === 'all') {
    for (const sourcePath of [
        'tools/operations/main.ts',
        'tools/operations/commands.ts',
        'tools/operations/error-log/ErrorLogMonitor.ts',
        'tools/operations/repair/RepairRunner.ts',
        'tools/operations/tsconfig.json',
    ]) {
        requireProjectFile(sourcePath)
    }
    const toolBundle = fs.readFileSync(path.join(distRoot, 'tool/index.js'), 'utf8')
    for (const commandName of ['migrationRun', 'errorLogPush', 'repair']) {
        if (!new RegExp(`\\b${commandName}\\b`).test(toolBundle)) {
            throw new Error(`tool bundle is missing command: ${commandName}`)
        }
    }
}

if ((mode === 'service' || mode === 'all') && !packageScripts['service.js测试']?.includes('node dist/app/index.js')) {
    throw new Error('service.js测试 must launch dist/app/index.js')
}
if (mode === 'service' || mode === 'all') {
    requireFile('app/runtime/index.mjs')
    requireFile('build/Release/ts_swoole_runtime_state.node')
}
if ((mode === 'http' || mode === 'all') && !packageScripts['http.js测试']?.includes('node dist/http/index.js')) {
    throw new Error('http.js测试 must launch dist/http/index.js')
}
if (!packageScripts.operations?.includes('tools/operations/main.ts')) {
    throw new Error('operations script must launch tools/operations/main.ts')
}
if (!packageScripts['编译operations']?.includes('tools/operations/tsconfig.json')) {
    throw new Error('编译operations must use the independent operations tsconfig')
}

for (const required of [
    'generated/records/record.json',
    'generated/records/bean.json5',
    'generated/records/proto.json5',
    'generated/adjust/change_document.json5',
    'config/platform.json5',
    'config_game/version.json',
]) {
    requireFile(required)
}

if (mode === 'all') {
    requireFile('pubRestart-service.sh')
    requireFile('pubRestart-http.sh')
    if (fs.existsSync(path.join(distRoot, 'pubRestart.sh'))) {
        throw new Error('all build must not expose an ambiguous pubRestart.sh')
    }
} else {
    requireFile('pubRestart.sh')
}

if (fs.existsSync(path.join(distRoot, 'resources'))) {
    throw new Error('build artifact must not contain resources')
}

const obsoleteClientPath = path.join(distRoot, 'src/forClient')
if (fs.existsSync(obsoleteClientPath)) {
    throw new Error(`obsolete client protocol path remains: ${obsoleteClientPath}`)
}

console.log(`build artifacts verified: ${mode}`)

function requireFile(relativePath) {
    const filePath = path.join(distRoot, relativePath)
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`missing build artifact: ${relativePath}`)
    }
    return filePath
}

function requireProjectFile(relativePath) {
    const filePath = path.join(projectRoot, relativePath)
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`missing project source: ${relativePath}`)
    }
    return filePath
}
