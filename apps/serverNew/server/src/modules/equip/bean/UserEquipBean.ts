import { Bean, DiffMap } from '@arthropoda/game-engine'
import { EquipDissolveBean } from './EquipDissolveBean'
import { EquipBean } from './EquipBean'
import { EquipPropBean } from './EquipPropBean'
import { ForgePoolBean } from './ForgePoolBean'

/**
 * 装备系统
 */
export class UserEquipBean extends Bean {
    /**
     * 装备对应位置
     */
    equips?: DiffMap<int, EquipBean>

    /**
     * 装备库
     */
    equipProps?: DiffMap<int, EquipPropBean>

    /**
     * 装备强度
     */
    equipMaster: int = 1

    /**
     * 是否开启低于评分自动熔炼
     */
    isOpenFpDissolve: boolean = true

    /**
     * 装备自动溶解条件
     */
    equipAutoDissolve?: DiffMap<int, EquipDissolveBean>

    /**
     * 打造池信息
     */
    forgePools?: DiffMap<int, ForgePoolBean>

    /**
     * 装备穿戴表现
     */
    equipWearShow: int = 0
}
