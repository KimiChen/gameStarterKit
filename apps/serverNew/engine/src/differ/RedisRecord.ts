import { RedisInstance } from '../database/RedisInstance'
import { OtherLoadOpts } from './subs/optsInterface'

export class RedisRecord<T> {
    /**
     * redisList主键名
     */
    readonly key: string = 'talk'

    /**
     * 最少可保留记录数
     */
    readonly minLen: int = 10

    /**
     * 最多可保留记录数，超过后会截取minLen长度
     */
    readonly maxLen: int = 15

    readonly loadOpts?: OtherLoadOpts

    constructor(key: string, minLen: int, maxLen: int, loadOpts?: OtherLoadOpts) {
        this.minLen = minLen
        this.maxLen = maxLen
        this.loadOpts = loadOpts
        if (this.loadOpts?.serverId) {
            this.key = `${this.loadOpts.serverId}:${key}`
        } else {
            this.key = key
        }
    }

    public getRedis() {
        return RedisInstance.getServerRedis()
    }

    /**
     * 添加值到头部
     * @param val
     * @returns
     */
    public async add(val: T) {
        const redis = this.getRedis()
        const cnt = await redis.lPush(this.key, [JSON.stringify(val)])
        if (cnt >= this.maxLen) {
            await redis.lTrim(this.key, 0, this.minLen - 1)
            return this.minLen
        }
        return cnt
    }

    /**
     * 获取最后插的值
     * @returns
     */
    public async first() {
        const datas = await this.getRedis().lRange(this.key, 0, 0)
        return datas.map(data => {
            return JSON.parse(data) as T
        })
    }

    /**
     * 从firstIndex开始获取最多count个值
     * @param count
     * @param firstIndex
     * @returns
     */
    public async get(count: int = 1, firstIndex: int = 0) {
        const lastIndex = count === -1 ? -1 : firstIndex + count - 1
        const datas = await this.getRedis().lRange(this.key, firstIndex, lastIndex)
        return datas.map(data => {
            return JSON.parse(data) as T
        })
    }

    /**
     * 删除所有记录
     * @returns
     */
    public async delete() {
        return this.getRedis().del(this.key)
    }

    /**
     * 删除记录
     * @param value
     * @returns
     */
    public async remove(value: T) {
        return this.getRedis().lRem(this.key, JSON.stringify(value))
    }

    /**
     * 设置过期时间
     * @param time
     * @returns
     */
    public async expire(time: int) {
        return this.getRedis().expire(this.key, time)
    }

    /**
     * 长度
     * @returns
     */
    public async len() {
        return this.getRedis().lLen(this.key)
    }
}
