import { Bean, DiffArray } from '@arthropoda/game-engine'

export class ArenaHighlightItem extends Bean {
    /**
     * 记录类型（1.伤害爆炸,2.奶量大师）
     */
    type: int = 0

    /**
     * 玩家信息
     */
    uId: int = 0

    /**
     * 参数
     */
    params?: DiffArray<int>

    /**
     * 完成时间
     */
    time: int = 0

    /**
     * 值
     */
    val: int = 0
}
