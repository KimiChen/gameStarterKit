import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqAchieveLabelUnDress } from '../AchieveC2S'

/**
 * 卸下成就标签
 */
export class ActionAchieveLabelUnDress extends GameAction {
    async doAction(req: ReqAchieveLabelUnDress, res: ResDefault) {
        const labelId = req.cId
        if (labelId <= 0) {
            throw SystemErrors.SysParamError
        }
        const user = this.user
        const list = user.achieve.labelWears.copy()

        let change = false

        for (let i = 0; i < list.length; i++) {
            const id = list[i]
            if (id === labelId) {
                list.splice(i, 1)
                change = true
                break
            }
        }
        if (change) {
            user.achieve.labelWears.init(list)
        }
    }
}
