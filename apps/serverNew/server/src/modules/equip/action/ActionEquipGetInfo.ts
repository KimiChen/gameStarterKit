import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqEquipGetInfo, ResEquipGetInfo } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { UserEquipRef } from '../ref/UserEquipRef'

/**
 * 获取他人的装备信息
 */
export class ActionEquipGetInfo extends GameAction {
    async doAction(req: ReqEquipGetInfo, res: ResEquipGetInfo) {
        const uId = req.uId
        const eId = req.equipId
        if (uId <= 0 || eId <= 0) {
            throw SystemErrors.SysParamError
        }

        const user = await UserEquipRef.load(uId)
        if (!user || !user.equipProps) {
            throw SystemErrors.SysParamError
        }

        const equipItem = user.equipProps.get(eId)
        if (equipItem == null) {
            throw EquipErrors.EquipDisassembly
        }

        res.equipInfo = equipItem.toModData() as any
    }
}
