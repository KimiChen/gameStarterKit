import fs from 'fs'
import path from 'path'
import ts from 'typescript'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

interface ModuleIndexEntry {
    name: string
    source: string
    systems: Record<string, RegisteredIndexEntry[]>
}

interface RegisteredIndexEntry {
    moduleName: string
    source: string
    contribution: Record<string, JsonValue>
}

const projectRoot = resolveProjectRoot()
const modulesRoot = path.join(projectRoot, 'src/modules')
const registryFile = path.join(projectRoot, 'generated/modules/GameModuleRegistry.ts')
const catalogFile = path.join(projectRoot, 'generated/modules/module-catalog.json')
const checkOnly = process.argv.includes('--check')

const modules = discoverModules()
const registry = renderRegistry(modules)
const systems = collectSystems(modules)
const catalog = JSON.stringify({ version: 1, modules, systems }, null, 2) + '\n'

writeOrCheck(registryFile, registry)
writeOrCheck(catalogFile, catalog)
console.log(`模块注册索引${checkOnly ? '校验' : '生成'}完成: ${modules.length} 个注册模块`)

function discoverModules(): ModuleIndexEntry[] {
    return fs
        .readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
            const exportName = toPascalCase(entry.name) + 'Module'
            const filePath = path.join(modulesRoot, entry.name, `${exportName}.ts`)
            return fs.existsSync(filePath) ? [parseModule(filePath, entry.name, exportName)] : []
        })
        .sort((left, right) => left.name.localeCompare(right.name))
}

function parseModule(filePath: string, moduleName: string, exportName: string): ModuleIndexEntry {
    const source = fs.readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    const exportedStatements = sourceFile.statements.filter((statement) =>
        ts.canHaveModifiers(statement)
            ? ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
            : false,
    )
    if (exportedStatements.length !== 1 || !ts.isVariableStatement(exportedStatements[0])) {
        throw new Error(`${relative(filePath)} must export only its module descriptor`)
    }
    const exportedVariables = sourceFile.statements.flatMap((statement) => {
        if (!ts.isVariableStatement(statement)) return []
        if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return []
        return [...statement.declarationList.declarations]
    })
    if (exportedVariables.length !== 1) {
        throw new Error(`${relative(filePath)} must export exactly one module descriptor`)
    }
    const declaration = exportedVariables[0]
    if (!ts.isIdentifier(declaration.name)) {
        throw new Error(`${relative(filePath)} must export exactly one named module descriptor`)
    }
    if (declaration.name.text !== exportName) {
        throw new Error(`${relative(filePath)} must export ${exportName}`)
    }
    if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) {
        throw new Error(`${relative(filePath)} must use defineGameModule({...})`)
    }
    if (declaration.initializer.expression.getText(sourceFile) !== 'defineGameModule') {
        throw new Error(`${relative(filePath)} must use defineGameModule({...})`)
    }
    const descriptor = declaration.initializer.arguments[0]
    if (!descriptor || !ts.isObjectLiteralExpression(descriptor)) {
        throw new Error(`${relative(filePath)} must pass an object literal to defineGameModule`)
    }
    const parsed = parseObject(descriptor, sourceFile)
    if (parsed.name !== moduleName) {
        throw new Error(`${relative(filePath)} name must be '${moduleName}', received '${String(parsed.name)}'`)
    }
    const sourcePath = relative(filePath)
    const systems = parseSystems(parsed, moduleName, sourcePath)
    if (Object.keys(systems).length === 0) throw new Error(`${sourcePath} has no contributions`)
    return { name: moduleName, source: sourcePath, systems }
}

function parseSystems(descriptor: Record<string, JsonValue>, moduleName: string, source: string) {
    const result: Record<string, RegisteredIndexEntry[]> = {}
    const add = (system: string, contribution: Record<string, JsonValue>) => {
        validateContribution(system, moduleName, contribution)
        ;(result[system] ??= []).push({ moduleName, source, contribution })
    }
    for (const [system, value] of Object.entries(descriptor)) {
        if (system === 'name') continue
        if (system === 'cron' || system === 'startup') {
            for (const contribution of asObjectArray(value, `${source}:${system}`)) add(system, contribution)
            continue
        }
        if (system === 'errorCodes') {
            const errorCodes = asObject(value, `${source}:errorCodes`)
            const prefixes = asStringArray(errorCodes.namePrefixes, `${source}:errorCodes.namePrefixes`)
            add(system, { name: `${moduleName}-error-codes`, app: 'all', namePrefixes: prefixes })
            continue
        }
        const group = asObject(value, `${source}:${system}`)
        for (const [kind, contributions] of Object.entries(group)) {
            for (const contribution of asObjectArray(contributions, `${source}:${system}.${kind}`)) {
                add(system, { kind: singular(kind), ...contribution })
            }
        }
    }
    return result
}

function validateContribution(system: string, moduleName: string, contribution: Record<string, JsonValue>) {
    if (typeof contribution.name !== 'string' || contribution.name.length === 0) {
        throw new Error(`${moduleName}:${system} contribution requires a stable name`)
    }
    if (!['service', 'management', 'all'].includes(String(contribution.app))) {
        throw new Error(`${moduleName}:${system}:${contribution.name} has invalid app '${String(contribution.app)}'`)
    }
    for (const key of ['before', 'after']) {
        if (contribution[key] !== undefined) asStringArray(contribution[key], `${moduleName}:${system}:${key}`)
    }
    if (system === 'cron') {
        if (typeof contribution.schedule !== 'string' || typeof contribution.handler !== 'string') {
            throw new Error(`${moduleName}:cron:${contribution.name} requires schedule and handler`)
        }
    }
}

function collectSystems(modules: ModuleIndexEntry[]) {
    const systems: Record<string, RegisteredIndexEntry[]> = {}
    for (const module of modules) {
        for (const [system, entries] of Object.entries(module.systems)) {
            ;(systems[system] ??= []).push(...entries)
        }
    }
    for (const [system, entries] of Object.entries(systems)) {
        const seen = new Map<string, RegisteredIndexEntry>()
        for (const entry of entries) {
            const key = `${entry.contribution.app}:${entry.contribution.name}`
            const duplicate = seen.get(key)
            if (duplicate) {
                throw new Error(
                    `duplicate contribution ${key} in ${duplicate.moduleName} and ${entry.moduleName} for ${entry.source}`,
                )
            }
            seen.set(key, entry)
        }
        systems[system] = sortIndexEntries(system, entries)
    }
    return Object.fromEntries(Object.entries(systems).sort(([left], [right]) => left.localeCompare(right)))
}

function sortIndexEntries(system: string, entries: RegisteredIndexEntry[]) {
    const scopes = [
        ...new Set(
            entries.map((entry) =>
                system === 'startup'
                    ? `${String(entry.contribution.app)}:${String(entry.contribution.phase)}`
                    : String(entry.contribution.app),
            ),
        ),
    ].sort()
    return scopes.flatMap((scope) => {
        const scoped = entries.filter((entry) => {
            const entryScope =
                system === 'startup'
                    ? `${String(entry.contribution.app)}:${String(entry.contribution.phase)}`
                    : String(entry.contribution.app)
            return entryScope === scope
        })
        const names = new Set(scoped.map((entry) => String(entry.contribution.name)))
        const modules = new Set(scoped.map((entry) => entry.moduleName))
        const edges = new Map(scoped.map((entry) => [entry, new Set<RegisteredIndexEntry>()]))
        const byName = new Map(scoped.map((entry) => [String(entry.contribution.name), entry]))
        const byModule = new Map<string, RegisteredIndexEntry[]>()
        for (const entry of scoped) byModule.set(entry.moduleName, [...(byModule.get(entry.moduleName) ?? []), entry])
        const targets = (owner: RegisteredIndexEntry, reference: string) => {
            if (!names.has(reference) && !modules.has(reference)) {
                throw new Error(
                    `unknown order dependency '${reference}' from ${owner.moduleName}:${owner.contribution.name}`,
                )
            }
            return byName.has(reference) ? [byName.get(reference)!] : byModule.get(reference)!
        }
        for (const entry of scoped) {
            for (const ref of asOptionalStrings(entry.contribution.before)) {
                for (const target of targets(entry, ref)) if (target !== entry) edges.get(entry)!.add(target)
            }
            for (const ref of asOptionalStrings(entry.contribution.after)) {
                for (const target of targets(entry, ref)) if (target !== entry) edges.get(target)!.add(entry)
            }
        }
        const indegree = new Map(scoped.map((entry) => [entry, 0]))
        for (const targets of edges.values()) {
            for (const target of targets) indegree.set(target, indegree.get(target)! + 1)
        }
        const compare = (left: RegisteredIndexEntry, right: RegisteredIndexEntry) =>
            left.moduleName.localeCompare(right.moduleName) ||
            String(left.contribution.name).localeCompare(String(right.contribution.name))
        const ready = scoped.filter((entry) => indegree.get(entry) === 0).sort(compare)
        const sorted: RegisteredIndexEntry[] = []
        while (ready.length > 0) {
            const current = ready.shift()!
            sorted.push(current)
            for (const target of [...edges.get(current)!].sort(compare)) {
                indegree.set(target, indegree.get(target)! - 1)
                if (indegree.get(target) === 0) {
                    ready.push(target)
                    ready.sort(compare)
                }
            }
        }
        if (sorted.length !== scoped.length) {
            const cycle = scoped
                .filter((entry) => indegree.get(entry)! > 0)
                .map((entry) => `${entry.moduleName}:${entry.contribution.name}`)
                .sort()
            throw new Error(`cyclic contribution order: ${cycle.join(' -> ')}`)
        }
        return sorted
    })
}

function renderRegistry(modules: ModuleIndexEntry[]) {
    const imports = modules.map((module) => {
        const exportName = toPascalCase(module.name) + 'Module'
        const specifier = '../../' + module.source.replace(/\.ts$/, '')
        return `import { ${exportName} } from '${specifier}'`
    })
    const entries = modules.map((module) => {
        const exportName = toPascalCase(module.name) + 'Module'
        return `    { moduleName: '${module.name}', source: '${module.source}', module: ${exportName} },`
    })
    return [
        "import type { GameModuleRegistryEntry } from '../../src/startup/GameModule'",
        ...imports,
        '',
        'export const gameModuleRegistry = Object.freeze([',
        ...entries,
        '] satisfies readonly GameModuleRegistryEntry[])',
        '',
    ].join('\n')
}

function parseObject(node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): Record<string, JsonValue> {
    return Object.fromEntries(
        node.properties.map((property) => {
            if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
                throw new Error(`unsupported module descriptor syntax: ${property.getText(sourceFile)}`)
            }
            const name = property.name.getText(sourceFile).replace(/^['"]|['"]$/g, '')
            const initializer = ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer
            return [name, parseValue(initializer, sourceFile)]
        }),
    )
}

function parseValue(node: ts.Expression, sourceFile: ts.SourceFile): JsonValue {
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => parseValue(element, sourceFile))
    if (ts.isObjectLiteralExpression(node)) return parseObject(node, sourceFile)
    return node.getText(sourceFile)
}

function asObject(value: JsonValue | undefined, label: string): Record<string, JsonValue> {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`)
    return value
}

function asObjectArray(value: JsonValue | undefined, label: string): Record<string, JsonValue>[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
    return value.map((entry, index) => asObject(entry, `${label}[${index}]`))
}

function asStringArray(value: JsonValue | undefined, label: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        throw new Error(`${label} must be a string array`)
    }
    return value as string[]
}

function asOptionalStrings(value: JsonValue | undefined) {
    return value === undefined ? [] : asStringArray(value, 'order constraint')
}

function singular(value: string) {
    return value.endsWith('ies') ? value.slice(0, -3) + 'y' : value.endsWith('s') ? value.slice(0, -1) : value
}

function writeOrCheck(filePath: string, content: string) {
    if (checkOnly) {
        if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content) {
            throw new Error(`module index is stale: ${relative(filePath)}; run pnpm gen:modules`)
        }
        return
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content) fs.writeFileSync(filePath, content)
}

function relative(filePath: string) {
    return path.relative(projectRoot, filePath).replaceAll(path.sep, '/')
}

function toPascalCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function resolveProjectRoot() {
    const index = process.argv.indexOf('--project-root')
    if (index < 0) return path.resolve(__dirname, '../..')
    const value = process.argv[index + 1]
    if (!value) throw new Error('--project-root requires a path')
    return path.resolve(value)
}
