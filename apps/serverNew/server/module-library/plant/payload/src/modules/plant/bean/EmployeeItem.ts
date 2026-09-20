import { Bean, OnlyRedis } from '@arthropoda/game-engine'

export class EmployeeItem extends Bean {
    /**
     * 配置id
     */
    id: int = 0

    /**
     * 等级
     */
    lv: int = 0

    /**
     * 是否在摸鱼
     */
    isRelax: boolean = false

    /**
     * 是否准备开摸（是否已经加入定时器）
     */
    @OnlyRedis
    isReady: boolean = false
}
