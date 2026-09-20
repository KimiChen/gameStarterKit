import { DiffArray } from './DiffArray'
import { Bean, IdFieldType } from './bean'
import { ClassInfo, Container, FieldInfo, Root } from './diff'
import { Hash } from './hash'
import { DiffMap } from './DiffMap'
import { BeanStatus } from './status'
import { HashLoadOpts } from './subs/optsInterface'

type DataFieldName<T> = {
    [K in keyof T]-?: K extends string ? (NonNullable<T[K]> extends (...args: any[]) => any ? never : K) : never
}[keyof T] &
    string

type FromDataFieldPath<T, Depth extends unknown[] = [unknown, unknown, unknown, unknown]> = {
    [K in DataFieldName<T>]: NonNullable<T[K]> extends Bean
        ? K | (Depth extends [unknown, ...infer Rest] ? `${K}.${FromDataFieldPath<NonNullable<T[K]>, Rest>}` : never)
        : K
}[DataFieldName<T>]

type BeanConstructor<T extends Bean> = Function & (abstract new (...args: any[]) => T)

function resolveFromField(fromClass: Function, fieldPath: string): FieldInfo {
    const classInfo = (fromClass as Function & { _class_info?: ClassInfo<Container> })._class_info
    if (!classInfo) {
        throw new Error(`FromData source ${fromClass.name} has no _class_info`)
    }

    const fieldNames = fieldPath.split('.')
    let fromField = classInfo.fieldMap[fieldNames[0]]
    if (!fromField) {
        throw new Error(`FromData source field ${fromClass.name}.${fieldPath} does not exist`)
    }

    for (const fieldName of fieldNames.slice(1)) {
        fromField = fromField[`f_${fieldName}`] as FieldInfo
        if (!fromField) {
            throw new Error(`FromData source field ${fromClass.name}.${fieldPath} does not exist`)
        }
    }
    return fromField
}

/**
 * 装饰器：按来源类和字段路径标识映射属性来源
 * @param fromClass 来源业务类
 * @param fieldPath 来源字段路径
 */
export function FromData<T extends Bean>(
    fromClass: BeanConstructor<T>,
    fieldPath: FromDataFieldPath<T>,
): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        const fromField = resolveFromField(fromClass, fieldPath)
        let classInfo = fromField.classInfo
        if (fromField.parentField) {
            classInfo = fromField.parentField.classInfo
        }
        const refField = new RefFieldInfo(String(propertyKey), fromField.name, classInfo, fromField)
        RefHash.addRefField(target, refField)
    }
}

interface FromClassMap {
    classInfo: ClassInfo<Container>
    fieldMaps: { [key: string]: FromFieldMap }
}

/**
 * 缓存映射结构
 */
interface FromFieldMap {
    classInfo: ClassInfo<Container>
    fieldMaps: { [key: string]: RefFieldInfo }
    idField: string
}

class RefFieldInfo extends FieldInfo {
    /** 来源数据结构 */
    fromClass: ClassInfo<Container>

    /** 来源字段信息 */
    fromField: FieldInfo

    /** 变量命名 */
    variableName: string

    constructor(variableName: string, name: string, fromClass: ClassInfo<Container>, fromField: FieldInfo) {
        super(fromClass, name, -1, fromField.type, fromField.defaultVal, fromField.collectionType)
        this.variableName = variableName
        this.fromClass = fromClass
        this.fromField = fromField
    }
}

export class RefHash extends Hash {
    /**
     * 对象变更信息
     */
    protected diffRef: Root

    /**
     * 缓存所有映射结构
     */
    static _infos: { [key: string]: FromClassMap } = {}

    protected getRefClassMaps() {
        if (RefHash._infos[this.constructor.name]) {
            return RefHash._infos[this.constructor.name].fieldMaps
        }
        return undefined
    }

    static addRefField(obj: typeof RefHash, field: RefFieldInfo) {
        const className = obj.constructor.name
        if (!this._infos[className]) {
            this._infos[className] = {
                classInfo: field.fromClass,
                fieldMaps: {},
            }
        }
        const refMaps = this._infos[className].fieldMaps
        const refClass = field.fromClass.name
        if (!refMaps[refClass]) {
            refMaps[refClass] = {
                classInfo: field.fromClass,
                fieldMaps: {},
                idField: 'id',
            }
        }
        refMaps[refClass].fieldMaps[field.variableName] = field
    }

    constructor(id: IdFieldType, loadOpts?: HashLoadOpts) {
        super(id, loadOpts, true)
        this.diffRef = new Root(BeanStatus.New, this)
    }

    static async load<T extends typeof Hash>(
        this: T,
        id: IdFieldType,
        loadOpts?: HashLoadOpts,
    ): Promise<InstanceType<T> | undefined> {
        const bean = new this(id, loadOpts) as RefHash
        await bean.parseRefFields()
        bean.diff.status = BeanStatus.None
        return bean as InstanceType<T>
    }

    static async loadAll<T extends typeof Hash>(
        this: T,
        ids: IdFieldType[],
        loadOpts?: HashLoadOpts,
    ): Promise<Map<IdFieldType, InstanceType<T>>> {
        const map = new Map()
        for (const id of ids) {
            const bean = await this.load(id, loadOpts)
            map.set(id, bean)
        }
        return map as Map<IdFieldType, InstanceType<T>>
    }

    protected async parseRefFields() {
        const classMaps = this.getRefClassMaps()
        if (classMaps == null) {
            return
        }
        for (const key in classMaps) {
            const fieldMap = classMaps[key]
            await this.paraseRefDiffHashData(fieldMap)
        }
        this.diffRef.status = BeanStatus.None
    }

    protected async paraseRefDiffHashData(fieldMap: FromFieldMap): Promise<this | undefined> {
        const idFromField = '_id'
        // if (fieldMap.idField) {
        //     idFromField = fieldMap.idField
        // }

        const id = this[idFromField as keyof this] as IdFieldType
        if (!id) {
            return
        }

        const fields: string[] = []
        for (const key in fieldMap.fieldMaps) {
            const field = fieldMap.fieldMaps[key]
            let name = field.name
            if (field.fromField.parentField) {
                name = field.fromField.parentField.name
            }
            if (!fields.includes(name)) {
                fields.push(name)
            }
        }
        const th = fieldMap.classInfo.constrFunc as any
        const hashKey = th.getRedisKey(id, this._loadOpts?.serverId)
        const data = await th.getRedis().hmGet(hashKey, fields)
        if (!data) {
            return
        }

        const beanData: { [name: string]: any } = {}

        for (let i = 0; i < fields.length; i++) {
            const name = fields[i]
            const redisVal = data[i]

            const fieldInfo = fieldMap.fieldMaps[name]
            if (fieldInfo === undefined) {
                beanData[name] = JSON.parse(redisVal)
                continue
            }

            let value = super.parseFieldValue(fieldInfo, redisVal, false)
            if (fieldInfo.fromField.type instanceof ClassInfo) {
                let bean
                if (fieldInfo.fromField.type.constrFunc == DiffMap) {
                    bean = new fieldInfo.fromField.type.constrFunc(fieldInfo)
                } else if (fieldInfo.fromField.type.constrFunc == DiffArray) {
                    bean = new fieldInfo.fromField.type.constrFunc(fieldInfo)
                } else {
                    bean = new fieldInfo.fromField.type.constrFunc()
                }
                if (redisVal != null) {
                    bean.parseFromData(JSON.parse(redisVal as string))
                }
                value = bean
            }
            this.setFieldValue(fieldInfo.variableName, value)
        }

        for (const key in fieldMap.fieldMaps) {
            const field = fieldMap.fieldMaps[key]
            if (!field.fromField.parentField) {
                continue
            }
            const redisVal = beanData[field.fromField.parentField.name]
            if (!redisVal) {
                continue
            }
            let value
            if (field.fromField.type instanceof ClassInfo) {
                let bean
                if (field.fromField.type.constrFunc == DiffMap) {
                    bean = new field.fromField.type.constrFunc(field)
                } else if (field.fromField.type.constrFunc == DiffArray) {
                    bean = new field.fromField.type.constrFunc(field)
                } else {
                    bean = new field.fromField.type.constrFunc()
                }
                if (redisVal[field.fromField.aliasName]) {
                    bean.parseFromData(redisVal[field.fromField.aliasName])
                }
                value = bean
            } else {
                value = redisVal[field.fromField.aliasName]
            }
            this.setFieldValue(field.variableName, value)
        }

        return this
    }

    protected setFieldValue(name: string, value: any) {
        this[name as keyof this] = value
    }
}
