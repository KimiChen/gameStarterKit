import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { ReqEquipForgeDraw, ResEquipForgeDraw } from '../EquipC2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { EquipForgeDispatcher } from '../inventory/EquipForgeDispatcher'
import { EquipForge } from '../forge/EquipForge'

/**
 * 装备打造
 */
export class ActionEquipForgeDraw extends GameAction {
    async doAction(req: ReqEquipForgeDraw, res: ResEquipForgeDraw) {
        const user = this.user
        const type = req.type
        const useId = req.propUseId

        const resAward: AwardResponse = { awards: [] }
        await EquipForgeDispatcher.forge(user, type, EquipForge.POOL_TYPE_DEFAULT, useId, resAward)

        res.awards = resAward
    }
}
