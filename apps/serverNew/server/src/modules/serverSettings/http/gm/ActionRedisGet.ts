import { RedisCache, RedisInstance } from '@arthropoda/game-engine'
import { GmAction } from '../../../gm/http/GmAction'
import { format } from 'util'
import { ServerListProxy } from '../../persistence/ServerListProxy'

export class ActionRedisGet extends GmAction {
    public async doAction(params: { [key: string]: any }) {
        const redisList = []
        const errorList: Record<string, any> = []

        let getCenter = true
        let getUser = true
        let getServer = true
        if (params.type == 1) {
            getServer = false
        } else if (params.type == 2) {
            getCenter = false
            getUser = false
        } else {
            //
        }
        // center redis

        if (getCenter) {
            try {
                const redis = RedisInstance.getCenterRedis()
                const item = await this.getItemInfo(redis)
                item.sId = 'center'
                redisList.push(item)
            } catch (e) {
                errorList.center = format('%s', e)
                const item = {
                    sId: 'center',
                    maxmemory: format('%s', e),
                }
                redisList.push(item)
            }
        }

        // user redis
        if (getUser) {
            const userRedisList = [CP.platform.userRedis]
            for (let index = 0; index < userRedisList.length; index++) {
                const redisConf = userRedisList[index]
                const key = 'user' + index
                try {
                    const redis = RedisInstance.getUserRedis()
                    const item = await this.getItemInfo(redis)
                    item.sId = key
                    redisList.push(item)
                } catch (e) {
                    errorList[key] = format('%s', e)
                    const item = {
                        sId: key,
                        maxmemory: format('%s', e),
                    }
                    redisList.push(item)
                }
            }
        }

        // server redis
        if (getServer) {
            const svs = await ServerListProxy.getAllList()
            for (const sv of svs) {
                const key = 'sv' + sv.sId
                try {
                    const redis = RedisInstance.getServerRedis()
                    const item = await this.getItemInfo(redis)
                    item.sId = key
                    redisList.push(item)
                } catch (e) {
                    errorList[key] = format('%s', e)
                    const item = {
                        sId: key,
                        maxmemory: format('%s', e),
                    }
                    redisList.push(item)
                }
            }
        }

        const res = {
            redis: redisList,
            error: {},
        }

        if (errorList) {
            res.error = errorList
        }

        return res
    }

    private async getItemInfo(redis: RedisCache) {
        const info = await redis.infoDict()
        let maxmemory = Int(info.maxmemory)
        let maxmemoryHuman = info.maxmemory_human
        const usedMemory = Int(info.used_memory)
        const usedMemoryHuman = info.used_memory_human

        const connected = Int(info.connected_clients)
        if (!maxmemoryHuman) {
            maxmemory = Int((await redis.getConf('maxmemory')).maxmemory)
            maxmemoryHuman = this.calc(maxmemory)
        }

        const occupy = maxmemory ? ((usedMemory / maxmemory) * 100).toFixed(2) : 0

        const data = {
            sId: '',
            maxmemory: maxmemoryHuman,
            usedMemory: usedMemoryHuman,
            occupy: occupy,
            connected: connected,
        }

        return data
    }

    calc(size: number, digits = 2) {
        const unit = ['', 'K', 'M', 'G', 'T', 'P']
        const base = 1024

        let max = 0
        let i = 0
        for (let index = 0; index < unit.length; index++) {
            i = index
            max = (index + 1) * 1024
            if (max >= size) {
                break
            }
        }
        return (size / Math.pow(base, i)).toFixed(digits) + ' ' + unit[i]
    }
}
