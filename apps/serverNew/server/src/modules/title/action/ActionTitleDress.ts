import { timestamp } from '@arthropoda/game-engine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqTitleDress } from '../TitleC2S'
import { ActionTitle } from './ActionTitle'

/**
 * 佩戴称号
 */
export class ActionTitleDress extends ActionTitle {
    async doAction(req: ReqTitleDress, res: ResDefault) {
        const user = this.user
        // 未拥有或已过期的称号在这里被拒绝，并顺手回收
        const item = ActionTitle.takeValid(user, req.titleId, timestamp())
        user.title.titleId = item.id
        user.title.titleExpire = item.expire
    }
}
