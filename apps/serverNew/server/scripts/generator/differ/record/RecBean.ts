import { ClassDeclaration } from 'ts-morph'
import { RecordField, RecordFieldType } from '../../util/RecordGen'
import { DifferType } from '../DifferType'
import { SourceFileFingerprint } from '../SourceFileFingerprint'
import console from 'console'
import { RecBeanProperty } from './RecBeanProperty'
import { RecMod } from './RecMod'
import { RecProject } from './RecProject'
import { RecFile } from './RecFile'
import { getComment } from '../../util/DocumentationParser'
import { IMsgType } from './IMsgType'
import { RecProperty } from './RecProperty'

export class RecBean extends RecFile implements IMsgType {
    static readonly COMPILE_METADATA_VERSION = 2

    @RecordField()
    version: int = 1

    @RecordField(RecBeanProperty, RecordFieldType.map)
    properties: Map<string, RecBeanProperty> = new Map()

    @RecordField(RecMod, RecordFieldType.map)
    mods?: Map<string, RecMod>

    @RecordField()
    comment: string = ''

    @RecordField()
    modId = 0

    @RecordField()
    diffType: DifferType = DifferType.Bean

    baseClass!: ClassDeclaration

    @RecordField()
    extendType?: string

    @RecordField()
    className!: string

    genClassName!: string

    @RecordField()
    idFiledType?: string

    /** 源码类装饰器快照，用于编译期校验 record 是否过期。 */
    @RecordField()
    decorators: string[] = []

    /** Bean 编译 record schema，升级后自动强制重扫所有有效 Bean。 */
    @RecordField()
    compileMetadataVersion?: number

    /** 用于生成时标记未重新添加即要删除的mod */
    oldMods?: Set<string>

    get package() {
        return this.relativePath + '/'
    }

    init(project: RecProject, fileInfo: SourceFileFingerprint, relativeDir: string) {
        super.initFile(project, fileInfo, relativeDir)
        this.diffType = DifferType.Invalid
        this.baseClass = this.sourceFile.getClasses()[0] //暂时只取第一个类
        if (!this.baseClass) return

        this.extendType = this.baseClass.getExtends()?.getText()
        this.diffType = DifferType.parseFrom(fileInfo.fileName, this.extendType)
        if (this.diffType === DifferType.Invalid) return
        this.comment = getComment(this.baseClass)
        this.className = this.baseClass.getName()!
        this.genClassName = this.className + 'Gen'
        this.decorators = this.baseClass.getDecorators().map((decorator) => decorator.getText())
    }

    get propsExist() {
        return RecBean.getPropsExist(this.properties)
    }

    static getPropsExist(properties: Map<string, RecProperty>) {
        const exists: RecProperty[] = []
        for (const value of properties.values()) {
            if (!value.deleted) exists.push(value)
        }
        return exists[Symbol.iterator]()
    }

    /** 旧 record 缺少编译快照时强制重扫一次，不依赖源码 mtime/md5 变化。 */
    needsCompileMetadataRefresh() {
        if (this.compileMetadataVersion !== RecBean.COMPILE_METADATA_VERSION) return true
        if (!this.className || this.extendType === undefined) return true
        for (const property of this.properties.values()) {
            if (!property.deleted && !property.sourceType) return true
        }
        return false
    }

    /** 解析并更新 Bean 元数据；Bean 源码由编译期 transformer 处理。 */
    async generate() {
        console.info(`正在更新Bean元数据:  ${this.fileInfo.path}`)
        this.saveType = 'SaveType.All'
        this.modType = 'ModType.None'
        this.initFunc = false
        this.modId = 0
        this.idFiledType = undefined
        this.compileMetadataVersion = RecBean.COMPILE_METADATA_VERSION
        this.oldMods = new Set(
            [...(this.mods?.entries() ?? [])].filter(([, mod]) => !mod.deleted).map(([name]) => name),
        )
        // 解析属性并维护字段 ID/删除记录。
        this.genProperties()
        this.updateCompileMetadata()
        for (const oldMod of this.oldMods) {
            const mod = this.mods!.get(oldMod)!
            mod.deleted = true
            if (this.project.mods.get(oldMod) === mod) {
                this.project.mods.delete(oldMod)
            }
            this.project.modChanged = true
        }
    }

    @RecordField()
    saveType: string = 'SaveType.All'

    @RecordField()
    modType?: string = 'ModType.None'

    @RecordField()
    initFunc = false

    setMod(name: string, modData: Partial<RecMod> = {}) {
        if (!this.mods) {
            this.mods = new Map()
        }
        let mod = this.mods.get(name)
        const previous = mod ? JSON.stringify(mod) : undefined
        if (!mod) {
            this.mods.set(name, (mod = new RecMod()))
            mod.name = name
            mod.id = this.project.modVersion++
        } else if (mod.deleted) {
            mod.deleted = false
        }
        this.oldMods!.delete(mod.name)
        if (!modData.subModType) {
            this.modId = mod.id
        }
        mod.type = this.className
        mod.importPath = this.relativePath
        Object.assign(mod, modData)
        if (previous !== JSON.stringify(mod)) {
            this.project.modChanged = true
        }
        this.project.mods.set(name, mod)
    }

    /** 解析类装饰器并维护编译转换所需的兼容元数据。 */
    private updateCompileMetadata() {
        // 装饰器
        this.baseClass.getDecorators().forEach((decorator) => {
            switch (decorator.getName()) {
                case 'OnlyRedis': {
                    this.saveType += ' - SaveType.ForNet'
                    break
                }
                case 'OnlyNet': {
                    this.saveType += ' - SaveType.ForRedis'
                    this.initFunc = true
                    break
                }
                case 'ClassNetMap': {
                    this.modType = 'ModType.ModMap'
                    this.setMod(this.getModName(), {
                        isMap: true,
                        mapKeyType: this.properties.get('id')!.type,
                        type: this.className,
                    })
                    break
                }
                case 'Mod': {
                    this.modType = 'ModType.ModBean'
                    this.setMod(this.getModName(), { isMap: false, type: this.className })
                    break
                }
            }
        })

        if (this.isHashType() && this.idFiledType == undefined) {
            throw new Error(`${this.className} Id未定义,hash必须指定字段`)
        }
    }

    /** 遍历字段列表 */
    private genProperties() {
        const props = this.properties
        //已删除的要保持记录并标记处理
        const allProps = new Set(this.properties.keys())
        this.baseClass.getProperties().forEach((property) => {
            let propertyName = property.getName()
            let prop = props.get(propertyName)
            if (!prop) {
                prop = new RecBeanProperty()
                prop.id = this.version++
                prop.name = propertyName
                props.set(propertyName, prop)
            }
            if (prop.deleted) {
                prop.deleted = false
            }
            allProps.delete(prop.name)
            prop.initBean(this, property, 'src/modules/', (absolutePath) =>
                this.project.paths.beanLogicalPath(absolutePath),
            )
        })
        allProps.forEach((val) => {
            this.properties.get(val)!.deleted = true
        })
    }

    isHashType() {
        return this.diffType == DifferType.Hash || this.diffType == DifferType.HashJson
    }

    forEach<T>(ts: IterableIterator<T>, f: (e: T) => string, sep: string = '\n'): string {
        let rs = ''
        for (const t of ts) {
            rs += f(t) + sep
        }
        return rs
    }

    /** modName由类名转小写 */
    getModName() {
        return this.className.charAt(0).toLowerCase() + this.className.slice(1)
    }
}
