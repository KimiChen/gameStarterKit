import { RedisClientMultiCommandType } from '@redis/client/dist/lib/client/multi-command'
import { ContextEngine } from '../context/ContextEngine'
import { RedisCache } from '../database/RedisCache'
import { IdFieldType, RootBean } from './bean'
import { ClassInfo, FieldInfo } from './diff'
import { JSONObject } from './redis'
import { BeanStatus } from './status'
import { HashLoadOpts } from './subs/optsInterface'
import { RedisFunctions, RedisModules, RedisScripts } from 'redis'
import { ReadonlyBean } from './readonly'

export class HashJson extends RootBean {
    /**
     * 此 HashJson 的 root key
     */
    protected _rootKey?: string

    get rootKey() {
        return this._rootKey
    }

    /**
     * @param id  为hash结构的key值
     * @param rootKey 为redis存储的key的后缀, className_rootKey
     * @param serverId 为redis存储的key前缀, sId:HashName_rootKey
     * @param byLoad 通过加载数据创建的对象
     */
    constructor(id: IdFieldType, rootKey?: string, loadOpts?: HashLoadOpts, byLoad = false) {
        super(id, loadOpts)
        this._rootKey = rootKey
        if (!byLoad) {
            // @ts-ignore
            const redisKey = this.constructor.getRedisKey(rootKey, loadOpts?.serverId)
            let loade = ContextEngine.currentCtxEngine?.loadedHashJson.get(redisKey)
            if (!loade) {
                ContextEngine.currentCtxEngine?.loadedHashJson.set(redisKey, (loade = new Map()))
            }
            loade?.set(id, this)
        }
    }

    // class 信息,这个类可以不设置
    // static _class_info: DiffClass<DiffHash> = new DiffClass(this.name);
    protected tryLoad(_field: string) {
        // TODO redis 动态加载
    }

    /**
     * 获取 redis 的存储键值
     * @param key 键值的后缀，和 Hash 的 id 不相同
     * @param serverId 键值的前缀,serverId:name_key
     * @returns
     */
    static getRedisKey(key?: string, serverId?: int): string {
        // @ts-ignore
        let redisKey = this._class_info.name
        if (key !== undefined) {
            redisKey = redisKey + '_' + key
        }
        if (serverId !== undefined) {
            redisKey = serverId + ':' + redisKey
        }
        return redisKey
    }

    static async load<T extends typeof HashJson>(
        this: T,
        id: IdFieldType,
        rootKey?: string,
        loadOpts?: HashLoadOpts,
    ): Promise<InstanceType<T> | undefined> {
        const beans = await this.loadByIds([id], rootKey, loadOpts)
        if (beans.size <= 0) {
            return undefined
        }
        return beans.values().next().value as InstanceType<T>
    }

    static async loadByIds<T extends typeof HashJson>(
        this: T,
        ids: readonly IdFieldType[],
        rootKey?: string,
        loadOpts?: HashLoadOpts,
    ) {
        const requestedIds = [...ids]
        const loadAll = requestedIds.length <= 0
        const redisKey = this.getRedisKey(rootKey, loadOpts?.serverId)
        let datas: { [k: string]: string } | string[]
        let beans = ContextEngine.currentCtxEngine?.loadedHashJson.get(redisKey) as Map<IdFieldType, InstanceType<T>>
        //这次要加载的指定ids的beans，有可能就是beans，后面重复set没问题
        let toLoadBeans = beans
        if (beans) {
            if (requestedIds.length > 0) {
                toLoadBeans = new Map<IdFieldType, InstanceType<any>>()
                //指定ids列表，要验证下ids是不是已经全在缓存，不是的话只要加载未加载的部分
                for (let i = requestedIds.length - 1; i >= 0; i--) {
                    const beanId = requestedIds[i]
                    const toLoadBean = beans.get(beanId)
                    if (toLoadBean) {
                        toLoadBeans.set(beanId, toLoadBean)
                        requestedIds.splice(i, 1)
                    }
                }
                if (requestedIds.length === 0) {
                    return toLoadBeans
                }
                beans = toLoadBeans
            } else {
                return beans
            }
        } else {
            beans = new Map<IdFieldType, InstanceType<T>>()
            toLoadBeans = beans
            ContextEngine.currentCtxEngine?.loadedHashJson.set(redisKey, beans)
        }
        if (loadAll) {
            datas = await this.getRedis().hGetAll(redisKey)
        } else {
            datas = await this.getRedis().hmGet(redisKey, requestedIds)
        }
        if (Array.isArray(datas)) {
            for (const index in datas) {
                const data = datas[index]
                if (data === null) {
                    continue
                }

                const id = requestedIds[index]
                const bean = new this(id, rootKey, loadOpts, true)

                bean.parseFromData(JSON.parse(data))
                bean.diff.status = BeanStatus.None
                beans.set(id, bean as InstanceType<T>)
                toLoadBeans.set(id, bean as InstanceType<T>)
            }
        } else {
            for (const id in datas) {
                const data = datas[id]
                if (data === null) {
                    continue
                }
                const bean = new this(id, rootKey, loadOpts, true)

                bean.parseFromData(JSON.parse(data))
                bean.diff.status = BeanStatus.None
                beans.set(id, bean as InstanceType<T>)
                toLoadBeans.set(id, bean as InstanceType<T>)
            }
        }
        return toLoadBeans
    }

    static async loadAll<T extends typeof HashJson>(this: T, rootKey?: string, loadOpts?: HashLoadOpts) {
        return this.loadByIds([], rootKey, loadOpts)
    }

    static async loadOnlyRead<T extends typeof HashJson>(
        this: T,
        id: IdFieldType,
        rootKey?: string,
        loadOpts?: HashLoadOpts,
    ): Promise<ReadonlyBean<InstanceType<T>> | undefined> {
        const beans = await this.loadOnlyReadIds([id], rootKey, loadOpts)
        if (beans.size <= 0) {
            return undefined
        }
        return beans.values().next().value as ReadonlyBean<InstanceType<T>>
    }

    static async loadOnlyReadIds<T extends typeof HashJson>(
        this: T,
        ids: readonly IdFieldType[],
        rootKey?: string,
        loadOpts?: HashLoadOpts,
    ): Promise<Map<IdFieldType, ReadonlyBean<InstanceType<T>>>> {
        const requestedIds = [...ids]
        const loadAll = requestedIds.length <= 0
        const redisKey = this.getRedisKey(rootKey, loadOpts?.serverId)
        const beans = new Map<IdFieldType, ReadonlyBean<InstanceType<T>>>()
        let datas: { [k: string]: string } | string[]
        if (loadAll) {
            datas = await this.getRedis().hGetAll(redisKey)
        } else {
            datas = await this.getRedis().hmGet(redisKey, requestedIds)
        }

        if (Array.isArray(datas)) {
            for (const index in datas) {
                const data = datas[index]
                if (data === null) {
                    continue
                }

                const id = requestedIds[index]
                const bean = new this(id, rootKey, loadOpts, true)

                bean.parseFromData(JSON.parse(data), false)
                bean.diff.status = BeanStatus.None
                beans.set(bean.getKeyId(), bean as ReadonlyBean<InstanceType<T>>)
            }
        } else {
            for (const id in datas) {
                const data = datas[id]
                if (data === null) {
                    continue
                }
                const bean = new this(id, rootKey, loadOpts, true)
                bean.parseFromData(JSON.parse(data), false)
                bean.diff.status = BeanStatus.None
                beans.set(bean.getKeyId(), bean as ReadonlyBean<InstanceType<T>>)
            }
        }

        return beans
    }

    static async loadOnlyReadAll<T extends typeof HashJson>(
        this: T,
        rootKey?: string,
        loadOpts?: HashLoadOpts,
    ): Promise<Map<IdFieldType, ReadonlyBean<InstanceType<T>>>> {
        return this.loadOnlyReadIds([], rootKey, loadOpts)
    }

    /**
     * 构建一个不被缓存也不会被自动保存,自动change的bean,用于不太通用的自定义逻辑
     */
    static buildDissociate<T extends HashJson>(
        this: { new (...v: any): T } & typeof HashJson,
        rootKey?: string,
        loadOpts?: HashLoadOpts,
        opts?: { diffStatus: BeanStatus },
    ): T {
        //byLoad为true, new时才不会进缓存
        const bean = new this(0, rootKey, loadOpts, true)
        bean.diff.status = opts?.diffStatus ?? BeanStatus.None
        return bean
    }

    getRedis(): RedisCache {
        throw new Error('Method not implemented.')
    }

    static getRedis(): RedisCache {
        throw new Error('Method not implemented.')
    }

    /**
     * 获取待保存数据
     * null 表示不需要保存，undefined 表示删除当前对象
     */
    public toSaveData(): JSONObject | null | undefined {
        if (this.diff === undefined) {
            return null
        }
        const classInfo = this.getClassInfo()
        const data: JSONObject = {}
        switch (this.diff.status) {
            case BeanStatus.Invalid:
            case BeanStatus.AutoInit:
            case BeanStatus.None:
            case BeanStatus.HashCollectionDelAll:
                return null
            case BeanStatus.Delete:
                return undefined
            // HashJson 有变更则保存全部字段
            case BeanStatus.New:
            case BeanStatus.FieldUpdate:
                for (const fieldInfo of classInfo.fields) {
                    if (!fieldInfo.forRedis) continue
                    this.toFieldSaveData(fieldInfo, data)
                }
                break
        }
        return data
    }

    /*
     * pipeClient为pipe的对象
     * 返回值为执行的redis命令数，用于判断redis pipe是否执行exec
     */
    async save(pipeClient?: RedisClientMultiCommandType<RedisModules, RedisFunctions, RedisScripts>) {
        try {
            const redis = pipeClient ?? this.getRedis()
            // @ts-ignore
            const redisKey = this.constructor.getRedisKey(this._rootKey, this._loadOpts?.serverId)
            const id = String(this._id)

            if (this.diff.status == BeanStatus.HashCollectionDelAll) {
                await redis.del(redisKey)
                return 1
            } else if (this.diff.status == BeanStatus.Delete) {
                await redis.hDel(redisKey, id)
                return 1
            }

            const data = this.toSaveData()
            if (data === null) {
                return 0
            }
            if (!data) {
                await redis.del(redisKey)
                return 1
            }

            data.id = this._id
            await redis.hSet(redisKey, id, JSON.stringify(data))
            const expire = this.expireTime()
            if (expire > 0) {
                await redis.expire(redisKey, expire)
            }
            return 1
        } finally {
            await super.save()
        }
    }

    protected parseFieldValue(fieldInfo: FieldInfo, data?: any): any {
        if (data === undefined) {
            return undefined
        }
        if (fieldInfo.type instanceof ClassInfo) {
            return JSON.stringify(data)
        }
        return super.parseFieldValue(fieldInfo, data)
    }
}
