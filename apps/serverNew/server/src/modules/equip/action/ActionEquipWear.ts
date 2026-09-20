import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { UserErrors } from '../../user/UserErrors'
import { UserFp } from '../../user/action/UserFp'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqEquipWear, ResEquipWear } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { EquipBean } from '../bean/EquipBean'
import { EquipPropBean } from '../bean/EquipPropBean'
import { EquipAttributeSync } from '../inventory/EquipAttributeSync'
import { EquipDisplayFormatter } from '../inventory/EquipDisplayFormatter'
import { EquipWearRules } from '../inventory/EquipWearRules'
import { EquipDefine } from '../rules/EquipDefine'

/**
 * 装备穿戴｜卸下
 */
export class ActionEquipWear extends GameAction {
    async doAction(req: ReqEquipWear, res: ResEquipWear) {
        const user = this.user

        const id = req.id
        const pos = req.pos
        if (!pos) {
            throw SystemErrors.SysParamError
        }

        let equipItem = user.equip.equips.get(pos)
        if (equipItem == null) {
            equipItem = new EquipBean({ pos: pos })
            user.equip.equips.set(pos, equipItem)
        }

        if (id) {
            // 穿戴||替换
            // 装备库不存在该装备
            const equipPropItem = user.equip.equipProps.get(id)
            if (equipPropItem == null) {
                throw SystemErrors.SysParamError
            }

            const equipConf = C.equip(equipPropItem.cId)
            if (equipConf.position != pos) {
                throw SystemErrors.SysParamError
            }

            if (!checkCanWear(user, equipPropItem)) {
                throw UserErrors.UserLvIsSmall
            }

            // 当前穿戴装备相同
            if (equipItem.id == id) {
                throw EquipErrors.EquipSameId
            }

            const oldEId = equipItem.id
            equipItem.id = id

            // 更新目标部位装备同时满足 境界提升条件 及 历史条件
            EquipWearRules.updateEquipPosHis(user, pos, equipConf)

            // 特效技能处理
            dealEquipEffectSkill(user, oldEId, id)
        } else {
            // 卸下
            if (!equipItem.id) {
                throw EquipErrors.EquipNoWear
            }

            // 当前穿戴装备信息
            const curEquipPropItem = user.equip.equipProps.get(equipItem.id)
            if (curEquipPropItem == null) {
                throw SystemErrors.SysParamError
            }

            const oldEId = equipItem.id
            equipItem.id = 0

            // 特殊技能处理
            dealEquipEffectSkill(user, oldEId, equipItem.id)
        }

        // 更新宝石模块属性
        const gemAttrs = EquipAttributeSync.getGemAttrs(user)
        Attr.updateAttrModItem(user, AttrModDefine.EquipGem, gemAttrs, false)
        // 宝石强度评分更新
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_GEM)

        // 装备模块属性
        EquipAttributeSync.updateEquipAttrs(user)

        // 装备评分更新
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_EQUIP)
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_EQUIP_ENTRY)
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_EQUIP_EFFECT)

        // 战场穿戴表现更新
        EquipDisplayFormatter.updateEquipWearShow(user)
    }
}

/**
 * 校验是否可穿戴
 * @param user
 * @param equipPropItem
 * @returns
 */
function checkCanWear(user: User, equipPropItem: EquipPropBean) {
    // 特效加成
    let reduceLv = 0
    for (const effectId of equipPropItem.effects) {
        const effectConf = C.equip_effect(effectId)
        if (effectConf.type != EquipDefine.EFFECT_WEAR_LV_CHANGE) {
            continue
        }

        // 数值填0代表该装备穿戴无等级限制
        if (effectConf.value1 === 0) {
            return true
        }

        reduceLv += effectConf.value1
    }

    // 可穿戴
    const equipConf = C.equip(equipPropItem.cId)
    if (user.lv >= equipConf.lvLimit - reduceLv) {
        return true
    }

    return false
}

function dealEquipEffectSkill(user: User, oldEquipId: int, newEquipId: int) {
    let rmSkills: int[] = []
    if (oldEquipId) {
        // 当前被卸下的装备
        const oldEquipPropItem = user.equip.equipProps.get(oldEquipId)
        if (oldEquipPropItem == null) {
            throw SystemErrors.SysParamError
        }
        rmSkills = EquipAttributeSync.getSkillsOfEffects(oldEquipPropItem.effects.copy())
    }

    let addSkills: int[] = []
    if (newEquipId) {
        // 当前传上装备
        const newEquipPropItem = user.equip.equipProps.get(newEquipId)
        if (newEquipPropItem == null) {
            throw SystemErrors.SysParamError
        }
        addSkills = EquipAttributeSync.getSkillsOfEffects(newEquipPropItem.effects.copy())
    }

    if (rmSkills.length > 0 || addSkills.length > 0) {
        // 同步到场景
        console.log('同步战斗场景:装备穿戴变更')
    }
}
