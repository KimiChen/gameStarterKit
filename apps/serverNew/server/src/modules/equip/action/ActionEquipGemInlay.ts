import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { Props } from '../../props/inventory/Props'
import { UserFp } from '../../user/action/UserFp'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqEquipGemInlay, ResEquipGemInlay } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { EquipBean } from '../bean/EquipBean'
import { EquipAttributeSync } from '../inventory/EquipAttributeSync'
import { EquipDefine } from '../rules/EquipDefine'

/**
 * 宝石镶嵌
 */
export class ActionEquipGemInlay extends GameAction {
    async doAction(req: ReqEquipGemInlay, res: ResEquipGemInlay) {
        const user = this.user

        const pos = req.pos
        if (!EquipDefine.EQUIP_POSITION.has(pos)) {
            throw SystemErrors.SysParamError
        }

        const [, equipGemConf] = Object.entries(C.equip_gem(pos).more)[0]

        // 该坑位已镶嵌
        let equipItem = user.equip.equips.get(pos)
        if (!equipItem) {
            equipItem = new EquipBean({ pos: pos })
            user.equip.equips.set(pos, equipItem)
        }
        if (equipItem.gemId) {
            throw EquipErrors.EquipGemIsInlay
        }
        if (!equipItem.id) {
            throw EquipErrors.EquipNoWear
        }

        const equipPropItem = user.equip.equipProps.get(equipItem.id)
        if (equipPropItem == null) {
            throw EquipErrors.EquipNotExist
        }

        // 穿戴的装备等级限制
        const itemConf = C.equip(equipPropItem.cId)
        if (itemConf.level < equipGemConf.equipLevel) {
            throw EquipErrors.EquipWearLvLimit
        }

        if (!equipGemConf.gemId) {
            throw SystemErrors.SysNoConf
        }

        // 消耗
        await Props.costProp(user, equipGemConf.insetId, equipGemConf.insetNum)

        equipItem.gemId = equipGemConf.gemId

        // 属性变更
        const gemAttrs = EquipAttributeSync.getGemAttrs(user)
        Attr.updateAttrModItem(user, AttrModDefine.EquipGem, gemAttrs)

        // 宝石强度评分更新
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_GEM)
    }
}
