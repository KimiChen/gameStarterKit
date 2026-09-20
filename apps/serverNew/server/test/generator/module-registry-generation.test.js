const assert = require('assert')
const childProcess = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

describe('module registry generation', () => {
    it('adds and removes descriptors without editing a central source list', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-modules-'))
        try {
            writeDescriptor(root, 'alpha')
            generate(root)
            assert.deepStrictEqual(moduleNames(root), ['alpha'])
            assert.deepStrictEqual(moduleSystems(root, 'alpha'), [
                'actions',
                'configuration',
                'cron',
                'errorCodes',
                'events',
                'managementHttp',
                'protocol',
                'session',
                'startup',
                'telemetry',
            ])
            const registryFile = path.join(root, 'generated/modules/GameModuleRegistry.ts')
            const first = fs.readFileSync(registryFile, 'utf8')

            generate(root)
            assert.strictEqual(fs.readFileSync(registryFile, 'utf8'), first)

            writeDescriptor(root, 'beta')
            generate(root)
            assert.deepStrictEqual(moduleNames(root), ['alpha', 'beta'])

            fs.rmSync(path.join(root, 'src/modules/alpha'), { recursive: true, force: true })
            generate(root)
            assert.deepStrictEqual(moduleNames(root), ['beta'])
            assert.doesNotMatch(fs.readFileSync(registryFile, 'utf8'), /AlphaModule/)
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })
})

function writeDescriptor(root, name) {
    const pascal = name.charAt(0).toUpperCase() + name.slice(1)
    const directory = path.join(root, 'src/modules', name)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(
        path.join(directory, `${pascal}Module.ts`),
        `import { defineGameModule } from '../../startup/GameModule'\n` +
            `export const ${pascal}Module = defineGameModule({\n` +
            `  name: '${name}',\n` +
            `  configuration: { initializers: [{ name: '${name}-config', app: 'all', handler: initialize }] },\n` +
            `  protocol: { actionExecutors: [{ kind: 'actionExecutor', name: '${name}-executor', app: 'all', executor }] },\n` +
            `  actions: { attachTasks: [{ name: '${name}-task', app: 'service', task: Task }] },\n` +
            `  events: { actionHandlers: [{ name: '${name}-event', app: 'service', route: '${name}/Enter', handlers: [Handler] }] },\n` +
            `  session: { handlers: [{ name: '${name}-session', app: 'service', handler: session }] },\n` +
            `  telemetry: { providers: [{ name: '${name}-telemetry', app: 'service', provider }] },\n` +
            `  managementHttp: { controllers: [{ kind: 'controller', name: '${name}-controller', app: 'management', controller: Controller }] },\n` +
            `  cron: [{ name: '${name}-cron', app: 'service', schedule: '* * * * * *', handler: runCron }],\n` +
            `  startup: [{ name: '${name}-startup', app: 'service', phase: 'runtime-ready', scope: 'process', run: startup }],\n` +
            `  errorCodes: { namePrefixes: ['${pascal}'] },\n` +
            `})\n`,
    )
}

function generate(root) {
    childProcess.execFileSync(
        'pnpm',
        [
            'exec',
            'ts-node',
            '--project',
            'scripts/tsconfig.json',
            'scripts/modules/GenerateModuleRegistry.ts',
            '--project-root',
            root,
        ],
        { cwd: projectRoot, stdio: 'pipe' },
    )
}

function moduleNames(root) {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'generated/modules/module-catalog.json'), 'utf8'))
    return catalog.modules.map((module) => module.name)
}

function moduleSystems(root, moduleName) {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'generated/modules/module-catalog.json'), 'utf8'))
    return Object.keys(catalog.modules.find((module) => module.name === moduleName).systems).sort()
}
