import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { Props } from '../../props/inventory/Props'
import { UserFp } from '../../user/action/UserFp'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqEquipGemEngrave, ResEquipGemEngrave } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { EquipAttributeSync } from '../inventory/EquipAttributeSync'
import { EquipDefine } from '../rules/EquipDefine'

/**
 * 宝石镌刻
 */
export class ActionEquipGemEngrave extends GameAction {
    async doAction(req: ReqEquipGemEngrave, res: ResEquipGemEngrave) {
        const user = this.user

        const pos = req.pos
        if (!EquipDefine.EQUIP_POSITION.has(pos)) {
            throw SystemErrors.SysParamError
        }

        // 坑位穿戴信息
        const equipItem = user.equip.equips.get(pos)
        if (!equipItem || !equipItem.gemId) {
            throw EquipErrors.EquipGemIsInlay
        }

        // 当前宝石信息
        const equipGemConf = C.equip_gem(pos).more.get(equipItem.gemId)
        if (!equipGemConf || !equipGemConf.newId) {
            throw EquipErrors.EquipGemCanNotEngrave
        }

        // 装备信息
        const equipPropItem = user.equip.equipProps.get(equipItem.id)
        if (equipPropItem == null) {
            throw EquipErrors.EquipNotExist
        }

        // 穿戴的装备等级限制
        const itemConf = C.equip(equipPropItem.cId)
        const equipNewGemConf = C.equip_gem(pos).more.get(equipGemConf.newId)
        if (itemConf.level < equipNewGemConf.equipLevel) {
            throw EquipErrors.EquipWearLvLimit
        }

        // 升级消耗
        await Props.costProp(user, equipGemConf.propId, equipGemConf.num)

        // 更新装备宝石
        equipItem.gemId = equipGemConf.newId

        // 属性变更
        const gemAttrs = EquipAttributeSync.getGemAttrs(user)
        Attr.updateAttrModItem(user, AttrModDefine.EquipGem, gemAttrs)

        // 宝石强度评分更新
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_GEM)
    }
}
