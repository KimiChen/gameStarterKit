import { Bean } from './bean'
import { BaseType, ChangeableField, ClassInfo, Container, Diff, FieldInfo } from './diff'
import { JSONObject } from './redis'
import { BeanStatus, FieldStatus } from './status'

/** DiffMap 中允许的 key 和 value 类型 */
export type MapKeyType = int | string
export type MapValueType = Bean | BaseType

/**
 * RedisBean字典结构
 */
export class DiffMap<K extends MapKeyType, V extends MapValueType> {
    /**
     * 原始map对象
     */
    protected map: Map<K, V> = new Map<K, V>()

    /**
     * 对象变更信息
     */
    protected diff?: Diff

    /**
     * 记录 map value 的类型信息
     */
    protected fieldInfo: FieldInfo

    /**
     * 是否可写
     */
    protected writable: boolean = true

    constructor(fieldInfo: FieldInfo) {
        this.fieldInfo = fieldInfo
    }

    static _class_info = new ClassInfo(this.name, DiffMap)

    /**
     * 重置当前对象的 diff
     */
    initDiff(parent?: Container, fieldInfo?: FieldInfo, status: BeanStatus = BeanStatus.None) {
        if (this.diff !== undefined || !this.writable) {
            return
        }
        this.invalidDiff()
        this.diff = new Diff(status, parent, fieldInfo)
    }

    /**
     * 把当前对象的 diff 变更状态为不可用，并返回 子对象 是否有产生变更
     */
    invalidDiff(): boolean {
        if (this.diff === undefined) {
            return false
        }
        const fieldChange =
            this.diff.status !== BeanStatus.None &&
            this.diff.status !== BeanStatus.Invalid &&
            this.diff.status !== BeanStatus.AutoInit
        this.diff = undefined
        if (!fieldChange) {
            return false
        }
        if (this.fieldInfo !== undefined && this.fieldInfo.type instanceof ClassInfo) {
            // value 如果是bean，需要清空所有的子对象 diff 状态
            this.map.forEach(function (value) {
                if (value instanceof Bean) {
                    value.invalidDiff()
                }
            })
        }
        return true
    }

    buildNet(datas: Map<K, V> | Array<[K, V]>) {
        this.assertWritable()
        if (!this.fieldInfo.forNet) {
            throw new Error('the diffArray is not onlyNet ' + this.fieldInfo)
        }
        this.map.clear()
        for (const [k, v] of datas) {
            if (v instanceof Bean) {
                ;(v as Bean).initDiff(this, k)
            }
            this.map.set(k, v)
        }
    }

    public onChange(field: ChangeableField, status: FieldStatus) {
        if (this.diff !== undefined && this.writable) {
            this.diff.setChanges(field, status)
        }
    }

    public toSaveData(): JSONObject | undefined | null {
        if (this.diff !== undefined && this.diff.status === BeanStatus.AutoInit) {
            // 自动初始化，不需要保存
            return null
        }
        const data: JSONObject = {}
        this.map.forEach(function (value, key) {
            //只有被反序列化成Bean的对象才要重新序列化
            if (value instanceof Bean) {
                data[key] = (value as any).toSaveData()
            } else {
                data[String(key)] = value
            }
        })
        return data
    }

    /**
     * 获取mod数据
     * null 表示不需要保存，undefined 表示删除当前对象
     * @param modVersions 版本路径对应的版本号，一层层下发，最后一层为数字即版本号，如{UserBase:1, AA:{BB:1}}
     */
    public toModData(forChange = false, modVersions?: int | { [key: string]: {} }): JSONObject | null | undefined {
        const data: JSONObject = {}
        const isBeanValue = this.fieldInfo.collectionType![1] instanceof ClassInfo
        if (!forChange) {
            if (modVersions) {
                Object.entries(modVersions).forEach(([v, k]) => {
                    let key: MapKeyType = k
                    if (this.fieldInfo.collectionType![0] !== 'string') {
                        key = Number(key)
                    }
                    const val = this.get(key as K)
                    if (val) {
                        const modVal = isBeanValue ? (val as any).toModData(forChange, v) : val
                        if (modVal) data[key] = modVal
                    }
                })
                return data
            }
            this.map.forEach((_, key) => {
                //有可能要先通过对象反序列化成bean
                const val = this.get(key as K)
                data[key] = isBeanValue ? (val as any).toModData(forChange) : val
            })
            return data
        }
        if (this.diff === undefined || this.diff.status === BeanStatus.AutoInit) {
            // 自动初始化，不需要保存
            return null
        }
        const changes = this.diff.changes
        if (changes) {
            Object.entries(changes).forEach(([key, status]) => {
                let dataKey: MapKeyType = key
                let oldKey: MapKeyType = dataKey
                if (this.fieldInfo.collectionType![0] !== 'string') {
                    //不是string只能是int,一定要转化为Number
                    dataKey = Number(dataKey)
                    oldKey = dataKey
                    if (forChange) {
                        // 如果key是int则最低位是1表示替换
                        dataKey = Number((BigInt(dataKey) << 1n) | (status === FieldStatus.New ? 1n : 0n))
                    }
                } else if (forChange) {
                    // 如果key是string,则最后一个字符是1表示替换
                    dataKey += status === FieldStatus.New ? '1' : '0'
                }
                switch (status) {
                    case FieldStatus.ChildUpdate:
                    case FieldStatus.New:
                    case FieldStatus.Update: {
                        const val = this.get(oldKey as K)
                        const field = this.diff?.field as FieldInfo
                        if (field.collectionType![1] instanceof ClassInfo) {
                            data[dataKey] = (val as any).toModData(status === FieldStatus.ChildUpdate)
                        } else {
                            data[dataKey] = val as any
                        }
                        break
                    }
                    case FieldStatus.Delete: {
                        if (this.fieldInfo.collectionType![1] instanceof ClassInfo) {
                            data[dataKey] = {}
                        } else {
                            switch (this.fieldInfo.collectionType![1]) {
                                case 'number':
                                case 'int':
                                    data[dataKey] = 0
                                    break
                                case 'string':
                                    data[dataKey] = '""'
                                    break
                                case 'boolean':
                                    data[dataKey] = false
                                    break
                            }
                        }
                        break
                    }
                }
            })
        }
        return data
    }

    toString(): string {
        let result = 'Map {'
        this.map.forEach((value, key) => {
            result += `${key}: ${value.toString()}, `
        })
        return result.slice(0, -2) + ',' // 移除最后的逗号和空格
    }

    parseFromData(data: JSONObject, writable: boolean = true) {
        this.assertWritable()
        this.writable = writable
        if (this.fieldInfo === undefined || this.fieldInfo.collectionType === undefined) {
            return
        }
        const numberKey = this.fieldInfo.collectionType[0] === 'int' // 判断是否是 int 做为 key
        for (const name in data) {
            let key: MapKeyType = name
            const value: unknown = data[name] // 最终可能为 bean
            if (numberKey) {
                key = Number(name)
            }
            this.map.set(key as K, value as V)
        }
    }

    set(key: K, value: V | Partial<V>): this {
        this.assertWritable()
        if (this.diff !== undefined) {
            // Map 对象初始化保留 FieldStatus.Invalid 状态，有实际元素添加时再变更为 FieldStatus.New
            if (this.diff.status == BeanStatus.AutoInit) {
                // 自动初始化，还未添加移除任何元素
                this.diff.status = BeanStatus.New
                this.diff.parentChange()
            }
            // 标记change信息
            this.diff.setChanges(key, FieldStatus.New)
        }

        if (value instanceof Bean) {
            this.map.set(key, value)
        } else if (typeof value === 'object' && value !== null) {
            const valType = this.fieldInfo.collectionType![1] as ClassInfo<any>
            this.map.set(key, new valType.constrFunc(value))
        } else {
            this.map.set(key, value)
        }

        return this
    }

    get(key: K): V | undefined {
        const value = this.map.get(key)
        if (value !== undefined) {
            return this.checkValue(key, value)
        }
        return value
    }

    delete(key: K): boolean {
        this.assertWritable()
        const exist = this.map.delete(key)
        if (exist && this.diff !== undefined) {
            this.diff.setChanges(key, FieldStatus.Delete)
        }
        return exist
    }

    clear() {
        this.assertWritable()
        if (this.map.size === 0) {
            return
        }
        this.map.clear()
        if (this.diff !== undefined) {
            this.diff.status = BeanStatus.New
            this.diff.changes = undefined
            this.diff.parentChange(FieldStatus.Update)
        }
    }

    init(datas: Map<K, V | Partial<V>>) {
        this.assertWritable()
        this.map.clear()
        for (const [k, v] of datas) {
            this.set(k, v)
        }
    }

    copy() {
        const newMap = new Map()
        this.forEach((value, key) => {
            newMap.set(key, value)
        })
        return newMap
    }

    forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void): void {
        const snapshot = this.writable ? undefined : new Map<K, V>()
        for (const [key, value] of this.map.entries()) {
            const resolved = this.checkValue(key, value)
            snapshot?.set(key, resolved)
            callbackfn(resolved, key, snapshot ?? this.map)
        }
    }

    has(key: K) {
        return this.map.has(key)
    }

    size() {
        return this.map.size
    }

    maxKey() {
        let maxKey = 0
        for (const [key] of this.map.entries()) {
            maxKey = Math.max(maxKey, Number(key))
        }
        return maxKey
    }

    keys() {
        return Array.from(this.map.keys())
    }

    values() {
        return Array.from(this, ([, value]) => value)
    }

    *[Symbol.iterator](): Iterator<[K, V]> {
        for (const [key, value] of this.map.entries()) {
            yield [key, this.checkValue(key, value)]
        }
    }

    private checkValue(key: K, value: V): V {
        if (value instanceof Object) {
            //是对象,但是又还没反序列化成Bean
            if (!(value instanceof Bean)) {
                const valType = this.fieldInfo.collectionType![1] as ClassInfo<any>
                const value1 = new valType.constrFunc((value as { id: int }).id) //以后可以附加value为第二个参数
                value1.parseFromData(value as JSONObject, this.writable)
                value = value1
                if (this.writable) {
                    ;(value as Bean).initDiff(this, key)
                }
                this.map.set(key, value1)
            }
        }
        return value
    }

    private assertWritable() {
        if (!this.writable) {
            throw new Error('the diffMap cannot be written ' + this.diff?.field)
        }
    }
}
