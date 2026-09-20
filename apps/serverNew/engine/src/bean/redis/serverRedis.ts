import { RedisCache } from '../../database/RedisCache'
import { RedisInstance } from '../../database/RedisInstance'
import { IdFieldType } from '../../differ/bean'
import { Hash } from '../../differ/hash'
import { HashJson } from '../../differ/hashJson'
import { ZSet } from '../../differ/ZSet'

export class ServerHash extends Hash {

    getRedis(): RedisCache {
        return RedisInstance.getServerRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getServerRedis()
    }
}

export class ServerHashJson extends HashJson {

    getRedis(): RedisCache {
        return RedisInstance.getServerRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getServerRedis()
    }
}

export class ServerZSet extends ZSet {
    getRedis(): RedisCache {
        return RedisInstance.getServerRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getServerRedis()
    }
}
