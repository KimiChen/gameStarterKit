import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { ReqPracticeNpcBreakUp } from '../PracticeC2S'

/**
 * NPC突破
 */
export class ActionPracticeNpcBreakUp extends GameAction {
    async doAction(req: ReqPracticeNpcBreakUp, res: ResDefault) {
        const user = this.user
        const breakConf = C.sterious_man_through(user.practice.practiceNpcBreakLv)
        const nextLv = user.practice.practiceNpcBreakLv + 1

        if (C.sterious_man_through(nextLv) == null) {
            // 已经满级
            throw SystemErrors.SysParamError
        }

        if (user.practice.practiceNpcLv < breakConf.level) {
            throw SystemErrors.SysParamError
        }

        if (breakConf.costPropId && breakConf.costNum) {
            await Props.costProp(user, breakConf.costPropId, breakConf.costNum)
        }
        user.practice.practiceNpcBreakLv = nextLv

        // TODO:任务
    }
}
