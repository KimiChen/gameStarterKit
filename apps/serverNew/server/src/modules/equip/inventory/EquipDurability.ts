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
import { EquipAttributeSync } from './EquipAttributeSync'
import { EquipDisplayFormatter } from './EquipDisplayFormatter'
import { EquipPowerCalculator } from './EquipPowerCalculator'

export class EquipDurability {
    // #endregion

    //#region 耐久
    /**
     * 更新装备耐久
     * @param HUser user
     * @param int   equipId
     * @param int   num
     * @return bool 是否需要更新属性
     */
    static changeEquipDurable(user: User, equipId: int, num: int): boolean {
        // 合法校验
        if (!equipId) {
            return false
        }

        // 装备信息
        const equipWearInfo = user.equip.equipProps.get(equipId)
        if (!equipWearInfo) {
            return false
        }

        // 坚不可摧效果,不扣除耐久
        if (num < 0 && equipWearInfo.effects.includes(EquipDefine.EFFECT_ID_25)) {
            return false
        }

        // 当前耐久
        const old = equipWearInfo.durable

        // 已损坏不可再次扣除耐久
        if (num < 0 && old <= 0) {
            return false
        }

        // 装备配表
        const equipConf = C.equip(equipWearInfo.cId)

        // 更新耐久数值
        equipWearInfo.durable = Math.max(0, Math.min(old + num, equipConf.durable))

        // 耐久变为0
        // 耐久0回满
        if (equipWearInfo.durable === 0 || old === 0) {
            return true
        }

        return false
    }

    /**
     * 穿戴装备耐久扣除
     * @param HUser user
     * @return void
     */
    static async costEquipWearDurable(user: User) {
        // 判断是否为红名玩家
        let num = Param.KilledReDurable

        // 红名阶段
        const evilStage = UserEvil.userEvilStage(user)
        if (evilStage) {
            num += evilStage.exReDurable
        }

        // 穿戴装备扣除耐久
        let updateAttr = false
        for (const [, equipWear] of user.equip.equips) {
            if (!equipWear) {
                continue
            }

            if (!equipWear.id) {
                continue
            }

            // 更新装备耐久
            if (EquipDurability.changeEquipDurable(user, equipWear.id, -num)) {
                updateAttr = true

                // 更新穿戴榜单
                const equipPropItem = user.equip.equipProps.get(equipWear.id)!
                await EquipDisplayFormatter.updateWearEquipRank(user.id, equipWear.pos, equipPropItem)
            }
        }

        if (updateAttr) {
            // 更新宝石模块属性
            EquipAttributeSync.updateGemAttrs(user)

            // 更新玩家装备属性
            EquipAttributeSync.updateEquipAttrs(user)

            // 更新玩家fp相关
            await EquipPowerCalculator.updateUserEquipFpAndRank(user)
        }
    }
}
