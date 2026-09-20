const childProcess = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { wireCompiledRuntime } = require('./wireCompiledRuntime')

const projectRoot = path.resolve(__dirname, '../..')
let exitCode = 0

function main() {
    try {
        const args = process.argv.slice(2)
        const skipBeanValidation = removeFlag(args, '--skip-bean-validation')
        if (!skipBeanValidation) run('pnpm', ['检查Bean编译记录'])
        const requested = args
        const projectConfig =
            requested.length > 0 &&
            requested
                .filter((value) => !value.startsWith('-'))
                .every((value) => value.replace(/\\/g, '/').replace(/^\.\//, '').startsWith('test/bean-compile/'))
                ? 'test/bean-compile/tsconfig.json'
                : 'test/tsconfig.json'
        const cacheName = projectConfig.includes('bean-compile') ? 'bean-compile' : 'all-tests'
        const compileRoot = path.join(projectRoot, 'build/test-compiled', cacheName)
        const signature = compilationSignature(projectConfig, requested)
        const signatureFile = path.join(compileRoot, '.signature')
        const cacheValid =
            fs.existsSync(signatureFile) &&
            fs.readFileSync(signatureFile, 'utf8') === signature &&
            fs.existsSync(path.join(compileRoot, 'server'))

        if (cacheValid) {
            console.log(`[tests] 复用 TypeScript 编译缓存: ${path.relative(projectRoot, compileRoot)}`)
        } else {
            fs.rmSync(compileRoot, { recursive: true, force: true })
            fs.mkdirSync(compileRoot, { recursive: true })
            try {
                run('pnpm', [
                    'exec',
                    'tspc',
                    '-p',
                    projectConfig,
                    '--outDir',
                    compileRoot,
                    '--incremental',
                    'false',
                    '--declaration',
                    'false',
                    '--declarationMap',
                    'false',
                ])
                const compiledEngine = path.join(compileRoot, 'engine', 'src')
                if (fs.existsSync(path.join(compiledEngine, 'index.js'))) wireCompiledRuntime(compileRoot)
                fs.writeFileSync(signatureFile, signature)
            } catch (error) {
                fs.rmSync(compileRoot, { recursive: true, force: true })
                throw error
            }
        }

        const compiledServer = path.join(compileRoot, 'server')
        const compiledEngine = path.join(compileRoot, 'engine', 'src')
        if (projectConfig === 'test/tsconfig.json' && !fs.existsSync(path.join(compiledEngine, 'index.js'))) {
            throw new Error(`测试编译没有生成引擎入口: ${compiledEngine}`)
        }
        const specs =
            requested.length > 0
                ? requested.map((value) => compiledTestArgument(value, compiledServer))
                : [path.join(compiledServer, 'test/**/*.test.js')]
        const nodePath = [
            path.join(projectRoot, 'node_modules'),
            path.join(projectRoot, '../engine/node_modules'),
            process.env.NODE_PATH,
        ]
            .filter(Boolean)
            .join(path.delimiter)
        run('pnpm', ['exec', 'mocha', '--config', 'test/mocha.config.cjs', ...specs], {
            ...process.env,
            NODE_PATH: nodePath,
        })
    } catch (error) {
        if (error instanceof CommandFailure) {
            exitCode = error.exitCode
        } else {
            console.error(error)
            exitCode = 1
        }
    }
    process.exitCode = exitCode
}

if (require.main === module) main()

function compiledTestArgument(value, compiledServer) {
    if (value.startsWith('-')) return value
    const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '')
    const jsPath = normalized.replace(/\.tsx?$/i, '.js')
    return path.join(compiledServer, jsPath)
}

function run(command, args, env = process.env) {
    const result = childProcess.spawnSync(command, args, {
        cwd: projectRoot,
        env,
        stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new CommandFailure(result.status ?? 1)
}

function compilationSignature(projectConfig, requested) {
    const hash = crypto.createHash('sha256')
    hash.update(`cache-version:4\nconfig:${projectConfig}\n`)
    const files = [
        path.join(projectRoot, 'tsconfig.json'),
        path.join(projectRoot, projectConfig),
        path.join(projectRoot, 'package.json'),
        path.join(projectRoot, 'pnpm-lock.yaml'),
        path.join(projectRoot, 'generated/records/record.json'),
        ...walkSourceFiles(path.join(projectRoot, 'scripts/bean-compile')),
        ...compilationInputs(projectConfig),
    ]
    for (const filePath of files.sort()) {
        if (!fs.existsSync(filePath)) continue
        hash.update(filePath)
        hash.update('\0')
        hash.update(fs.readFileSync(filePath))
        hash.update('\0')
    }
    return hash.digest('hex')
}

function compilationInputs(projectConfig) {
    const configPath = path.join(projectRoot, projectConfig)
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), undefined, configPath)
    if (parsed.errors.length > 0) {
        throw new Error(
            parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
        )
    }
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    return program
        .getSourceFiles()
        .filter((sourceFile) => !sourceFile.fileName.includes(`${path.sep}node_modules${path.sep}`))
        .map((sourceFile) => sourceFile.fileName)
}

function walkSourceFiles(directory) {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) return walkSourceFiles(filePath)
        return entry.isFile() && /\.(?:ts|tsx|js|cjs|json|json5)$/.test(entry.name) ? [filePath] : []
    })
}

function removeFlag(values, flag) {
    const index = values.indexOf(flag)
    if (index < 0) return false
    values.splice(index, 1)
    return true
}

function CommandFailure(exitCode) {
    this.exitCode = exitCode
}

module.exports = { compilationInputs, compilationSignature }
