import { ReqPowerOper, ResPowerOper } from '../UserC2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserPower } from './UserPower'

export class ActionPowerOper extends GameAction {
    async doAction(req: ReqPowerOper, res: ResPowerOper) {
        const user = this.user

        if (user.power == null) {
            user.power = UserPower.initPower(user)
        }

        UserPower.recovery(user)

        if (req.type == 1) {
            UserPower.changeNum(user, req.num)
        } else {
            UserPower.changeNum(user, -req.num)
        }

        res.left = user.power?.times
    }
}
