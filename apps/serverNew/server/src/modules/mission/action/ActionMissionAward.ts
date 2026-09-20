import { ReqMissionAward, ResMissionAward } from '../MissionC2S'
import { ActionMission } from './ActionMission'

/**
 * 当前个人历练新手保护额外奖励领取
 */
export class ActionMissionAward extends ActionMission {
    async doAction(req: ReqMissionAward, res: ResMissionAward) {
        // 奖励
        await ActionMission.pickUpAwards(this.user, false, res.awards)
    }
}
