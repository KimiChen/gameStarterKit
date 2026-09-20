import ts from 'typescript'
import {
    BeanCompileRecord,
    BeanDifferKind,
    BeanFieldRecord,
    BeanRecordContract,
    BeanRecordContractOptions,
} from './record-contract'

const ENGINE_MODULE = '@arthropoda/game-engine'
const RECORD_REFRESH_COMMAND = 'pnpm 一键生成代码'

const HASH_BASES = new Set(['Hash', 'UserHash', 'ServerHash', 'CenterHash'])
const HASH_JSON_BASES = new Set(['HashJson', 'UserHashJson', 'ServerHashJson', 'CenterHashJson'])

export interface BeanCompileTransformerOptions extends BeanRecordContractOptions {}

export interface BeanCompilePluginConfig {
    projectRoot?: string
    recordPath?: string
    beanRoot?: string
}

interface ProgramTransformerRuntime {
    ts: typeof ts
}

/**
 * ts-patch Program transformer 入口。必须配置 `transformProgram: true`，使
 * checker、noEmit、ts-node 和 emit 都读取转换后的同一个 SourceFile。
 */
export default function beanCompileProgramPlugin(
    program: ts.Program,
    host: ts.CompilerHost | undefined,
    pluginConfig: BeanCompilePluginConfig = {},
    runtime: ProgramTransformerRuntime = { ts },
): ts.Program {
    const tsInstance = runtime.ts
    const compilerOptions = program.getCompilerOptions()
    const baseHost = host ?? tsInstance.createCompilerHost(compilerOptions, true)
    const sourceTransformer = createBeanCompileTransformer({
        projectRoot: pluginConfig.projectRoot ?? program.getCurrentDirectory(),
        recordPath: pluginConfig.recordPath,
        beanRoot: pluginConfig.beanRoot,
    })
    const transformedFiles = new Map<string, ts.SourceFile>()
    const compilerHost: ts.CompilerHost = Object.create(baseHost) as ts.CompilerHost
    compilerHost.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
        const cacheKey = tsInstance.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()
        const cached = transformedFiles.get(cacheKey)
        if (cached) return cached
        const sourceFile = baseHost.getSourceFile(
            fileName,
            languageVersionOrOptions,
            onError,
            shouldCreateNewSourceFile,
        )
        if (!sourceFile || sourceFile.isDeclarationFile) return sourceFile
        const unboundSource = tsInstance.createSourceFile(
            fileName,
            sourceFile.text,
            languageVersionOrOptions,
            true,
            (sourceFile as ts.SourceFile & { scriptKind: ts.ScriptKind }).scriptKind,
        )
        copySourceFileIdentity(unboundSource, sourceFile)
        const result = tsInstance.transform(unboundSource, [sourceTransformer], compilerOptions)
        const transformed = result.transformed[0] as ts.SourceFile
        const reboundSource =
            transformed === unboundSource
                ? unboundSource
                : tsInstance.createSourceFile(
                      fileName,
                      tsInstance.createPrinter({ newLine: tsInstance.NewLineKind.LineFeed }).printFile(transformed),
                      languageVersionOrOptions,
                      true,
                      (sourceFile as ts.SourceFile & { scriptKind: ts.ScriptKind }).scriptKind,
                  )
        copySourceFileIdentity(reboundSource, sourceFile)
        result.dispose()
        transformedFiles.set(cacheKey, reboundSource)
        return reboundSource
    }

    return tsInstance.createProgram({
        rootNames: program.getRootFileNames(),
        options: compilerOptions,
        host: compilerHost,
        projectReferences: program.getProjectReferences(),
        configFileParsingDiagnostics: program.getConfigFileParsingDiagnostics(),
    })
}

/** 仅供 transpileModule 等显式 emit 场景复用；项目配置应使用默认 Program 入口。 */
export function beanCompileSourcePlugin(
    program: ts.Program,
    pluginConfig: BeanCompilePluginConfig = {},
): ts.TransformerFactory<ts.SourceFile> {
    return createBeanCompileTransformer({
        projectRoot: pluginConfig.projectRoot ?? program.getCurrentDirectory(),
        recordPath: pluginConfig.recordPath,
        beanRoot: pluginConfig.beanRoot,
    })
}

/** 可供测试和其他编译入口直接复用的 transformer。 */
export function createBeanCompileTransformer(
    options: BeanCompileTransformerOptions,
): ts.TransformerFactory<ts.SourceFile> {
    const contract = new BeanRecordContract(options)

    return (context) => {
        const factory = context.factory

        return (sourceFile) => {
            const relativePath = contract.relativePathOf(sourceFile.fileName)
            if (!relativePath) return sourceFile

            const candidates = sourceFile.statements.filter(ts.isClassDeclaration).filter((node) => {
                const extendName = getExtendName(node, sourceFile)
                return extendName !== undefined && classifyExtendName(extendName) !== undefined
            })
            if (candidates.length === 0) return sourceFile

            // 分阶段迁移期间，保留旧 *Gen 的文件继续走旧实现；删除旧类后同一
            // transformer 会立即接管业务类。最终迁移完成后不会再命中此分支。
            if (candidates.some((node) => hasLegacyGeneratedClass(sourceFile, node))) {
                return sourceFile
            }

            const runtimeName = findOrCreateRuntimeName(sourceFile)
            const runtimeIdentifier = factory.createIdentifier(runtimeName)
            let transformed = false
            const statements = sourceFile.statements.map((statement) => {
                if (!ts.isClassDeclaration(statement)) return statement
                const extendName = getExtendName(statement, sourceFile)
                const kind = extendName ? classifyExtendName(extendName) : undefined
                if (kind === undefined || extendName === 'RefHash') return statement
                if (!statement.name) {
                    failAt(sourceFile, statement, '符合 Bean 继承规则的类必须有名称')
                }
                if (hasGeneratedClassInfo(statement)) return statement

                const className = statement.name.text
                const record = contract.find(relativePath, className)
                if (!record) {
                    failAt(sourceFile, statement, `record.json 中找不到 ${relativePath}#${className} 的记录`)
                }
                validateClassRecord(sourceFile, statement, record, kind, extendName!)
                transformed = true
                return transformBeanClass(context, sourceFile, statement, record, kind, runtimeIdentifier)
            })

            if (!transformed) return sourceFile
            const withRuntimeImport = addRuntimeImport(factory, statements, runtimeName)
            for (const statement of withRuntimeImport) {
                if (statement.pos < 0 || statement.end < 0) {
                    anchorGeneratedTree(sourceFile, statement, candidates[0])
                }
            }
            const transformedSourceFile = factory.updateSourceFile(sourceFile, withRuntimeImport)
            ;(
                ts as typeof ts & {
                    setParentRecursive(root: ts.Node, incremental: boolean): ts.Node
                }
            ).setParentRecursive(transformedSourceFile, false)
            return transformedSourceFile
        }
    }
}

/**
 * `tsc --noEmit` 不保证进入 emit transformer；静态检查入口可在创建 Program
 * 后调用本函数，复用完全相同的 record 校验与转换前置条件。
 */
export function validateBeanCompileProgram(program: ts.Program, pluginConfig: BeanCompilePluginConfig = {}): void {
    const transformer = createBeanCompileTransformer({
        projectRoot: pluginConfig.projectRoot ?? program.getCurrentDirectory(),
        recordPath: pluginConfig.recordPath,
        beanRoot: pluginConfig.beanRoot,
    })
    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue
        const result = ts.transform(sourceFile, [transformer], program.getCompilerOptions())
        result.dispose()
    }
}

function classifyExtendName(extendName: string): BeanDifferKind | undefined {
    if (extendName === 'Bean') return BeanDifferKind.Bean
    if (HASH_BASES.has(extendName)) return BeanDifferKind.Hash
    if (HASH_JSON_BASES.has(extendName)) return BeanDifferKind.HashJson
    // RefHash 明确排除，但保留为“已识别”以便调用方表达排除规则。
    if (extendName === 'RefHash') return undefined
    return undefined
}

function getExtendName(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string | undefined {
    const clause = node.heritageClauses?.find((item) => item.token === ts.SyntaxKind.ExtendsKeyword)
    const expression = clause?.types[0]?.expression
    if (!expression) return undefined
    const text = expression.getText(sourceFile).trim()
    return text.substring(text.lastIndexOf('.') + 1)
}

function hasLegacyGeneratedClass(sourceFile: ts.SourceFile, node: ts.ClassDeclaration): boolean {
    if (!node.name) return false
    const legacyName = `${node.name.text}Gen`
    return sourceFile.statements.some(
        (statement) => ts.isClassDeclaration(statement) && statement.name?.text === legacyName,
    )
}

function hasGeneratedClassInfo(node: ts.ClassDeclaration): boolean {
    return node.members.some(
        (member) =>
            ts.isPropertyDeclaration(member) &&
            hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
            propertyNameText(member.name) === '_class_info',
    )
}

function validateClassRecord(
    sourceFile: ts.SourceFile,
    node: ts.ClassDeclaration,
    record: BeanCompileRecord,
    kind: BeanDifferKind,
    extendName: string,
) {
    const className = node.name!.text
    if ((record.className ?? record.name) !== className) {
        failAt(sourceFile, node, `record 类名 ${record.className ?? record.name} 与源码 ${className} 不一致`)
    }
    if (record.className === undefined) {
        failAt(sourceFile, node, `${className} 的 record 缺少 className 快照`)
    }
    if (record.extendType === undefined || normalizeTypeText(record.extendType) !== normalizeTypeText(extendName)) {
        failAt(
            sourceFile,
            node,
            `${className} 的继承类型已变化（record=${record.extendType ?? '缺失'}，源码=${extendName}）`,
        )
    }
    if (record.diffType !== kind) {
        failAt(sourceFile, node, `${className} 的 Bean 类型已变化（record=${record.diffType}，源码=${kind}）`)
    }
    validateDecoratorSnapshot(sourceFile, node, record.decorators, `${className} 类`)

    if (
        record.saveType === undefined ||
        record.modType === undefined ||
        record.modId === undefined ||
        record.initFunc === undefined
    ) {
        failAt(sourceFile, node, `${className} 的 record 缺少编译元数据快照`)
    }
    if (kind !== BeanDifferKind.Bean && record.idFiledType === undefined) {
        failAt(sourceFile, node, `${className} 的 record 缺少 Hash id 类型`)
    }
    if (node.members.some(ts.isConstructorDeclaration)) {
        failAt(sourceFile, node, `${className} 不能声明业务 constructor，构造行为由 Bean 编译器生成`)
    }

    const sourceFields = node.members.filter(isBusinessField)
    const sourceByName = new Map<string, ts.PropertyDeclaration>()
    for (const field of sourceFields) {
        const name = propertyNameText(field.name)
        if (!name || !ts.isIdentifier(field.name)) {
            failAt(sourceFile, field, `${className} 仅支持标识符形式的业务字段`)
        }
        sourceByName.set(name, field)
    }

    const activeRecords = Object.values(record.properties ?? {}).filter((field) => !field.deleted)
    for (const fieldRecord of activeRecords) {
        const field = sourceByName.get(fieldRecord.name)
        if (!field) {
            failAt(sourceFile, node, `${className}.${fieldRecord.name} 已从源码删除，但 record 仍为有效字段`)
        }
        validateFieldRecord(sourceFile, className, field, fieldRecord)
        sourceByName.delete(fieldRecord.name)
    }
    const added = sourceByName.values().next().value as ts.PropertyDeclaration | undefined
    if (added) {
        failAt(sourceFile, added, `${className}.${propertyNameText(added.name)} 尚未写入 record.json`)
    }
}

function validateFieldRecord(
    sourceFile: ts.SourceFile,
    className: string,
    node: ts.PropertyDeclaration,
    record: BeanFieldRecord,
) {
    if (record.sourceType === undefined || record.sourceInitializer === undefined || record.decorators === undefined) {
        failAt(sourceFile, node, `${className}.${record.name} 的 record 缺少源码快照`)
    }

    const sourceType = sourceFieldTypeText(sourceFile, node, record)
    if (normalizeTypeText(sourceType) !== normalizeTypeText(record.sourceType)) {
        failAt(
            sourceFile,
            node,
            `${className}.${record.name} 类型已变化（record=${record.sourceType}，源码=${sourceType}）`,
        )
    }
    if ((node.questionToken !== undefined) !== record.hasQuestionToken) {
        failAt(
            sourceFile,
            node,
            `${className}.${record.name} 可选性已变化（record=${record.hasQuestionToken}，源码=${node.questionToken !== undefined}）`,
        )
    }
    const initializer = node.initializer?.getText(sourceFile).trim() ?? null
    const recordedInitializer = record.sourceInitializer === null ? null : record.sourceInitializer?.trim()
    if (initializer !== recordedInitializer) {
        failAt(
            sourceFile,
            node,
            `${className}.${record.name} initializer 已变化（record=${String(record.sourceInitializer)}，源码=${String(initializer)}）`,
        )
    }
    validateDecoratorSnapshot(sourceFile, node, record.decorators, `${className}.${record.name}`)
    validateSemanticFieldType(sourceFile, node, record, sourceType)

    if (record.saveType === undefined || record.modType === undefined || record.listen === undefined) {
        failAt(sourceFile, node, `${className}.${record.name} 的 record 缺少字段编译元数据`)
    }
    if (isPrimitiveRecord(record) && record.defaultValue === undefined) {
        failAt(sourceFile, node, `${className}.${record.name} 的 record 缺少基础类型默认值`)
    }
}

function validateSemanticFieldType(
    sourceFile: ts.SourceFile,
    node: ts.PropertyDeclaration,
    record: BeanFieldRecord,
    sourceType: string,
) {
    const normalized = normalizeTypeText(sourceType).replace(/\|undefined/g, '')
    if (record.type === 'Array') {
        const item = collectionTypeParts(normalized, 'Array')
        if (!item || normalizeTypeText(item[0]) !== normalizeTypeText(record.collectionTypes?.[0] ?? '')) {
            failAt(sourceFile, node, `${record.name} 的 Array 类型与 record 不一致`)
        }
        return
    }
    if (record.type === 'Map') {
        const parts = collectionTypeParts(normalized, 'Map')
        if (
            !parts ||
            parts.length !== 2 ||
            normalizeTypeText(parts[0]) !== normalizeTypeText(record.collectionTypes?.[0] ?? '') ||
            normalizeTypeText(parts[1]) !== normalizeTypeText(record.collectionTypes?.[1] ?? '')
        ) {
            failAt(sourceFile, node, `${record.name} 的 Map 类型与 record 不一致`)
        }
        return
    }
    if (record.type === 'uint') return // enum 在生成器中统一记录为 uint。
    if (normalized !== normalizeTypeText(record.type)) {
        failAt(
            sourceFile,
            node,
            `${record.name} 的语义类型与 record 不一致（record=${record.type}，源码=${sourceType}）`,
        )
    }
}

function collectionTypeParts(typeText: string, expected: 'Array' | 'Map'): string[] | undefined {
    if (expected === 'Array' && typeText.endsWith('[]')) {
        return [typeText.substring(0, typeText.length - 2)]
    }
    const accepted = expected === 'Array' ? ['Array', 'DiffArray'] : ['Map', 'DiffMap']
    for (const name of accepted) {
        const prefix = `${name}<`
        if (typeText.startsWith(prefix) && typeText.endsWith('>')) {
            return splitTopLevelTypes(typeText.substring(prefix.length, typeText.length - 1))
        }
    }
    return undefined
}

function splitTopLevelTypes(value: string): string[] {
    const result: string[] = []
    let begin = 0
    let depth = 0
    for (let index = 0; index < value.length; index++) {
        const char = value[index]
        if (char === '<' || char === '[' || char === '(' || char === '{') depth++
        if (char === '>' || char === ']' || char === ')' || char === '}') depth--
        if (char === ',' && depth === 0) {
            result.push(value.substring(begin, index))
            begin = index + 1
        }
    }
    result.push(value.substring(begin))
    return result.map((item) => item.trim())
}

function validateDecoratorSnapshot(
    sourceFile: ts.SourceFile,
    node: ts.Node,
    expected: string[] | undefined,
    owner: string,
) {
    if (expected === undefined) {
        failAt(sourceFile, node, `${owner} 的 record 缺少装饰器快照`)
    }
    const actual = getDecorators(node).map((decorator) => normalizeDecoratorText(decorator.getText(sourceFile)))
    const normalizedExpected = expected.map(normalizeDecoratorText)
    if (
        actual.length !== normalizedExpected.length ||
        actual.some((item, index) => item !== normalizedExpected[index])
    ) {
        failAt(
            sourceFile,
            node,
            `${owner} 装饰器已变化（record=${normalizedExpected.join(',') || '无'}，源码=${actual.join(',') || '无'}）`,
        )
    }
}

function transformBeanClass(
    context: ts.TransformationContext,
    sourceFile: ts.SourceFile,
    node: ts.ClassDeclaration,
    record: BeanCompileRecord,
    kind: BeanDifferKind,
    runtime: ts.Identifier,
): ts.ClassDeclaration {
    const factory = context.factory
    const fields = Object.values(record.properties).filter((field) => !field.deleted)
    const sourceFields = new Map<string, ts.PropertyDeclaration>()
    node.members.filter(isBusinessField).forEach((field) => sourceFields.set(propertyNameText(field.name)!, field))

    const generatedMembers: ts.ClassElement[] = []
    for (const field of fields) {
        generatedMembers.push(createStorageProperty(factory, sourceFile, sourceFields.get(field.name)!, field, runtime))
    }
    generatedMembers.push(createBeanConstructor(factory, node.name!.text, fields, record, kind, runtime))
    if (record.initFunc && !node.members.some((member) => methodName(member) === 'buildNet')) {
        generatedMembers.push(createBuildNetMethod(factory))
    }
    for (const field of fields) {
        generatedMembers.push(...createFieldAccessors(context, field, kind, node.name!.text, runtime))
    }
    generatedMembers.push(createClassInfoProperty(context, node.name!.text, record, kind, runtime))
    for (const field of fields) {
        generatedMembers.push(createFieldInfoProperty(context, node.name!.text, field, runtime))
    }
    generatedMembers.push(createFieldRegistrationBlock(factory, node.name!.text, fields))

    for (const member of generatedMembers) anchorGeneratedTree(sourceFile, member, node)

    const businessMembers = node.members.filter((member) => !isBusinessField(member))
    const transformed = factory.updateClassDeclaration(
        node,
        node.modifiers,
        node.name,
        node.typeParameters,
        node.heritageClauses,
        [...generatedMembers, ...businessMembers],
    )
    const boundSource = node as ts.ClassDeclaration & {
        symbol?: ts.Symbol
        localSymbol?: ts.Symbol
        locals?: ts.SymbolTable
    }
    const boundTarget = transformed as typeof boundSource
    boundTarget.symbol = boundSource.symbol
    boundTarget.localSymbol = boundSource.localSymbol
    boundTarget.locals = boundSource.locals
    return transformed
}

function createStorageProperty(
    factory: ts.NodeFactory,
    sourceFile: ts.SourceFile,
    sourceField: ts.PropertyDeclaration,
    record: BeanFieldRecord,
    runtime: ts.Identifier,
): ts.PropertyDeclaration {
    const primitive = isPrimitiveRecord(record)
    const property = factory.createPropertyDeclaration(
        [factory.createModifier(ts.SyntaxKind.ProtectedKeyword)],
        `_${record.name}`,
        primitive ? undefined : factory.createToken(ts.SyntaxKind.QuestionToken),
        beanFieldTypeNode(factory, record, runtime),
        primitive ? parseExpression(record.defaultValue!) : factory.createIdentifier('undefined'),
    )
    ts.setTextRange(property, sourceField)
    return property
}

function createBeanConstructor(
    factory: ts.NodeFactory,
    className: string,
    fields: BeanFieldRecord[],
    record: BeanCompileRecord,
    kind: BeanDifferKind,
    runtime: ts.Identifier,
): ts.ConstructorDeclaration {
    const parameters: ts.ParameterDeclaration[] = []
    const statements: ts.Statement[] = []
    if (kind === BeanDifferKind.Bean) {
        parameters.push(
            factory.createParameterDeclaration(
                undefined,
                undefined,
                'data',
                factory.createToken(ts.SyntaxKind.QuestionToken),
                factory.createTypeReferenceNode('Partial', [factory.createTypeReferenceNode(className, undefined)]),
                undefined,
            ),
        )
        statements.push(
            factory.createExpressionStatement(factory.createCallExpression(factory.createSuper(), undefined, [])),
        )
        for (const field of fields) {
            const dataValue = factory.createPropertyAccessExpression(factory.createIdentifier('data'), field.name)
            const assignedValue =
                field.type === 'int'
                    ? factory.createCallExpression(
                          factory.createPropertyAccessExpression(factory.createIdentifier('Math'), 'trunc'),
                          undefined,
                          [dataValue],
                      )
                    : dataValue
            statements.push(
                factory.createIfStatement(
                    factory.createPropertyAccessChain(
                        factory.createIdentifier('data'),
                        factory.createToken(ts.SyntaxKind.QuestionDotToken),
                        field.name,
                    ),
                    factory.createBlock(
                        [
                            factory.createExpressionStatement(
                                factory.createAssignment(
                                    factory.createPropertyAccessExpression(factory.createThis(), `_${field.name}`),
                                    assignedValue,
                                ),
                            ),
                        ],
                        true,
                    ),
                ),
            )
            statements.push(createDeletePublicField(factory, field.name))
        }
    } else {
        parameters.push(
            factory.createParameterDeclaration(
                undefined,
                undefined,
                'id',
                undefined,
                parseTypeNode(record.idFiledType!),
                undefined,
            ),
        )
        if (kind === BeanDifferKind.HashJson) {
            parameters.push(
                factory.createParameterDeclaration(
                    undefined,
                    undefined,
                    'rootKey',
                    factory.createToken(ts.SyntaxKind.QuestionToken),
                    factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                    undefined,
                ),
            )
        }
        parameters.push(
            factory.createParameterDeclaration(
                undefined,
                undefined,
                'loadOpts',
                factory.createToken(ts.SyntaxKind.QuestionToken),
                factory.createTypeReferenceNode(
                    factory.createQualifiedName(runtime, factory.createIdentifier('HashLoadOpts')),
                    undefined,
                ),
                undefined,
            ),
            factory.createParameterDeclaration(
                undefined,
                undefined,
                'byLoad',
                undefined,
                undefined,
                factory.createFalse(),
            ),
        )
        const superArgs =
            kind === BeanDifferKind.HashJson ? ['id', 'rootKey', 'loadOpts', 'byLoad'] : ['id', 'loadOpts', 'byLoad']
        statements.push(
            factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createSuper(),
                    undefined,
                    superArgs.map((name) => factory.createIdentifier(name)),
                ),
            ),
        )
        fields.forEach((field) => statements.push(createDeletePublicField(factory, field.name)))
        statements.push(
            factory.createExpressionStatement(
                factory.createAssignment(
                    factory.createPropertyAccessExpression(factory.createThis(), '_id'),
                    factory.createIdentifier('id'),
                ),
            ),
        )
    }
    return factory.createConstructorDeclaration(undefined, parameters, factory.createBlock(statements, true))
}

function createDeletePublicField(factory: ts.NodeFactory, fieldName: string): ts.Statement {
    return factory.createExpressionStatement(
        factory.createDeleteExpression(
            factory.createPropertyAccessExpression(
                factory.createParenthesizedExpression(
                    factory.createAsExpression(
                        factory.createThis(),
                        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                    ),
                ),
                fieldName,
            ),
        ),
    )
}

function createBuildNetMethod(factory: ts.NodeFactory): ts.MethodDeclaration {
    return factory.createMethodDeclaration(
        undefined,
        undefined,
        'buildNet',
        undefined,
        undefined,
        [
            factory.createParameterDeclaration(
                undefined,
                undefined,
                'data',
                undefined,
                factory.createTypeReferenceNode('Partial', [factory.createThisTypeNode()]),
                undefined,
            ),
        ],
        undefined,
        factory.createBlock(
            [
                factory.createExpressionStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(factory.createSuper(), '_buildNet'),
                        undefined,
                        [factory.createIdentifier('data')],
                    ),
                ),
            ],
            true,
        ),
    )
}

function createFieldAccessors(
    context: ts.TransformationContext,
    field: BeanFieldRecord,
    kind: BeanDifferKind,
    className: string,
    runtime: ts.Identifier,
): ts.ClassElement[] {
    if (isPrimitiveRecord(field)) {
        return createPrimitiveAccessors(context.factory, field, kind, className, runtime)
    }
    if (field.type === 'Array') {
        return [createArrayGetter(context.factory, field, kind, className, runtime)]
    }
    if (field.type === 'Map') {
        return [createMapGetter(context.factory, field, kind, className, runtime)]
    }
    return createObjectAccessors(context.factory, field, kind, className, runtime)
}

function createPrimitiveAccessors(
    factory: ts.NodeFactory,
    field: BeanFieldRecord,
    kind: BeanDifferKind,
    className: string,
    runtime: ts.Identifier,
): ts.ClassElement[] {
    const storage = () => factory.createPropertyAccessExpression(factory.createThis(), `_${field.name}`)
    const getterStatements: ts.Statement[] = []
    if (kind !== BeanDifferKind.Bean) getterStatements.push(createTryLoad(factory, field.name))
    getterStatements.push(factory.createReturnStatement(storage()))

    const setterStatements: ts.Statement[] = []
    if (field.type === 'int' || field.type === 'number') {
        setterStatements.push(
            factory.createIfStatement(
                factory.createCallExpression(factory.createIdentifier('isNaN'), undefined, [
                    factory.createIdentifier('value'),
                ]),
                factory.createBlock(
                    [
                        factory.createThrowStatement(
                            factory.createNewExpression(factory.createIdentifier('Error'), undefined, [
                                factory.createBinaryExpression(
                                    factory.createBinaryExpression(
                                        factory.createStringLiteral(`${field.name} value=`),
                                        factory.createToken(ts.SyntaxKind.PlusToken),
                                        factory.createIdentifier('value'),
                                    ),
                                    factory.createToken(ts.SyntaxKind.PlusToken),
                                    factory.createStringLiteral(' is not a number or NaN'),
                                ),
                            ]),
                        ),
                    ],
                    true,
                ),
            ),
        )
    }
    if (field.type === 'int') {
        setterStatements.push(
            factory.createExpressionStatement(
                factory.createAssignment(
                    factory.createIdentifier('value'),
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(factory.createIdentifier('Math'), 'trunc'),
                        undefined,
                        [factory.createIdentifier('value')],
                    ),
                ),
            ),
        )
    }
    setterStatements.push(
        factory.createIfStatement(
            factory.createBinaryExpression(
                storage(),
                factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                factory.createIdentifier('value'),
            ),
            factory.createBlock([factory.createReturnStatement()], true),
        ),
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(factory.createThis(), 'assertWritable'),
                undefined,
                [],
            ),
        ),
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [factory.createVariableDeclaration('oldVal', undefined, undefined, storage())],
                ts.NodeFlags.Const,
            ),
        ),
        factory.createExpressionStatement(factory.createAssignment(storage(), factory.createIdentifier('value'))),
        createOnChange(factory, className, field.name, runtime, 'Update', factory.createIdentifier('oldVal')),
    )

    const type = beanFieldTypeNode(factory, field, runtime)
    return [
        factory.createGetAccessorDeclaration(
            undefined,
            field.name,
            [],
            type,
            factory.createBlock(getterStatements, true),
        ),
        factory.createSetAccessorDeclaration(
            undefined,
            field.name,
            [factory.createParameterDeclaration(undefined, undefined, 'value', undefined, type, undefined)],
            factory.createBlock(setterStatements, true),
        ),
    ]
}

function createArrayGetter(
    factory: ts.NodeFactory,
    field: BeanFieldRecord,
    kind: BeanDifferKind,
    className: string,
    runtime: ts.Identifier,
): ts.GetAccessorDeclaration {
    const storage = () => factory.createPropertyAccessExpression(factory.createThis(), `_${field.name}`)
    const fieldInfo = () => classFieldInfo(factory, className, field.name)
    const statements: ts.Statement[] = []
    if (kind !== BeanDifferKind.Bean) statements.push(createTryLoad(factory, field.name))

    const createEmpty: ts.Statement[] = [
        factory.createExpressionStatement(
            factory.createAssignment(
                storage(),
                createCollectionInstance(factory, runtime, 'DiffArray', field, [fieldInfo()]),
            ),
        ),
        createInitDiff(factory, storage(), fieldInfo(), runtime, true),
    ]
    const restoreStatements: ts.Statement[] = []
    const sourceValue =
        kind === BeanDifferKind.Bean
            ? factory.createAsExpression(
                  storage(),
                  factory.createArrayTypeNode(parseTypeNode(field.collectionTypes![0])),
              )
            : factory.createCallExpression(
                  factory.createPropertyAccessExpression(factory.createIdentifier('JSON'), 'parse'),
                  undefined,
                  [factory.createAsExpression(storage(), factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword))],
              )
    restoreStatements.push(
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [factory.createVariableDeclaration('val', undefined, undefined, sourceValue)],
                ts.NodeFlags.Const,
            ),
        ),
        factory.createExpressionStatement(
            factory.createAssignment(
                storage(),
                createCollectionInstance(factory, runtime, 'DiffArray', field, [
                    fieldInfo(),
                    factory.createSpreadElement(factory.createIdentifier('val')),
                ]),
            ),
        ),
        createInitDiff(factory, storage(), fieldInfo(), runtime, true),
    )
    statements.push(
        factory.createIfStatement(
            factory.createBinaryExpression(
                storage(),
                factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                factory.createIdentifier('undefined'),
            ),
            factory.createBlock(createEmpty, true),
            factory.createIfStatement(
                kind === BeanDifferKind.Bean
                    ? factory.createPrefixUnaryExpression(
                          ts.SyntaxKind.ExclamationToken,
                          factory.createParenthesizedExpression(
                              factory.createBinaryExpression(
                                  storage(),
                                  factory.createToken(ts.SyntaxKind.InstanceOfKeyword),
                                  runtimeAccess(factory, runtime, 'DiffArray'),
                              ),
                          ),
                      )
                    : factory.createBinaryExpression(
                          factory.createTypeOfExpression(storage()),
                          factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                          factory.createStringLiteral('string'),
                      ),
                factory.createBlock(restoreStatements, true),
            ),
        ),
        factory.createReturnStatement(storage()),
    )
    return factory.createGetAccessorDeclaration(
        undefined,
        field.name,
        [],
        beanFieldTypeNode(factory, field, runtime),
        factory.createBlock(statements, true),
    )
}

function createMapGetter(
    factory: ts.NodeFactory,
    field: BeanFieldRecord,
    kind: BeanDifferKind,
    className: string,
    runtime: ts.Identifier,
): ts.GetAccessorDeclaration {
    const storage = () => factory.createPropertyAccessExpression(factory.createThis(), `_${field.name}`)
    const fieldInfo = () => classFieldInfo(factory, className, field.name)
    const statements: ts.Statement[] = []
    if (kind !== BeanDifferKind.Bean) statements.push(createTryLoad(factory, field.name))

    const createEmpty: ts.Statement[] = [
        factory.createExpressionStatement(
            factory.createAssignment(
                storage(),
                createCollectionInstance(factory, runtime, 'DiffMap', field, [fieldInfo()]),
            ),
        ),
    ]
    if (kind === BeanDifferKind.Hash && field.modType !== 'ModType.None') {
        createEmpty.push(createSubModVersionInitialization(factory, field.name))
    }
    createEmpty.push(
        factory.createIfStatement(
            factory.createPropertyAccessExpression(factory.createThis(), 'writable'),
            factory.createBlock([createInitDiff(factory, storage(), fieldInfo(), runtime, false)], true),
        ),
    )

    const restoreValue =
        kind === BeanDifferKind.Bean
            ? storage()
            : factory.createCallExpression(
                  factory.createPropertyAccessExpression(factory.createIdentifier('JSON'), 'parse'),
                  undefined,
                  [factory.createAsExpression(storage(), factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword))],
              )
    const restoreStatements: ts.Statement[] = [
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [factory.createVariableDeclaration('data', undefined, undefined, restoreValue)],
                ts.NodeFlags.Const,
            ),
        ),
        factory.createExpressionStatement(
            factory.createAssignment(
                storage(),
                createCollectionInstance(factory, runtime, 'DiffMap', field, [fieldInfo()]),
            ),
        ),
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(storage(), 'parseFromData'),
                undefined,
                [
                    factory.createIdentifier('data'),
                    factory.createPropertyAccessExpression(factory.createThis(), 'writable'),
                ],
            ),
        ),
        createInitDiff(factory, storage(), fieldInfo(), runtime, false),
    ]
    const rebind = factory.createIfStatement(
        factory.createPropertyAccessExpression(factory.createThis(), 'diff'),
        factory.createBlock([createInitDiff(factory, storage(), fieldInfo(), runtime, false)], true),
    )
    statements.push(
        factory.createIfStatement(
            factory.createBinaryExpression(
                storage(),
                factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                factory.createIdentifier('undefined'),
            ),
            factory.createBlock(createEmpty, true),
            factory.createIfStatement(
                kind === BeanDifferKind.Bean
                    ? factory.createPrefixUnaryExpression(
                          ts.SyntaxKind.ExclamationToken,
                          factory.createParenthesizedExpression(
                              factory.createBinaryExpression(
                                  storage(),
                                  factory.createToken(ts.SyntaxKind.InstanceOfKeyword),
                                  runtimeAccess(factory, runtime, 'DiffMap'),
                              ),
                          ),
                      )
                    : factory.createBinaryExpression(
                          factory.createTypeOfExpression(storage()),
                          factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                          factory.createStringLiteral('string'),
                      ),
                factory.createBlock(restoreStatements, true),
                rebind,
            ),
        ),
        factory.createReturnStatement(storage()),
    )
    return factory.createGetAccessorDeclaration(
        undefined,
        field.name,
        [],
        beanFieldTypeNode(factory, field, runtime),
        factory.createBlock(statements, true),
    )
}

function createObjectAccessors(
    factory: ts.NodeFactory,
    field: BeanFieldRecord,
    kind: BeanDifferKind,
    className: string,
    runtime: ts.Identifier,
): ts.ClassElement[] {
    const storage = () => factory.createPropertyAccessExpression(factory.createThis(), `_${field.name}`)
    const fieldInfo = () => classFieldInfo(factory, className, field.name)
    const statements: ts.Statement[] = []
    if (kind === BeanDifferKind.Hash) statements.push(createTryLoad(factory, field.name))

    if (kind === BeanDifferKind.Hash) {
        const absent: ts.Statement[] = []
        if (field.hasQuestionToken) {
            absent.push(factory.createReturnStatement(factory.createIdentifier('undefined')))
        } else {
            absent.push(
                factory.createExpressionStatement(
                    factory.createAssignment(
                        storage(),
                        factory.createNewExpression(parseExpression(field.type), undefined, []),
                    ),
                ),
            )
        }
        if (field.modType !== 'ModType.None') absent.push(createSubModVersionInitialization(factory, field.name))
        statements.push(
            factory.createIfStatement(
                factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, storage()),
                factory.createBlock(absent, true),
            ),
        )
    } else if (kind === BeanDifferKind.HashJson) {
        statements.push(
            factory.createIfStatement(
                factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, storage()),
                factory.createBlock(
                    [
                        factory.createReturnStatement(
                            field.hasQuestionToken
                                ? factory.createIdentifier('undefined')
                                : factory.createNewExpression(parseExpression(field.type), undefined, []),
                        ),
                    ],
                    true,
                ),
            ),
        )
    } else {
        statements.push(
            factory.createIfStatement(
                factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, storage()),
                factory.createBlock([factory.createReturnStatement(factory.createIdentifier('undefined'))], true),
            ),
        )
    }

    const restoreStatements: ts.Statement[] = [
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [
                    factory.createVariableDeclaration(
                        'val',
                        undefined,
                        undefined,
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(factory.createIdentifier('JSON'), 'parse'),
                            undefined,
                            [storage()],
                        ),
                    ),
                ],
                ts.NodeFlags.Const,
            ),
        ),
        factory.createExpressionStatement(
            factory.createAssignment(
                storage(),
                factory.createNewExpression(parseExpression(field.type), undefined, []),
            ),
        ),
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(storage(), 'parseFromData'),
                undefined,
                [
                    factory.createIdentifier('val'),
                    factory.createPropertyAccessExpression(factory.createThis(), 'writable'),
                ],
            ),
        ),
    ]
    if (kind !== BeanDifferKind.Hash) {
        restoreStatements.push(
            factory.createExpressionStatement(
                factory.createCallExpression(factory.createPropertyAccessExpression(storage(), 'initDiff'), undefined, [
                    factory.createThis(),
                    fieldInfo(),
                    factory.createIdentifier('val'),
                ]),
            ),
        )
    }
    const elseStatements: ts.Statement[] = []
    if (kind !== BeanDifferKind.Hash) {
        elseStatements.push(
            factory.createExpressionStatement(
                factory.createCallExpression(factory.createPropertyAccessExpression(storage(), 'initDiff'), undefined, [
                    factory.createThis(),
                    fieldInfo(),
                ]),
            ),
        )
    }
    statements.push(
        factory.createIfStatement(
            factory.createBinaryExpression(
                factory.createTypeOfExpression(storage()),
                factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                factory.createStringLiteral('string'),
            ),
            factory.createBlock(restoreStatements, true),
            elseStatements.length ? factory.createBlock(elseStatements, true) : undefined,
        ),
    )
    if (kind === BeanDifferKind.Hash) {
        statements.push(
            factory.createExpressionStatement(
                factory.createCallExpression(factory.createPropertyAccessExpression(storage(), 'initDiff'), undefined, [
                    factory.createThis(),
                    fieldInfo(),
                ]),
            ),
        )
    }
    statements.push(factory.createReturnStatement(storage()))

    const sourceType = beanFieldTypeNode(factory, field, runtime)
    const getterType =
        kind === BeanDifferKind.Bean || field.hasQuestionToken
            ? factory.createUnionTypeNode([sourceType, factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword)])
            : sourceType
    const setterStatements = [
        factory.createIfStatement(
            factory.createBinaryExpression(
                storage(),
                factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                factory.createIdentifier('value'),
            ),
            factory.createBlock([factory.createReturnStatement()], true),
        ),
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(factory.createThis(), 'assertWritable'),
                undefined,
                [],
            ),
        ),
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(factory.createThis(), 'onChange'),
                undefined,
                [
                    fieldInfo(),
                    factory.createConditionalExpression(
                        factory.createIdentifier('value'),
                        factory.createToken(ts.SyntaxKind.QuestionToken),
                        runtimeAccess(factory, runtime, 'FieldStatus', 'Update'),
                        factory.createToken(ts.SyntaxKind.ColonToken),
                        runtimeAccess(factory, runtime, 'FieldStatus', 'Delete'),
                    ),
                ],
            ),
        ),
        factory.createExpressionStatement(factory.createAssignment(storage(), factory.createIdentifier('value'))),
    ]
    return [
        factory.createGetAccessorDeclaration(
            undefined,
            field.name,
            [],
            getterType,
            factory.createBlock(statements, true),
        ),
        factory.createSetAccessorDeclaration(
            undefined,
            field.name,
            [factory.createParameterDeclaration(undefined, undefined, 'value', undefined, sourceType, undefined)],
            factory.createBlock(setterStatements, true),
        ),
    ]
}

function createClassInfoProperty(
    context: ts.TransformationContext,
    className: string,
    record: BeanCompileRecord,
    kind: BeanDifferKind,
    runtime: ts.Identifier,
): ts.PropertyDeclaration {
    const factory = context.factory
    const args: ts.Expression[] = [factory.createStringLiteral(className), factory.createIdentifier(className)]
    if (kind !== BeanDifferKind.Bean) {
        args.push(
            factory.createNumericLiteral(record.modId!),
            parseRuntimeExpression(context, record.saveType!, runtime),
            parseRuntimeExpression(context, record.modType!, runtime),
        )
    }
    return factory.createPropertyDeclaration(
        [factory.createModifier(ts.SyntaxKind.StaticKeyword)],
        '_class_info',
        undefined,
        undefined,
        factory.createNewExpression(runtimeAccess(factory, runtime, 'ClassInfo'), undefined, args),
    )
}

function createFieldInfoProperty(
    context: ts.TransformationContext,
    className: string,
    field: BeanFieldRecord,
    runtime: ts.Identifier,
): ts.PropertyDeclaration {
    const factory = context.factory
    const args: ts.Expression[] = [
        factory.createPropertyAccessExpression(factory.createIdentifier(className), '_class_info'),
        factory.createStringLiteral(field.name),
        factory.createNumericLiteral(field.id),
        fieldTypeExpression(factory, field, runtime),
        field.defaultValue === undefined ? factory.createIdentifier('undefined') : parseExpression(field.defaultValue),
        collectionTypeExpression(factory, field),
        parseRuntimeExpression(context, field.saveType!, runtime),
    ]
    args.push(
        parseRuntimeExpression(context, field.modType!, runtime),
        field.listen === 'undefined' ? factory.createIdentifier('undefined') : parseExpression(field.listen!),
    )
    return factory.createPropertyDeclaration(
        [factory.createModifier(ts.SyntaxKind.StaticKeyword), factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
        `f_${field.name}`,
        undefined,
        undefined,
        factory.createNewExpression(runtimeAccess(factory, runtime, 'FieldInfo'), undefined, args),
    )
}

function createFieldRegistrationBlock(
    factory: ts.NodeFactory,
    className: string,
    fields: BeanFieldRecord[],
): ts.ClassStaticBlockDeclaration {
    return factory.createClassStaticBlockDeclaration(
        factory.createBlock(
            fields.map((field) =>
                factory.createExpressionStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(factory.createIdentifier(className), '_class_info'),
                            'addField',
                        ),
                        undefined,
                        [classFieldInfo(factory, className, field.name)],
                    ),
                ),
            ),
            true,
        ),
    )
}

function createTryLoad(factory: ts.NodeFactory, fieldName: string): ts.Statement {
    return factory.createExpressionStatement(
        factory.createCallExpression(
            factory.createPropertyAccessExpression(factory.createThis(), 'tryLoad'),
            undefined,
            [factory.createStringLiteral(fieldName)],
        ),
    )
}

function createInitDiff(
    factory: ts.NodeFactory,
    storage: ts.Expression,
    fieldInfo: ts.Expression,
    runtime: ts.Identifier,
    autoInit: boolean,
): ts.Statement {
    const args: ts.Expression[] = [factory.createThis(), fieldInfo]
    if (autoInit) args.push(runtimeAccess(factory, runtime, 'BeanStatus', 'AutoInit'))
    return factory.createExpressionStatement(
        factory.createCallExpression(factory.createPropertyAccessExpression(storage, 'initDiff'), undefined, args),
    )
}

function createSubModVersionInitialization(factory: ts.NodeFactory, fieldName: string): ts.Statement {
    return factory.createExpressionStatement(
        factory.createAssignment(
            factory.createPropertyAccessExpression(
                factory.createNonNullExpression(
                    factory.createPropertyAccessExpression(factory.createThis(), '__versions'),
                ),
                fieldName,
            ),
            factory.createNumericLiteral(1),
        ),
    )
}

function createOnChange(
    factory: ts.NodeFactory,
    className: string,
    fieldName: string,
    runtime: ts.Identifier,
    status: 'Update' | 'Delete',
    oldValue?: ts.Expression,
): ts.Statement {
    const args: ts.Expression[] = [
        classFieldInfo(factory, className, fieldName),
        runtimeAccess(factory, runtime, 'FieldStatus', status),
    ]
    if (oldValue) args.push(oldValue)
    return factory.createExpressionStatement(
        factory.createCallExpression(
            factory.createPropertyAccessExpression(factory.createThis(), 'onChange'),
            undefined,
            args,
        ),
    )
}

function createCollectionInstance(
    factory: ts.NodeFactory,
    runtime: ts.Identifier,
    className: 'DiffArray' | 'DiffMap',
    field: BeanFieldRecord,
    args: ts.Expression[],
): ts.NewExpression {
    return factory.createNewExpression(
        runtimeAccess(factory, runtime, className),
        field.collectionTypes?.map(parseTypeNode),
        args,
    )
}

function beanFieldTypeNode(factory: ts.NodeFactory, field: BeanFieldRecord, runtime: ts.Identifier): ts.TypeNode {
    switch (field.type) {
        case 'int':
        case 'uint':
            return factory.createTypeReferenceNode(field.type, undefined)
        case 'number':
            return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        case 'string':
            return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
        case 'boolean':
            return factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
        case 'Array':
            return factory.createTypeReferenceNode(
                factory.createQualifiedName(runtime, factory.createIdentifier('DiffArray')),
                [parseTypeNode(field.collectionTypes![0])],
            )
        case 'Map':
            return factory.createTypeReferenceNode(
                factory.createQualifiedName(runtime, factory.createIdentifier('DiffMap')),
                field.collectionTypes!.map(parseTypeNode),
            )
        default:
            return parseTypeNode(field.type)
    }
}

function fieldTypeExpression(factory: ts.NodeFactory, field: BeanFieldRecord, runtime: ts.Identifier): ts.Expression {
    if (isPrimitiveRecord(field)) return factory.createStringLiteral(field.type)
    if (field.type === 'Array') return runtimeAccess(factory, runtime, 'DiffArray', '_class_info')
    if (field.type === 'Map') return runtimeAccess(factory, runtime, 'DiffMap', '_class_info')
    return factory.createPropertyAccessExpression(parseExpression(field.type), '_class_info')
}

function collectionTypeExpression(factory: ts.NodeFactory, field: BeanFieldRecord): ts.Expression {
    if (!field.collectionTypes?.length) return factory.createIdentifier('undefined')
    if (field.type === 'Array') {
        return factory.createArrayLiteralExpression([
            factory.createStringLiteral(field.collectionTypes[0]),
            factory.createIdentifier('undefined'),
        ])
    }
    const valueType = field.typeImport
        ? factory.createPropertyAccessExpression(parseExpression(field.collectionTypes[1]), '_class_info')
        : factory.createStringLiteral(field.collectionTypes[1])
    return factory.createArrayLiteralExpression([factory.createStringLiteral(field.collectionTypes[0]), valueType])
}

function classFieldInfo(factory: ts.NodeFactory, className: string, fieldName: string): ts.PropertyAccessExpression {
    return factory.createPropertyAccessExpression(factory.createIdentifier(className), `f_${fieldName}`)
}

function runtimeAccess(
    factory: ts.NodeFactory,
    runtime: ts.Identifier,
    ...names: string[]
): ts.PropertyAccessExpression {
    let expression: ts.Expression = runtime
    for (const name of names) expression = factory.createPropertyAccessExpression(expression, name)
    return expression as ts.PropertyAccessExpression
}

function parseRuntimeExpression(
    context: ts.TransformationContext,
    text: string,
    runtime: ts.Identifier,
): ts.Expression {
    const runtimeRoots = new Set(['SaveType', 'ModType', 'BeanStatus', 'FieldStatus'])
    const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
        if (ts.isIdentifier(node) && runtimeRoots.has(node.text)) {
            return runtimeAccess(context.factory, runtime, node.text)
        }
        return ts.visitEachChild(node, visitor, context)
    }
    return ts.visitNode(parseExpression(text), visitor, ts.isExpression)!
}

function parseExpression(text: string): ts.Expression {
    const normalized = text.trim()
    if (normalized === 'undefined') return ts.factory.createIdentifier('undefined')
    if (normalized === 'true') return ts.factory.createTrue()
    if (normalized === 'false') return ts.factory.createFalse()
    if (normalized === 'null') return ts.factory.createNull()
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return ts.factory.createNumericLiteral(normalized)
    if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(normalized)) {
        const names = normalized.split('.')
        let expression: ts.Expression = ts.factory.createIdentifier(names[0])
        for (const name of names.slice(1)) expression = ts.factory.createPropertyAccessExpression(expression, name)
        return expression
    }
    const source = ts.createSourceFile(
        '__bean_expression.ts',
        `(${normalized})`,
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
    )
    const statement = source.statements[0]
    if (!statement || !ts.isExpressionStatement(statement)) {
        throw new Error(`[Bean编译] 无法解析表达式: ${text}`)
    }
    const expression = statement.expression
    return synthesizedClone(ts.isParenthesizedExpression(expression) ? expression.expression : expression)
}

function parseTypeNode(text: string): ts.TypeNode {
    const source = ts.createSourceFile(
        '__bean_type.ts',
        `type __BeanType = ${text}`,
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
    )
    const statement = source.statements[0]
    if (!statement || !ts.isTypeAliasDeclaration(statement)) {
        throw new Error(`[Bean编译] 无法解析类型: ${text}`)
    }
    return synthesizedClone(statement.type)
}

function synthesizedClone<T extends ts.Node>(node: T): T {
    const clone = (
        ts as typeof ts & {
            getSynthesizedDeepClone<N extends ts.Node>(value: N): N
        }
    ).getSynthesizedDeepClone(node)
    const resetForeignRange = (current: ts.Node) => {
        ts.setTextRange(current, { pos: -1, end: -1 })
        ;(current as ts.Node & { original?: ts.Node }).original = undefined
        ts.forEachChild(current, resetForeignRange)
    }
    resetForeignRange(clone)
    return clone
}

function addRuntimeImport(
    factory: ts.NodeFactory,
    statements: readonly ts.Statement[],
    runtimeName: string,
): readonly ts.Statement[] {
    const alreadyImported = statements.some(
        (statement) =>
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier) &&
            statement.moduleSpecifier.text === ENGINE_MODULE &&
            statement.importClause?.namedBindings !== undefined &&
            ts.isNamespaceImport(statement.importClause.namedBindings) &&
            statement.importClause.namedBindings.name.text === runtimeName,
    )
    if (alreadyImported) return statements

    const declaration = factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
            false,
            undefined,
            factory.createNamespaceImport(factory.createIdentifier(runtimeName)),
        ),
        factory.createStringLiteral(ENGINE_MODULE),
        undefined,
    )
    let insertAt = 0
    while (insertAt < statements.length && ts.isImportDeclaration(statements[insertAt])) insertAt++
    return [...statements.slice(0, insertAt), declaration, ...statements.slice(insertAt)]
}

function findOrCreateRuntimeName(sourceFile: ts.SourceFile): string {
    for (const statement of sourceFile.statements) {
        if (
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier) &&
            statement.moduleSpecifier.text === ENGINE_MODULE &&
            statement.importClause?.namedBindings &&
            ts.isNamespaceImport(statement.importClause.namedBindings)
        ) {
            return statement.importClause.namedBindings.name.text
        }
    }
    let index = 0
    let candidate = '__alloyBeanRuntime'
    while (new RegExp(`\\b${candidate}\\b`).test(sourceFile.text)) {
        index++
        candidate = `__alloyBeanRuntime${index}`
    }
    return candidate
}

function isBusinessField(member: ts.ClassElement): member is ts.PropertyDeclaration {
    return ts.isPropertyDeclaration(member) && !hasModifier(member, ts.SyntaxKind.StaticKeyword)
}

function isPrimitiveRecord(field: BeanFieldRecord): boolean {
    return field.type === 'int' || field.type === 'number' || field.type === 'string' || field.type === 'boolean'
}

function sourceFieldTypeText(sourceFile: ts.SourceFile, node: ts.PropertyDeclaration, record: BeanFieldRecord): string {
    if (node.type) return node.type.getText(sourceFile)
    if (node.initializer) {
        if (ts.isNumericLiteral(node.initializer)) return 'number'
        if (ts.isStringLiteralLike(node.initializer)) return 'string'
        if (
            node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
            node.initializer.kind === ts.SyntaxKind.FalseKeyword
        ) {
            return 'boolean'
        }
    }
    return record.sourceType ?? record.type
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] {
    return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []
}

function propertyNameText(name: ts.PropertyName | undefined): string | undefined {
    if (!name) return undefined
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
    return undefined
}

function methodName(member: ts.ClassElement): string | undefined {
    return ts.isMethodDeclaration(member) ? propertyNameText(member.name) : undefined
}

function normalizeTypeText(value: string): string {
    return value.replace(/\s+/g, '').replace(/import\("[^"]*"\)\./g, '')
}

function normalizeDecoratorText(value: string): string {
    return value.replace(/\s+/g, '')
}

function anchorGeneratedTree(sourceFile: ts.SourceFile, generated: ts.Node, anchor: ts.Node) {
    const start = anchor.getStart(sourceFile)
    const range = { pos: start, end: Math.max(start, anchor.end) }
    if (generated.pos < 0 || generated.end < 0) ts.setTextRange(generated, range)
    const addSourceMapRange = (node: ts.Node) => {
        ts.setSourceMapRange(node, range)
        ts.forEachChild(node, addSourceMapRange)
    }
    addSourceMapRange(generated)
}

function copySourceFileIdentity(target: ts.SourceFile, source: ts.SourceFile) {
    const sourceWithIdentity = source as ts.SourceFile & {
        path?: ts.Path
        resolvedPath?: ts.Path
        originalFileName?: string
        impliedNodeFormat?: ts.ResolutionMode
        packageJsonLocations?: readonly string[]
        packageJsonScope?: unknown
        version?: string
    }
    const targetWithIdentity = target as typeof sourceWithIdentity
    targetWithIdentity.path = sourceWithIdentity.path
    targetWithIdentity.resolvedPath = sourceWithIdentity.resolvedPath
    targetWithIdentity.originalFileName = sourceWithIdentity.originalFileName
    targetWithIdentity.impliedNodeFormat = sourceWithIdentity.impliedNodeFormat
    targetWithIdentity.packageJsonLocations = sourceWithIdentity.packageJsonLocations
    targetWithIdentity.packageJsonScope = sourceWithIdentity.packageJsonScope
    targetWithIdentity.version = sourceWithIdentity.version
}

function failAt(sourceFile: ts.SourceFile, node: ts.Node, message: string): never {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    throw new Error(
        `[Bean编译] ${sourceFile.fileName}:${position.line + 1}:${position.character + 1} ${message}；请先执行 ${RECORD_REFRESH_COMMAND}`,
    )
}
