import { Bean } from '@arthropoda/game-engine'

/**
 * 单个属性类型对象
 */
export class SubscribeItem extends Bean {
    /**
     * 订阅id
     */
    subId: int = 0

    /**
     * 游戏内开关
     */
    gameState: boolean = false

    /**
     * 授权状态
     */
    acceptState: boolean = false
}
