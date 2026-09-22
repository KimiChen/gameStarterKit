import fs from 'fs'
import path from 'path'
import { listArchived, readManifest } from './ModuleLibrary'
import { readSchemaLobbyApis } from '../generator/SchemaLobbyProtocol'

interface CatalogEntry {
    moduleName: string
    source: string
    contribution: Record<string, unknown>
}

interface CatalogModule {
    name: string
    source: string
    systems: Record<string, CatalogEntry[]>
}

interface Catalog {
    modules: CatalogModule[]
    systems: Record<string, CatalogEntry[]>
}

interface SourceModule {
    name: string
    root: string
    descriptor?: string
    systems: string[]
    counts: {
        sourceFiles: number
        actions: number
        beans: number
        http: number
        telemetry: number
    }
    protocols: string[]
    protocolActions: ProtocolAction[]
    errors: string[]
    tests: string[]
}

interface ProtocolAction {
    direction: 'C2S' | 'S2S'
    route: string
    request: string
    action?: string
    directDependencies: string[]
    dependencies: string[]
    beans: string[]
    configTables: string[]
    events: string[]
    unresolvedImports: string[]
    tests: string[]
    readme: string
    framework: string[]
    verify: string
}

const projectRoot = path.resolve(__dirname, '../..')
const modulesRoot = path.join(projectRoot, 'src/modules')
const catalog = readJson<Catalog>('generated/modules/module-catalog.json')
const args = process.argv.slice(2).filter((argument) => argument !== '--')
const json = removeFlag(args, '--json')
const help = removeFlag(args, '--help') || removeFlag(args, '-h')
const context = removeFlag(args, '--context')
const archived = removeFlag(args, '--archived')
const moduleName = optionValue(args, '--module')
const actionRoute = optionValue(args, '--action')
const system = args.find((argument) => !argument.startsWith('-'))
const sourceModules = actionRoute ? [] : discoverSourceModules()

if (help) {
    printHelp()
    process.exit(0)
}
if (args.some((argument) => argument.startsWith('-'))) throw new Error(`unknown option: ${args.join(' ')}`)
if ([system, moduleName, actionRoute].filter(Boolean).length > 1) {
    throw new Error('system, --module and --action cannot be combined')
}
if (archived && (system || actionRoute)) throw new Error('--archived only supports module listing and --module')
if (system && !Object.hasOwn(catalog.systems, system)) throw new Error(`unknown module system: ${system}`)

if (archived && moduleName) printJson(readManifest(moduleName))
else if (archived) printJson(listArchived())
else if (actionRoute) printAction(requireAction(actionRoute), json, context)
else if (moduleName) printModule(requireModule(moduleName), json)
else if (system) printSystem(system, json)
else printModules(json)

function discoverSourceModules(): SourceModule[] {
    const runtimeModules = new Map(catalog.modules.map((module) => [module.name, module]))
    return fs
        .readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => discoverSourceModule(entry.name, runtimeModules.get(entry.name)))
        .sort((left, right) => left.name.localeCompare(right.name))
}

function discoverSourceModule(
    moduleName: string,
    runtimeModule = catalog.modules.find((module) => module.name === moduleName),
) {
    const moduleRoot = path.join(modulesRoot, moduleName)
    if (!fs.existsSync(moduleRoot)) throw new Error(`unknown source module: ${moduleName}`)
    const files = walkFiles(moduleRoot)
        .filter((filePath) => filePath.endsWith('.ts'))
        .map(relative)
        .sort()
    const tests = walkFiles(path.join(projectRoot, 'test/modules', moduleName))
        .filter((filePath) => /\.test\.(?:js|ts)$/.test(filePath))
        .map(relative)
        .sort()
    return {
        name: moduleName,
        root: relative(moduleRoot),
        ...(runtimeModule ? { descriptor: runtimeModule.source } : {}),
        systems: runtimeModule ? Object.keys(runtimeModule.systems) : [],
        counts: {
            sourceFiles: files.length,
            actions: files.filter((filePath) => filePath.includes('/action/')).length,
            beans: files.filter((filePath) => filePath.includes('/bean/')).length,
            http: files.filter((filePath) => filePath.includes('/http/')).length,
            telemetry: files.filter((filePath) => filePath.includes('/telemetry/')).length,
        },
        protocols: files.filter((filePath) => /(?:C2S|S2S)\.ts$/.test(filePath)),
        protocolActions: discoverProtocolActions(moduleName, moduleRoot, files, tests),
        errors: files.filter((filePath) => /Errors\.ts$/.test(filePath)),
        tests,
    }
}

function printModules(asJson: boolean) {
    if (asJson) return printJson(sourceModules)
    console.log('MODULE\tSYSTEMS\tFILES\tTESTS\tDESCRIPTOR')
    for (const module of sourceModules) {
        console.log(
            `${module.name}\t${module.systems.join(',') || '-'}\t${module.counts.sourceFiles}\t${module.tests.length}\t${module.descriptor ?? '-'}`,
        )
    }
}

function printModule(module: SourceModule, asJson: boolean) {
    const contributions = catalog.modules.find((entry) => entry.name === module.name)?.systems ?? {}
    if (asJson) return printJson({ ...module, contributions })
    console.log(`MODULE\t${module.name}`)
    console.log(`ROOT\t${module.root}`)
    console.log(`DESCRIPTOR\t${module.descriptor ?? '-'}`)
    console.log(`SYSTEMS\t${module.systems.join(',') || '-'}`)
    console.log(
        `FILES\t${module.counts.sourceFiles} total, ${module.counts.actions} actions, ${module.counts.beans} beans, ${module.counts.http} http, ${module.counts.telemetry} telemetry`,
    )
    printSection('PROTOCOLS', module.protocols)
    printProtocolActions(module.protocolActions)
    printSection('ERRORS', module.errors)
    printSection('TESTS', module.tests)
    console.log(`SEARCH\trg --files ${module.root}`)
    const contributionEntries = Object.entries(contributions).flatMap(([key, values]) =>
        values.map((entry) => ({ system: key, ...entry })),
    )
    if (contributionEntries.length > 0) printContributionRows(contributionEntries)
}

function printAction(action: ProtocolAction, asJson: boolean, includeContext: boolean) {
    if (asJson) return printJson(action)
    console.log(`ROUTE\t${action.route}`)
    console.log(`DIRECTION\t${action.direction}`)
    console.log(`REQUEST\t${action.request}`)
    console.log(`ACTION\t${action.action ?? '-'}`)
    printSection('DIRECT_DEPENDENCIES', action.directDependencies)
    if (includeContext) printSection('CONTEXT_DEPENDENCIES', action.dependencies)
    else console.log(`CONTEXT_DEPENDENCIES\t${action.dependencies.length} files (use --context to list)`)
    printSection('BEANS', action.beans)
    printSection('CONFIG_TABLES', action.configTables)
    printSection('EVENTS', action.events)
    printSection('UNRESOLVED_IMPORTS', action.unresolvedImports)
    printSection('TESTS', action.tests)
    console.log(`README\t${action.readme}`)
    printSection('FRAMEWORK', action.framework)
    console.log(`VERIFY\t${action.verify}`)
}

function printSystem(system: string, asJson: boolean) {
    const entries = (catalog.systems[system] ?? []).map((entry) => ({ system, ...entry }))
    if (asJson) return printJson(entries)
    printContributionRows(entries)
}

function printContributionRows(entries: (CatalogEntry & { system: string })[]) {
    console.log('SYSTEM\tMODULE\tNAME\tAPP\tDETAIL\tSOURCE')
    for (const entry of entries) {
        const contribution = entry.contribution
        const detail =
            entry.system === 'cron'
                ? `${String(contribution.schedule)} -> ${String(contribution.handler)}`
                : String(
                      contribution.handler ??
                          contribution.controller ??
                          contribution.middleware ??
                          contribution.provider ??
                          contribution.task ??
                          contribution.executor ??
                          contribution.run ??
                          contribution.namePrefixes ??
                          '',
                  )
        console.log(
            `${entry.system}\t${entry.moduleName}\t${String(contribution.name)}\t${String(contribution.app)}\t${detail}\t${entry.source}`,
        )
    }
}

function printSection(label: string, values: string[]) {
    if (values.length === 0) return
    console.log(`${label}\t${values.join(',')}`)
}

function printProtocolActions(actions: ProtocolAction[]) {
    if (actions.length === 0) return
    console.log('ACTIONS\tROUTE\tACTION\tBEANS\tCONFIG\tEVENTS')
    for (const action of actions) {
        console.log(
            `${action.direction}\t${action.route}\t${action.action ?? '-'}\t${action.beans.join(',') || '-'}\t${action.configTables.join(',') || '-'}\t${action.events.join(',') || '-'}`,
        )
    }
}

function requireModule(moduleName: string) {
    const module = sourceModules.find((entry) => entry.name === moduleName)
    if (!module) throw new Error(`unknown source module: ${moduleName}`)
    return module
}

function requireAction(route: string) {
    const moduleName = route.split('/')[0]
    const action = moduleName
        ? discoverSourceModule(moduleName).protocolActions.find((item) => item.route === route)
        : undefined
    if (!action) throw new Error(`unknown protocol action: ${route}`)
    return action
}

function printJson(value: unknown) {
    console.log(JSON.stringify(value, null, 2))
}

function printHelp() {
    console.log(`Usage:
  pnpm modules:list
  pnpm modules:list cron
  pnpm module:show activity
  pnpm --silent modules:list --action gong/GongSkillUp
  pnpm --silent modules:list --action shop/ShopBuy --context
  pnpm modules:list --archived
  pnpm module:show -- equip --archived
  pnpm --silent module:show activity --json

Selectors:
  <system>            Query resolved runtime contributions
  --module <name>     Show a compact source module summary
  --action <route>    Show a protocol Action, direct dependencies, and validation context
  --context           List the bounded transitive source context for an Action
  --archived          Read the archive catalog, or the selected package manifest
  --json              Print JSON; use pnpm --silent when piping it
  --help              Show this help`)
}

function discoverProtocolActions(
    moduleName: string,
    moduleRoot: string,
    files: string[],
    tests: string[],
): ProtocolAction[] {
    const schemaActions = readSchemaLobbyApis(projectRoot)
        .filter((api) => api.ownerModule === moduleName && !api.pending)
        .map((api) => {
            const actionPath = path.join(moduleRoot, 'action', `Action${api.name}.ts`)
            const action = fs.existsSync(actionPath) ? relative(actionPath) : undefined
            const context = action ? actionContext(actionPath, moduleRoot) : emptyActionContext()
            return {
                direction: 'C2S' as const,
                route: `${moduleName}/${api.name}`,
                request: api.requestType,
                ...(action ? { action } : {}),
                ...context,
                tests,
                readme: owningReadme(actionPath),
                framework: frameworkDocs(context),
                verify: `pnpm verify:module -- ${moduleName}`,
            }
        })

    const s2sActions = files
        .filter((filePath) => filePath.endsWith('S2S.ts'))
        .flatMap((relativeProtocolPath) => {
            const protocolPath = path.join(projectRoot, relativeProtocolPath)
            const requests = [...fs.readFileSync(protocolPath, 'utf8').matchAll(/export\s+interface\s+Req(\w+)/g)].map(
                (match) => match[1],
            )
            return requests.map((request) => {
                const actionPath = path.join(moduleRoot, 'action', `Action${request}.ts`)
                const action = fs.existsSync(actionPath) ? relative(actionPath) : undefined
                const context = action ? actionContext(actionPath, moduleRoot) : emptyActionContext()
                return {
                    direction: 'S2S' as const,
                    route: `${moduleName}/${request}`,
                    request: `Req${request}`,
                    ...(action ? { action } : {}),
                    ...context,
                    tests,
                    readme: owningReadme(actionPath ?? protocolPath),
                    framework: frameworkDocs(context),
                    verify: `pnpm verify:module -- ${moduleName}`,
                }
            })
        })

    return [...schemaActions, ...s2sActions].sort((left, right) => left.route.localeCompare(right.route))
}

function actionContext(sourcePath: string, moduleRoot: string) {
    const dependencies = new Map<string, number>()
    const unresolvedImports = new Set<string>()
    const directDependencies = sourceImports(sourcePath, unresolvedImports)
    const visit = (filePath: string, depth: number) => {
        if (depth > 5 || dependencies.size >= 64) return
        for (const dependency of sourceImports(filePath, unresolvedImports)) {
            const dependencyPath = path.join(projectRoot, dependency)
            if (!dependencyPath.startsWith(moduleRoot + path.sep)) continue
            const previousDepth = dependencies.get(dependency)
            if (previousDepth !== undefined && previousDepth <= depth) continue
            dependencies.set(dependency, depth)
            visit(dependencyPath, depth + 1)
        }
    }
    for (const dependency of directDependencies) {
        dependencies.set(dependency, 1)
        visit(path.join(projectRoot, dependency), 2)
    }
    const allDependencies = [...dependencies.keys()].sort()
    const contextSources = [sourcePath, ...allDependencies.map((dependency) => path.join(projectRoot, dependency))]
    return {
        directDependencies,
        dependencies: allDependencies,
        beans: allDependencies.filter((dependency) => dependency.includes('/bean/')),
        configTables: [...new Set(contextSources.flatMap(configTables))].sort(),
        events: allDependencies.filter((dependency) => /\/event\/|\/\w*Event\.ts$/.test(dependency)),
        unresolvedImports: [...unresolvedImports].sort(),
    }
}

function emptyActionContext() {
    return { directDependencies: [], dependencies: [], beans: [], configTables: [], events: [], unresolvedImports: [] }
}

function frameworkDocs(context: ReturnType<typeof actionContext>): string[] {
    const docs = ['engine/docs/development.md#Action 和本地调用']
    if (context.beans.length > 0) {
        docs.push('engine/docs/development.md#Redis Bean 和 Ref')
        docs.push('engine/docs/development.md#Change 和持久化')
    }
    if (context.events.length > 0) docs.push('engine/docs/development.md#事件')
    return docs
}

function sourceImports(sourcePath: string, unresolvedImports: Set<string>) {
    const source = fs.readFileSync(sourcePath, 'utf8')
    return [
        ...new Set(
            [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
                .map((match) => {
                    const resolved = resolveSourceImport(sourcePath, match[1])
                    if (!resolved && match[1].startsWith('.'))
                        unresolvedImports.add(`${relative(sourcePath)}:${match[1]}`)
                    return resolved
                })
                .filter(Boolean) as string[],
        ),
    ].sort()
}

function configTables(sourcePath: string) {
    return [...fs.readFileSync(sourcePath, 'utf8').matchAll(/\bC\.([A-Za-z_]\w*)\s*\(/g)].map((match) => match[1])
}

function owningReadme(sourcePath: string) {
    let directory = path.dirname(sourcePath)
    while (directory.startsWith(projectRoot)) {
        const candidate = path.join(directory, 'README.md')
        if (fs.existsSync(candidate)) return relative(candidate)
        if (directory === projectRoot) break
        directory = path.dirname(directory)
    }
    return 'README.md'
}

function resolveSourceImport(sourcePath: string, specifier: string) {
    if (!specifier.startsWith('.')) return undefined
    const unresolved = path.resolve(path.dirname(sourcePath), specifier)
    const candidates = [
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        `${unresolved}.d.ts`,
        path.join(unresolved, 'index.ts'),
    ]
    const resolved = candidates.find((candidate) => fs.existsSync(candidate))
    return resolved ? relative(resolved) : undefined
}

function walkFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name)
        return entry.isDirectory() ? walkFiles(filePath) : entry.isFile() ? [filePath] : []
    })
}

function relative(filePath: string) {
    return path.relative(projectRoot, filePath).replaceAll(path.sep, '/')
}

function readJson<T>(relativePath: string): T {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T
}

function removeFlag(values: string[], flag: string) {
    const index = values.indexOf(flag)
    if (index < 0) return false
    values.splice(index, 1)
    return true
}

function optionValue(values: string[], option: string) {
    const index = values.indexOf(option)
    if (index < 0) return undefined
    const value = values[index + 1]
    if (!value || value.startsWith('-')) throw new Error(`${option} requires a value`)
    values.splice(index, 2)
    return value
}
