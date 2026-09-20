import { getDifferCache } from './differCache'
import { RedisClientMultiCommandType } from '@redis/client/dist/lib/client/multi-command'
import { RedisFunctions, RedisModules, RedisScripts } from 'redis'

export class RedisService {

    /**
     * Save 单纯保存数据 不生成 net changes
     * @returns 
     */
    static async save() {
        const cache = getDifferCache()
        if (!cache) {
            return
        }

        // 开启redis的pipe
        const pipeClients: { [k: string]: RedisClientMultiCommandType<RedisModules, RedisFunctions, RedisScripts> } = {} // pipe的客户端
        const pipeExecs: { [k: string]: boolean } = {} // 记录pipe是否执行了命令
        for (const bean of cache.changedBeans) {
            bean._throwOnErrorCtx()
            const redis = bean.getRedis()
            if (!redis) {
                continue
            }
            //这里有个问题需要这么指定类型, https://github.com/microsoft/TypeScript/issues/38050
            pipeClients[redis.getId()]
                = redis.client().multi() as unknown as RedisClientMultiCommandType<RedisModules, RedisFunctions, RedisScripts>
            pipeExecs[redis.getId()] = false
        }

        for (const bean of cache.changedBeans) {
            if (!bean.getClassInfo().forRedis()) continue
            const redis = bean.getRedis()
            const pipeClient = redis ? pipeClients[redis.getId()] : undefined

            // 保存 redis RootBean
            const cmdNum = await bean.save(pipeClient) // 返回redis执行的命令数
            if (redis && pipeClient && cmdNum > 0) {
                pipeExecs[redis.getId()] = true
            }
        }

        for (const [, item] of cache.rankLoadedList) {
            const redis = item.getRedis()
            let pipeClient
            if (redis.getId() in pipeClients) {
                pipeClient = pipeClients[redis.getId()]
            } else {
                pipeClients[redis.getId()]
                    = redis.client().multi() as unknown as RedisClientMultiCommandType<RedisModules, RedisFunctions, RedisScripts>
                pipeExecs[redis.getId()] = false
                pipeClient = pipeClients[redis.getId()]
            }
            if (item._cacheDeleted) {
                pipeClient.del(item.key)
            }
            await item._handleRankInfoMap(item._memberCommitMap)
            if (item._expireTime > 0) {
                await redis.expire(item.key, item._expireTime)
            }
            pipeExecs[redis.getId()] = true
        }

        // 执行pipe的exec
        for (const clientId in pipeClients) {
            if (pipeExecs[clientId]) {
                await pipeClients[clientId].execAsPipeline()
            }
        }
    }

}
