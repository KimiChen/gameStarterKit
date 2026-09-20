import { RedisLock } from '@arthropoda/game-engine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqActivityStageTask } from '../ActivityS2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { ActivityStageScheduler } from '../scheduling/ActivityStageScheduler'
import { ActivityStateKeys } from '../rules/ActivityStateKeys'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { timestamp } from '@arthropoda/game-engine'

/**
 * 活动阶段切换调度任务
 */
export class ActionActivityStageTask extends GameAction {
    async doAction(req: ReqActivityStageTask, res: ResDefault) {
        // 活动阶段逻辑触发
        let isRun = false
        await RedisLock.runOrSkip(`${ActivityStateKeys.ActionActivityStageTaskLock}${req.sid}`, async () => {
            isRun = true
            await ActivityStageScheduler.checkActivityStageTask(req.sid)
        })
        if (!isRun) {
            await QueuedLocalAction.rpc(ActionActivityStageTask, { sid: req.sid }, 0, req.sid, timestamp() + 1)
        }
    }
}
