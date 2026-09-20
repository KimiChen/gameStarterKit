import { ReqActivityNotifyProcessTimeVer } from '../ActivityS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { ActivityScheduleStore } from '../scheduling/ActivityScheduleStore'

/**
 * 把新活动版本给所有进程
 */
export class ActionActivityNotifyProcessTimeVer extends GameAction {
    async doAction(req: ReqActivityNotifyProcessTimeVer, res: ResDefault) {
        await ActivityScheduleStore.updateServerTimeVerExpiredStatus()
    }
}
