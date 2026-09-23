const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../..')
const redisSourceOwnerAliases = new Map([['RankAccess', 'RankHelper']])

function captureSourceContracts(record) {
    const errorCodes = collectErrorCodes()
    const redisKeys = collectRedisKeys()
    const database = collectDatabaseContract()
    const classLists = collectClassLists()
    const sourceMappings = collectSourceMappings(record)
    validateSourceStructure(record, sourceMappings)
    return { errorCodes, redisKeys, database, classLists, sourceMappings }
}

function collectErrorCodes() {
    const generatedRegistry = path.join(projectRoot, 'generated/errors/ErrorCode.ts')
    if (!fs.existsSync(generatedRegistry)) throw new Error('missing generated error registry')
    const sourcePaths = [
        ...walkTypeScriptFiles(path.join(projectRoot, 'src/runtime/errors')).filter((item) =>
            item.endsWith('Errors.ts'),
        ),
        ...walkTypeScriptFiles(path.join(projectRoot, 'src/modules')).filter((item) =>
            /[\\/][^\\/]+Errors\.ts$/.test(item),
        ),
    ]
    if (sourcePaths.length === 0) {
        throw new Error('missing error code source')
    }

    const entries = []
    for (const sourcePath of sourcePaths) {
        const sourceFile = readSourceFile(sourcePath)
        visit(sourceFile, (node) => {
            if (!ts.isPropertyDeclaration(node) || !hasModifier(node, ts.SyntaxKind.StaticKeyword)) return
            if (!node.name || !node.initializer || !ts.isNewExpression(node.initializer)) return
            if (node.initializer.expression.getText(sourceFile) !== 'GameError') return
            const args = node.initializer.arguments ?? []
            const code = literalValue(args[0], sourceFile)
            const message = literalValue(args[1], sourceFile)
            if (typeof code !== 'number' || typeof message !== 'string') {
                throw new Error(`unsupported GameError declaration: ${node.getText(sourceFile)}`)
            }
            entries.push({
                owner:
                    sourceFile.statements.find(ts.isClassDeclaration)?.name?.text ?? path.basename(sourcePath, '.ts'),
                name: propertyName(node.name, sourceFile),
                code,
                message,
            })
        })
    }

    assertUnique(entries, (entry) => entry.name, 'error code name')
    assertUnique(entries, (entry) => String(entry.code), 'error code number')
    validateErrorRegistry(generatedRegistry, entries)
    return entries.sort((left, right) => left.code - right.code || left.name.localeCompare(right.name))
}

function validateErrorRegistry(registryPath, entries) {
    const sourceFile = readSourceFile(registryPath)
    const registryNames = []
    visit(sourceFile, (node) => {
        if (!ts.isPropertyDeclaration(node) || !hasModifier(node, ts.SyntaxKind.StaticKeyword) || !node.name) return
        registryNames.push(propertyName(node.name, sourceFile))
    })
    const expectedNames = entries.map((entry) => entry.name).sort()
    registryNames.sort()
    if (JSON.stringify(registryNames) !== JSON.stringify(expectedNames)) {
        throw new Error('generated error registry does not match module error definitions')
    }
}

function nativeKitStorageContracts(kitsRoot = path.resolve(projectRoot, '../kits')) {
    const contracts = new Map()
    if (!fs.existsSync(kitsRoot)) return contracts
    for (const dir of fs.readdirSync(kitsRoot, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue
        const manifestPath = path.join(kitsRoot, dir.name, 'kit.json')
        if (!fs.existsSync(manifestPath)) continue
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        if (manifest.serverRuntime !== 'serverNew') continue
        if (manifest.id !== dir.name) throw new Error(`native kit identity mismatch: ${manifestPath}`)
        const file = path.join(kitsRoot, dir.name, 'native-data.json')
        const contract = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
        if (
            fs.existsSync(file) &&
            (!contract ||
                typeof contract !== 'object' ||
                Array.isArray(contract) ||
                Object.keys(contract).some(
                    (key) => !['schemaVersion', 'dataVersion', 'minSupported', 'retention', 'keys'].includes(key),
                ) ||
                contract.schemaVersion !== 1 ||
                !Number.isSafeInteger(contract.dataVersion) ||
                contract.dataVersion < 1 ||
                !Number.isSafeInteger(contract.minSupported) ||
                contract.minSupported < 1 ||
                contract.minSupported > contract.dataVersion ||
                contract.retention !== 'preserve' ||
                !Array.isArray(contract.keys) ||
                contract.keys.some(
                    (key) => typeof key !== 'string' || !key.startsWith(`kt:${dir.name}:`) || /\s/.test(key),
                ) ||
                new Set(contract.keys).size !== contract.keys.length)
        )
            throw new Error(`invalid native kit data contract: ${file}`)
        contracts.set(dir.name, { expected: new Set(contract?.keys ?? []), actual: new Set() })
    }
    return contracts
}

function collectRedisKeys() {
    const entries = []
    const nativeKits = nativeKitStorageContracts()
    for (const filePath of walkTypeScriptFiles(path.join(projectRoot, 'src'))) {
        const relative = normalizePath(path.relative(path.join(projectRoot, 'src/modules'), filePath))
        const kit = nativeKits.get(relative.split('/')[0])
        const fileEntries = []
        const sourceFile = readSourceFile(filePath)
        visit(sourceFile, (node) => {
            let name
            let initializer
            if (ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) {
                name = node.name && propertyName(node.name, sourceFile)
                initializer = node.initializer
            } else if (
                ts.isBinaryExpression(node) &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isIdentifier(node.left)
            ) {
                name = node.left.text
                initializer = node.right
            }
            if (!name || !initializer) return
            // Encapsulated structures own their first constructor argument. These keys must remain
            // visible to compatibility review even when the property is named "accounts" or "claims".
            if (
                ts.isNewExpression(initializer) &&
                ts.isIdentifier(initializer.expression) &&
                ['AtomicHash', 'AtomicOperation', 'AtomicLease'].includes(initializer.expression.text)
            ) {
                const value = literalValue(initializer.arguments?.[0], sourceFile)
                if (typeof value === 'string' && value.includes(':')) {
                    fileEntries.push({
                        sourceName: normalizeRedisSourceName(declarationSourceName(node, `${name}.key`, sourceFile)),
                        value,
                    })
                }
                return
            }
            const sourceOwnsKeys = declarationOwners(node, sourceFile).some((owner) => /Keys$/.test(owner))
            if (!/(?:key|prefix|redis)/i.test(name) && !sourceOwnsKeys) return
            const value = literalValue(initializer, sourceFile)
            if (typeof value !== 'string' || !value.includes(':')) return
            fileEntries.push({
                sourceName: normalizeRedisSourceName(declarationSourceName(node, name, sourceFile)),
                value,
            })
        })
        if (kit) {
            for (const entry of fileEntries) kit.actual.add(entry.value)
        } else entries.push(...fileEntries)
    }
    // Installed kits come and go. Their own versioned data contract is checked on both sides;
    // the host's frozen baseline must not acquire a dependency on an optional package.
    for (const [id, kit] of nativeKits) {
        if (JSON.stringify([...kit.actual].sort()) !== JSON.stringify([...kit.expected].sort())) {
            throw new Error(
                `native kit ${id} Redis keys differ from apps/serverNew/kits/${id}/native-data.json: actual=${JSON.stringify([...kit.actual].sort())}`,
            )
        }
    }
    const unique = new Map(entries.map((entry) => [`${entry.sourceName}\u0000${entry.value}`, entry]))
    return [...unique.values()].sort(
        (left, right) => left.sourceName.localeCompare(right.sourceName) || left.value.localeCompare(right.value),
    )
}

function collectDatabaseContract() {
    const tables = []
    const persistenceRoot = path.join(projectRoot, 'generated/persistence')
    for (const filePath of walkTypeScriptFiles(persistenceRoot).filter((item) => item.endsWith('Model.ts'))) {
        const sourceFile = readSourceFile(filePath)
        for (const declaration of sourceFile.statements.filter(ts.isClassDeclaration)) {
            if (!declaration.name) continue
            const entity = decoratorCall(declaration, 'Entity')
            if (!entity) continue
            const tableName = literalValue(entity.arguments[0], sourceFile)
            const columns = []
            for (const member of declaration.members) {
                if (!ts.isPropertyDeclaration(member) || !member.name) continue
                const column = decoratorCall(member, 'Column') ?? decoratorCall(member, 'PrimaryGeneratedColumn')
                if (!column) continue
                const args = column.arguments.map((argument) => normalizeExpression(argument, sourceFile))
                const options = column.arguments.find(ts.isObjectLiteralExpression)
                const explicitName = options && objectPropertyValue(options, 'name', sourceFile)
                columns.push({
                    property: propertyName(member.name, sourceFile),
                    column: typeof explicitName === 'string' ? explicitName : propertyName(member.name, sourceFile),
                    decorator: column.expression.getText(sourceFile),
                    arguments: args,
                })
            }
            const indexes = decoratorsOf(declaration, 'Index').map((decorator) =>
                decorator.arguments.map((argument) => normalizeExpression(argument, sourceFile)),
            )
            tables.push({
                sourceName: declaration.name.text,
                table: typeof tableName === 'string' ? tableName : declaration.name.text,
                columns: columns.sort((left, right) => left.column.localeCompare(right.column)),
                indexes: indexes.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
            })
        }
    }
    assertUnique(tables, (table) => table.table, 'database table')
    return tables.sort((left, right) => left.table.localeCompare(right.table))
}

function collectClassLists() {
    return Object.fromEntries(
        ['activityOperator-info.ts', 'gm-info.ts'].map((fileName) => {
            const filePath = path.join(projectRoot, 'generated/configTypes', fileName)
            const content = fs.readFileSync(filePath, 'utf8')
            const body = content.match(/export const classList\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
            const names = [...body.matchAll(/^\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*:/gm)].map((match) => match[1])
            assertUnique(names, (name) => name, `ClassList ${fileName}`)
            return [fileName, names]
        }),
    )
}

function collectSourceMappings(record) {
    const protocols = []
    const actions = []
    const beans = []

    for (const [direction, group] of sortedEntries(record.protocols)) {
        for (const [, protocolFile] of sortedEntries(group.protocols)) {
            if (protocolFile.deleted === true) continue
            const packageName = protocolFile.relativePath.replace(/^\//, '')
            const routes = []
            for (const [name, api] of sortedEntries(protocolFile.apis)) {
                if (api.req?.deleted === true) continue
                routes.push(`${packageName}/${name}`)
            }
            for (const [name, push] of sortedEntries(protocolFile.pushs)) {
                if (push.deleted === true) continue
                routes.push(`${packageName}/Push${name}`)
            }
            protocols.push({
                sourceName: path.basename(protocolFile.sourcePath ?? '', path.extname(protocolFile.sourcePath ?? '')),
                direction,
                package: packageName,
                routes: routes.sort(),
            })
        }
        actions.push(...collectActionMappings(direction))
    }

    for (const [, bean] of sortedEntries(record.beans)) {
        if (bean.deleted === true || bean.diffType === 0) continue
        beans.push({
            sourceName: bean.className ?? bean.name,
            logicalName: bean.relativePath,
            mods: sortedEntries(bean.mods)
                .filter(([, mod]) => mod.deleted !== true)
                .map(([, mod]) => mod.name)
                .sort(),
        })
    }

    return {
        protocols: protocols.sort((left, right) =>
            `${left.direction}:${left.package}`.localeCompare(`${right.direction}:${right.package}`),
        ),
        actions: actions.sort((left, right) => left.route.localeCompare(right.route)),
        beans: beans.sort((left, right) => left.sourceName.localeCompare(right.sourceName)),
    }
}

function collectActionMappings(direction) {
    const registryPath = path.join(projectRoot, 'generated/protocol/server', direction, 'actions.ts')
    const sourceFile = readSourceFile(registryPath)
    const imports = new Map()
    for (const statement of sourceFile.statements.filter(ts.isImportDeclaration)) {
        if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
        const namedBindings = statement.importClause?.namedBindings
        if (!namedBindings || !ts.isNamedImports(namedBindings)) continue
        for (const element of namedBindings.elements) {
            imports.set(element.name.text, resolveImport(registryPath, statement.moduleSpecifier.text))
        }
    }

    const mappings = []
    visit(sourceFile, (node) => {
        if (!ts.isPropertyAssignment(node) || !ts.isStringLiteral(node.name) || !ts.isIdentifier(node.initializer))
            return
        const actionPath = imports.get(node.initializer.text)
        if (!actionPath) throw new Error(`missing Action import for ${node.name.text}`)
        if (!fs.existsSync(actionPath))
            throw new Error(`missing Action source: ${normalizePath(path.relative(projectRoot, actionPath))}`)
        const source = fs.readFileSync(actionPath, 'utf8')
        const sourceFile = ts.createSourceFile(actionPath, source, ts.ScriptTarget.Latest, true)
        const exportedClasses = sourceFile.statements
            .filter(
                (statement) =>
                    ts.isClassDeclaration(statement) &&
                    statement.name &&
                    hasModifier(statement, ts.SyntaxKind.ExportKeyword),
            )
            .map((statement) => statement.name.text)
        if (!exportedClasses.includes(node.initializer.text)) {
            throw new Error(
                `Action ${node.initializer.text} is not exported by ${normalizePath(path.relative(projectRoot, actionPath))}`,
            )
        }
        mappings.push({ route: `${direction}:${node.name.text}`, sourceName: node.initializer.text })
    })
    assertUnique(mappings, (mapping) => mapping.route, `${direction} Action route`)
    return mappings
}

function validateSourceStructure(record, sourceMappings) {
    const errors = []
    const activeBeans = sortedEntries(record.beans).filter(([, bean]) => bean.deleted !== true && bean.diffType !== 0)
    validateRecordSources(
        activeBeans.map(([, bean]) => bean),
        'Bean',
        errors,
    )
    for (const [, group] of sortedEntries(record.protocols)) {
        validateRecordSources(
            sortedEntries(group.protocols)
                .filter(([, protocol]) => protocol.deleted !== true)
                .map(([, protocol]) => protocol),
            'protocol',
            errors,
        )
    }

    const classFiles = [
        ...walkTypeScriptFiles(path.join(projectRoot, 'src/runtime')).filter(
            (filePath) => !filePath.includes(`${path.sep}protocol${path.sep}`),
        ),
        ...walkTypeScriptFiles(path.join(projectRoot, 'src/modules')).filter((filePath) =>
            /[\\/]action[\\/]Action[^\\/]+\.ts$/.test(filePath),
        ),
        ...walkTypeScriptFiles(path.join(projectRoot, 'src/http')).filter((filePath) =>
            /[\\/]Action[^\\/]+\.ts$/.test(filePath),
        ),
    ]
    for (const filePath of classFiles) {
        const mismatch = exportedClassNameMismatch(filePath, fs.readFileSync(filePath, 'utf8'))
        if (mismatch)
            errors.push(`${mismatch.file}: expected ${mismatch.expected}, exports ${mismatch.exports.join(', ')}`)
    }

    assertUnique(sourceMappings.beans, (mapping) => mapping.sourceName, 'Bean source name')
    assertUnique(sourceMappings.beans, (mapping) => mapping.logicalName, 'Bean logical name')
    assertUnique(sourceMappings.protocols, (mapping) => `${mapping.direction}:${mapping.package}`, 'protocol package')
    if (errors.length > 0) throw new Error(`source structure validation failed:\n- ${errors.join('\n- ')}`)
}

function validateRecordSources(records, label, errors) {
    const sourcePaths = new Set()
    for (const record of records) {
        const sourcePath = record.sourcePath
        if (!sourcePath) {
            errors.push(`${label} ${record.className ?? record.name} has no sourcePath`)
            continue
        }
        if (sourcePaths.has(sourcePath)) errors.push(`duplicate ${label} sourcePath: ${sourcePath}`)
        sourcePaths.add(sourcePath)
        if (!fs.existsSync(path.join(projectRoot, sourcePath))) errors.push(`missing ${label} source: ${sourcePath}`)
    }
}

function exportedClassNameMismatch(filePath, source) {
    if (!source.trim()) return undefined
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    const exports = sourceFile.statements
        .filter(
            (statement) =>
                ts.isClassDeclaration(statement) &&
                statement.name &&
                hasModifier(statement, ts.SyntaxKind.ExportKeyword),
        )
        .map((statement) => statement.name.text)
    if (exports.length === 0) return undefined
    const expected = path.basename(filePath, path.extname(filePath))
    if (exports.includes(expected)) return undefined
    return { file: normalizePath(path.relative(projectRoot, filePath)), expected, exports }
}

function normalizeTypeScriptWithoutImports(content, fileName = 'artifact.ts') {
    const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true)
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false })
    return sourceFile.statements
        .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isImportEqualsDeclaration(statement))
        .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile))
        .join('\n')
        .trim()
}

function readSourceFile(filePath) {
    return ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true)
}

function walkTypeScriptFiles(directory) {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) return walkTypeScriptFiles(filePath)
        return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [filePath] : []
    })
}

function decoratorsOf(node, name) {
    return (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [])
        .map((decorator) => decorator.expression)
        .filter(
            (expression) =>
                ts.isCallExpression(expression) &&
                ts.isIdentifier(expression.expression) &&
                expression.expression.text === name,
        )
}

function decoratorCall(node, name) {
    return decoratorsOf(node, name)[0]
}

function objectPropertyValue(object, name, sourceFile) {
    const property = object.properties.find(
        (item) => ts.isPropertyAssignment(item) && propertyName(item.name, sourceFile) === name,
    )
    return property && ts.isPropertyAssignment(property) ? literalValue(property.initializer, sourceFile) : undefined
}

function normalizeExpression(expression, sourceFile) {
    if (ts.isObjectLiteralExpression(expression)) {
        return Object.fromEntries(
            expression.properties
                .filter(ts.isPropertyAssignment)
                .map((property) => [
                    propertyName(property.name, sourceFile),
                    normalizeExpression(property.initializer, sourceFile),
                ])
                .sort(([left], [right]) => left.localeCompare(right)),
        )
    }
    if (ts.isArrayLiteralExpression(expression))
        return expression.elements.map((item) => normalizeExpression(item, sourceFile))
    const literal = literalValue(expression, sourceFile)
    if (literal !== undefined) return literal
    return ts.createPrinter().printNode(ts.EmitHint.Expression, expression, sourceFile).replace(/\s+/g, ' ').trim()
}

function literalValue(node, sourceFile) {
    if (!node) return undefined
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
        return node.operator === ts.SyntaxKind.MinusToken ? -Number(node.operand.text) : Number(node.operand.text)
    }
    if (sourceFile && ts.isParenthesizedExpression(node)) return literalValue(node.expression, sourceFile)
    return undefined
}

function declarationSourceName(node, name, sourceFile) {
    const owners = declarationOwners(node, sourceFile)
    return [...owners, name].join('.')
}

function normalizeRedisSourceName(sourceName) {
    for (const [currentOwner, compatibilityOwner] of redisSourceOwnerAliases) {
        if (sourceName === currentOwner || sourceName.startsWith(`${currentOwner}.`)) {
            return compatibilityOwner + sourceName.substring(currentOwner.length)
        }
    }
    return sourceName
}

function declarationOwners(node, sourceFile) {
    const owners = []
    let current = node.parent
    while (current) {
        if (
            (ts.isClassDeclaration(current) || ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current)) &&
            current.name
        ) {
            owners.unshift(propertyName(current.name, sourceFile))
        }
        current = current.parent
    }
    if (owners.length === 0) owners.push(path.basename(sourceFile.fileName, path.extname(sourceFile.fileName)))
    return owners
}

function resolveImport(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier)
    for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate)) return candidate
    }
    return base
}

function propertyName(node, sourceFile) {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
    return node.getText(sourceFile)
}

function hasModifier(node, kind) {
    return node.modifiers?.some((modifier) => modifier.kind === kind) === true
}

function visit(node, callback) {
    callback(node)
    node.forEachChild((child) => visit(child, callback))
}

function assertUnique(items, keyOf, label) {
    const seen = new Map()
    for (const item of items) {
        const key = keyOf(item)
        if (seen.has(key)) throw new Error(`duplicate ${label}: ${key}`)
        seen.set(key, item)
    }
}

function sortedEntries(value) {
    return Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right))
}

function normalizePath(value) {
    return value.replace(/\\/g, '/')
}

module.exports = {
    nativeKitStorageContracts,
    collectRedisKeys,
    captureSourceContracts,
    collectClassLists,
    exportedClassNameMismatch,
    normalizeRedisSourceName,
    normalizeTypeScriptWithoutImports,
    projectRoot,
}
