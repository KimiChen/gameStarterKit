import { FromData, RefHash } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'
import { EquipPropBean } from '../bean/EquipPropBean'

/**
 * 玩家装备映射
 */
export class UserEquipRef extends RefHash {
    @FromData(User, 'equip.equipProps')
    equipProps?: DiffMap<int, EquipPropBean>
}
