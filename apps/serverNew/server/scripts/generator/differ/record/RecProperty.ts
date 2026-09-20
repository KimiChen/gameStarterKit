import { RecordGen, RecordField } from '../../util/RecordGen'
import { getComment, getCommentWrapped } from '../../util/DocumentationParser'
import { getPropTypeName, isScalarType } from '../../util/TypeScriptPropertyTypes'
import { RecBean } from './RecBean'
import { PropertyDeclaration, PropertySignature, SyntaxKind } from 'ts-morph'
import path from 'path'

export class RecProperty extends RecordGen {
    @RecordField()
    id!: number

    @RecordField()
    name!: string

    /** 类型, 基础类型，Map， Array */
    @RecordField()
    type!: string

    @RecordField()
    comment!: string

    get commentWrapped() {
        return getCommentWrapped(this.comment)
    }

    @RecordField()
    deleted?: boolean

    prop!: PropertyDeclaration | PropertySignature

    /** 要导入的相对路径 */
    @RecordField()
    typeImport: string = ''

    @RecordField()
    hasQuestionToken = false

    /** 集合类型列表, 值类型, key类型  */
    @RecordField()
    collectionTypes?: string[]

    rootPath: string = 'src/modules/'

    sourceImportResolver?: (absolutePath: string) => string | undefined

    static BUFFER_TYPES = new Set([
        'ArrayBuffer',
        'Int8Array',
        'Int16Array',
        'Int32Array',
        'BigInt64Array',
        'Uint8Array',
        'Uint16Array',
        'Uint32Array',
        'BigUint64Array',
        'Float32Array',
        'Float64Array',
    ])

    init(
        prop: PropertyDeclaration | PropertySignature,
        rootPath: string,
        sourceImportResolver?: (absolutePath: string) => string | undefined,
    ) {
        this.rootPath = rootPath
        this.sourceImportResolver = sourceImportResolver
        this.prop = prop
        this.comment = getComment(prop)
        this.initType()
        this.hasQuestionToken = this.prop.hasQuestionToken()
    }

    initType() {
        const type = this.prop.getType()
        if (type.isEnum()) {
            this.type = 'uint'
            return
        }
        if (this.initTypeFromSourceNode()) {
            return
        }
        const propType = type.getText()
        if (type.isArray()) {
            this.type = 'Array'
            const elementType = type.getArrayElementType()!
            const eleTypeText = elementType.getText()
            let eleTypeName = eleTypeText
            if (elementType.isClassOrInterface()) {
                //引用类型
                if (eleTypeText.startsWith('import(')) {
                    const importBeanIndex = eleTypeText.indexOf(this.rootPath)
                    eleTypeName = eleTypeText.substring(eleTypeText.lastIndexOf('.') + 1)
                    if (importBeanIndex > 0) {
                        this.typeImport =
                            '/' +
                            eleTypeText.substring(
                                importBeanIndex + this.rootPath.length,
                                eleTypeText.lastIndexOf(')') - 1,
                            )
                    }
                } else {
                    this.typeImport = '/' + this.prop.getSourceFile().getBaseNameWithoutExtension()
                }
            }
            this.collectionTypes = [eleTypeName]
            return
        }
        const isCollectionType = type.getTypeArguments() && type.getTypeArguments().length > 0
        this.type = this.parseType(propType, isCollectionType)
        if (isCollectionType) {
            this.initCollectionType(propType)
        } else if (type.isInterface() && RecProperty.BUFFER_TYPES.has(this.type)) {
            this.type = 'buffer'
        }
    }

    /**
     * TypeScript 5.9 下 checker 的 getText()/getTypeArguments() 会展开为绝对
     * import() 类型。Bean/协议记录优先读取源码 type node，保持生成契约稳定。
     */
    private initTypeFromSourceNode(): boolean {
        const typeNode = this.prop.getTypeNode()
        if (!typeNode) return false
        const sourceType = typeNode.getText().trim()
        const normalized = sourceType.replace(/\s+/g, '')

        if (normalized.endsWith('[]')) {
            const itemType = normalized.substring(0, normalized.length - 2)
            this.type = 'Array'
            this.collectionTypes = [itemType]
            this.typeImport = this.resolveSourceImport(itemType)
            return true
        }

        const generic = this.parseSourceGeneric(normalized)
        if (generic) {
            const [baseType, genericTypes] = generic
            if (baseType === 'Array' || baseType === 'DiffArray') {
                if (genericTypes.length !== 1) return false
                this.type = 'Array'
                this.collectionTypes = [genericTypes[0]]
                this.typeImport = this.resolveSourceImport(genericTypes[0])
                return true
            }
            if (baseType === 'Map' || baseType === 'DiffMap') {
                if (genericTypes.length !== 2) return false
                if (!['string', 'int'].includes(genericTypes[0])) {
                    throw new Error('Map类型必须为(string,int):  ' + sourceType)
                }
                this.type = 'Map'
                this.collectionTypes = genericTypes
                this.typeImport = this.resolveSourceImport(genericTypes[1])
                return true
            }
            return false
        }

        switch (normalized) {
            case 'int':
            case 'number':
            case 'string':
            case 'boolean':
                this.type = normalized
                return true
            default:
                if (RecProperty.BUFFER_TYPES.has(normalized)) {
                    this.type = 'buffer'
                    return true
                }
                if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(normalized)) {
                    this.type = normalized.substring(normalized.lastIndexOf('.') + 1)
                    this.typeImport = this.resolveSourceImport(this.type)
                    return true
                }
                return false
        }
    }

    private parseSourceGeneric(sourceType: string): [string, string[]] | undefined {
        const begin = sourceType.indexOf('<')
        if (begin <= 0 || !sourceType.endsWith('>')) return undefined
        const baseType = sourceType.substring(0, begin)
        const content = sourceType.substring(begin + 1, sourceType.length - 1)
        const parts: string[] = []
        let start = 0
        let depth = 0
        for (let index = 0; index < content.length; index++) {
            const char = content[index]
            if (char === '<' || char === '[' || char === '(' || char === '{') depth++
            if (char === '>' || char === ']' || char === ')' || char === '}') depth--
            if (char === ',' && depth === 0) {
                parts.push(content.substring(start, index))
                start = index + 1
            }
        }
        parts.push(content.substring(start))
        return [baseType, parts.map((item) => item.trim())]
    }

    private resolveSourceImport(typeName: string): string {
        if (['int', 'number', 'string', 'boolean', 'uint'].includes(typeName)) return ''
        const localName = typeName.substring(typeName.lastIndexOf('.') + 1)
        const sourceFile = this.prop.getSourceFile()
        for (const declaration of sourceFile.getImportDeclarations()) {
            let imported = declaration.getDefaultImport()?.getText() === localName
            if (!imported) {
                imported = declaration
                    .getNamedImports()
                    .some((item) => (item.getAliasNode()?.getText() ?? item.getName()) === localName)
            }
            if (!imported) continue
            const modulePath = declaration.getModuleSpecifierValue()
            if (!modulePath.startsWith('.')) return ''
            const absolute = path.resolve(path.dirname(sourceFile.getFilePath()), modulePath).replace(/\\/g, '/')
            const resolved = this.sourceImportResolver?.(absolute)
            if (resolved) return resolved
            const rootMarker = '/' + this.rootPath.replace(/^\/+|\/+$/g, '') + '/'
            const markerIndex = absolute.lastIndexOf(rootMarker)
            if (markerIndex < 0) return ''
            return (
                '/' +
                absolute
                    .substring(markerIndex + rootMarker.length)
                    .replace(/\.(?:tsx?|mts|cts)$/i, '')
                    .replace(/\/index$/, '')
            )
        }
        return ''
    }

    parseType(propType: string, isCollectionType = false) {
        if (isCollectionType) {
            propType = propType.match(/<(.+?)>/)![1]
            propType = propType.substring(propType.indexOf(',') + 1).trim() //处理map的情况
        }
        if (propType.startsWith('import(')) {
            const absoluteImport = propType.match(/import\("([^"]+)"\)/)?.[1]
            const resolved = absoluteImport ? this.sourceImportResolver?.(absoluteImport) : undefined
            if (resolved) {
                this.typeImport = resolved
                return propType.replace(/import\("[^"]*"\)\./g, '')
            }
            const importBeanIndex = propType.indexOf(this.rootPath)
            if (importBeanIndex > 0) {
                this.typeImport =
                    '/' + propType.substring(importBeanIndex + this.rootPath.length, propType.lastIndexOf(')') - 1)
            }
            return propType.replace(/import\("[^"]*"\)\./g, '')
        } else {
            //其他非导入类型
            return propType
        }
    }

    initCollectionType(propType: string) {
        propType = propType.replace(/import\("[^"]*"\)\./g, '')
        const baseType = propType.replace(/<.*?>/g, '')
        const match = propType.match(/<([^<>]+)>/)
        switch (baseType) {
            case 'DiffArray':
            case 'Array': {
                this.type = 'Array'
                if (match) {
                    this.collectionTypes = [match[1]]
                }
                break
            }
            case 'DiffMap':
            case 'Map': {
                this.type = 'Map'
                if (match) {
                    const ret = match[1].split(',')
                    ret[1] = ret[1].trim()
                    this.collectionTypes = [ret[0], this.parseType(ret[1])]
                    if (!['string', 'int'].includes(ret[0])) {
                        throw new Error('Map类型必须为(string,int):  ' + propType)
                    }
                }
                break
            }
        }
    }

    static getDefaultValueForType(type: string): string | undefined {
        // 根据属性类型返回相应的默认值，可以根据需要进行自定义
        switch (type) {
            case 'int':
            case 'number':
                return '0'
            case 'string':
                return '""'
            case 'boolean':
                return 'false'
            default:
                return undefined
        }
    }

    private getDoc(prop: PropertyDeclaration | PropertySignature): string[] | undefined {
        const prev = prop.getPreviousSibling()
        if (prop.getJsDocs().length > 0) {
            return [prop.getJsDocs()[0].getFullText()]
        } else if (prev && prev.getKind() === SyntaxKind.SingleLineCommentTrivia) {
            return [prev.getText().replaceAll('//', '')]
        }
        return undefined
    }

    isBaseType() {
        return isScalarType(this.type)
    }

    isCollectionType(): boolean {
        return this.collectionTypes ? true : false
    }

    isBeanType() {
        if (this.collectionTypes) {
            return false
        }
        if (this.typeImport) {
            return true
        }
    }

    protocolType() {
        if (this.collectionTypes) {
            if (this.type === 'Map') {
                return `Map<${this.collectionTypes[0]}, ${this.collectionTypes[1]}>`
            }
            if (this.type === 'Array') {
                return `${this.collectionTypes![0]}[]`
            }
        }
        return this.type
    }

    protobufType() {
        if (this.collectionTypes) {
            if (this.type === 'Map') {
                return this.collectionTypes[1]
            }
            if (this.type === 'Array') {
                return this.collectionTypes![0]
            }
        }
        switch (this.type) {
            case 'int':
                return 'int64'
            case 'number':
                return 'double'
            case 'uint':
                return 'uint64'
            case 'boolean':
                return 'bool'
            case 'string':
                return 'string'
        }
        return this.type
    }

    /** 获取关联的类型，有可能是对象，也有可能是数组或map引用 */
    refType() {
        const ct = this.collectionTypes
        if (!ct?.length) {
            return this.type
        }
        return ct[ct.length - 1]
    }
}
