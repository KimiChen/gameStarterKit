import { PubSubListener } from '@redis/client/dist/lib/client/pub-sub'
import { type ZMember } from '@redis/client/dist/lib/commands/generic-transformers'
import { type RedisCommandArgument } from '@redis/client/dist/lib/commands/index'
import { HSETObject, MemberType, RedisCache } from './RedisCache'

/**
 * 区服redis代理,该类下的所有命令都会为 key 加上前缀
 * sId:xxxx
 * 
 * 为了防止误用,没有封装 connection, disconnect, getId, getClient 等方法
 */
export class ServerRedisProxy {
    sId: number

    constructor(sId: number, private redisCache: RedisCache) {
        if (sId == 0) {
            Log.redis.error('input a error param, sId must not be zero')
        }
        this.sId = sId
    }

    private serverIdPrefix<T extends string | string[]>(key: T): T {
        if (Array.isArray(key)) {
            return key.map(k => `${this.sId}:${k}`) as T
        } else {
            return `${this.sId}:${key}` as T
        }
    }

    /**
     *
     * @param key
     * @param value
     * @param expired  大于1672502400,表示按时间戳设置过期时间，否则表示剩余有效时间秒数
     * @returns
     */
    async set(key: string, value: RedisCommandArgument | int, expired: int = 0) {
        key = this.serverIdPrefix(key)
        return this.redisCache.set(key, value, expired)
    }

    setnx(key: string, value: RedisCommandArgument, expired: int = 0) {
        key = this.serverIdPrefix(key)
        return this.redisCache.setnx(key, value, expired)
    }

    getConf(...args: [parameter: string]) {
        return this.redisCache.getConf(...args)
    }

    // 过期的时间戳，-1为永不过期
    ttl(...args: [key: string]) {
        return this.redisCache.ttl(...args)
    }

    // ...args的区别  TODO
    get(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.get(key)
    }

    // 获取转对象
    async getObject(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.getObject(key)
    }

    getBuffer(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.getBuffer(key)
    }

    incr(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.incr(key)
    }

    incrBy(key: string, decrement: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.incrBy(key, decrement)
    }

    decr(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.decr(key)
    }

    decrBy(key: string, decrement: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.decrBy(key, decrement)
    }

    lPush(key: string, elements: RedisCommandArgument[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lPush(key, elements)
    }

    rPush(key: string, elements: RedisCommandArgument[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.rPush(key, elements)
    }

    lSize(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lSize(key)
    }

    lLen(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lLen(key)
    }

    lRem(key: string, element: RedisCommandArgument, count: int = 1) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lRem(key, element, count)
    }

    lPop(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lPop(key)
    }

    lTrim(key: string, start: int, stop: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lTrim(key, start, stop)
    }

    lRange(key: string, start: int, stop: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.lRange(key, start, stop)
    }

    blPop(key: string, timeout: int = 5) {
        key = this.serverIdPrefix(key)
        return this.redisCache.blPop(key, timeout)
    }

    brPop(key: string, timeout: int = 5) {
        key = this.serverIdPrefix(key)
        return this.redisCache.brPop(key, timeout)
    }

    rPop(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.rPop(key)
    }

    sAdd(key: string, members: RedisCommandArgument | RedisCommandArgument[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sAdd(key, members)
    }

    sRem(key: string, members: RedisCommandArgument | RedisCommandArgument[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sRem(key, members)
    }

    sPop(key: string, count: int = 1) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sPop(key, count)
    }

    sRandmember(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sRandmember(key)
    }

    sRandMemberCount(key: string, count: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sRandMemberCount(key, count)
    }

    sIsmember(key: string, member: RedisCommandArgument) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sIsmember(key, member)
    }

    sCard(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sCard(key)
    }

    sMembers(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.sMembers(key)
    }

    zAdd(key: string, score: int, member: MemberType) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zAdd(key, score, member)
    }

    zAddMembers(key: string, members: ZMember | ZMember[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zAddMembers(key, members)
    }

    zCard(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zCard(key)
    }

    zIncrby(key: string, score: int, member: MemberType) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zIncrby(key, score, member)
    }

    // 按照排名获取区间 正序
    zRange(key: string, min: int, max: int, isRev: boolean = false) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zRange(key, min, max, isRev)
    }

    //
    zRangeWithScores(key: string, min: int, max: int, isRev: boolean = false) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zRangeWithScores(key, min, max, isRev)
    }

    // 按积分获取区间
    zRangeByScore(key: string, min: int, max: int, isRev: boolean = false) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zRangeByScore(key, min, max, isRev)
    }

    zRem(key: string, members: MemberType | MemberType[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zRem(key, members)
    }

    zRank(key: string, member: MemberType, isRev: boolean = false) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zRank(key, member, isRev)
    }

    zScore(key: string, member: MemberType) {
        key = this.serverIdPrefix(key)
        return this.redisCache.zScore(key, member)
    }

    // 返回值要进行判断
    hSet(key: string, field: string | int, value: RedisCommandArgument | int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hSet(key, field, value)
    }

    hSetNX(key: string, field: RedisCommandArgument, value: RedisCommandArgument) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hSetNX(key, field, value)
    }

    hMset(key: string, value: HSETObject) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hMset(key, value)
    }

    hDel(key: string, field: RedisCommandArgument | RedisCommandArgument[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hDel(key, field)
    }

    hIncrBy(key: string, field: RedisCommandArgument, increment: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hIncrBy(key, field, increment)
    }

    hGet(key: string, field: RedisCommandArgument) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hGet(key, field)
    }

    hmGet(key: string, fields: MemberType | MemberType[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hmGet(key, fields)
    }

    hGetAll(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hGetAll(key)
    }

    hGetAllBuffer(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hGetAllBuffer(key)
    }

    hKeys(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hKeys(key)
    }

    hExists(key: string, field: RedisCommandArgument) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hExists(key, field)
    }

    hLen(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.hLen(key)
    }

    exists(key: string) {
        key = this.serverIdPrefix(key)
        return this.redisCache.exists(key)
    }

    expire(key: string, seconds: int) {
        key = this.serverIdPrefix(key)
        return this.redisCache.expire(key, seconds)
    }

    expireAt(key: string, time: int | Date) {
        key = this.serverIdPrefix(key)
        return this.redisCache.expireAt(key, time)
    }

    delete(key: string | string[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.delete(key)
    }

    del(key: string | string[]) {
        key = this.serverIdPrefix(key)
        return this.redisCache.del(key)
    }

    rename(key: string, newKey: string) {
        key = this.serverIdPrefix(key)
        newKey = this.serverIdPrefix(newKey)
        return this.redisCache.rename(key, newKey)
    }

    subscribe(channels: string | Array<string>, listener: PubSubListener<false>) {
        channels = this.serverIdPrefix(channels)
        return this.redisCache.subscribe(channels, listener)
    }

    unsubscribe(channels?: string | Array<string>) {
        if (channels) {
            channels = this.serverIdPrefix(channels)
        }
        return this.redisCache.unsubscribe(channels)
    }

    pSubscribe(channels: string | Array<string>, listener: PubSubListener<false>) {
        channels = this.serverIdPrefix(channels)
        return this.redisCache.pSubscribe(channels, listener)
    }

    pUnsubscribe(channels?: string | Array<string>) {
        if (channels) {
            channels = this.serverIdPrefix(channels)
        }
        return this.redisCache.pUnsubscribe(channels)
    }

    publish(...args: [channel: string, message: RedisCommandArgument]) {
        if (args.length > 0) {
            args[0] = this.serverIdPrefix(args[0])
        }
        return this.redisCache.publish(...args)
    }

    info() {
        return this.redisCache.info()
    }

}
