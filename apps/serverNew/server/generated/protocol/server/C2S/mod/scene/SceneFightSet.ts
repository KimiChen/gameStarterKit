import { SceneFightSetModeItem } from '../scene/SceneFightSetModeItem'

export interface SceneFightSet {
    /**
     * 攻击模式
     */
    atkRangeMap?: Map<int, SceneFightSetModeItem>
    /**
     * 自动反击
     */
    attackBack: boolean
    /**
     * 自动释放妖术神通
     */
    autoSkill: boolean
    /**
     * 自动使用丹药
     */
    autoDrug: boolean
    /**
     * 穿戴的丹药Id
     */
    drugId: int
    /**
     * 至宝设置 OFF 1PVP 2PVE 3ALL
     */
    rareRange: int
    /**
     * 时装设置 OFF 1PVP 2PVE 3ALL
     */
    fashionRange: int
    /**
     * 神通设置 OFF 1PVP 2PVE 3ALL
     */
    magicRange: int
}
