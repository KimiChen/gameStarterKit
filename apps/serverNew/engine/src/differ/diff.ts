import { DiffMap, MapKeyType, MapValueType } from './DiffMap'
import { Bean, RootBean } from './bean'

import { BeanStatus, FieldStatus } from './status'
import { DiffArray } from './DiffArray'
import { convertToBase52, lcfirst } from '../utils/common'
import { addRootChange } from './differCache'
import { ListenArgs, ListenHandler } from '../event/EventSystem'

/** 容器类型，包含 Bean 和数据集合 DiffMap 喝 DiffArray */
export declare type Container = Bean | DiffMap<MapKeyType, MapValueType> | DiffArray<BaseType>

type BeanConstructor<T> = new (...args: any[]) => T

/** 可变更字段和字段类型，BaseType 表示集合类型中的 key/index 类型 */
export declare type ChangeableField = FieldInfo | ChangeableFieldType
export declare type ChangeableFieldType = string | int

/** differ 模块中允许的基础类型 */
export type BaseType = int | string | boolean

/** 字段的用途,保存到redis和同步到网络客户端,之后如果有扩展还是按位,0 */
export enum SaveType {
    ForRedis = 1,
    ForNet = 2,

    /** 默认值,增加配置时要维护所有都要All,如再加个4,All就要|4 */
    All = ForRedis | ForNet,
}

/** 字段的用途,保存到redis和同步到网络客户端,之后如果有扩展还是按位,0 */
export enum ModType {
    None = 0,
    ModBean = 1,
    ModMap = 2,
}

export class Diff {
    /**
     * 当前关联对象状态
     */
    status: BeanStatus

    /**
     * 当前对象属性变更信息
     */
    changes?: { [key: ChangeableFieldType]: FieldStatus }

    /**
     * 初始对象数据,保存时如果该对象没变更则直接拿来使用
     */
    originals?: { [key: int | string]: string | object }

    /**
     * 当前对象关联的父对象
     */
    parent?: Container

    /**
     * 当前对象在所属父对象的属性名称
     */
    field?: ChangeableField

    /**
     * 当前对象的mod类型，有标注@Mod的bean才有值
     */
    modType: ModType = ModType.None

    constructor(status: BeanStatus, parent?: Container, field?: ChangeableField) {
        this.status = status
        this.parent = parent
        this.field = field
    }

    /**
     * 触发 父对象 记录变更信息
     */
    parentChange(toStatus = FieldStatus.ChildUpdate) {
        if (this.parent === undefined) {
            return
        }
        if (this.field !== undefined) {
            this.parent.onChange(this.field, toStatus)
        }
    }

    /**
     * 设置指定属性变更信息
     * 返回field是不是_version 如果是的话就不用更新version
     */
    setChanges(field: ChangeableField, status: FieldStatus) {
        if (this.status == BeanStatus.New || this.status === BeanStatus.Invalid) {
            return false
        }
        if (this.status == BeanStatus.Delete) {
            // 对象已删除
            return false
        }

        let key: ChangeableFieldType
        if (field instanceof FieldInfo) {
            key = (field as FieldInfo).name
        } else {
            key = field
        }

        let oldStatus
        if (this.changes === undefined) {
            this.changes = {}
        } else {
            oldStatus = this.changes[key]
        }
        if (oldStatus !== undefined) {
            status = FieldStatus.convert(oldStatus, status)
            if (oldStatus === status) {
                //状态没有变动
                return false
            }
        }

        if (status == FieldStatus.None) {
            // put 又 remove
            delete this.changes[key]
        } else {
            this.changes[key] = status
        }
        if (this.status == BeanStatus.None) {
            // 属性变更导致的 record_file_time 变化
            this.status = BeanStatus.FieldUpdate
            this.parentChange()
        }
        return true
    }
}

// Root 根层级 RootBean 对象变更信息
export class Root extends Diff {
    // 关联的 RootBean
    current: RootBean

    // 是否已经添加到 root record_file_time 列表中
    changed: boolean = false

    constructor(status: BeanStatus, current: RootBean) {
        super(status, undefined, undefined)
        this.status = status
        this.current = current
        this.modType = current.getClassInfo()?.modType
    }

    /**
     * 添加到 record_file_time 列表
     */
    addRootChange() {
        if (this.changed) {
            // 已经添加到 root record_file_time 列表不处理，避免重复添加
            return
        }
        this.changed = true
        addRootChange(this.current)
    }

    /**
     * 设置指定属性变更信息
     */
    setChanges(field: FieldInfo, status: FieldStatus) {
        const isVersionField = super.setChanges(field, status)
        this.addRootChange()
        return isVersionField
    }
}

export class FieldInfo {
    /**
     * 属性名称
     */
    name: string

    /**
     * 属性索引
     */
    index: int

    /**
     * 通过索引按0-51->[A-Za-z]生成别名
     */
    aliasName: string

    /**
     * 属性类型
     */
    type: ClassInfo<Container> | string

    /**
     * 默认值，Container 没有默认值
     */
    defaultVal?: int | string | boolean

    /**
     * 集合类型
     * 如果是 Map, 为 key 和 valye 的类型
     * 如果是 Array，则为 item 类型
     */
    collectionType?: [MapKeyType | BaseType, ClassInfo<Bean> | MapValueType | undefined]

    /**
     * 保存到redis和同步到网络客户端
     */
    saveType: SaveType = SaveType.All

    /**
     * mod类型,bean/Map
     */
    modType: ModType = ModType.None

    /**
     * 类信息
     */
    classInfo: ClassInfo<Container>;

    /**
     * 添加索引签名
     */
    [key: string]: any

    /**
     * 上级类属性
     */
    parentField?: FieldInfo

    /**
     * 字段监听器
     */
    listenHandle?: typeof ListenHandler<ListenArgs>

    constructor(
        classInfo: ClassInfo<Container>,
        name: string,
        index: int,
        type: ClassInfo<Container> | string,
        defaultVal?: int | string | boolean,
        collectionType?: [MapKeyType | BaseType, ClassInfo<Bean> | MapValueType | undefined],
        saveType: SaveType = SaveType.All,
        modType: ModType = ModType.None,
        listenHandle?: typeof ListenHandler<ListenArgs>,
    ) {
        this.classInfo = classInfo
        this.name = name
        this.index = index
        this.aliasName = convertToBase52(this.index)
        this.type = type
        this.defaultVal = defaultVal
        this.collectionType = collectionType
        this.saveType = saveType
        this.modType = modType
        this.listenHandle = listenHandle
        if (type instanceof ClassInfo) {
            for (const fi of type.fields) {
                const f = new FieldInfo(
                    fi.classInfo,
                    fi.name,
                    fi.index,
                    fi.type,
                    fi.defaultVal,
                    fi.collectionType,
                    fi.saveType,
                )
                f.parentField = this
                this[`f_${fi.name}`] = f
            }
        }
    }

    get forRedis(): boolean {
        return (this.saveType & SaveType.ForRedis) !== 0
    }

    get forNet(): boolean {
        return (this.saveType & SaveType.ForNet) !== 0
    }

    isMap() {
        return (this.type as ClassInfo<any>).name === 'DiffMap'
        //TODO TypeError: undefined is not a constructor return this.type === DiffMap._class_info 不能使用实例判断
    }

    isArray() {
        return (this.type as ClassInfo<any>).name === 'DiffArray'
    }

    setVal(obj: any, value: any) {
        obj[this.name] = value
    }

    getVal(obj: any) {
        return obj[this.name]
    }

    addNum(obj: any, value: number | int) {
        obj[this.name] += value
        return obj[this.name]
    }

    /**
     * 把a-zA-Z 代表0-51共52进制的字符串  超过之后就aa ab, 转成数字
     * @param str
     */
    convertFromBase52(str: string): int {
        const base = 52
        let result = 0

        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i)
            const value = charCode - (charCode < 97 ? 65 : 71)
            result = result * base + value
        }

        return result
    }
}

export class ClassInfo<T extends Container> {
    /**
     * 已登记的模块身份；保留历史编号，不作为 wire 路由。
     */
    modId: int = 0

    /**
     * 类型名称
     */
    name: string

    /**
     * 类信息
     */
    constrFunc: BeanConstructor<T>

    /**
     * 属性类型
     */
    fields: FieldInfo[] = []

    /**
     * 属性类型
     */
    fieldMap: { [key: string]: FieldInfo } = {}

    /**
     * 使用别名映射的属性类型
     */
    aliasFieldMap: { [key: string]: FieldInfo } = {}

    saveType: SaveType

    modType: ModType

    /** 是否有子独立mod */
    haveSubMods: boolean = false

    constructor(
        name: string,
        constrFunc: BeanConstructor<T>,
        id: int = 0,
        saveType: SaveType = SaveType.All,
        modType: ModType = ModType.None,
    ) {
        this.name = name
        this.constrFunc = constrFunc
        this.modId = id
        this.saveType = saveType
        this.modType = modType
    }

    get modName(): string {
        return lcfirst(this.name)
    }

    addField(field: FieldInfo) {
        this.fields.push(field)
        this.fieldMap[field.name] = field
        this.aliasFieldMap[field.aliasName] = field
        if (field.modType !== ModType.None) {
            this.haveSubMods = true
        }
    }

    forRedis(): boolean {
        return (this.saveType & SaveType.ForRedis) !== 0
    }

    forNet(): boolean {
        return (this.saveType & SaveType.ForNet) !== 0
    }

}
