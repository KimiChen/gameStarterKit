import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { UserErrors } from '../../user/UserErrors'
import { ReqEquipFashionRecover, ResEquipFashionRecover } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'

/**
 * 时装耐久恢复
 */
export class ActionEquipFashionRecover extends GameAction {
    async doAction(req: ReqEquipFashionRecover, res: ResEquipFashionRecover) {
        const user = this.user
        const cId = req.cId
        const propId = req.propId
        if (!cId || !propId) {
            throw SystemErrors.SysParamError
        }

        // 未获得该时装
        const fashionItem = user.fashion.fashions.get(cId)
        if (!fashionItem) {
            throw EquipErrors.EquipFashionHasNot
        }

        // 品质限制判断
        const fashionConf = C.equip_fashion(cId)
        const conf = C.item(propId)
        if (conf.quality != fashionConf.quality) {
            throw SystemErrors.SysParamError
        }

        // 消耗
        if (!(await Props.costProp(user, propId, 1))) {
            throw UserErrors.UserNumIsSmall
        }

        // 耐久增加走通用方法
        Props.changeDurable(user, cId, conf.value1, ItemIdDefine.DURABLE_FIELD_NAME.fashionItems)
    }
}
