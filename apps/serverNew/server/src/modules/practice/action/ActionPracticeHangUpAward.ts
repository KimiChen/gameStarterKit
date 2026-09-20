import { Props } from '../../props/inventory/Props'
import { ReqPracticeHangUpAward, ResPracticeHangUpAward } from '../PracticeC2S'
import { ActionPractice } from './ActionPractice'

/**
 * 领取挂机奖励
 */
export class ActionPracticeHangUpAward extends ActionPractice {
    async doAction(req: ReqPracticeHangUpAward, res: ResPracticeHangUpAward) {
        // 结算当前收益
        const user = this.user
        ActionPractice.settlement(user)

        // 下发奖励
        await Props.addProps(user, user.practice.hangUpAwards.values(), res.award)

        user.practice.hangUpAwards.clear()

        user.practice.hangUpAwardTime = user.practice.settledPracticeTime
        user.practice.settledNum = 0

        // TODO:任务更新
        return
    }
}
