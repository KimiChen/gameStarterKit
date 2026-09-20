import { Bean } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

/**
 * 玩家申请列表
 */
export class GuildApply extends Bean {
    /**
     * 玩家ID
     */
    id: int = 0

    /**
     * 成员基础信息
     */
    userInfo?: UserInfoOnlyNetBean
}
