import { UserInfoOnlyNetBean } from '../user/UserInfoOnlyNetBean'

export interface GuildMemberBean {
    /**
     * 联盟成员id
     */
    uId: int
    /**
     * 联盟成员职位
     */
    role: int
    /**
     * 玩家加入联盟时间
     */
    joinTime: int
    /**
     * 今日捐献次数
     */
    dayBuildTimes: int
    /**
     * 今日桃园被协助次数
     */
    dayHelpedTimes: number
    /**
     * 今日灵脉被协助次数
     */
    dayLodeBeHelpedTimes: number
    /**
     * 是否在线 1：在线 2：离线
     */
    isOnline: boolean
    /**
     * 成员基础信息
     */
    userInfo?: UserInfoOnlyNetBean
}
