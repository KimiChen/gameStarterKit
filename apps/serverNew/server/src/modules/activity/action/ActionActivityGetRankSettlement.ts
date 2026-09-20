import { ActivityDefine } from '../rules/ActivityDefine'
import { ReqActivityGetRankSettlement } from '../ActivityC2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GameAction } from '../../../runtime/action/GameAction'
import { ActivityAvailabilityRules } from '../rules/ActivityAvailabilityRules'
import { ActivityScheduleResolver } from '../scheduling/ActivityScheduleResolver'
import { ActivityRank } from '../rank/ActivityRank'

/**
 * 冲榜活动结算状态请求
 */
export class ActionActivityGetRankSettlement extends GameAction {
    async doAction(req: ReqActivityGetRankSettlement, res: ResDefault) {
        for (const [, listConf] of C.list()) {
            const activityName = listConf.activityName
            if (!ActivityDefine.isRankActivity(activityName)) {
                continue
            }
            if (!(await ActivityAvailabilityRules.isAwardTime(this.user.sId, activityName, this.user))) {
                continue
            }
            const activityOpenInfo = await ActivityScheduleResolver.getOpen(this.user.sId, activityName, this.user)
            if (!activityOpenInfo) {
                continue
            }
            const settlement = await ActivityRank.loadUserAwardCache(0, activityOpenInfo)
            if (!settlement) {
                continue
            }

            ActivityRank.setRankInfoChange(this.user.id, activityName, { settlement: true })
            const awardInfo = await ActivityRank.loadUserAwardCache(this.user.id, activityOpenInfo)
            if (!awardInfo) {
                continue
            }
            ActivityRank.setRankInfoChange(this.user.id, activityName, { awardInfos: awardInfo.awardInfos })
        }
    }
}
