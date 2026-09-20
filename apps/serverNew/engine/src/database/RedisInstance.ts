import { RedisCache } from './RedisCache'
import { PlatformRedisConfig } from '../typings/conf-platform'
import { ServerRedisProxy } from './ServerRedisProxy'

export class RedisInstanceExport {
    public static getCenterRedis() {
        return RedisInstance.getCenterRedis()
    }

    public static getServerRedis() {
        return RedisInstance.getServerRedis()
    }

    /**
     * 代理对象会为 读写命令自动带上区服前缀, 区服:xxxxxx
     */
    public static getSvRedisByServerId(sId: number) {
        return RedisInstance.getSvRedisByServerId(sId)
    }

    public static getUserRedis() {
        return RedisInstance.getUserRedis()
    }
}

export class RedisInstance {
    private static isInit = false

    /** center的redis实例 */
    private static centerRedis: RedisCache

    /** server的redis实例 */
    private static serverRedis: RedisCache

    /** user的redis实例 */
    private static userRedis: RedisCache

    private static subscriberRedis: RedisCache

    /**
     * 初始化所有的redis实例
     * @param centerConfig
     * @param svConfig
     * @param userConfig
     * @param needSubscriber
     */
    public static async init(
        centerConfig: PlatformRedisConfig,
        svConfig: PlatformRedisConfig,
        userConfig: PlatformRedisConfig,
        needSubscriber: boolean = false,
    ) {
        if (this.isInit) {
            throw new Error('RedisInstance已初始化')
        }
        this.centerRedis = new RedisCache(centerConfig)
        await this.centerRedis.connect()

        this.serverRedis = new RedisCache(svConfig)
        await this.serverRedis.connect()

        this.userRedis = new RedisCache(userConfig)
        await this.userRedis.connect()

        this.subscriberRedis = new RedisCache(centerConfig)
        await this.subscriberRedis.connect()
        this.isInit = true
    }

    public static async clear() {
        if (!this.isInit) return
        const instances = new Set(
            [this.centerRedis, this.serverRedis, this.userRedis, this.subscriberRedis].filter(Boolean),
        )
        await Promise.allSettled([...instances].map((instance) => instance.disconnect()))
        this.isInit = false
    }

    public static getCenterRedis() {
        return this.centerRedis
    }

    public static getServerRedis() {
        return this.serverRedis
    }

    /**
     * 代理对象会为 读写命令自动带上区服前缀, 区服:xxxxxx
     */
    public static getSvRedisByServerId(sId: number) {
        return new ServerRedisProxy(sId, this.serverRedis)
    }

    public static getUserRedis() {
        return this.userRedis
    }

    public static getSubscriberRedis() {
        return this.subscriberRedis
    }
}
