import { GameAction } from '../../../runtime/action/GameAction'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ReqPlantSetEmpRelax } from '../PlantS2S'

/**
 * 修改青蛙摸鱼状态
 */
export class ActionPlantSetEmpRelax extends GameAction {
    async doAction(req: ReqPlantSetEmpRelax, res: ResDefault) {
        if (!this.user) {
            return
        }

        const item = this.user.plant.employees.get(req.empId)
        if (!item) {
            return
        }

        // 状态修改
        item.isRelax = true
    }
}
