import { Bean, DiffArray, DiffMap } from '@arthropoda/game-engine'
import { LabelBean } from './LabelBean'

/**
 * 玩家成就系统
 */
export class UserAchieveBean extends Bean {
    /**
     * 资历点
     */
    achievePoint: int = 0

    /**
     * 成就领取记录
     */
    achieves?: DiffArray<int>

    /**
     * 成就资历奖励领取情况
     */
    achieveBadges?: DiffMap<int, int>

    /**
     * 已点亮的成就标签
     */
    labels?: DiffMap<int, LabelBean>

    /**
     * 穿戴的成就标签
     */
    labelWears?: DiffArray<int>
}
