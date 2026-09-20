import { mapEnd } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { ReqPlantLvUp } from '../PlantC2S'
import { PlantErrors } from '../PlantErrors'

/**
 * 升级青蛙
 */
export class ActionPlantLvUp extends GameAction {
    async doAction(req: ReqPlantLvUp, res: ResDefault) {
        const employeeId = req.id

        // 未拥有
        if (!this.user.plant.employees.has(employeeId)) {
            throw SystemErrors.SysParamErr
        }

        const employee = this.user.plant.employees.get(employeeId)!
        const empConf = C.peach_orchard(employeeId)

        // 满级
        if (employee.lv >= mapEnd(empConf.detail)!.lv) {
            throw PlantErrors.PlantMaxLv
        }

        const lvConf = empConf.detail.get(employee.lv)

        // 升级消耗
        await Props.costProp(this.user, lvConf.costPropId, lvConf.costNum)

        employee.lv++
    }
}
