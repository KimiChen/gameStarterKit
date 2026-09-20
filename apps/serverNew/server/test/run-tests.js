const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const mochaConfig = 'test/mocha.config.cjs'
const suiteDefinitions = [
    { id: 'bean-compile', name: 'Bean compile', roots: ['test/bean-compile'] },
    { id: 'modules', name: 'Business modules', roots: ['test/modules'] },
    { id: 'generator', name: 'Generators', roots: ['test/generator'] },
    { id: 'telemetry', name: 'Telemetry', roots: ['test/telemetry'] },
    { id: 'http', name: 'Management HTTP', roots: ['test/http'] },
    { id: 'runtime', name: 'Runtime', roots: ['test/runtime'] },
    { id: 'startup', name: 'Startup', roots: ['test/startup'] },
    { id: 'structure', name: 'Structure contracts', roots: ['test/structure-baseline'] },
    { id: 'tools', name: 'Tools', roots: ['test/tools'] },
    {
        id: 'errorcode',
        name: 'Error codes',
        roots: ['test/errorcode'],
        before: [
            'pnpm',
            ['exec', 'ts-node', '--project', 'scripts/tsconfig.json', 'scripts/errorcode/checkErrorCodes.ts'],
        ],
    },
]

if (require.main === module) {
    try {
        main(process.argv.slice(2))
    } catch (error) {
        console.error(`[tests] ${error.message}`)
        process.exitCode = 1
    }
}

function main(args) {
    const options = parseArguments(args)
    const inventory = buildInventory()

    if (options.help) {
        printHelp()
        return
    }
    if (options.list) {
        printInventory(inventory)
        return
    }

    if (options.file) {
        runFiles('file', [validateRequestedFile(options.file, inventory)], options)
        return
    }
    if (options.module) {
        runModule(options.module, inventory, options)
        return
    }

    const selectedIds =
        options.suites.length > 0 ? new Set(options.suites) : new Set(suiteDefinitions.map(({ id }) => id))
    for (const id of selectedIds) {
        if (!suiteDefinitions.some((suite) => suite.id === id)) throw new Error(`unknown suite: ${id}`)
    }
    runSuites(
        suiteDefinitions.filter((suite) => selectedIds.has(suite.id)),
        inventory,
        options,
    )
}

function parseArguments(args) {
    args = args.filter((argument) => argument !== '--')
    const options = { suites: [] }
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]
        if (argument === '--help' || argument === '-h') {
            options.help = true
        } else if (argument === '--list') {
            options.list = true
        } else if (argument === '--skip-bean-validation') {
            options.skipBeanValidation = true
        } else if (argument === '--suite') {
            const values = readValues(args, index + 1)
            if (values.length === 0) throw new Error('--suite requires at least one suite id')
            options.suites.push(...values)
            index += values.length
        } else if (argument === '--module') {
            const value = args[index + 1]
            if (!value || value.startsWith('-')) throw new Error('--module requires a module name')
            options.module = value
            index += 1
        } else if (argument === '--file') {
            const value = args[index + 1]
            if (!value || value.startsWith('-')) throw new Error('--file requires a test file path')
            options.file = value
            index += 1
        } else {
            throw new Error(`unknown argument: ${argument}`)
        }
    }

    const selectors = [options.suites.length > 0, Boolean(options.module), Boolean(options.file)].filter(Boolean).length
    if (selectors > 1) throw new Error('--suite, --module and --file cannot be combined')
    if (options.list && selectors > 0) throw new Error('--list cannot be combined with a test selector')
    return options
}

function readValues(args, start) {
    const values = []
    for (let index = start; index < args.length && !args[index].startsWith('-'); index += 1) values.push(args[index])
    return values
}

function buildInventory() {
    validateModuleOwnership()
    const allFiles = discoverTestFiles('test')
    const bySuite = new Map()
    const owners = new Map()

    for (const suite of suiteDefinitions) {
        const files = suite.roots.flatMap(discoverTestFiles).sort()
        if (files.length === 0 && suite.id !== 'startup') throw new Error(`suite has no tests: ${suite.id}`)
        bySuite.set(suite.id, files)
        for (const file of files) {
            if (owners.has(file)) throw new Error(`test belongs to multiple suites: ${file}`)
            owners.set(file, suite.id)
        }
    }

    const uncovered = allFiles.filter((file) => !owners.has(file))
    if (uncovered.length > 0) throw new Error(`tests are not assigned to a suite:\n${uncovered.join('\n')}`)
    return { allFiles, bySuite, modules: discoverBusinessModules() }
}

function validateModuleOwnership() {
    const modulesRoot = path.join(projectRoot, 'test/modules')
    for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
        if (entry.isFile() && isTestFile(entry.name))
            throw new Error(`technical test at test/modules root: ${entry.name}`)
        if (!entry.isDirectory()) continue
        if (!fs.existsSync(path.join(projectRoot, 'src/modules', entry.name))) {
            throw new Error(`test module has no source module: ${entry.name}`)
        }
    }
}

function discoverBusinessModules() {
    const modulesRoot = path.join(projectRoot, 'test/modules')
    return fs
        .readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => discoverTestFiles(`test/modules/${name}`).length > 0)
        .sort()
}

function discoverTestFiles(relativeRoot) {
    const root = path.join(projectRoot, relativeRoot)
    if (!fs.existsSync(root)) return []
    return walk(root)
        .filter((file) => isTestFile(file))
        .map((file) => normalizePath(path.relative(projectRoot, file)))
        .sort()
}

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(file) : [file]
    })
}

function isTestFile(file) {
    return /\.test\.(?:js|ts)$/.test(file)
}

function runSuites(suites, inventory, options) {
    const typescript = []
    for (const suite of suites) {
        const files = inventory.bySuite.get(suite.id)
        if (files.length === 0) throw new Error(`suite has no matching tests: ${suite.id}`)
        console.log(`\n[tests:${suite.id}] ${suite.name}`)
        if (suite.before) run(suite.before[0], suite.before[1])
        console.log(`[tests:${suite.id}] ${files.length} file(s)`)
        const javascript = files.filter((file) => file.endsWith('.js'))
        if (javascript.length > 0) run('pnpm', ['exec', 'mocha', '--config', mochaConfig, ...javascript])
        typescript.push(...files.filter((file) => file.endsWith('.ts')))
    }
    if (typescript.length > 0) runTypescriptFiles('selected-suites', [...new Set(typescript)], options)
}

function runModule(moduleName, inventory, options) {
    if (!fs.existsSync(path.join(projectRoot, 'src/modules', moduleName)))
        throw new Error(`unknown module: ${moduleName}`)
    if (!inventory.modules.includes(moduleName)) throw new Error(`module has no tests: ${moduleName}`)
    runFiles(`module:${moduleName}`, discoverTestFiles(`test/modules/${moduleName}`), options)
}

function validateRequestedFile(requested, inventory) {
    const normalized = normalizePath(path.normalize(requested).replace(/^\.\//, ''))
    if (!normalized.startsWith('test/')) throw new Error(`test file must be under test/: ${requested}`)
    if (!inventory.allFiles.includes(normalized)) throw new Error(`unknown test file: ${requested}`)
    return normalized
}

function runFiles(label, files, options) {
    if (files.length === 0) throw new Error(`no tests matched: ${label}`)
    const javascript = files.filter((file) => file.endsWith('.js'))
    const typescript = files.filter((file) => file.endsWith('.ts'))
    console.log(`[tests:${label}] ${files.length} file(s)`)
    if (javascript.length > 0) run('pnpm', ['exec', 'mocha', '--config', mochaConfig, ...javascript])
    if (typescript.length > 0) runTypescriptFiles(label, typescript, options)
}

function runTypescriptFiles(label, files, options) {
    console.log(`[tests:${label}:typescript] ${files.length} file(s), single compiled run`)
    run('node', [
        'scripts/bean-compile/run-compiled-tests.js',
        ...(options.skipBeanValidation ? ['--skip-bean-validation'] : []),
        ...files,
    ])
}

function run(command, args) {
    const result = childProcess.spawnSync(command, args, {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 1}`)
}

function printInventory(inventory) {
    console.log('Suites:')
    for (const suite of suiteDefinitions) console.log(`  ${suite.id}: ${inventory.bySuite.get(suite.id).length}`)
    console.log('Business modules:')
    for (const moduleName of inventory.modules) console.log(`  ${moduleName}`)
    console.log('Test files:')
    for (const file of inventory.allFiles) console.log(`  ${file}`)
}

function printHelp() {
    console.log(`Usage:
  pnpm test
  pnpm test -- --list
  pnpm test:suite -- startup
  pnpm test:module -- user
  pnpm test:file -- test/modules/user/compatibility.test.js

Selectors:
  --suite <id...>   Run one or more suites in the fixed suite order
  --module <name>   Run one real business module test directory
  --file <path>     Run one JavaScript or TypeScript test file
  --skip-bean-validation
                    Skip Bean validation when the caller already completed it
  --list            List suites, business modules and test files
  --help            Show this help`)
}

function normalizePath(file) {
    return file.replaceAll(path.sep, '/')
}

module.exports = { buildInventory, discoverTestFiles, parseArguments, suiteDefinitions }
