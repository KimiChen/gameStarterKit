import { ActivityDefine } from '../rules/ActivityDefine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { ReqActivityClose } from '../ActivityS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { RankAccess } from '../../rank/persistence/RankAccess'
import { ActionActivityOpenReload } from './ActionActivityOpenReload'

export class ActionActivityClose extends GameAction {
    async doAction(req: ReqActivityClose, res: ResDefault) {
        LocalAction.send(ActionActivityOpenReload, { sIds: [req.sId] }, 0, 0)
        if (ActivityDefine.isRankActivity(req.activityName)) {
            //如果是冲榜活动，清空排行榜
            await RankAccess.getRedisRank(req.activityName).clear()
        }
    }
}
