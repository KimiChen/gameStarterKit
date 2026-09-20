const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

// Links compiled server output to the compiled engine and its runtime dependencies.
function wireCompiledRuntime(outputRootValue) {
    const outputRoot = path.resolve(projectRoot, outputRootValue)
    const compiledServerRoot = path.join(outputRoot, 'server')
    const compiledEngineRoot = path.join(outputRoot, 'engine')
    const compiledEngineSource = path.join(compiledEngineRoot, 'src')
    const engineModules = path.resolve(projectRoot, '../engine/node_modules')

    requireDirectory(compiledServerRoot, '业务编译目录')
    requireDirectory(compiledEngineSource, '引擎编译目录')
    requireDirectory(engineModules, '引擎依赖目录')

    linkDirectory(compiledEngineSource, path.join(compiledServerRoot, 'node_modules', '@arthropoda', 'game-engine'))
    linkDirectory(engineModules, path.join(compiledEngineRoot, 'node_modules'))
}

function requireDirectory(directory, label) {
    if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`[Bean编译] ${label}不存在: ${directory}`)
    }
}

function linkDirectory(target, linkPath) {
    const relativeTarget = path.relative(path.dirname(linkPath), target) || '.'
    const current = fs.lstatSync(linkPath, { throwIfNoEntry: false })
    if (current?.isSymbolicLink()) {
        const resolvedCurrent = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath))
        if (resolvedCurrent === target) return
    }
    if (current) fs.rmSync(linkPath, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(linkPath), { recursive: true })
    fs.symlinkSync(relativeTarget, linkPath, 'dir')
}

module.exports = { wireCompiledRuntime }

if (require.main === module) {
    wireCompiledRuntime(process.argv[2] ?? 'build/compiled')
}
