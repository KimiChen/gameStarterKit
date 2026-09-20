import { DiffArray } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { MagicBean } from './MagicBean'
import { TreasureBean } from './TreasureBean'

/**
 * 玩家功法系统
 */
export class UserGongBean extends Bean {
    /**
     * 功法强度
     */
    master: int = 1

    /**
     * 功法等级
     */
    lv: int = 0

    /**
     * 功法点数
     */
    abPoint: int = 0

    /**
     * 妖术点数
     */
    mgPoint: int = 0

    /**
     * 穿戴的神通ID
     */
    magicId: int = 0

    /**
     * 神通的冷却
     */
    magicCd: int = 0

    /**
     *  妖术列表
     */
    sorceryList?: DiffArray<int>

    /**
     * 奇珍列表
     */
    treasures?: DiffMap<int, TreasureBean>

    /**
     * 神符列表
     */
    magics?: DiffMap<int, MagicBean>
}
