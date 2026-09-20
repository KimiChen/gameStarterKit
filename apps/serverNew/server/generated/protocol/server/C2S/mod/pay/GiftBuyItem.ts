import { PropBean } from '../props/PropBean'

export interface GiftBuyItem {
    /**
     * 礼包id
     */
    id: int
    /**
     * 购买次数
     */
    num: int
    /**
     * 自选奖励
     */
    chooseAwards?: Map<int, PropBean>
}
