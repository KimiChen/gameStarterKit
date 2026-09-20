import { EquipBean } from '../equip/EquipBean'
import { EquipPropBean } from '../equip/EquipPropBean'
import { EquipDissolveBean } from '../equip/EquipDissolveBean'
import { ForgePoolBean } from '../equip/ForgePoolBean'

export interface UserEquipBean {
    /**
     * 装备对应位置
     */
    equips?: Map<int, EquipBean>
    /**
     * 装备库
     */
    equipProps?: Map<int, EquipPropBean>
    /**
     * 装备强度
     */
    equipMaster: int
    /**
     * 是否开启低于评分自动熔炼
     */
    isOpenFpDissolve: boolean
    /**
     * 装备自动溶解条件
     */
    equipAutoDissolve?: Map<int, EquipDissolveBean>
    /**
     * 打造池信息
     */
    forgePools?: Map<int, ForgePoolBean>
    /**
     * 装备穿戴表现
     */
    equipWearShow: int
}
