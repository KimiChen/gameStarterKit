import { timestamp } from '@arthropoda/game-engine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqTitleRead } from '../TitleC2S'
import { ActionTitle } from './ActionTitle'

/**
 * 标记称号已读
 */
export class ActionTitleRead extends ActionTitle {
    async doAction(req: ReqTitleRead, res: ResDefault) {
        const item = ActionTitle.takeValid(this.user, req.titleId, timestamp())
        item.isRead = true
    }
}
