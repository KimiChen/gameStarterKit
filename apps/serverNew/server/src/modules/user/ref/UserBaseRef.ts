import { FromData, RefHash } from '@arthropoda/game-engine'
import { User } from '../bean/User'
import { DiffMap } from '@arthropoda/game-engine'
import { FashionWearBean } from '../../equip/bean/FashionWearBean'
import { EquipBean } from '../../equip/bean/EquipBean'
import { EquipPropBean } from '../../equip/bean/EquipPropBean'

/**
 * 玩家基础信息
 */
export class UserBaseRef extends RefHash {
    @FromData(User, 'id')
    id: int = 0

    @FromData(User, 'sId')
    sId: int = 0

    @FromData(User, 'activityTime')
    activityTime: int = 0

    @FromData(User, 'lv')
    lv: int = 1

    @FromData(User, 'name')
    name: string = ''

    @FromData(User, 'fp')
    fp: int = 0

    @FromData(User, 'realm')
    realm: int = 1

    @FromData(User, 'vip')
    vip: int = 0

    @FromData(User, 'guild')
    guild: int = 0

    @FromData(User, 'guildName')
    guildName: string = ''

    @FromData(User, 'head')
    head: int = 0

    @FromData(User, 'face')
    face: int = 0

    @FromData(User, 'hair')
    hair: int = 0

    @FromData(User, 'faceDecorate')
    faceDecorate: int = 0

    @FromData(User, 'race')
    race: int = 0

    @FromData(User, 'fashion.fashionWear')
    fashionWear?: DiffMap<int, FashionWearBean>

    @FromData(User, 'sex')
    sex: int = 0

    @FromData(User, 'equip.equips')
    equips?: DiffMap<int, EquipBean>

    @FromData(User, 'weapon.lv')
    weaponLv: int = 0

    @FromData(User, 'equip.equipProps')
    equipProps?: DiffMap<int, EquipPropBean>

    @FromData(User, 'gong.magicId')
    magicId: int = 0

    @FromData(User, 'gong.lv')
    gongLv: int = 0
}
