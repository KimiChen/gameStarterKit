import { RedisClientType, commandOptions, createClient } from 'redis'
import { md5, timestamp } from '../utils/common'
import { type RedisCommandArgument } from '@redis/client/dist/lib/commands/index'
import { type ZMember } from '@redis/client/dist/lib/commands/generic-transformers'
import { PubSubListener } from '@redis/client/dist/lib/client/pub-sub'
import { PlatformRedisConfig } from '../typings/conf-platform'

type Types = RedisCommandArgument | int
export type HSETObject = Record<string | int, Types>
export type MemberType = string | int
export function MemberTypeToString(member: MemberType) {
    return typeof member == 'number' ? member.toString() : member
}
const optionBuffer = commandOptions({ returnBuffers: true })

export class RedisCache {
    protected link: RedisClientType

    protected id: string

    constructor(private config: PlatformRedisConfig) {
        const auth = config.secret ? `:${encodeURIComponent(config.secret)}@` : ''
        const url = `redis://${auth}${config.host}:${config.port}/${config.database ?? 0}`
        this.link = createClient({
            url: url,
            pingInterval: 2000,
        })
        this.id = md5(url)
    }

    // redis库会自动重连
    // 若redis shutdown，库重连的报错信息，会在onError抛出一个错误
    connect() {
        this.link.on('error', (err) => {
            // Redis Client Error Error: connect ECONNREFUSED
            Log.redis.error('Redis Client Error:', err)
        })
        return this.link.connect()
    }

    disconnect() {
        return this.link.disconnect()
    }

    // redis实例的id
    getId() {
        return this.id
    }

    /**
     *
     * @param key
     * @param value
     * @param expired  大于1672502400,表示按时间戳设置过期时间，否则表示剩余有效时间秒数
     * @returns
     */
    async set(key: string, value: RedisCommandArgument | int, expired: int = 0) {
        if (expired <= 0) {
            return this.link.set(key, value)
        } else {
            let timeVal = expired
            // 1672502400为 2023-01-01的时间戳,大于这个数表示按时间戳来设定过期时间
            if (expired > 1672502400) {
                timeVal = expired - timestamp()
            }
            return this.link.set(key, value, { EX: timeVal })
        }
    }

    setnx(key: string, value: RedisCommandArgument, expired: int = 0) {
        if (expired <= 0) {
            return this.link.setNX(key, value)
        } else {
            let timeVal = expired
            // 1672502400为 2023-01-01的时间戳,大于这个数表示按时间戳来设定过期时间
            if (expired > 1672502400) {
                timeVal = expired - timestamp()
            }
            return this.link.set(key, value, { EX: timeVal, NX: true })
        }
    }

    /** 
     * 例如 *max-*-entries* 
     * 得到 {"hash-max-zipmap-entries" : "512", "list-max-ziplist-entries": "512", "set-max-intset-entries": "512"}
     */
    async getConf(pattern: string) {
        return this.link.configGet(pattern)
    }

    // 过期的时间戳，-1为永不过期
    ttl(...args: [key: string]) {
        return this.link.ttl(...args)
    }

    // ...args的区别  TODO
    get(key: string) {
        return this.link.get(key)
    }

    // 获取转对象
    async getObject(key: string) {
        const val = await this.link.get(key)
        if (val === null) {
            return null
        }
        try {
            return JSON.parse(val)
        } catch (e) {
            return null
        }
    }

    getBuffer(key: string) {
        return this.link.get(commandOptions({ returnBuffers: true }), key)
    }

    incr(key: string) {
        return this.link.incr(key)
    }

    incrBy(key: string, decrement: int) {
        return this.link.incrBy(key, decrement)
    }

    decr(key: string) {
        return this.link.decr(key)
    }

    decrBy(key: string, decrement: int) {
        return this.link.decrBy(key, decrement)
    }

    lPush(key: string, elements: RedisCommandArgument[]) {
        if (elements.length == 0) {
            return Promise.resolve(0)
        }
        return this.link.lPush(key, elements)
    }

    rPush(key: string, elements: RedisCommandArgument[]) {
        if (elements.length == 0) {
            return Promise.resolve(0)
        }
        return this.link.rPush(key, elements)
    }

    lSize(key: string) {
        return this.link.lLen(key)
    }

    lLen(key: string) {
        return this.link.lLen(key)
    }

    lRem(key: string, element: RedisCommandArgument, count: int = 1) {
        return this.link.lRem(key, count, element)
    }

    lPop(key: string) {
        return this.link.lPop(key)
    }

    lTrim(key: string, start: int, stop: int) {
        return this.link.lTrim(key, start, stop)
    }

    lRange(key: string, start: int, stop: int) {
        return this.link.lRange(key, start, stop)
    }

    blPop(key: string, timeout: int = 5) {
        return this.link.blPop(key, timeout)
    }

    brPop(key: string, timeout: int = 5) {
        return this.link.brPop(key, timeout)
    }

    rPop(key: string) {
        return this.link.rPop(key)
    }

    sAdd(key: string, members: RedisCommandArgument | RedisCommandArgument[]) {
        if (Array.isArray(members) && members.length == 0) {
            return Promise.resolve(0)
        }
        return this.link.sAdd(key, members)
    }

    sRem(key: string, members: RedisCommandArgument | RedisCommandArgument[]) {
        if (Array.isArray(members) && members.length == 0) {
            return Promise.resolve(0)
        }
        return this.link.sRem(key, members)
    }

    sPop(key: string, count: int = 1) {
        return this.link.sPop(key, count)
    }

    sRandmember(key: string) {
        return this.link.sRandMember(key)
    }

    sRandMemberCount(key: string, count: int) {
        return this.link.sRandMemberCount(key, count)
    }

    sIsmember(key: string, member: RedisCommandArgument) {
        return this.link.sIsMember(key, member)
    }

    sCard(key: string) {
        return this.link.sCard(key)
    }

    sMembers(key: string) {
        return this.link.sMembers(key)
    }

    zAdd(key: string, score: int, member: MemberType) {
        return this.link.zAdd(key, { score: score, value: MemberTypeToString(member) })
    }

    zAddMembers(key: string, members: ZMember | ZMember[]) {
        return this.link.zAdd(key, members)
    }

    zCard(key: string) {
        return this.link.zCard(key)
    }

    zIncrby(key: string, score: int, member: MemberType) {
        return this.link.zIncrBy(key, score, MemberTypeToString(member))
    }

    // 按照排名获取区间 正序
    zRange(key: string, min: int, max: int, isRev: boolean = false) {
        return this.link.zRange(key, min, max, isRev ? { REV: true } : undefined)
    }

    //
    zRangeWithScores(key: string, min: int, max: int, isRev: boolean = false) {
        return this.link.zRangeWithScores(key, min, max, isRev ? { REV: true } : undefined)
    }

    // 按积分获取区间
    zRangeByScore(key: string, min: int, max: int, isRev: boolean = false) {
        // 如果是倒序， min、max传值是反的
        if (isRev) {
            const tmp = min
            min = Math.max(min, max)
            max = Math.min(tmp, max)
        }

        return this.link.zRange(key, min, max, isRev ? { REV: true, BY: 'SCORE' } : { BY: 'SCORE' })
    }

    zRem(key: string, members: MemberType | MemberType[]) {
        if (Array.isArray(members)) {
            const ms = members.map((member) => {
                return MemberTypeToString(member)
            })
            return this.link.zRem(key, ms)
        } else {
            return this.link.zRem(key, MemberTypeToString(members))
        }
    }

    zRank(key: string, member: MemberType, isRev: boolean = false) {
        if (isRev) {
            return this.link.zRevRank(key, MemberTypeToString(member))
        } else {
            return this.link.zRank(key, MemberTypeToString(member))
        }
    }

    zScore(key: string, member: MemberType) {
        return this.link.zScore(key, MemberTypeToString(member))
    }

    // 返回值要进行判断
    hSet(key: string, field: string | int, value: RedisCommandArgument | int) {
        return this.link.hSet(key, field, value)
    }

    hSetNX(key: string, field: RedisCommandArgument, value: RedisCommandArgument) {
        return this.link.hSetNX(key, field, value)
    }

    hMset(key: string, value: HSETObject) {
        return this.link.hSet(key, value)
    }

    hDel(key: string, field: RedisCommandArgument | RedisCommandArgument[]) {
        if (Array.isArray(field) && field.length == 0) {
            return Promise.resolve(0)
        }
        return this.link.hDel(key, field)
    }

    hIncrBy(key: string, field: RedisCommandArgument, increment: int) {
        return this.link.hIncrBy(key, field, increment)
    }

    hGet(key: string, field: RedisCommandArgument) {
        return this.link.hGet(key, field)
    }

    hmGet(key: string, fields: MemberType | MemberType[]) {
        if (Array.isArray(fields)) {
            const fds = fields.map((field) => {
                return MemberTypeToString(field)
            })
            return this.link.hmGet(key, fds)
        } else {
            return this.link.hmGet(key, MemberTypeToString(fields))
        }
    }

    async hmGetToMap(key: string, fields: MemberType | MemberType[]) {
        let fds: string[] = []
        if (Array.isArray(fields)) {
            fds = fields.map((field) => {
                return MemberTypeToString(field)
            })
        } else {
            fds.push(MemberTypeToString(fields))
        }
        const data = await this.link.hmGet(key, fds)
        const result: { [key: string]: string } = {}
        for (const index in data) {
            result[fds[index]] = data[index]
        }
        return result
    }

    hGetAll(key: string) {
        return this.link.hGetAll(key)
    }

    hGetAllBuffer(key: string) {
        return this.link.hGetAll(optionBuffer, key)
    }

    hKeys(key: string) {
        return this.link.hKeys(key)
    }

    hExists(key: string, field: RedisCommandArgument) {
        return this.link.hExists(key, field)
    }

    hLen(key: string) {
        return this.link.hLen(key)
    }

    exists(key: string) {
        return this.link.exists(key)
    }

    expire(key: string, seconds: int) {
        return this.link.expire(key, seconds)
    }

    expireAt(key: string, time: int | Date) {
        return this.link.expireAt(key, time)
    }

    delete(key: string | string[]) {
        return this.link.del(key)
    }

    del(key: string | string[]) {
        return this.link.del(key)
    }

    rename(key: string, newKey: string) {
        return this.link.rename(key, newKey)
    }

    subscribe(channels: string | Array<string>, listener: PubSubListener<false>) {
        return this.link.subscribe(channels, listener)
    }

    unsubscribe(channels?: string | Array<string>) {
        return this.link.unsubscribe(channels)
    }

    pSubscribe(channels: string | Array<string>, listener: PubSubListener<false>) {
        return this.link.pSubscribe(channels, listener)
    }

    pUnsubscribe(channels?: string | Array<string>) {
        return this.link.pUnsubscribe(channels)
    }

    publish(...args: [channel: string, message: RedisCommandArgument]) {
        return this.link.publish(...args)
    }

    client() {
        return this.link
    }

    info() {
        return this.link.info()
    }

    async infoDict(): Promise<Record<string, string>> {
        const s = await this.info()
        const regExp = new RegExp(/(.*?):(.*?)\r\n/gm)
        const dict: Record<string, string> = {}
        for (let index = 0; index < s.length; index++) {
            const result = regExp.exec(s)
            if (!result) {
                break
            }
            dict[result[1]] = result[2]
        }
        return dict
    }

    async callFunction(command: string, ...args: string[]): Promise<any> {
        try {
            return await this.link.sendCommand([command, ...args])
        } catch (err) {
            throw new Error(`${command} error:` + String(err))
        }
    }
}
