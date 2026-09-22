const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../..')
const sourceRoots = ['src', 'scripts', 'tools']
const prohibitedTerms = ['Manager', 'Helper', 'Common', 'Utils', 'Util', 'Base', 'Misc', 'Shared', 'Other', 'Flow']
const contextualTerms = ['Service', 'Data', 'Info', 'Logic', 'Define']
const compatibilityAllowlist = new Map([
    [
        'scripts/bean-compile/transformer.ts',
        {
            names: [
                'classFieldInfo',
                'createClassInfoProperty',
                'createFieldInfoProperty',
                'fieldInfo',
                'hasGeneratedClassInfo',
            ],
            reason: 'ClassInfo and FieldInfo are stable Bean runtime metadata contracts',
        },
    ],
    [
        'src/modules/activity/bean/ActivityDrawInfo.ts',
        { names: ['ActivityDrawInfo'], reason: 'persisted activity Bean identity is protocol compatible' },
    ],
    [
        'src/modules/activity/gift/GiftDefine.ts',
        { names: ['GiftDefine'], reason: 'management HTTP still shares the established gift constants entry' },
    ],
    [
        'src/modules/guild/GuildS2S.ts',
        { names: ['ReqGuildResetGift'], reason: 'single S2S protocol request remains in its stable route source file' },
    ],
    [
        'src/modules/mail/language/LanguageDefine.ts',
        { names: ['LanguageDefine'], reason: 'management HTTP still shares the established language constants entry' },
    ],
    [
        'src/modules/pay/bean/PayInfoItem.ts',
        { names: ['PayInfoItem'], reason: 'persisted Bean and protobuf identity must retain its established name' },
    ],
    [
        'src/modules/pay/bean/TqInfoItem.ts',
        { names: ['TqInfoItem'], reason: 'persisted Bean and protobuf identity must retain its established name' },
    ],
    [
        'src/modules/serverSettings/runtime/SystemInfoDefine.ts',
        { names: ['SystemInfoDefine'], reason: 'system message numeric identity is shared across business modules' },
    ],
    [
        'src/modules/user/ref/UserBaseRef.ts',
        {
            names: ['UserBaseRef'],
            reason: 'persisted user reference identity is outside the D3 behavior-neutral rename set',
        },
    ],
    [
        'src/modules/user/http/gm/ActionPlayerGetPlayerOtherInfo.ts',
        {
            names: ['ActionPlayerGetPlayerOtherInfo'],
            reason: 'GM ClassList action identity is an external management API contract',
        },
    ],
    [
        'src/runtime/protocol/C2S/ModInfo.ts',
        {
            names: ['ModInfo', 'BeanInfo', 'FieldInfo'],
            reason: 'protobuf and record schema identities are compatibility contracts',
        },
    ],
    [
        'src/runtime/protocol/C2S/commom.ts',
        {
            names: ['EquipPropInfo'],
            reason: 'protobuf payload identity and documented external misspelling remain stable',
        },
    ],
    [
        'src/runtime/protocol/C2S/message.ts',
        { names: ['MsgType'], reason: 'protocol source path and enum identity are recorded compatibility contracts' },
    ],
    [
        'src/runtime/protocol/C2S/global.ts',
        {
            names: ['GlobalResponse'],
            reason: 'protocol source path and global response identity are recorded compatibility contracts',
        },
    ],
    [
        'src/runtime/protocol/S2S/commom.ts',
        { names: ['MailPropItem'], reason: 'protocol source path and documented external misspelling remain stable' },
    ],
    [
        'src/runtime/protocol/S2S/settingTag.ts',
        { names: ['ReqSettingTagRefresh'], reason: 'protocol source path and request identity are recorded contracts' },
    ],
    [
        'src/runtime/protocol/ServiceType.ts',
        {
            names: ['ServiceType', 'Service'],
            reason: 'protocol routing enum and generated request marker remain stable',
        },
    ],
    [
        'src/runtime/persistence/DatabaseMigrationRunner.ts',
        {
            names: ['ensureDatabaseMigrations'],
            reason: 'migration entry name is shared by management HTTP and the operations CLI',
        },
    ],
    [
        'src/runtime/persistence/TypeOrmExtensions.ts',
        {
            names: ['BaseEntity'],
            reason: 'TypeORM module augmentation must use the external BaseEntity declaration name',
        },
    ],
    [
        'src/startup/MultiProcessRuntime.ts',
        {
            names: ['runMultiProcessRuntime'],
            reason: 'multi-process startup entry is intentionally action-named',
        },
    ],
    [
        'src/startup/ServiceRuntime.ts',
        {
            names: [
                'ServiceRuntime',
                'ServiceRuntimeOptions',
                'initializeServiceRuntime',
                'prepareServiceRuntimeShutdown',
                'rollbackServiceRuntimeStart',
                'shutdownServiceRuntime',
                'startServiceRuntime',
            ],
            reason: 'service runtime lifecycle names distinguish service workers from management HTTP',
        },
    ],
    [
        'src/startup/runtimeTypes.ts',
        {
            names: ['RuntimeWorkerInfo'],
            reason: 'runtime worker snapshot shape mirrors the alloy-core runtime boundary',
        },
    ],
    [
        'src/telemetry/consumers/ThinkingDataAnalytics.ts',
        { names: ['ThinkingDataAnalytics'], reason: 'ThinkingData is the external analytics provider brand' },
    ],
    [
        'src/telemetry/consumers/ThinkingDataException.ts',
        { names: ['ThinkingDataException'], reason: 'ThinkingData is the external analytics provider brand' },
    ],
    [
        'src/telemetry/consumers/ThinkingDataNetworkException.ts',
        { names: ['ThinkingDataNetworkException'], reason: 'ThinkingData is the external analytics provider brand' },
    ],
])

function auditModuleNames() {
    const violations = []
    const compatibility = []
    const scannedFiles = sourceRoots
        .flatMap((sourceRoot) => walkSourceFiles(path.join(projectRoot, sourceRoot)))
        .map((filePath) => normalizePath(path.relative(projectRoot, filePath)))
        .sort()

    for (const relativePath of scannedFiles) {
        const filePath = path.join(projectRoot, relativePath)
        const source = fs.readFileSync(filePath, 'utf8')
        const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
        const primaryNames = exportedPrimaryNames(sourceFile)
        const declaredNames = declaredPrimaryNames(sourceFile)
        const fileName = path.basename(filePath, path.extname(filePath))

        inspectName(relativePath, fileName, 'file', sourceFile, violations, compatibility)
        for (const primaryName of primaryNames) {
            inspectName(relativePath, primaryName, 'export', sourceFile, violations, compatibility)
        }
        for (const declaredName of declaredNames) {
            if (primaryNames.includes(declaredName)) continue
            inspectName(relativePath, declaredName, 'declaration', sourceFile, violations, compatibility)
        }

        if (primaryNames.length === 1 && primaryNames[0] !== fileName) {
            const allowance = compatibilityAllowlist.get(relativePath)
            if (allowance?.names.includes(primaryNames[0])) {
                compatibility.push(`${relativePath} -> ${primaryNames[0]}: ${allowance.reason}`)
            } else {
                violations.push(`${relativePath}: file name ${fileName} does not match export ${primaryNames[0]}`)
            }
        }
    }

    return {
        violations: [...new Set(violations)].sort(),
        compatibility: [...new Set(compatibility)].sort(),
        coverage: {
            roots: [...sourceRoots],
            modules: discoverModuleNames(),
            files: scannedFiles,
        },
    }
}

function inspectName(relativePath, name, kind, sourceFile, violations, compatibility) {
    const prohibited = prohibitedTerms.find((candidate) => containsNameTerm(name, candidate))
    const contextual = contextualTerms.find((candidate) => containsNameTerm(name, candidate))
    if (!prohibited && (!contextual || isSpecificContextualName(relativePath, name, sourceFile))) return

    const allowance = compatibilityAllowlist.get(relativePath)
    if (allowance?.names.includes(name)) {
        compatibility.push(`${relativePath} -> ${name}: ${allowance.reason}`)
        return
    }

    const term = prohibited ?? contextual
    violations.push(`${relativePath}: ${kind} name ${name} contains unaudited ${term}`)
}

function containsNameTerm(name, term) {
    let index = name.indexOf(term)
    while (index >= 0) {
        const next = name[index + term.length]
        if (next === undefined || !/[a-z]/.test(next)) return true
        index = name.indexOf(term, index + 1)
    }
    return false
}

function isSpecificContextualName(relativePath, name, sourceFile) {
    if (/^(?:Action|Req|Res|Push|Pb)/.test(name)) return true
    if (/(?:Bean|Ref)$/.test(name)) return true
    if (name.endsWith('Define') && relativePath.includes('/rules/')) return isRuleCatalog(sourceFile, name)
    return false
}

function isRuleCatalog(sourceFile, exportName) {
    const declaration = sourceFile.statements.find(
        (statement) => ts.isClassDeclaration(statement) && statement.name?.text === exportName,
    )
    if (!declaration) return false
    return declaration.members.every((member) =>
        member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword),
    )
}

function exportedPrimaryNames(sourceFile) {
    const declarationNames = sourceFile.statements
        .filter((statement) => statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
        .flatMap((statement) => {
            if (
                ts.isClassDeclaration(statement) ||
                ts.isInterfaceDeclaration(statement) ||
                ts.isEnumDeclaration(statement) ||
                ts.isTypeAliasDeclaration(statement) ||
                ts.isFunctionDeclaration(statement)
            ) {
                return statement.name?.text ? [statement.name.text] : []
            }
            if (ts.isVariableStatement(statement)) {
                return statement.declarationList.declarations
                    .map((declaration) => (ts.isIdentifier(declaration.name) ? declaration.name.text : undefined))
                    .filter(Boolean)
            }
            return []
        })

    const reexportNames = sourceFile.statements.flatMap((statement) => {
        if (
            !ts.isExportDeclaration(statement) ||
            !statement.exportClause ||
            !ts.isNamedExports(statement.exportClause)
        ) {
            return []
        }
        return statement.exportClause.elements.map((element) => element.name.text)
    })

    const commonJsNames = []
    visit(sourceFile, (node) => {
        if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return
        if (
            ts.isPropertyAccessExpression(node.left) &&
            ts.isIdentifier(node.left.expression) &&
            node.left.expression.text === 'exports'
        ) {
            commonJsNames.push(node.left.name.text)
            return
        }
        if (!isModuleExports(node.left) || !ts.isObjectLiteralExpression(node.right)) return
        for (const property of node.right.properties) {
            if (ts.isShorthandPropertyAssignment(property)) commonJsNames.push(property.name.text)
            else if (
                ts.isPropertyAssignment(property) &&
                (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            ) {
                commonJsNames.push(property.name.text)
            }
        }
    })

    return [...new Set([...declarationNames, ...reexportNames, ...commonJsNames])]
}

function declaredPrimaryNames(sourceFile) {
    const names = []
    visit(sourceFile, (node) => {
        if (
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isFunctionDeclaration(node)
        ) {
            if (node.name?.text) names.push(node.name.text)
            return
        }
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            (ts.isArrowFunction(node.initializer) ||
                ts.isFunctionExpression(node.initializer) ||
                ts.isClassExpression(node.initializer))
        ) {
            names.push(node.name.text)
        }
    })
    return [...new Set(names)]
}

function isModuleExports(node) {
    return (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'module' &&
        node.name.text === 'exports'
    )
}

function visit(node, callback) {
    callback(node)
    ts.forEachChild(node, (child) => visit(child, callback))
}

function walkSourceFiles(directory) {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            if (normalizePath(path.relative(projectRoot, filePath)) === 'src/http/public') return []
            return walkSourceFiles(filePath)
        }
        if (!entry.isFile() || entry.name.endsWith('.d.ts')) return []
        return entry.name.endsWith('.ts') || entry.name.endsWith('.js') ? [filePath] : []
    })
}

function discoverModuleNames() {
    const modulesRoot = path.join(projectRoot, 'src/modules')
    if (!fs.existsSync(modulesRoot)) return []
    return fs
        .readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
}

function normalizePath(value) {
    return value.replaceAll(path.sep, '/')
}

if (require.main === module) {
    const report = auditModuleNames()
    for (const item of report.violations) console.error(item)
    if (report.violations.length > 0) process.exitCode = 1
    else console.log(`module naming audit passed with ${report.compatibility.length} explicit compatibility names`)
}

module.exports = {
    auditModuleNames,
    compatibilityAllowlist,
    declaredPrimaryNames,
    discoverModuleNames,
    exportedPrimaryNames,
    sourceRoots,
}
