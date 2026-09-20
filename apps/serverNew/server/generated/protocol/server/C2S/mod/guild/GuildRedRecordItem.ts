import { UserInfoOnlyNetBean } from '../user/UserInfoOnlyNetBean'

export interface GuildRedRecordItem {
    /**
     * 玩家id
     */
    uId: int
    /**
     * 玩家信息
     */
    uInfo?: UserInfoOnlyNetBean
    /**
     * 领取的时间
     */
    time: int
    /**
     * 领取的奖励列表（json格式）
     */
    awards: string
}
