import { RedisCache } from '../../database/RedisCache'
import { RedisInstance } from '../../database/RedisInstance'
import { Hash } from '../../differ/hash'
import { HashJson } from '../../differ/hashJson'
import { ZSet } from '../../differ/ZSet'

export class CenterHash extends Hash {
    getRedis(): RedisCache {
        return RedisInstance.getCenterRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getCenterRedis()
    }
}

export class CenterHashJson extends HashJson {
    getRedis(): RedisCache {
        return RedisInstance.getCenterRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getCenterRedis()
    }
}

export class CenterZSet extends ZSet {
    getRedis(): RedisCache {
        return RedisInstance.getCenterRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getCenterRedis()
    }
}
