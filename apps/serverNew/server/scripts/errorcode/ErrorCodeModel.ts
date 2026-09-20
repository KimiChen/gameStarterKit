import fs from 'fs'
import path from 'path'
import ts from 'typescript'

export interface ErrorDefinition {
    name: string
    code: number
    message: string
    owner: string
}

export interface ErrorOwnership extends ErrorDefinition {
    consumers: string[]
}

const systemPrefixes = ['Protect', 'Sys', 'Forbid']

const systemNames = new Set(['InvalidIp', 'ApiCallQueueTimeout', 'RuntimeError'])

export function inferErrorOwner(name: string, projectRoot = path.resolve(__dirname, '../..')): string {
    if (systemNames.has(name) || systemPrefixes.some((prefix) => name.startsWith(prefix))) return 'system'
    const prefixOwners = loadModulePrefixOwners(projectRoot)
    const prefix = [...prefixOwners.keys()]
        .sort((left, right) => right.length - left.length)
        .find((candidate) => name.startsWith(candidate))
    if (!prefix) throw new Error(`无法确定错误码所有者: ${name}`)
    return prefixOwners.get(prefix)!
}

export function errorClassName(owner: string): string {
    if (owner === 'system') return 'SystemErrors'
    return owner.charAt(0).toUpperCase() + owner.slice(1) + 'Errors'
}

export function errorSourceFile(projectRoot: string, owner: string): string {
    return owner === 'system'
        ? path.join(projectRoot, 'src', 'runtime', 'errors', 'SystemErrors.ts')
        : path.join(projectRoot, 'src', 'modules', owner, errorClassName(owner) + '.ts')
}

export function parseErrorFile(
    filePath: string,
    owner?: string,
    projectRoot = path.resolve(__dirname, '../..'),
): ErrorDefinition[] {
    const source = fs.readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    const definitions: ErrorDefinition[] = []
    sourceFile.forEachChild((statement) => {
        if (!ts.isClassDeclaration(statement)) return
        for (const member of statement.members) {
            if (!ts.isPropertyDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) continue
            if (!member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) continue
            if (!member.initializer || !ts.isNewExpression(member.initializer)) continue
            if (member.initializer.expression.getText(sourceFile) !== 'GameError') continue
            const [codeNode, messageNode] = member.initializer.arguments ?? []
            if (!codeNode || !ts.isNumericLiteral(codeNode) || !messageNode || !ts.isStringLiteralLike(messageNode)) {
                throw new Error(`错误码定义格式不受支持: ${filePath}:${member.name.text}`)
            }
            definitions.push({
                name: member.name.text,
                code: Number(codeNode.text),
                message: messageNode.text,
                owner: owner ?? inferErrorOwner(member.name.text, projectRoot),
            })
        }
    })
    return definitions
}

export function loadErrorDefinitions(projectRoot: string): ErrorDefinition[] {
    const legacyFile = path.join(projectRoot, 'src', 'config', 'ErrorCode.ts')
    if (fs.existsSync(legacyFile)) {
        return parseErrorFile(legacyFile, undefined, projectRoot).sort(
            (left, right) => left.code - right.code || left.name.localeCompare(right.name),
        )
    }

    const definitions: ErrorDefinition[] = []
    const systemFile = errorSourceFile(projectRoot, 'system')
    if (fs.existsSync(systemFile)) definitions.push(...parseErrorFile(systemFile, 'system'))
    const modulesRoot = path.join(projectRoot, 'src', 'modules')
    for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const owner = entry.name
        const filePath = errorSourceFile(projectRoot, owner)
        const errorFiles = fs
            .readdirSync(path.join(modulesRoot, owner), { withFileTypes: true })
            .filter((file) => file.isFile() && file.name.endsWith('Errors.ts'))
            .map((file) => path.join(modulesRoot, owner, file.name))
        for (const discovered of errorFiles) {
            if (discovered !== filePath) {
                throw new Error(
                    `错误码类路径与模块不一致: ${path.relative(projectRoot, discovered)}, expected=${path.relative(projectRoot, filePath)}`,
                )
            }
        }
        if (fs.existsSync(filePath)) definitions.push(...parseErrorFile(filePath, owner))
    }
    return definitions.sort((left, right) => left.code - right.code || left.name.localeCompare(right.name))
}

export function validateErrorDefinitions(
    definitions: ErrorDefinition[],
    projectRoot = path.resolve(__dirname, '../..'),
) {
    const names = new Map<string, ErrorDefinition>()
    const codes = new Map<number, ErrorDefinition>()
    for (const definition of definitions) {
        const expectedOwner = inferErrorOwner(definition.name, projectRoot)
        if (definition.owner !== expectedOwner) {
            throw new Error(`${definition.name} 所有者错误: ${definition.owner}, expected=${expectedOwner}`)
        }
        if (names.has(definition.name)) throw new Error(`错误码名称重复: ${definition.name}`)
        if (codes.has(definition.code)) {
            throw new Error(
                `错误码数字重复: ${definition.code} (${codes.get(definition.code)!.name}, ${definition.name})`,
            )
        }
        names.set(definition.name, definition)
        codes.set(definition.code, definition)
    }
}

export function loadModulePrefixOwners(projectRoot: string) {
    const catalogFile = path.join(projectRoot, 'generated', 'modules', 'module-catalog.json')
    if (!fs.existsSync(catalogFile)) {
        throw new Error(`模块索引不存在: ${catalogFile}，请先运行 pnpm gen:modules`)
    }
    const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as {
        systems?: {
            errorCodes?: {
                moduleName: string
                source: string
                contribution: { namePrefixes?: string[] }
            }[]
        }
    }
    const prefixOwners = new Map<string, string>()
    for (const entry of catalog.systems?.errorCodes ?? []) {
        for (const prefix of entry.contribution.namePrefixes ?? []) {
            if (!prefix || !/^[A-Z][A-Za-z0-9]*$/.test(prefix)) {
                throw new Error(`错误码前缀格式错误: ${entry.moduleName}:${prefix}`)
            }
            const duplicate = prefixOwners.get(prefix)
            if (duplicate) throw new Error(`错误码前缀冲突: ${prefix} (${duplicate}, ${entry.moduleName})`)
            prefixOwners.set(prefix, entry.moduleName)
        }
    }
    for (const owner of new Set(prefixOwners.values())) {
        const filePath = errorSourceFile(projectRoot, owner)
        if (!fs.existsSync(filePath)) {
            throw new Error(`模块 ${owner} 声明了错误码前缀但缺少 ${path.relative(projectRoot, filePath)}`)
        }
    }
    return prefixOwners
}

export function auditErrorConsumers(projectRoot: string, definitions: ErrorDefinition[]): ErrorOwnership[] {
    const consumers = new Map(definitions.map((definition) => [definition.name, new Set<string>()]))
    const definitionsByName = new Map(definitions.map((definition) => [definition.name, definition]))
    for (const filePath of walkTypeScriptFiles(path.join(projectRoot, 'src'))) {
        if (filePath.includes(`${path.sep}config${path.sep}ErrorCode.ts`)) continue
        if (filePath.includes(`${path.sep}runtime${path.sep}errors${path.sep}`)) continue
        if (/[/\\]modules[/\\][^/\\]+[/\\][^/\\]+Errors\.ts$/.test(filePath)) continue
        const source = fs.readFileSync(filePath, 'utf8')
        for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
            const definition = definitionsByName.get(match[2])
            if (!definition) continue
            const expectedClass = errorClassName(definition.owner)
            if (match[1] !== 'ErrorCode' && match[1] !== expectedClass) {
                throw new Error(
                    `${definition.name} 使用了错误所有者 ${match[1]}: ${path.relative(projectRoot, filePath)}, expected=${expectedClass}`,
                )
            }
            const paths = consumers.get(definition.name)!
            paths.add(path.relative(projectRoot, filePath).replaceAll(path.sep, '/'))
        }
    }
    return definitions.map((definition) => ({
        ...definition,
        consumers: [...consumers.get(definition.name)!].sort(),
    }))
}

function walkTypeScriptFiles(root: string): string[] {
    if (!fs.existsSync(root)) return []
    const result: string[] = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const filePath = path.join(root, entry.name)
        if (entry.isDirectory()) result.push(...walkTypeScriptFiles(filePath))
        else if (entry.isFile() && /\.tsx?$/.test(entry.name)) result.push(filePath)
    }
    return result
}
