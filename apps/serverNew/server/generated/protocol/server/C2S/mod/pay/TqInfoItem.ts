export interface TqInfoItem {
    /**
     * 特权id
     */
    id: int
    /**
     * 过期时间
     */
    outTime: int
    /**
     * 今日是否领奖
     */
    dayAward: boolean
    /**
     * 今日是否领npc攻击次数
     */
    isAtkTimes: boolean
}
