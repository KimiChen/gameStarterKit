import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqEquipLock, ResEquipLock } from '../EquipC2S'

/**
 * 装备锁定
 */
export class ActionEquipLock extends GameAction {
    async doAction(req: ReqEquipLock, res: ResEquipLock) {
        const user = this.user

        // 装备id
        const id = req.id
        if (!id) {
            throw SystemErrors.SysParamError
        }

        // 装备库不存在该装备
        const equipPropItem = user.equip.equipProps.get(id)
        if (equipPropItem == null) {
            throw SystemErrors.SysParamError
        }

        // 锁定或解锁
        equipPropItem.status = equipPropItem.status == 0 ? 1 : 0
    }
}
