import { FashionWearBean } from '../equip/FashionWearBean'
import { EquipBean } from '../equip/EquipBean'

export interface UserInfoOnlyNetBean {
    /**
     * 区服ID
     */
    sId: int
    /**
     * 玩家ID
     */
    id: int
    /**
     * 玩家名称
     */
    name: string
    /**
     * 等级
     */
    lv: int
    /**
     * 玩家战力
     */
    fp: int

    activityTime: int

    realm: int

    vip: int

    guild: int

    guildName: string

    head: int

    face: int

    hair: int

    faceDecorate: int

    race: int

    fashionWear?: Map<int, FashionWearBean>

    sex: int

    equips?: Map<int, EquipBean>

    weaponLv: int

    magicId: int

    gongLv: int
}
