import { DiffArray } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'

export class ActivityItemBean extends Bean {
    /**
     * 活动配置表的id
     */
    id: int = 0

    /**
     * 活动名称
     */
    name: string = ''

    /**
     * 活动开始时间
     */
    startTs: int = 0

    /**
     * 活动结束时间
     */
    endTs: int = 0

    /**
     * 奖励开始时间
     */
    awardStart: int = 0

    /**
     * 奖励结束时间
     */
    awardEnd: int = 0

    /**
     * 预览时间
     */
    openTs: int = 0

    /**
     * 预览关闭时间
     */
    closeTs: int = 0

    /**
     * 每日开启时间
     */
    dailyStart: int = 0

    /**
     * 每日结束时间
     */
    dailyEnd: int = 0

    /**
     * 结算期时长-秒
     */
    settleTime: int = 0

    /**
     * 跨服活动涉及的区服id
     */
    crossSids?: DiffArray<int>

    /**
     * 跨服自增id
     */
    crossId: int = 0
}
