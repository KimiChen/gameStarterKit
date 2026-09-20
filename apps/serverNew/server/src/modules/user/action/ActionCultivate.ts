import { GameAction } from '../../../runtime/action/GameAction'
import { ReqCultivate, ResCultivate } from '../UserC2S'
import { UserErrors } from '../UserErrors'
import { UserEvent } from './UserEvent'

/** 养成样例：消耗经验道具，按当前等级门槛升级并返回最新战力。 */
export class ActionCultivate extends GameAction {
    async doAction(req: ReqCultivate, res: ResCultivate) {
        if (req.exp <= 0 || req.exp > 1_000_000) throw UserErrors.UserNoCoin
        const user = this.user
        user.exp += req.exp
        while (user.lv < C.level().end().id) {
            const needExp = C.level(user.lv).exp
            if (user.exp < needExp) break
            user.exp -= needExp
            user.lv++
            await UserEvent.userLevelUp(user, user.lv)
        }
        res.lv = user.lv
        res.exp = user.exp
        res.fp = user.fp
    }
}
