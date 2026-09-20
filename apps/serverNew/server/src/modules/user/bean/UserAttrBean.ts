import { Bean } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { AttrModBean } from '../../attr/bean/AttrModBean'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'

/**
 * 玩家属性系统
 */
export class UserAttrBean extends Bean {
    /**
     * 属性点
     */
    point: int = 0

    /**
     * 玩家汇总属性
     */
    attrs?: DiffMap<int, AttrTypeBean>

    /**
     * 玩家各个系统属性数值
     */
    mods?: DiffMap<int, AttrModBean>
}
