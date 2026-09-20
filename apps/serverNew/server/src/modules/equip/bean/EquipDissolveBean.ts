import { Bean } from '@arthropoda/game-engine'

/**
 * 自动溶解条件设置
 */
export class EquipDissolveBean extends Bean {
    /**
     * 品质
     */
    quality: int = 0

    /**
     * 等级
     */
    level: int = 0

    /**
     * 是否启用
     */
    enable: int = 0
}
