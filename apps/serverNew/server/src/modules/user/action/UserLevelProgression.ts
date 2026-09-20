import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { User } from '../bean/User'
import { UserEvent } from './UserEvent'

export class UserLevelProgression {
    static async autoLevelUp(user: User, resp?: AwardResponse) {
        if (user.lv >= C.level().end().id) return

        const lvConf = C.level(user.lv)
        const needExp = lvConf.exp
        if (!Props.checkPropCount(user, ItemIdDefine.ITEM_ID_EXP, needExp, false)) return

        await Props.costProp(user, ItemIdDefine.ITEM_ID_EXP, needExp)
        user.lv++
        await Props.addProps(user, lvConf.awards, resp)
        await UserEvent.userLevelUp(user, user.lv)
        await UserLevelProgression.autoLevelUp(user, resp)
    }
}
