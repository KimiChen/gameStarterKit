import { RedisCache } from '../database/RedisCache'
import { ChangeableField, ClassInfo, Container, Diff, FieldInfo, ModType, Root } from './diff'
import { JSONObject } from './redis'
import { BeanStatus, FieldStatus } from './status'
import { ModSync } from '../mod/ModSync'
import { HashLoadOpts } from './subs/optsInterface'
import { ContextEngine } from '../context/ContextEngine'
import { RedisClientMultiCommandType } from '@redis/client/dist/lib/client/multi-command'
import { RedisFunctions, RedisModules, RedisScripts } from 'redis'
import { ListenArgs } from '../event/EventSystem'

/** 每个 RootBean 中必须的 id 字段，默认缺省添加，必须业务中定义 */
export type IdFieldType = int | string

export class Bean {
    /**
     * 对象变更信息
     */
    protected diff?: Diff

    protected writable: boolean = true

    static _class_info?: ClassInfo<any>

    /**
     * 获取当前class信息
     */
    getClassInfo(): ClassInfo<Bean> {
        // eslint-disable-next-line
        // @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return this.constructor._class_info
    }

    /**
     * 初始化仅网络同步的数据,之后的变更会自动推送
     * 由子类调用,不能用同名函数, 否则子类这个方法的参数无法正确提示(提示变成getter)
     * */
    protected _buildNet(data: Partial<this>) {
        const classInfo = this.getClassInfo()
        Object.entries(data).forEach(([key, val]) => {
            const fieldInfo = classInfo.fieldMap[key]
            if (key && fieldInfo?.forNet) {
                this.setFieldValue(key, val)
            }
        })
    }

    /**
     * 重置当前对象的 diff
     */
    initDiff(parent?: Container, field?: ChangeableField, originalData: object | undefined = undefined) {
        if (this.diff !== undefined || !this.writable) {
            return
        }
        this.invalidDiff()
        this.diff = new Diff(BeanStatus.None, parent, field)
        if (field && originalData) {
            if (!this.diff.originals) {
                this.diff.originals = {}
            }
            this.diff.originals[field instanceof FieldInfo ? field.name : field] = originalData
        }
    }

    /**
     * 把当前对象的 diff 变更状态为不可用
     * @return 返回当前对象是否有产生变更
     */
    invalidDiff(): boolean {
        if (this.diff === undefined) {
            return false
        }
        const fieldChange = this.diff.status !== BeanStatus.None && this.diff.status !== BeanStatus.Invalid
        this.diff = undefined
        return fieldChange
    }

    /**
     * 直接通过属性名获取指定属性值，不走 get 方法
     */
    protected getFieldValue<K extends keyof typeof this>(name: string): this[K] {
        return this[('_' + name) as K]
    }

    /**
     * 直接通过属性名设置指定属性值，不走 set 方法
     */
    protected setFieldValue(name: string, value: any) {
        this[('_' + name) as keyof this] = value
    }

    /**
     * 标记指定属性变更状态
     */
    public onChange(field: ChangeableField, status: FieldStatus, oldVal?: any) {
        this.assertWritable()
        const diff = this.diff
        if (diff !== undefined) {
            if (field instanceof FieldInfo) {
                const listens = []
                if (field.listenHandle) {
                    listens.push(field.listenHandle)
                }
                let f: FieldInfo | undefined = diff.field as FieldInfo
                while (f != undefined) {
                    if (f.listenHandle) {
                        listens.push(f.listenHandle)
                    }
                    f = f.parentField as FieldInfo
                }
                for (const item of listens) {
                    const listenArgs = new ListenArgs()
                    listenArgs.status = status
                    listenArgs.bean = this
                    listenArgs.oldVal = oldVal
                    const listenHandler = new item()
                    listenHandler.handler(listenArgs)
                }
            }
            if (diff.setChanges(field, status)) {
                if (field instanceof FieldInfo && field.modType !== ModType.None) {
                    //是子mod
                    const bean = this as any as RootBean
                    if (field.name in bean.__versions!) {
                        bean.__versions![field.name]++
                    } else {
                        bean.__versions![field.name] = 1
                    }
                    return
                }
                //状态变更，检查要不要做版本提升
                if (diff.modType === ModType.None) {
                    return
                }
                if (diff.modType === ModType.ModBean) {
                    ;(this as any as RootBean).__version!++
                }
            }
        }
    }

    protected assertWritable() {
        if (!this.writable) {
            throw new Error('the Bean cannot be written')
        }
    }

    /**
     * 获取待保存数据，null 表示不需要保存
     */
    public toSaveData(): JSONObject | null | undefined {
        const classInfo = this.getClassInfo()
        const data: JSONObject = {}
        for (const fieldInfo of classInfo.fields) {
            if (!fieldInfo.forRedis) continue
            this.toFieldSaveData(fieldInfo, data)
        }
        return data
    }

    /**
     * 获取mod数据
     * null 表示不需要保存，undefined 表示删除当前对象
     * @param forChange 是否只取变更部分
     * @param modVersions 版本路径对应的版本号，一层层下发，最后一层为数字即版本号，如{UserBase:1, AA:{BB:1}}
     */
    toModData(forChange = false, modVersions?: Map<string, int>): JSONObject | null | undefined {
        //!forChange时要全部获取
        let status = BeanStatus.New
        if (forChange) {
            if (this.diff === undefined) {
                return null
            }
            status = this.diff.status
        }
        const getSelfAll = !modVersions || modVersions?.get('_self') !== undefined
        //客户端带上来的版本号
        const withVersion = modVersions?.get('_self') ?? 0
        const classInfo = this.getClassInfo()
        const data: JSONObject = {}
        switch (status) {
            case BeanStatus.Invalid:
            case BeanStatus.AutoInit:
            case BeanStatus.None:
            case BeanStatus.HashCollectionDelAll:
                return null
            case BeanStatus.Delete:
                return undefined
            case BeanStatus.New:
                if (!forChange && !getSelfAll && modVersions) {
                    //只获取对应要获取的子模块
                    for (const [subModName, ver] of modVersions) {
                        const fieldInfo = classInfo.fieldMap[subModName]
                        this.fieldToModData(data, modVersions, fieldInfo, forChange)
                    }
                } else {
                    //获取所有数据，有可能包括子模块
                    for (const fieldInfo of classInfo.fields) {
                        if (!fieldInfo.forNet) continue
                        if (fieldInfo.modType !== ModType.None) {
                            this.fieldToModData(data, modVersions, fieldInfo, forChange)
                        } else {
                            this.toFieldModData(fieldInfo, data, forChange)
                        }
                    }
                }
                break
            case BeanStatus.FieldUpdate:
                //FieldUpdate情况下this.diff一定有值
                if (this.diff!.changes === undefined) {
                    break
                }
                if (this.diff!.modType === ModType.ModBean) {
                    //TODO
                }
                for (const field in this.diff!.changes) {
                    const fieldInfo = classInfo.fieldMap[field]
                    if (!fieldInfo.forNet) continue
                    const fieldStatus = this.diff!.changes[field]
                    switch (fieldStatus) {
                        case FieldStatus.Delete:
                            ModSync.addReplace(data, fieldInfo.index)
                            continue
                        case FieldStatus.Invalid:
                        case FieldStatus.None:
                            continue
                        case FieldStatus.ChildUpdate:
                        case FieldStatus.Update: {
                            let val = this.getFieldValue(fieldInfo.name) as any
                            if (val instanceof Object) {
                                val = val.toModData(fieldStatus === FieldStatus.ChildUpdate)
                                if (fieldStatus === FieldStatus.Update) {
                                    ModSync.addReplace(data, fieldInfo.index)
                                }
                                if (fieldInfo.modType !== ModType.None) {
                                    ;((data._subMods ?? (data._subMods = {})) as JSONObject)[fieldInfo.name] = val
                                    break
                                }
                            }
                            // @ts-ignore
                            data[fieldInfo.name] = val
                            break
                        }
                        default: // 其他情况都完整序列化
                            break
                    }
                }
                break
        }
        if (withVersion >= 0) {
            // data._version = this.__addVersion(0)
        }
        return data
    }

    protected fieldToModData(
        data: JSONObject,
        modVersions: Map<string, int> | undefined,
        fieldInfo: FieldInfo,
        forChange = false,
    ) {
        const root = this as any as RootBean
        if (modVersions) {
            const withSubVersion = modVersions.get(fieldInfo.name)
            if (withSubVersion === undefined) return false
            if (withSubVersion === root.__versions![fieldInfo.name]) {
                //版本一致则不需要设置
                return false
            }
        }
        this.toFieldModData(fieldInfo, (data._subMods ?? (data._subMods = {})) as JSONObject, forChange)
    }

    protected toFieldSaveData(fieldInfo: FieldInfo, data: JSONObject, useAlias: boolean = true) {
        // if(this.diff && fieldInfo.)
        const value = this.getFieldValue(fieldInfo.name)
        // 忽略默认值属性
        if (this.diff && this.diff.status == BeanStatus.New && fieldInfo.defaultVal === value) {
            return
        }
        if (value === undefined) {
            return
        }

        let fieldData: any = value
        // 如果是对象，则调用 toSaveData 方法
        // 对象可能为 Bean, Map 或者 Array 等
        if (value instanceof Object) {
            if ('diff' in value) {
                const diff: Diff = value.diff as Diff
                if (diff && diff.status === BeanStatus.None && diff.originals?.[fieldInfo.name]) {
                    //读过但是未变更过,直接用
                    fieldData = diff.originals[fieldInfo.name]
                } else {
                    fieldData = (value as any).toSaveData()
                }
            } else {
                //缓存的对象没被读过,可以直接用
                fieldData = value
            }
        } else if (typeof value === 'boolean') {
            // ioredis 不支持直接存储 boolean
            // 所以全部显式的转换为 string
            // TODO 是否要独立抽取，对应 parseFieldValue，此为 formatFieldValue
            fieldData = String(value)
        }

        if (fieldData !== null) {
            //bean类字段名使用短别名
            data[useAlias ? fieldInfo.aliasName : fieldInfo.name] = fieldData
        }
    }

    protected toFieldModData(
        fieldInfo: FieldInfo,
        data: JSONObject,
        forChange: boolean = true,
        modVersions?: int | { [key: string]: {} },
    ) {
        const fieldType = fieldInfo.type
        let value = this.getFieldValue(fieldInfo.name)
        if (!value) {
            return
        }
        if (fieldType instanceof ClassInfo) {
            //有可能还没反序列化,要先做
            if (!(value instanceof fieldType.constrFunc)) {
                value = this[fieldInfo.name as keyof this]
            }
        }
        let defaultVal = fieldInfo.defaultVal
        switch (typeof fieldInfo.defaultVal) {
            case 'number':
                defaultVal = 0
                break
            case 'boolean':
                defaultVal = false
                break
            case 'string':
                defaultVal = ''
                break
        }
        if (defaultVal === value) {
            // 忽略默认值属性
            return
        }

        let fieldData: any = value
        // 对象可能为 Bean, Map 或者 Array 等
        if (fieldType instanceof ClassInfo) {
            fieldData = (value as any).toModData(forChange, modVersions)
        }
        if (fieldData) {
            data[fieldInfo.name] = fieldData
        }
    }

    /**
     * TODO 这个方法应该避免 被业务调用！
     * @param data
     */
    public parseFromData(data?: JSONObject, writable: boolean = true) {
        this.assertWritable()
        this.writable = writable
        if (!data) {
            return
        }
        const classInfo = this.getClassInfo()
        for (const name in data) {
            const fieldInfo = classInfo.aliasFieldMap[name]
            if (fieldInfo === undefined) {
                continue
            }
            //TODO 先转了； 等之后直接设置,不需要转,等真正使用时再转
            // const value = data[name]
            const value = this.parseFieldValue(fieldInfo, data[name])
            if (value === undefined) {
                continue
            }
            this.setFieldValue(fieldInfo.name, value)
        }
    }

    protected parseFieldValue(fieldInfo: FieldInfo, data?: any, writable: boolean = true): unknown {
        // TODO 这个判断需要确认是否安全
        if (!data) {
            return undefined
        }

        // 基础数据类型直接赋值
        if (!(fieldInfo.type instanceof ClassInfo)) {
            return this.parseBaseValue(fieldInfo, data) // 转换为实际类型
        }
        return data
        // // 类型为 Container, get时反序列化
        // let bean: any
        //
        // // TODO 这个判断可以考虑优化一下
        // if (fieldInfo.type.fields?.length <= 0) {
        //     bean = new fieldInfo.type.constrFunc(fieldInfo)
        // } else {
        //     bean = new fieldInfo.type.constrFunc()
        // }
        //
        // bean.parseFromData(json5.parse(data), writable)
        // return bean
    }

    parseBaseValue(fieldInfo: FieldInfo, value: unknown): unknown {
        switch (fieldInfo.type) {
            case 'boolean':
                return (value as string).toLowerCase() === 'false' ? false : true
            case 'int':
                return Number(value)
            case 'uint':
                return Number(value)
            case 'number':
                return Number(value)
            default:
                return String(value)
        }
    }

    toString(): string {
        // let className = this.constructor.name
        // if (className.endsWith('Gen')) className = className.substring(0, className.length - 3)
        // let value = className + ': {'
        let value = '{'
        let isBegin = true
        for (const name in this) {
            if (name[0] !== '_' || this[name] == undefined) continue
            if (!isBegin) {
                value += ', '
            } else {
                isBegin = false
            }

            if (this[name] === '') {
                value += `"${name.substring(1)}": ` + `"${this[name]}"`
            } else {
                value += `"${name.substring(1)}": ` + `${this[name]}`
            }
        }
        return value + '}'
    }
}

export abstract class RootBean extends Bean {
    /**
     * RootBean 子类的 id（key）字段
     * 采用父类默认集成的方式，继承至 Hash
     * HashJson 的业务 Bean 不需要在定义此字段
     */
    protected _id: IdFieldType

    /** 只有RootBean才会有版本号 */
    __version?: uint

    /** 只有RootBean才会有子mod版本号列表<子mod名称，版本号> */
    __versions?: { [key: string]: int }

    __versionsChanged?: Set<string>

    getKeyId() {
        return this._id
    }

    readonly __createCtxId: int = 0

    /**
     * 区服Id,源自ServerRedis
     */
    protected _loadOpts?: HashLoadOpts

    /**
     * 需要通知的玩家Id列表
     */
    protected _notifyUserIds: Set<int> = new Set()

    /** Optional live recipient source, evaluated when ModSync reads this Bean's diff. */
    private _notifyUidsResolver?: () => readonly int[]

    get notifyUserIds() {
        return this._notifyUserIds
    }

    /**
     * 对象变更信息
     */
    protected diff: Root

    protected constructor(id: IdFieldType, loadOpts?: HashLoadOpts) {
        super()
        this._id = id
        this._loadOpts = loadOpts
        this.diff = new Root(BeanStatus.New, this)

        const classInfo = this.getClassInfo()
        if (classInfo?.modType === ModType.ModBean) {
            this.__version = 1
        }
        if (classInfo?.haveSubMods) {
            this.__versions = {}
        }
        this.__createCtxId = ContextEngine.currentCtxEngine?.ctxId ?? 0
    }

    _getDiff() {
        return this.diff
    }

    /**
     * 重置当前对象的 diff
     */
    initDiff() {
        this.invalidDiff()
        this.diff.status = BeanStatus.None
    }

    /**
     * 把当前对象的 diff 变更状态为不可用，并返回 子对象 是否有产生变更
     */
    invalidDiff(): boolean {
        // RootBean 不清空 diff 对象
        if (this.diff.status === BeanStatus.Invalid) {
            return false
        }
        let changed = false
        if (this.diff.status != BeanStatus.None) {
            changed = true
        }
        this.diff.status = BeanStatus.Invalid
        this.diff.changes = undefined
        return changed
    }

    delete() {
        if (this.writable) {
            this._throwOnErrorCtx()
            this.diff.status = BeanStatus.Delete
            this.diff.addRootChange()
        }
    }

    addSubModVersion(field: FieldInfo) {
        if (this.__versionsChanged!.has(field.name)) {
            return
        }
        this.__versionsChanged!.add(field.name)
        this.__versions![field.name]++
    }

    /**
     * 获取待保存数据
     * null 表示不需要保存，undefined 表示删除当前对象
     */
    public toSaveData(): JSONObject | null | undefined {
        this._throwOnErrorCtx()
        if (this.diff === undefined) {
            return null
        }
        const classInfo = this.getClassInfo()
        const data: JSONObject = {}
        let subModsChanged = false
        switch (this.diff.status) {
            case BeanStatus.Invalid:
            case BeanStatus.AutoInit:
            case BeanStatus.None:
            case BeanStatus.HashCollectionDelAll:
                return null
            case BeanStatus.Delete:
                return undefined
            case BeanStatus.New:
                for (const fieldInfo of classInfo.fields) {
                    if (!fieldInfo.forRedis) continue
                    if (fieldInfo.modType !== ModType.None) {
                        subModsChanged = true
                    }
                    this.toFieldSaveData(fieldInfo, data, false) //顶级对象字段名不使用别名
                }
                break
            case BeanStatus.FieldUpdate:
                if (this.diff.changes === undefined) {
                    break
                }

                for (const field in this.diff.changes) {
                    const fieldInfo = classInfo.fieldMap[field]
                    if (!fieldInfo.forRedis) continue
                    if (fieldInfo.modType !== ModType.None) {
                        subModsChanged = true
                    }
                    const fieldStatus = this.diff.changes[field]
                    switch (fieldStatus) {
                        case FieldStatus.Delete:
                            continue
                        case FieldStatus.Invalid:
                        case FieldStatus.None:
                            continue
                        default: // 其他情况都完整序列化
                            this.toFieldSaveData(fieldInfo, data, false)
                    }
                }
                break
        }
        if (classInfo.modType === ModType.ModBean) {
            data._version = this.__version
        }
        if (subModsChanged) {
            data._versions = this.__versions
        }
        return data
    }

    /*
     * pipeClient为pipe的对象
     * 返回值为执行的redis命令数，用于判断redis pipe是否执行exec
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async save(pipeClient?: RedisClientMultiCommandType<RedisModules, RedisFunctions, RedisScripts>) {
        this._throwOnErrorCtx()
        //TODO 后续看具体使用场景 决定保存后需不需要重置 diff
        this.initDiff()
        this.diff.changed = false

        return 0
    }

    getRedis(): RedisCache | null {
        return null
    }

    /** 获取本次变更的通知 uid；绑定实时接收者时在调用时解析。 */
    getNotifyUids() {
        return this._notifyUidsResolver ? Array.from(this._notifyUidsResolver()) : Array.from(this._notifyUserIds)
    }

    setNotifyUidsResolver(resolver: () => readonly int[]): void {
        this._notifyUidsResolver = resolver
    }

    addNotifyUids(...uIds: int[]) {
        for (const uId of uIds) {
            this._notifyUserIds.add(uId)
        }
    }

    // key的过期时间,默认是0,不过期
    expireTime(): int {
        return 0
    }

    // 刷新key的过期时间
    async refreshExpire(expire: number = 0) {
        if (expire <= 0) {
            expire = this.expireTime()
        } else if (this.expireTime() > 0) {
            throw new Error('调用refreshExpire方法手动管理过期时间的对象，不允许expireTime()返回>0的值同时可自动管理')
        }
        if (expire > 0) {
            // @ts-ignore
            const key = this.constructor.getRedisKey(this._id, this._loadOpts?.serverId)
            await this.getRedis()?.expire(key, expire)
        }
    }

    //检查bean被其他上下文回调修改时报错,因为没在onchange里实时调用,只能检查大部分情况不是所有情况
    public _throwOnErrorCtx() {
        const beanCtxId = this.__createCtxId
        const currentCtxId = ContextEngine.currentCtxEngine?.ctxId ?? 0
        if (this.__createCtxId !== currentCtxId) {
            throw new Error('bean只能在所属上下修改,创建时上下文id:' + beanCtxId + ',当前id:' + currentCtxId)
        }
    }
}
