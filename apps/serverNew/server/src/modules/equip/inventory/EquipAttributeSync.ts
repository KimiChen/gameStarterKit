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

export class EquipAttributeSync {
    /**
     * 更新彩色变异套装属性
     * @param HUser user
     * @return void
     */
    static updateSuitAttr(user: User) {
        let count = 0
        for (const [, equip] of user.equip.equips) {
            // 是否穿戴装备
            if (equip.id <= 0) {
                continue
            }
            const equipItem = user.equip.equipProps.get(equip.id)
            // 装备库中不存在该装备
            if (equipItem == undefined) {
                continue
            }
            // 【彩色变异】特效
            if (equipItem.effects.includes(EquipDefine.EFFECT_ID_21)) {
                count++
            }
        }

        let attrs: Map<int, AttrTypeBean> = new Map()
        if (count > 0) {
            attrs = AttrDefine.getBaseAttr(C.equip_suit(count).attr)
        }

        // 更新属性
        Attr.updateAttrModItem(user, AttrModDefine.EquipSuit, attrs)
    }

    // #endregion

    //#region 属性
    /**
     * 更新玩家装备属性模块
     */
    static updateEquipAttrs(user: User) {
        const attrs: Map<int, AttrTypeBean> = new Map()

        // 穿戴装备
        for (const [, equip] of user.equip.equips) {
            if (!equip.id) {
                continue
            }

            EquipDefine.getEquipAttrs(user, equip.id, attrs)
        }

        // 坑位对应属性模块id
        Attr.updateAttrModItem(user, AttrModDefine.Equip, attrs)
    }

    // #endregion

    //#region 宝石
    /**
     * getGemAttrs
     * 宝石属性
     * @param HUser user
     * @return AttrTypeItem[]
     */
    static getGemAttrs(user: User) {
        const attrs: Map<int, AttrTypeBean> = new Map()

        for (const [, equip] of user.equip.equips) {
            if (!equip.gemId) {
                continue
            }

            if (equip.id <= 0) {
                continue
            }
            const equipPropItem = user.equip.equipProps.get(equip.id)
            // 装备库中不存在该装备
            if (!equipPropItem) {
                continue
            }

            const equipGemConf = C.equip_gem(equip.pos)
            const moreConf = equipGemConf.more.get(equip.gemId)
            EquipDefine.gemImproveBaseAttrs(moreConf, equipPropItem, attrs, true)
        }

        return attrs
    }

    /**
     * 更新宝石属性
     * @param user
     */
    static updateGemAttrs(user: User) {
        // 更新宝石模块属性
        const gemAttrs = EquipAttributeSync.getGemAttrs(user)
        Attr.updateAttrModItem(user, AttrModDefine.EquipGem, gemAttrs, false)
    }

    // #endregion

    //#region 技能
    /**
     * 获得装备技能
     * @param user
     * @returns
     */
    static getEquipSkills(user: User) {
        const skills: int[] = []
        if (!user.equip.equips) {
            return skills
        }

        for (const [, equip] of user.equip.equips) {
            if (!equip.id) {
                continue
            }

            const equipPropItem = user.equip.equipProps.get(equip.id)
            if (equipPropItem == null) {
                continue
            }
            const curSkills = EquipAttributeSync.getSkillsOfEffects(equipPropItem.effects.copy())
            skills.concat(curSkills)
        }

        return skills
    }

    /**
     * 获取装备技能特效
     * @param effects
     * @returns
     */
    static getSkillsOfEffects(effects: int[]) {
        const skills: int[] = []
        if (effects.length == 0) {
            return skills
        }

        for (const effect of effects) {
            const equipEffectConf = C.equip_effect(effect)
            if (equipEffectConf.type != EquipDefine.EFFECT_SKILL_ID) {
                continue
            }
            skills.push(equipEffectConf.value1)
        }

        return skills
    }
}
