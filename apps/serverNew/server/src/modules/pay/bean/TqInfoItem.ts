import { Bean } from '@arthropoda/game-engine'

export class TqInfoItem extends Bean {
    /**
     * 特权id
     */
    id: int = 0

    /**
     * 过期时间
     */
    outTime: int = 0

    /**
     * 今日是否领奖
     */
    dayAward: boolean = false

    /**
     * 今日是否领npc攻击次数
     */
    isAtkTimes: boolean = false
}
