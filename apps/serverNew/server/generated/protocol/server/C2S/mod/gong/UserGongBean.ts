import { TreasureBean } from '../gong/TreasureBean'
import { MagicBean } from '../gong/MagicBean'

export interface UserGongBean {
    /**
     * 功法强度
     */
    master: int
    /**
     * 功法等级
     */
    lv: int
    /**
     * 功法点数
     */
    abPoint: int
    /**
     * 妖术点数
     */
    mgPoint: int
    /**
     * 穿戴的神通ID
     */
    magicId: int
    /**
     * 神通的冷却
     */
    magicCd: int
    /**
     * 妖术列表
     */
    sorceryList?: int[]
    /**
     * 奇珍列表
     */
    treasures?: Map<int, TreasureBean>
    /**
     * 神符列表
     */
    magics?: Map<int, MagicBean>
}
