import { Bean } from '@arthropoda/game-engine'

export class FirstPayItem extends Bean {
    /**
     * 充值表id
     */
    id: int = 0

    /**
     * 登录天数
     */
    loginDays: int = 0

    /**
     * 已领取的奖励天数
     */
    hasAwards: int = 0

    /**
     * 是否弹窗
     */
    isPop: boolean = false
}
