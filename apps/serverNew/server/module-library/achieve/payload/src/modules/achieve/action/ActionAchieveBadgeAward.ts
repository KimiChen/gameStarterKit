import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ReqAchieveBadgeAward, ResAchieveBadgeAward } from '../AchieveC2S'
import { AchieveErrors } from '../AchieveErrors'

/**
 * 成就资历奖励领取
 */
export class ActionAchieveBadgeAward extends GameAction {
    async doAction(req: ReqAchieveBadgeAward, res: ResAchieveBadgeAward) {
        if (req.cId <= 0) {
            throw SystemErrors.SysParamError
        }
        const user = this.user
        const conf = C.achievement_award(req.cId)
        if (conf.need > user.achieve.achievePoint) {
            throw AchieveErrors.AchievePointNotEnough
        }
        console.log('cId : ', req.cId)
        if (user.achieve.achieveBadges.has(req.cId)) {
            throw AchieveErrors.AchieveRepeatAward
        }
        user.achieve.achieveBadges.set(req.cId, req.cId)

        const desc = '成就徽章领奖：' + conf.id + '_' + conf.desc

        await Props.addProps(user, conf.awards, res.award, true, desc)
    }
}
