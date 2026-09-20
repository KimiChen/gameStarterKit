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

export class EquipPowerCalculator {
    // #endregion

    //#region 评分
    /**
     * 基础属性评分
     * @param EquipPropItem equipPropItem
     * @return int
     */
    static equipBaseAttrFp(equipPropItem: EquipPropBean): int {
        // 耐久影响属性
        return PowerScoreRules.math_AttrFp(equipPropItem.attr.copy())
    }

    /**
     * equipEntryAttrFp
     * 装备词条属性评分
     * @param EquipPropItem equipPropItem
     * @return int
     */
    static equipEntryAttrFp(equipPropItem: EquipPropBean): int {
        if (equipPropItem.entries.size() == 0) {
            return 0
        }

        let totalFp = 0
        for (const [, item] of equipPropItem.entries) {
            if (!item.attrMap) {
                continue
            }

            // 耐久影响属性
            const fp = PowerScoreRules.math_AttrFp(item.attrMap.copy())
            totalFp += fp
        }

        return totalFp
    }

    /**
     * 装备特效评分
     * @param EquipPropItem equipPropItem
     * @return int
     */
    static equipEffectFp(equipPropItem: EquipPropBean): int {
        let totalFp = 0
        if (equipPropItem.effects.length() == 0) {
            return totalFp
        }

        for (const effectId of equipPropItem.effects) {
            const equipEffectConf = C.equip_effect(effectId)
            const equipConf = C.equip(equipPropItem.cId)
            const moreConf = equipEffectConf.more.get(equipConf.level)
            switch (moreConf.fpType) {
                case EquipDefine.EQUIP_EFFECT_TYPE_CONF_FP:
                    // 直接读配表评分
                    totalFp += moreConf.fp
                    break
                case EquipDefine.EQUIP_EFFECT_TYPE_CALCULATE_FP:
                    // 计算获得评分
                    totalFp += EquipPowerCalculator.equipCalculateEffectFp(effectId, equipPropItem)
                    break
                default:
                    break
            }
        }

        return totalFp
    }

    /**
     * 计算装备特效fp
     * @param effectId
     * @param equipPropItem
     * @returns
     */
    static equipCalculateEffectFp(effectId: int, equipPropItem: EquipPropBean): int {
        // 装备基础属性加成值
        const attrs: Map<int, AttrTypeBean> = new Map()

        // 获取效果带来的属性
        EquipDefine.attrFromEquipEffect(attrs, effectId, equipPropItem)
        if (attrs.size == 0) {
            return 0
        }

        return PowerScoreRules.math_AttrFp(attrs)
    }

    /**
     * 装备评分计算
     * @param equipPropItem
     */
    static calculateEquipFp(equipPropItem: EquipPropBean) {
        const attrFp = EquipPowerCalculator.equipBaseAttrFp(equipPropItem)
        const entryFp = EquipPowerCalculator.equipEntryAttrFp(equipPropItem)
        const effectFp = EquipPowerCalculator.equipEffectFp(equipPropItem)

        equipPropItem.attrFp = attrFp
        equipPropItem.entryFp = entryFp
        equipPropItem.effectFp = effectFp
        equipPropItem.fp = attrFp + entryFp + effectFp
    }

    /**
     * 更新评分模块
     * @param user
     */
    static async updateUserEquipFpAndRank(user: User) {
        // 装备评分更新
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_EQUIP)
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_EQUIP_ENTRY)
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_EQUIP_EFFECT)

        // 活动榜单更新
        const rankFp = PowerScoreRules.getActivityRankFp(user, ActivityDefine.RankEquipFp)
        await ActivityRankUpdate.run(user, [ActivityDefine.RankEquipFp], rankFp)
    }
}
