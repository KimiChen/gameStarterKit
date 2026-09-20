import { Bean } from '@arthropoda/game-engine'
import { OnlyNet } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

/**
 * 联盟成员信息
 */
export class GuildMemberBean extends Bean {
    /**
     * 联盟成员id
     */
    uId: int = 0

    /**
     * 联盟成员职位
     */
    role: int = 0

    /**
     * 玩家加入联盟时间
     */
    joinTime: int = 0

    /**
     * 今日捐献次数
     */
    dayBuildTimes: int = 0

    /**
     * 今日桃园被协助次数
     */
    @OnlyNet
    dayHelpedTimes = 0

    /**
     * 今日灵脉被协助次数
     */
    @OnlyNet
    dayLodeBeHelpedTimes = 0

    /**
     * 是否在线 1：在线 2：离线
     */
    @OnlyNet
    isOnline: boolean = false

    /**
     * 成员基础信息
     */
    @OnlyNet
    userInfo?: UserInfoOnlyNetBean
}
