import { TimeAdd } from '@arthropoda/game-engine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqTimeAddChange } from '../AdjustS2S'
import { strtotime, timestamp } from '@arthropoda/game-engine'
import { CronService } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'

/**
 * 时间偏移量增加等
 */
export class ActionTimeAddChange extends GameAction {
    async doAction(req: ReqTimeAddChange, res: ResDefault) {
        if (req.timeFormat) {
            const newTime = strtotime(req.timeFormat)
            const now = timestamp()
            const addSecond = newTime - now
            if (addSecond > 0) {
                TimeAdd.addTime(addSecond)
                // 刷新cron任务
                CronService.afterTimeAdd()
            }
        }
    }
}
