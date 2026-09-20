import { RedisInstance } from '@arthropoda/game-engine'
import { GameRandom } from '../random/GameRandom'
import { PlatformLineInfo, SID_BASE_NUM } from '@arthropoda/game-engine'

/**
 * 唯一Id生成
 */
export class GameIdGenerator {
    //#region UserId
    private static USER_KEY: string = 'IdGenerater:user:'

    /**
     * 获取userId
     * @param sid 区服
     * @returns
     */
    static async getUserId(sid: int) {
        await this.setAutoId(sid) // 后续由部署工具设置

        const redis = RedisInstance.getCenterRedis()
        if (!(await redis.exists(GameIdGenerator.USER_KEY + sid))) {
            throw new Error('id key exists')
        }
        return redis.incr(GameIdGenerator.USER_KEY + sid)
    }

    /**
     * 设置初始值
     * @param sid 区服
     * @returns
     */
    static async setAutoId(sid: int) {
        const redis = RedisInstance.getCenterRedis()

        const autoId = await redis.get(GameIdGenerator.USER_KEY + sid)
        if (autoId && Number(autoId) >= SID_BASE_NUM) {
            Log.info(`${sid}区服User自增ID已设置为:${autoId}`)
            return
        }

        let baseId = sid * SID_BASE_NUM + GameRandom.rand(20000, 100000)
        const platBaseNum = PlatformLineInfo.getPlatformBaseNum()
        baseId += platBaseNum
        await redis.set(GameIdGenerator.USER_KEY + sid, baseId)

        Log.info(`${sid}区服User自增ID已设置为:${baseId}`)
    }
    //#endregion

    //#region 唯一递增索引
    // 聊天记录
    static readonly CHAT_UNIQUE_ID = 'chat_unique_id'

    /**
     * 模块内的唯一ID，本服或全服
     */
    static readonly UNIQUE_ID_IN_MODULE = 'unique_id_in_module'

    // 灵脉
    static readonly MODULE_LODE_ATTACK = 'lode_attack'

    static readonly MODULE_LODE_DEFEND = 'lode_defend'

    // 需要全服唯一索引，则记录在Center
    public static globalModule: string[] = []

    static async getUniqueId(module: string, num: int = 1) {
        let redis = RedisInstance.getServerRedis()
        if (this.globalModule.includes(module)) {
            redis = RedisInstance.getCenterRedis()
        }

        return redis.hIncrBy(this.UNIQUE_ID_IN_MODULE, module, num)
    }
    //#endregion
}
