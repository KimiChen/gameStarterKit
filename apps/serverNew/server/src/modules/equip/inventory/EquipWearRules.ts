import { UtilObject, getServerIdByUid } from '@arthropoda/game-engine'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { ActivityRankUpdate } from '../../activity/rank/ActivityRankUpdate'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { Props, PropsExtra } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { SceneEquip } from '../../scene/model/SceneEquip'
import { SystemInfoDefine } from '../../serverSettings/runtime/SystemInfoDefine'
import { UserEvil } from '../../user/action/UserEvil'
import { UserFp } from '../../user/action/UserFp'
import { UserAppearance } from '../../user/action/UserAppearance'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { EquipErrors } from '../EquipErrors'
import { EntryBean } from '../bean/EntryBean'
import { EquipPropBean } from '../bean/EquipPropBean'
import { FashionBean } from '../bean/FashionBean'
import { FashionWearBean } from '../bean/FashionWearBean'
import { EquipForge } from '../forge/EquipForge'
import { EquipForgeUseProp } from '../forge/EquipForgeUseProp'
import { EquipDefine } from '../rules/EquipDefine'

export class EquipWearRules {
    // #endregion

    //#region 境界
    /**
     * 装备境界提升校验
     * @param user
     * @param equipAwardConf
     * @returns
     */
    static checkRealmUp(user: User, equipAwardConf: IConfEquip_award) {
        // 判断玩家等级是否满足条件
        if (user.lv < equipAwardConf.lvLimit) {
            return false
        }

        // 玩家穿戴信息
        const equipWears = user.equip.equips

        // 判断各部位穿戴是否满足条件
        for (const [pos, { field }] of EquipDefine.EQUIP_POSITION) {
            // 目标部位
            const [equipLv, equipQuality] = UtilObject.getField(equipAwardConf, field)

            // 判断部位是否存在坑位信息
            const equipWear = equipWears.get(pos)
            if (equipWear == null) {
                return false
            }

            // 历史穿戴最大等级是否满足条件
            if (equipWear.hisLevel < equipLv) {
                return false
            }

            // 历史穿戴最大品质是否满足条件
            if (equipWear.hisQuality < equipQuality) {
                return false
            }
        }

        return true
    }

    /**
     * 设置当前突破装备境界最优条件
     * @param HUser     user
     * @param int       pos
     * @param EquipConf equipConf
     */
    static updateEquipPosHis(user: User, pos: int, equipConf: IConfEquip) {
        // 配置最大阶级
        const endStrength = C.equip_award().end()!.id
        const strength = user.equip.equipMaster

        // 强度已满级
        if (strength >= endStrength) {
            return
        }

        // 玩家穿戴信息
        const equipWears = user.equip.equips
        const equipPos = equipWears.get(pos)
        // 判断部位是否存在坑位信息
        if (equipPos == null) {
            return
        }

        // 获取下一个境界条件
        const equipRealmConf = C.equip_award(strength)
        const fieldName = EquipDefine.EQUIP_POSITION.get(pos)!.field
        const [equipRealmLv, equipRealmQuality] = UtilObject.getField(equipRealmConf, fieldName)

        // 不满足当前境界条件穿戴最大等级和品质重置
        if (
            (equipPos.hisLevel && equipPos.hisLevel < equipRealmLv) ||
            (equipPos.hisQuality && equipPos.hisQuality < equipRealmQuality)
        ) {
            equipPos.hisLevel = 0
            equipPos.hisQuality = 0
        }

        // 目标部位装备同时满足 境界提升条件 及 历史条件
        if (
            equipConf.level >= equipRealmLv &&
            equipConf.quality >= equipRealmQuality &&
            equipConf.level >= equipPos.hisLevel &&
            equipConf.quality >= equipPos.hisQuality
        ) {
            equipPos.hisQuality = equipConf.quality
            equipPos.hisLevel = equipConf.level
        }
    }
}
