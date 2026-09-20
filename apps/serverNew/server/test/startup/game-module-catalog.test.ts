import 'reflect-metadata'
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { gameModuleSystems, defineGameModule, type GameModuleRegistryEntry } from '../../src/startup/GameModule'
import { GameModuleCatalog, validateGameModules } from '../../src/startup/GameModuleCatalog'
import { resolveApplicationRoot } from '../../src/startup/initializeApplication'

const projectRoot = process.cwd()
const generatedCatalog = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'generated/modules/module-catalog.json'), 'utf8'),
)

describe('GameModuleCatalog', () => {
    it('matches the generated registry and preserves source ownership', () => {
        assert.deepStrictEqual(
            GameModuleCatalog.registry.map(({ moduleName, source }) => ({ moduleName, source })),
            generatedCatalog.modules.map((module: { name: string; source: string }) => ({
                moduleName: module.name,
                source: module.source,
            })),
        )
        for (const entry of GameModuleCatalog.registry) {
            assert.strictEqual(entry.moduleName, entry.module.name)
            assert.ok(Object.isFrozen(entry.module), entry.moduleName)
            assert.ok(fs.existsSync(path.join(projectRoot, entry.source)), entry.source)
        }
    })

    it('keeps system and module queries bidirectionally consistent', () => {
        for (const system of gameModuleSystems) {
            const entries = GameModuleCatalog.systems[system].entries
            assert.deepStrictEqual(GameModuleCatalog.getSystemModules(system), [
                ...new Set(entries.map((entry) => entry.moduleName)),
            ])
            for (const entry of entries) {
                const moduleEntries = GameModuleCatalog.getModuleContributions(entry.moduleName)[system]
                assert.ok(moduleEntries?.includes(entry as never), `${system}:${entry.moduleName}`)
            }
        }
        assert.throws(() => GameModuleCatalog.getModuleContributions('missing-module'), /unknown game module/)
    })

    it('keeps generated metadata aligned with runtime contributions', () => {
        for (const system of gameModuleSystems) {
            const runtime = GameModuleCatalog.systems[system].entries.map((entry) => ({
                moduleName: entry.moduleName,
                source: entry.source,
                name: entry.contribution.name,
                app: entry.contribution.app,
            }))
            const generated = (generatedCatalog.systems[system] ?? []).map(
                (entry: { moduleName: string; source: string; contribution: { name: string; app: string } }) => ({
                    moduleName: entry.moduleName,
                    source: entry.source,
                    name: entry.contribution.name,
                    app: entry.contribution.app,
                }),
            )
            assert.deepStrictEqual(runtime, generated, system)
        }
    })

    it('registers Action events through their owning modules in execution order', () => {
        assert.deepStrictEqual(
            GameModuleCatalog.systems.events.entries.map((entry) => ({
                module: entry.moduleName,
                name: entry.contribution.name,
                route: entry.contribution.route,
            })),
            [
                { module: 'rank', name: 'rank-user-enter', route: 'user/Enter' },
                { module: 'user', name: 'user-enter-telemetry', route: 'user/Enter' },
                { module: 'user', name: 'user-login-action-log', route: 'base/Login' },
            ],
        )
    })

    it('enforces unique names, known dependencies and acyclic ordering with module evidence', () => {
        assert.doesNotThrow(() => validateGameModules(GameModuleCatalog.registry))
        assert.throws(
            () =>
                validateGameModules([
                    registry('first', descriptor('first', 'duplicate')),
                    registry('second', descriptor('second', 'duplicate')),
                ]),
            /duplicate telemetry contribution 'duplicate' in modules first and second/,
        )
        assert.throws(
            () => validateGameModules([registry('first', descriptor('first', 'one', { after: ['missing'] }))]),
            /unknown telemetry order dependency 'missing' from module first contribution one/,
        )
        assert.throws(
            () =>
                validateGameModules([
                    registry('first', descriptor('first', 'one', { after: ['two'] })),
                    registry('second', descriptor('second', 'two', { after: ['one'] })),
                ]),
            /cyclic telemetry contribution order: first:one -> second:two/,
        )
    })

    it('keeps every descriptor in its owning module root with owned imports', () => {
        for (const entry of GameModuleCatalog.registry) {
            const source = fs.readFileSync(path.join(projectRoot, entry.source), 'utf8')
            const exportName = path.basename(entry.source, '.ts')
            assert.match(source, new RegExp(`export const ${exportName} = defineGameModule\\(`), entry.source)
            const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
            for (const specifier of imports) {
                assert.ok(
                    specifier === '../../startup/GameModule' || specifier.startsWith('./'),
                    `${entry.source} imports outside its module: ${specifier}`,
                )
            }
        }
    })

    it('keeps framework consumers free of business implementation imports and lists', () => {
        for (const relativePath of [
            'src/main.ts',
            'src/startup/initializeApplication.ts',
            'src/startup/GameRuntimeInitializer.ts',
            'src/startup/ServiceRuntime.ts',
            'src/http/app.ts',
            'src/http/initializeManagementHttp.ts',
        ]) {
            const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
            assert.doesNotMatch(source, /from\s+['"][^'"]*(?:\.\.\/modules\/|src\/modules\/)/, relativePath)
            if (relativePath !== 'src/main.ts') {
                assert.match(source, /GameModuleCatalog|GameModuleLifecycle|RuntimeCronScheduler/, relativePath)
            }
        }
        const catalogSource = fs.readFileSync(path.join(projectRoot, 'src/startup/GameModuleCatalog.ts'), 'utf8')
        assert.doesNotMatch(catalogSource, /from\s+['"][^'"]*(?:\.\.\/modules\/|src\/modules\/)/)
        assert.match(catalogSource, /generated\/modules\/GameModuleRegistry/)
    })

    it('locates source and packaged roots using generated records and config markers', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-root-'))
        const invalid = path.join(root, 'invalid')
        const valid = path.join(root, 'valid')
        fs.mkdirSync(invalid, { recursive: true })
        fs.mkdirSync(path.join(valid, 'generated/records'), { recursive: true })
        fs.mkdirSync(path.join(valid, 'config'), { recursive: true })
        fs.writeFileSync(path.join(valid, 'generated/records/record.json'), '{}')
        try {
            assert.strictEqual(resolveApplicationRoot([invalid, valid]), valid)
            assert.throws(() => resolveApplicationRoot([invalid]), /unable to locate application root/)
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })
})

function descriptor(name: string, contributionName: string, order: { before?: string[]; after?: string[] } = {}) {
    return defineGameModule({
        name,
        telemetry: {
            providers: [
                {
                    name: contributionName,
                    app: 'service',
                    ...order,
                    provider: { name: contributionName, provide: () => ({}) },
                },
            ],
        },
    })
}

function registry(moduleName: string, module: ReturnType<typeof descriptor>): GameModuleRegistryEntry {
    return { moduleName, source: `src/modules/${moduleName}/${moduleName}Module.ts`, module }
}
