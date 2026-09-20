import { RedisInstance, getUserServersMapId } from '@arthropoda/game-engine'
import { ServerSettingsKeys } from '../rules/ServerSettingsKeys'

export class UserServerDirectory {
    /**
     * 获取用户所有的区服
     * @param string $openId
     * @return Record<区服,IUserServerRole>
     */
    public static async getUserServers(openId: string): Promise<Record<string, IUserServerRole>> {
        const redis = RedisInstance.getCenterRedis()
        const hashId = getUserServersMapId(openId)
        const resData = await redis.hGet(ServerSettingsKeys.GAME_USER_SERVERS + hashId, openId)
        if (!resData) {
            return {}
        }
        const l = JSON.parse(resData)
        if (!l) {
            return {}
        }

        return l
    }
}

export type IUserServerRole = {
    sId: int
    uId: int
    uLv: int
    uName: string
    uTitle: string
    t: int
}
