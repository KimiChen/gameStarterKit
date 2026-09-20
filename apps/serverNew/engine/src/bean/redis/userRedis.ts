import { RedisCache } from '../../database/RedisCache'
import { RedisInstance } from '../../database/RedisInstance'
import { IdFieldType } from '../../differ/bean'
import { Hash } from '../../differ/hash'
import { HashJson } from '../../differ/hashJson'
import { ZSet } from '../../differ/ZSet'

export class UserHash extends Hash {

    getNotifyUids() {
        return [this._id as int]
    }

    getRedis(): RedisCache {
        return RedisInstance.getUserRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getUserRedis()
    }
}

export class UserHashJson extends HashJson {

    getRedis(): RedisCache {
        return RedisInstance.getUserRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getUserRedis()
    }
}

export class UserZSet extends ZSet {
    getRedis(): RedisCache {
        return RedisInstance.getUserRedis()
    }

    static getRedis(): RedisCache {
        return RedisInstance.getUserRedis()
    }
}
