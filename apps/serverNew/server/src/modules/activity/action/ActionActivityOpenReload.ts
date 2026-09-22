import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqActivityOpenReload } from '../ActivityS2S'
import { ActivityRefresh } from '../refresh/ActivityRefresh'
import { GameAction } from '../../../runtime/action/GameAction'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { ActionActivityNotifyProcessTimeVer } from './ActionActivityNotifyProcessTimeVer'
import { ActionActivityStageTask } from './ActionActivityStageTask'

/**
 * 从数据库重新加载活动配置
 */
export class ActionActivityOpenReload extends GameAction {
    async doAction(req: ReqActivityOpenReload, res: ResDefault) {
        req.sIds ??= []
        const changedSids = []
        for (const sId of req.sIds) {
            const changed = await ActivityRefresh.refreshActivitiesCache(sId)
            if (changed) {
                changedSids.push(sId)
            }
        }
        for (const sId of req.sIds) {
            // 立即检测触发阶段性任务逻辑
            await QueuedLocalAction.rpc(ActionActivityStageTask, { sid: sId }, 0, sId)
        }

        if (changedSids.length > 0) {
            LocalAction.broadcast(ActionActivityNotifyProcessTimeVer, {})
        }
    }
}
