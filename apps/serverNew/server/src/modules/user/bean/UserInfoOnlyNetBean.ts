import { Bean } from '@arthropoda/game-engine'
import { EquipBean } from '../../equip/bean/EquipBean'
import { EquipPropBean } from '../../equip/bean/EquipPropBean'
import { FashionWearBean } from '../../equip/bean/FashionWearBean'
import { DiffMap } from '@arthropoda/game-engine'

/**
 * 玩家信息显示结构
 */
export class UserInfoOnlyNetBean extends Bean {
    /**
     * 区服ID
     */
    sId: int = 0

    /**
     * 玩家ID
     */
    id: int = 0

    /**
     * 玩家名称
     */
    name: string = ''

    /**
     * 等级
     */
    lv: int = 0

    /**
     * 玩家战力
     */
    fp: int = 0

    activityTime: int = 0

    realm: int = 1

    vip: int = 0

    guild: int = 0

    guildName: string = ''

    head: int = 0

    face: int = 0

    hair: int = 0

    faceDecorate: int = 0

    race: int = 0

    fashionWear?: DiffMap<int, FashionWearBean>

    sex: int = 0

    equips?: DiffMap<int, EquipBean>

    weaponLv: int = 0

    magicId: int = 0

    gongLv: int = 0
}
