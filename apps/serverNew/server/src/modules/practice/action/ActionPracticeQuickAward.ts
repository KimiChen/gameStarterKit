import { Map2Array } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Award } from '../../props/award/Award'
import { PropBean } from '../../props/bean/PropBean'
import { Props } from '../../props/inventory/Props'
import { ReqPracticeQuickAward, ResPracticeQuickAward } from '../PracticeC2S'
import { ActionPractice } from './ActionPractice'

/**
 * 快速挂机接口
 */
export class ActionPracticeQuickAward extends ActionPractice {
    async doAction(req: ReqPracticeQuickAward, res: ResPracticeQuickAward) {
        const propId = req.propId
        const clientKilledNum = req.killedNum
        const user = this.user
        if (user.practice.quickHangUpTimes + 1 > Param.PracticeFastMaxTimes) {
            throw SystemErrors.SysParamError
        }
        let costNum = 0
        const costId = user.practice.quickHangUpTimes + 1
        const costConf = C.fast_practice(costId)
        if (propId === costConf.costPropId) {
            costNum = costConf.costNum
        } else if (propId === costConf.costPropId2) {
            costNum = costConf.costNum2
        } else {
            throw SystemErrors.SysParamError
        }

        if (!costNum) {
            throw SystemErrors.SysParamError
        }

        await Props.costProp(user, propId, costNum)
        user.practice.quickHangUpTimes++

        // 结算时间收益
        const practiceConf = C.practice(user.practice.practiceId)
        const num = Param.PracticeFastTime / Param.PracticeUnitTime
        const awards: Map<int, PropBean> = new Map<int, PropBean>()
        for (const conf of practiceConf.wait) {
            awards.set(conf.propId, new PropBean({ propId: conf.propId, num: conf.num * num }))
        }

        let killNum = ActionPractice.getKilledNumByHangUpTime(user, Param.PracticeFastTime)

        if (killNum !== clientKilledNum) {
            if (Math.abs(killNum - clientKilledNum) < 5) {
                killNum = clientKilledNum
            } else {
                throw SystemErrors.SysParamError
            }
        }
        // 击杀掉落宝箱奖励
        const killedAwards = ActionPractice.getKilledAwardsByKilledNum(user, killNum)
        Award.mergeAwards(awards, killedAwards)
        // 击杀固定掉落奖励
        Award.mergeAwards(awards, practiceConf.littleMonsterAward1)

        await Props.addProps(user, Map2Array(awards)!, res.award)

        // TODO:任务
        return
    }
}
