const childProcess = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const temporaryWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-generated-check-'))
const temporaryProject = path.join(temporaryWorkspace, 'alloy-demo', 'alloy-server')

try {
    copyWorkingTree()
    linkDevelopmentDependencies()
    runGeneration()
    const differences = [...compareTree('generated'), ...compareTree('src')]
    if (differences.length > 0) {
        throw new Error(
            `生成产物与源码不一致，请运行 pnpm generate 并提交结果:\n${[...new Set(differences)]
                .sort()
                .map((filePath) => `- ${filePath}`)
                .join('\n')}`,
        )
    }
    console.log('生成产物只读一致性检查通过')
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
} finally {
    fs.rmSync(temporaryWorkspace, { recursive: true, force: true })
}

function copyWorkingTree() {
    fs.mkdirSync(temporaryProject, { recursive: true })
    const result = childProcess.spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: projectRoot,
        encoding: 'buffer',
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`git ls-files exited with status ${result.status ?? 1}`)
    for (const relativePath of result.stdout.toString('utf8').split('\0').filter(Boolean)) {
        const source = path.join(projectRoot, relativePath)
        if (!fs.existsSync(source)) continue
        const target = path.join(temporaryProject, relativePath)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        const stats = fs.lstatSync(source)
        if (stats.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(source), target)
        else if (stats.isFile()) fs.copyFileSync(source, target)
    }
}

function linkDevelopmentDependencies() {
    fs.symlinkSync(path.resolve(projectRoot, '../../shared'), path.join(temporaryWorkspace, 'shared'), 'dir')
    fs.symlinkSync(path.join(projectRoot, 'node_modules'), path.join(temporaryProject, 'node_modules'), 'dir')
    const engineRoot = path.resolve(projectRoot, '../engine')
    if (!fs.existsSync(engineRoot)) throw new Error(`缺少 serverNew 的 engine: ${engineRoot}`)
    // server/tsconfig 从项目同级的 engine 解析，而 generator 的独立 tsconfig
    // 仍以临时工作区根为锚点包含 engine typings；两处都链接到同一迁入源。
    fs.symlinkSync(engineRoot, path.join(temporaryWorkspace, 'engine'), 'dir')
    fs.symlinkSync(engineRoot, path.join(path.dirname(temporaryProject), 'engine'), 'dir')
}

function runGeneration() {
    const result = childProcess.spawnSync('pnpm', ['generate'], {
        cwd: temporaryProject,
        env: process.env,
        stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`临时工作区生成失败，退出码 ${result.status ?? 1}`)
}

function compareTree(relativePath) {
    const current = path.join(projectRoot, relativePath)
    const generated = path.join(temporaryProject, relativePath)
    const currentFiles = collectRelativeFiles(current)
    const generatedFiles = collectRelativeFiles(generated)
    const files = new Set([...currentFiles, ...generatedFiles])
    const differences = []
    for (const file of files) {
        const currentFile = currentFiles.size === 1 && currentFiles.has('') ? current : path.join(current, file)
        const generatedFile =
            generatedFiles.size === 1 && generatedFiles.has('') ? generated : path.join(generated, file)
        if (!fs.existsSync(currentFile) || !fs.existsSync(generatedFile)) {
            differences.push(normalize(path.join(relativePath, file)))
            continue
        }
        if (!fs.readFileSync(currentFile).equals(fs.readFileSync(generatedFile))) {
            differences.push(normalize(path.join(relativePath, file)))
        }
    }
    return differences
}

function collectRelativeFiles(root) {
    if (!fs.existsSync(root)) return new Set()
    if (fs.statSync(root).isFile()) return new Set([''])
    const files = []
    walk(root, files)
    return new Set(files.map((filePath) => normalize(path.relative(root, filePath))))
}

function walk(directory, result) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === '.DS_Store') continue
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(filePath, result)
        else if (entry.isFile()) result.push(filePath)
    }
}

function normalize(filePath) {
    return filePath.replaceAll(path.sep, '/')
}
