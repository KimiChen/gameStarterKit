import { AttrTypeBean } from '../attr/AttrTypeBean'
import { AttrModBean } from '../attr/AttrModBean'

export interface UserAttrBean {
    /**
     * 属性点
     */
    point: int
    /**
     * 玩家汇总属性
     */
    attrs?: Map<int, AttrTypeBean>
    /**
     * 玩家各个系统属性数值
     */
    mods?: Map<int, AttrModBean>
}
