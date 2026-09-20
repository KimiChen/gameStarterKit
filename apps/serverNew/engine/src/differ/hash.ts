import { IdFieldType, RootBean } from './bean'
import { BeanStatus } from './status'
import { HSETObject, RedisCache } from '../database/RedisCache'
import { RedisCommandArgument, RedisFunctions, RedisModules, RedisScripts } from '@redis/client/dist/lib/commands'
import { ContextEngine } from '../context/ContextEngine'
import { JSONObject } from './redis'
import { ModType } from './diff'
import { HashLoadOpts } from './subs/optsInterface'
import { RedisClientMultiCommandType } from '@redis/client/dist/lib/client/multi-command'
import { ReadonlyBean } from './readonly'

/**
 * 类装饰器: 标识网络同步为Map结构
 */
export const ClassNetMap: ClassDecorator = function (_constructor: Function): void {}

/** 装饰器: 标识仅网络同步 */
export const OnlyNet: ClassDecorator & PropertyDecorator = function (
    _target: Object,
    _propertyKey: string | symbol,
): void {} as any

/** 装饰器: 标识仅保存到redis */
export const OnlyRedis: ClassDecorator & PropertyDecorator = function (
    _target: Object,
    _propertyKey: string | symbol,
): void {} as any

/** 装饰器: 标识为自动同步模块 */
export const Mod: ClassDecorator & PropertyDecorator = function (
    _target: Object,
    _propertyKey: string | symbol,
): void {} as any

export class Hash extends RootBean {
    constructor(id: IdFieldType, loadOpts?: HashLoadOpts, byLoad = false) {
        super(id, loadOpts)
        if (!byLoad) {
            // @ts-ignore 业务中new出来的缓存对象
            const diffHashKey = this.constructor.getRedisKey(id, loadOpts?.serverId)
            ContextEngine.currentCtxEngine?.loadedHash.set(diffHashKey, this)
        }
    }

    // class 信息,这个类可以不设置
    // static _class_info: DiffClass<DiffHash> = new DiffClass(this.name);
    protected tryLoad(_field: string) {
        // TODO redis
    }

    /**
     * 获取hashKey
     * @param id IdFieldType
     * @param serverId 区服
     * @returns
     */
    static getRedisKey(id?: IdFieldType, serverId?: int): string {
        // @ts-ignore
        let redisKey = this._class_info.name
        if (id !== undefined) {
            redisKey = redisKey + '_' + id
        }
        if (serverId !== undefined) {
            redisKey = serverId + ':' + redisKey
        }
        return redisKey
    }

    static async load<T extends Hash>(
        this: { new (...v: any): T } & typeof Hash,
        id: IdFieldType,
        loadOpts?: HashLoadOpts,
    ): Promise<T | undefined> {
        const classInfo = this._class_info
        if (!classInfo?.forRedis()) {
            throw new Error('OnlyNet的对象不能通过load创建')
        }
        const diffHashKey = this.getRedisKey(id, loadOpts?.serverId)
        const loaded = ContextEngine.currentCtxEngine?.loadedHash.get(diffHashKey)
        if (loaded) {
            return loaded as T
        }
        const data = await this._loadFieldToRedis(diffHashKey, loadOpts)
        if (!data.id) {
            return undefined
        }
        const bean = new this(id, loadOpts, true)
        bean.parseFromData(data)
        bean.diff.status = BeanStatus.None
        // 缓存hash
        ContextEngine.currentCtxEngine?.loadedHash.set(diffHashKey, bean)
        return bean
    }

    /**
     * 加载的对象数据为只读对象，不会保存不会同步，不走static缓存
     * @param this
     * @param id
     * @returns
     */
    static async loadOnlyRead<T extends Hash>(
        this: { new (...v: any): T } & typeof Hash,
        id: IdFieldType,
        loadOpts?: HashLoadOpts,
    ): Promise<ReadonlyBean<T> | undefined> {
        const classInfo = this._class_info
        if (!classInfo?.forRedis()) {
            throw new Error('OnlyNet的对象不能通过load创建')
        }
        const diffHashKey = this.getRedisKey(id, loadOpts?.serverId)
        const data = await this._loadFieldToRedis(diffHashKey, loadOpts)
        if (!data.id) {
            return undefined
        }
        const bean = new this(id, loadOpts, true)
        bean.parseFromData(data, false)
        bean.diff.status = BeanStatus.None
        return bean as ReadonlyBean<T>
    }

    /**
     * 构建一个不被缓存也不会被自动保存,自动change的bean,用于不太通用的自定义逻辑
     */
    static buildDissociate<T extends Hash>(
        this: { new (...v: any): T } & typeof Hash,
        opts?: { diffStatus: BeanStatus },
    ): T {
        //byLoad为true, new时才不会进缓存
        const bean = new this(0, undefined, true)
        bean.diff.status = opts?.diffStatus ?? BeanStatus.None
        return bean
    }

    /**
     * 从redis加载数据
     * @param diffHashKey
     * @param loadOpts
     * @returns
     */
    static async _loadFieldToRedis(diffHashKey: string, loadOpts?: HashLoadOpts) {
        let data: { [key: string]: string }
        if (loadOpts && loadOpts.fields && loadOpts.fields.length > 0) {
            if (!loadOpts.fields.includes('id')) {
                loadOpts.fields.push('id')
            }
            data = await this.getRedis().hmGetToMap(diffHashKey, loadOpts.fields)
        } else {
            data = await this.getRedis().hGetAll(diffHashKey)
        }
        return data
    }

    getRedis(): RedisCache {
        throw new Error('Method not implemented.')
    }

    static getRedis(): RedisCache {
        throw new Error('Method not implemented.')
    }

    /*
     * pipeClient为pipe的对象
     * 返回值为执行的redis命令数，用于判断redis pipe是否执行exec
     */
    async save(pipeClient?: RedisClientMultiCommandType<RedisModules, RedisFunctions, RedisScripts>) {
        try {
            const data = this.toSaveData()
            if (data === null) {
                return 0
            }
            // @ts-ignore
            const redisKey = this.constructor.getRedisKey(this._id, this._loadOpts?.serverId)
            //const redis = this.getRedis()
            const redis = pipeClient ?? this.getRedis()
            if (!data) {
                //TODO 异步io 操作如何处理
                // Log.redis.debug(`del ${redisKey}`)
                await redis.del(redisKey)
                return 1
            }
            data.id = this._id

            // 可否合并为 hmSet 操作
            const mSetData: HSETObject = {}
            let cmdNum = 0
            for (const name in data) {
                const value = data[name]
                if (value === undefined) {
                    // TODO 异步io 操作如何处理
                    // Log.redis.debug(`hDel ${redisKey} ${name}`)
                    await redis.hDel(redisKey, name)
                    cmdNum++
                } else {
                    const finalVal =
                        typeof value === 'object' ? JSON.stringify(value) : (value as RedisCommandArgument | int)
                    mSetData[name] = finalVal
                }
            }
            if (Object.keys(mSetData).length > 0) {
                // Log.redis.debug(`hmSet ${redisKey}`, json5.stringify(mSetData))
                if (redis instanceof RedisCache) {
                    await redis.hMset(redisKey, mSetData)
                } else {
                    await redis.hSet(redisKey, mSetData)
                }

                const expire = this.expireTime()
                if (expire > 0) {
                    await redis.expire(redisKey, expire)
                }
                cmdNum++
            }
            return cmdNum
        } finally {
            await super.save()
        }
    }

    /**
     * TODO 考虑和 Bean 的 parseFromData 整合，只差了 json 反序列化
     * 或者在此进行懒序列化的处理
     * @param data
     * @returns
     */
    public parseFromData(data?: JSONObject, writable: boolean = true) {
        this.assertWritable()
        this.writable = writable
        // data 实际类型为 { [key: string]: string }
        if (!data) {
            return
        }
        const classInfo = this.getClassInfo()
        for (const name in data) {
            const fieldInfo = classInfo.fieldMap[name]
            if (fieldInfo === undefined) {
                continue
            }

            const value = this.parseFieldValue(fieldInfo, data[name])
            if (value === undefined) {
                continue
            }
            this.setFieldValue(name, value)
        }
        if (classInfo.modType === ModType.ModBean) {
            this.__version = Number(data._version)
        }
        if (classInfo.haveSubMods && data._versions) {
            this.__versions = JSON.parse(data._versions as string)
        }
    }
}
