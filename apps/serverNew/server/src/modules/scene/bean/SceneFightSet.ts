import { Bean, DiffMap } from '@arthropoda/game-engine'
import { SceneFightSetModeItem } from './SceneFightSetModeItem'

export class SceneFightSet extends Bean {
    /**
     * 攻击模式
     */
    atkRangeMap?: DiffMap<int, SceneFightSetModeItem>

    /**
     * 自动反击
     */
    attackBack: boolean = false

    /**
     * 自动释放妖术/神通
     */
    autoSkill: boolean = false

    /**
     * 自动使用丹药
     */
    autoDrug: boolean = false

    /**
     * 穿戴的丹药Id
     */
    drugId: int = 0

    /**
     * 至宝设置 OFF 1PVP 2PVE 3ALL
     */
    rareRange: int = 0

    /**
     * 时装设置 OFF 1PVP 2PVE 3ALL
     */
    fashionRange: int = 0

    /**
     * 神通设置 OFF 1PVP 2PVE 3ALL
     */
    magicRange: int = 0
}
