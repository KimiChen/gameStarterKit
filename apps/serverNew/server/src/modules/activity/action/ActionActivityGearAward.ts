import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ReqActivityGearAward, ResActivityGearAward } from '../ActivityC2S'
import { ActivityErrors } from '../ActivityErrors'
import { ActivityOperatorRegistry } from '../operation/ActivityOperatorRegistry'
import { RankOperator } from '../rank/RankOperator'

/**
 * 通用领取档位类活动奖励接口
 */
export class ActionActivityGearAward extends GameAction {
    async doAction(req: ReqActivityGearAward, res: ResActivityGearAward) {
        const activityName = req.activityName // 活动名称
        const id = req.id // 档位ID
        const ext = req.ext // 额外参数
        const user = this.user

        if (!activityName || !id) {
            throw SystemErrors.SysParamError.vars([activityName, id])
        }

        const operator = await ActivityOperatorRegistry.getActivityOperator(user.sId, activityName, user)
        const activityOpenInfo = operator?.activityOpenInfo
        // 活动是否可以领奖
        if (!activityOpenInfo || !activityOpenInfo.checkIsAwardTime(operator.awardDelayTime)) {
            throw ActivityErrors.ActivityNotAward.vars([activityOpenInfo])
        }

        // 处理领奖逻辑
        const awards = await (operator as RankOperator).onGearAward(user, id, ext)

        await Props.addProps(user, awards, res.awards)
    }
}
