import { UtilTime } from '@arthropoda/game-engine'
import { ServerHashJson } from '@arthropoda/game-engine'

export class PayClickBean extends ServerHashJson {
    id: int = 0

    /**
     * 玩家ID
     */
    uId: int = 0

    /**
     * 渠道ID
     */
    channel: string = ''

    /**
     * 订单ID
     */
    billno: string = ''

    /**
     * 计费点ID
     */
    rechargeId: int = 0

    /**
     * 礼包ID
     */
    giftId: int = 0

    /**
     * 活动名称
     */
    activity: string = ''

    expireTime(): int {
        return UtilTime.DAY_SECOND * 2
    }
}
