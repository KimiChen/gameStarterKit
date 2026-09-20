import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { TaskErrors } from '../../task/TaskErrors'
import { ReqAchieveLabel } from '../AchieveC2S'
import { LabelBean } from '../bean/LabelBean'

/**
 * 点亮成就标签
 */
export class ActionAchieveLabel extends GameAction {
    async doAction(req: ReqAchieveLabel, res: ResDefault) {
        const labelId = req.cId
        if (labelId <= 0) {
            throw SystemErrors.SysParamError
        }
        const user = this.user
        // 已点亮不处理
        if (user.achieve.labels.has(labelId)) {
            return
        }
        const labConf = C.achievement_label(labelId)
        for (const needConf of labConf.need) {
            if (!user.achieve.achieves.includes(needConf.achievementSortId)) {
                throw TaskErrors.TaskNoComplete
            }
        }
        const lab = new LabelBean({ id: labelId, time: timestamp() })
        user.achieve.labels.set(labelId, lab)

        // 数数统计
    }
}
