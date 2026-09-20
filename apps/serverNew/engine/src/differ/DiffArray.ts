import { BaseType, ChangeableField, ClassInfo, Container, Diff, FieldInfo } from './diff'
import { JSONArray } from './redis'
import { BeanStatus, FieldStatus } from './status'

/**
 * RedisBean数组结构,仅支持基础类型
 */
export class DiffArray<T extends BaseType> {
    protected arr: Array<T> = new Array<T>()

    /**
     * 对象变更信息
     */
    protected diff?: Diff

    /**
     * 记录 map value 的类型信息
     */
    protected fieldInfo?: FieldInfo

    /**
     * 是否可写
     */
    protected writable: boolean = true

    constructor(fieldInfo?: FieldInfo, ...values: T[]) {
        this.fieldInfo = fieldInfo

        if (values.length > 0) {
            this.arr.push(...values)
        }
    }

    static _class_info = new ClassInfo(this.name, this)

    /**
     * 重置当前对象的 diff
     */
    initDiff(parent?: Container, fieldInfo?: FieldInfo, status: BeanStatus = BeanStatus.None) {
        if (this.diff !== undefined) {
            return
        }
        this.invalidDiff()
        this.diff = new Diff(status, parent, fieldInfo)
    }

    invalidDiff(): boolean {
        if (this.diff === undefined) {
            return false
        }

        const hasChanged = BeanStatus.hasChanged(this.diff.status)
        this.diff = undefined

        return hasChanged
    }

    buildNet(array: Array<T>) {
        this.assertWritable()
        if (!this.fieldInfo?.forNet) {
            throw new Error('the diffArray is not onlyNet ' + this.fieldInfo)
        }
        this.arr = array
    }

    public onChange(field: ChangeableField, status: FieldStatus) {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
        if (this.diff !== undefined) {
            this.diff.setChanges(field, status)
        }
    }

    public toSaveData(): JSONArray | null {
        if (this.diff !== undefined && this.diff.status === BeanStatus.AutoInit) {
            // 自动初始化，不需要保存
            return null
        }

        return this.arr
    }

    /**
     * 获取mod数据
     * null 表示不需要保存，undefined 表示删除当前对象
     */
    public toModData(_forChange = false) {
        return this.arr
    }

    parseFromData(data: T[], writable: boolean = false) {
        this.assertWritable()
        this.arr.push(...data)
        this.writable = writable
    }

    add(...values: T[]): this {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
        if (this.diff !== undefined && this.diff.status != BeanStatus.New) {
            this.diff.status = BeanStatus.New // 整个 bean 全部变成
            this.diff.parentChange()
        }

        this.arr.push(...values)
        return this
    }

    removeBy(...values: T[]): this {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
        if (values.length > 0) {
            let change = false

            values.forEach((v) => {
                const index = this.arr.indexOf(v)
                if (index !== -1) {
                    change = true
                    this.arr.splice(index, 1)
                }
            })

            if (change && this.diff !== undefined) {
                if (this.diff.status != BeanStatus.New) {
                    this.diff.status = BeanStatus.New
                }
                this.diff.parentChange()
            }
        }
        return this
    }

    set(index: int, val: T): this {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
        if (this.diff !== undefined && this.diff.status != BeanStatus.New) {
            this.diff.status = BeanStatus.New // 整个 bean 全部变成
            this.diff.parentChange()
        }
        this.arr[index] = val
        return this
    }

    public removeAt(...indexs: int[]): this {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
        if (indexs.length > 0) {
            let change = false
            const len = this.arr.length

            indexs.forEach((v) => {
                if (v < len) {
                    change = true
                    this.arr.splice(v, 1)
                }
            })

            if (change && this.diff !== undefined) {
                if (this.diff.status != BeanStatus.New) {
                    this.diff.status = BeanStatus.New
                }
                this.diff.parentChange()
            }
        }
        return this
    }

    isEmpty(): boolean {
        return this.arr.length <= 0
    }

    length(): int {
        return this.arr.length
    }

    forEach(callbackfn: (value: T, index: int, arr: readonly T[]) => void): void {
        const values = this.writable ? this.arr : this.arr.slice()
        for (let i = 0; i < this.arr.length; i++) {
            callbackfn(this.arr[i], i, values)
        }
    }

    *[Symbol.iterator]() {
        for (const item of this.arr) {
            yield item
        }
    }

    clear(): void {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
        this.arr.length = 0
        this.diff?.parentChange()
    }

    toString(): string {
        return this.arr.toString()
    }

    includes(searchElement: T) {
        return this.arr.includes(searchElement)
    }

    at(index: number) {
        return this.arr.at(index)
    }

    init(array: Array<T>) {
        this.assertWritable()
        this.clear()
        this.add(...array)
    }

    copy() {
        return this.arr.slice()
    }

    private assertWritable() {
        if (!this.writable) {
            throw new Error('the diffArray cannot be written ' + this.diff?.field)
        }
    }
}
