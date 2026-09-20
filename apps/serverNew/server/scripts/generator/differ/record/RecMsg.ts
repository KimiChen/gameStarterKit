import { RecordGen, RecordField, RecordFieldType } from '../../util/RecordGen'
import { RecBeanProperty } from './RecBeanProperty'
import { InterfaceDeclaration } from 'ts-morph'
import { getComment, getCommentWrapped } from '../../util/DocumentationParser'
import { RecProperty } from './RecProperty'
import { IMsgType } from './IMsgType'
import { RecBean } from './RecBean'
import { RecProject } from './RecProject'
import { RecProtocolFile } from './RecProtocolFile'
import { RecordSet } from '../../util/RecordSet'

/** msg包含req res 推送消息 */
export class RecMsg extends RecordGen implements IMsgType {
    /**
     * 预留100内框架自定义字段序号
     */
    @RecordField()
    version: int = 100

    @RecordField()
    name!: string

    @RecordField()
    comment!: string

    @RecordField()
    package!: string

    @RecordField(RecProperty, RecordFieldType.map)
    properties: Map<string, RecProperty> = new Map()

    @RecordField()
    deleted?: boolean

    get commentWrapped() {
        return getCommentWrapped(this.comment)
    }

    set msgPath(s: string) {}

    get propsExist() {
        return RecBean.getPropsExist(this.properties)
    }

    get msgPath() {
        return this.package + this.name.substring(3)
    }

    init(file: RecProtocolFile, iter: InterfaceDeclaration, rootPath: string) {
        this.name = iter.getName()
        this.comment = getComment(iter)
        //需要处理被删除的情况
        const allProps = new Set(this.properties.keys())
        for (const property of iter.getProperties()) {
            const propertyName = property.getName()
            let prop = this.properties.get(propertyName)
            if (!prop) {
                prop = new RecProperty()
                prop.id = this.version++
                prop.name = propertyName
                this.properties.set(propertyName, prop)
            }
            prop.init(property, rootPath, (absolutePath) =>
                file.project.paths.protocolTypeImport(absolutePath, file.group.name as 'C2S' | 'S2S'),
            )
            if (prop.deleted) {
                prop.deleted = false
            }
            //导入其他协议分组如S2S引用了C2S的接口
            if (prop.typeImport.startsWith('../')) {
                const fileNameIndex = prop.typeImport.indexOf('/', 4)
                const groupName = prop.typeImport.substring(3, fileNameIndex)
                let groups = file.group.refs.get(groupName)
                if (!groups) {
                    file.group.refs.set(groupName, (groups = new RecordSet()))
                }
                groups.add(prop.typeImport.substring(fileNameIndex + 1) + '/' + prop.type)
            }
            allProps.delete(prop.name)
        }
        allProps.forEach((val) => {
            this.properties.get(val)!.deleted = true
        })
    }
}
