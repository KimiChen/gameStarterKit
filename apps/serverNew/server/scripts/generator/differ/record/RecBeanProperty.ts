import { RecordField } from '../../util/RecordGen'
import { getComment } from '../../util/DocumentationParser'
import { RecBean } from './RecBean'
import { PropertyDeclaration } from 'ts-morph'
import { RecProperty } from './RecProperty'

export class RecBeanProperty extends RecProperty {
    bean!: RecBean

    @RecordField()
    defaultValue?: string

    /** 源码中声明的类型，用于编译期校验 record 是否过期。 */
    @RecordField()
    sourceType: string = ''

    /** 源码 initializer；null 表示字段没有 initializer。 */
    @RecordField()
    sourceInitializer: string | null = null

    /** 源码字段装饰器快照，用于编译期校验。 */
    @RecordField()
    decorators: string[] = []

    @RecordField()
    saveType = 'SaveType.All'

    @RecordField()
    modType = 'ModType.None'

    @RecordField()
    listen = 'undefined'

    initBean(
        bean: RecBean,
        prop: PropertyDeclaration,
        rootPath: string,
        sourceImportResolver?: (absolutePath: string) => string | undefined,
    ) {
        this.rootPath = rootPath
        this.bean = bean
        this.prop = prop
        this.sourceImportResolver = sourceImportResolver
        this.typeImport = ''
        this.collectionTypes = undefined
        this.defaultValue = undefined
        this.saveType = 'SaveType.All'
        this.modType = 'ModType.None'
        this.listen = 'undefined'
        this.decorators = prop.getDecorators().map((decorator) => decorator.getText())
        this.sourceType = prop.getTypeNode()?.getText() ?? prop.getType().getText(prop)
        this.sourceInitializer = prop.getInitializer()?.getText() ?? null
        this.comment = getComment(prop)
        this.initType()
        this.genInitializer()
        this.hasQuestionToken = this.prop.hasQuestionToken()
        // 装饰器
        prop.getDecorators().forEach((decorator) => {
            switch (decorator.getName()) {
                case 'OnlyRedis': {
                    this.saveType = 'SaveType.ForRedis'
                    break
                }
                case 'OnlyNet': {
                    this.bean.initFunc = true
                    this.saveType = 'SaveType.ForNet'
                    break
                }
                case 'Mod': {
                    this.modType = this.collectionTypes?.length === 2 ? 'ModType.ModMap' : 'ModType.ModBean'
                    let subModType = ''
                    if (this.collectionTypes?.length) {
                        subModType = this.collectionTypes[this.collectionTypes.length - 1]
                    } else {
                        subModType = this.type
                    }
                    this.bean.setMod(this.name, {
                        type: this.bean.className,
                        isMap: this.collectionTypes?.length === 2,
                        subModType: subModType,
                        subImportPath: this.typeImport,
                        mapKeyType: this.collectionTypes?.[0],
                    })
                    break
                }
                case 'Listen': {
                    decorator.getArguments().forEach((arg) => {
                        this.listen = arg.getText()
                    })
                    break
                }
            }
        })

        if (this.name == 'id') {
            //记录id类型
            this.bean.idFiledType = this.type
        }
    }

    genInitializer() {
        const initializer = this.prop.getInitializer()
        let defaultValue = RecBeanProperty.getDefaultValueForType(this.type) // 根据属性类型获取默认值
        if (initializer && defaultValue != undefined) {
            defaultValue = initializer.getText()
        }
        this.defaultValue = defaultValue
    }

    getFieldType() {
        switch (this.type) {
            case 'int':
            case 'number':
            case 'string':
            case 'boolean':
                return `'${this.type}'`
            default:
                if (this.type === 'Map') {
                    return 'DiffMap._class_info'
                }
                if (this.type === 'Array') {
                    return 'DiffArray._class_info'
                }
                return this.type + '._class_info'
        }
    }

    isMod() {
        return this.modType !== 'ModType.None'
    }

    beanType() {
        if (this.collectionTypes) {
            if (this.type === 'Map') {
                return `DiffMap<${this.collectionTypes[0]}, ${this.collectionTypes[1]}>`
            }
            if (this.type === 'Array') {
                return `DiffArray<${this.collectionTypes[0]}>`
            }
        }
        return this.type
    }

    beanCollectionTypes() {
        if (!this.collectionTypes) {
            return undefined
        }
        return this.collectionTypes.length === 1
            ? `['${this.collectionTypes[0]}', undefined]`
            : `['${this.collectionTypes[0]}', ${this.typeImport ? this.collectionTypes[1] + '._class_info' : `'${this.collectionTypes[1]}'`}]`
    }
}
