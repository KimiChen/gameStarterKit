import { Bean } from '@arthropoda/game-engine'

/**
 * 攻击模式设置
 */
export class SceneFightSetModeItem extends Bean {
    /**
     * 偏好id
     */
    id: int = 0

    /**
     * 攻击模式：1友好 2帮会 3区服 4全体
     */
    atkRange: int = 0
}
