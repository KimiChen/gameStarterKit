import { ReqNiubility, ResNiubility } from '../UserC2S'
import { AdjustUserBoostCommands } from '../../adjust/change/AdjustUserBoostCommands'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * 一键牛逼
 */
export class ActionNiubility extends GameAction {
    async doAction(req: ReqNiubility, res: ResNiubility) {
        const user = this.user
        await new AdjustUserBoostCommands(user).demonUser()
    }
}
