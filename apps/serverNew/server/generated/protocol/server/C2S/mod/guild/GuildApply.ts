import { UserInfoOnlyNetBean } from '../user/UserInfoOnlyNetBean'

export interface GuildApply {
    /**
     * 玩家ID
     */
    id: int
    /**
     * 成员基础信息
     */
    userInfo?: UserInfoOnlyNetBean
}
