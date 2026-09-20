import { randomUUID } from 'crypto'
import { RedisCache } from '../database/RedisCache'
import { RedisInstance } from '../database/RedisInstance'
import { millisecond, sleep, timestamp } from './common'

export class RedisLock {

    private static registerToken: { [token: string]: number } = {}

    private token: string

    private key: string

    // ! 秒
    private ttl: int

    // ! redis 实例
    private redis: RedisCache

    private isLock = false

    constructor(key: string, redis: RedisCache, ttl = 5) {
        this.key = key
        this.ttl = ttl
        this.redis = redis
        this.token = randomUUID()
    }

    private tidyDissociateLock() {
        const now = timestamp()
        const del = []
        for (const key in RedisLock.registerToken) {
            const expiredTime = RedisLock.registerToken[key]
            if (expiredTime > now) {
                continue
            }
            del.push(key)
        }
        if (del.length > 0) {
            if (ADJUST_OPEN) {
                Log.warn('lock timeout, number:' + del.length)
            }
            for (const key of del) {
                delete RedisLock.registerToken[key]
                Log.warn(`clear timeout lock, key:${key}`)
            }
        }
    }

    private registerLockStatus() {
        this.isLock = true
        if (ADJUST_OPEN) {
            RedisLock.registerToken[this.token] = this.ttl + timestamp()
            this.tidyDissociateLock()
        }

    }

    private unregisterLockStatus() {
        delete RedisLock.registerToken[this.token]
        delete RedisLock.registerToken[this.token]
        this.isLock = false
    }

    /**
     * 调用该方法必须手动调用unlock,或等待tll自动过期
     * 但本类中的isLock还会返回已经lock状态并不会和redis的过期同步
     * @returns 
     */
    public async lock() {
        if (this.isLock) {
            return true
        }
        if (!await this.redis.setnx(this.key, this.token, this.ttl)) {
            this.token = ''
            return false
        }
        this.registerLockStatus()
        return true
    }

    /**
     * 同步等待锁，超时还未锁，返回失败
     * @param int timeout      延迟毫秒
     * @return boolean
     */
    public async waitLock(timeoutMs: int) {
        const token = this.token
        const beginTime = millisecond()
        do {
            if (await this.lock()) {
                return true
            }
            this.token = token

            if (timeoutMs > 0 && millisecond() - beginTime >= timeoutMs) {
                break
            }

            await sleep(1000)
            // eslint-disable-next-line no-constant-condition
        } while (true)

        return false
    }

    public async unLock() {
        const script = `
            if redis.call("GET", KEYS[1]) == ARGV[1] then
                return redis.call("DEL", KEYS[1])
            else
                return 0
            end
        `
        await this.redis.client().eval(script, {
            keys: [this.key],
            arguments: [this.token],
        })
        this.unregisterLockStatus()
    }

    /**
     * @param key 
     * @param ttl 锁的key在redis中的过期时间
     * @returns 
     */
    static create(key: string, ttl = 5): RedisLock {
        const locker = new RedisLock(key, RedisInstance.getCenterRedis(), ttl)
        return locker
    }

    /**
     * 尝试获取锁再执行,获取锁失败的话会跳过函数
     * @param key 
     * @param fn 
     */
    static async runOrSkip(key: string, fn: () => void | Promise<void>) {
        const locker = this.create(key)
        if (await locker.lock()) {
            try {
                await fn()
            } finally {
                await locker.unLock()
            }
        }
    }

    /** 获取锁, 等待timeoutMs时间后还没获取锁则放弃 */
    static async runBlock(key: string, timeoutMs: number, fn: () => void | Promise<void>) {
        const locker = this.create(key)
        if (await locker.waitLock(timeoutMs)) {
            try {
                await fn()
            } finally {
                await locker.unLock()
            }
        }
    }
}