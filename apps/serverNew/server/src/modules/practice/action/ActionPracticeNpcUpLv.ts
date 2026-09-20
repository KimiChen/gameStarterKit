import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { ReqPracticeNpcUpLv } from '../PracticeC2S'

/**
 * NPC升级
 */
export class ActionPracticeNpcUpLv extends GameAction {
    async doAction(req: ReqPracticeNpcUpLv, res: ResDefault) {
        const user = this.user
        const npcConf = C.sterious_man(user.practice.practiceNpcLv)
        if (user.lv < npcConf.level) {
            throw SystemErrors.SysParamError
        }

        if (user.practice.practiceNpcBreakLv < npcConf.breakThrough) {
            throw SystemErrors.SysParamError
        }

        const nextNpcLv = user.practice.practiceNpcLv + 1

        if (C.sterious_man(nextNpcLv) === undefined) {
            throw SystemErrors.SysParamError
        }

        if (npcConf.costPropId && npcConf.costNum) {
            await Props.costProp(user, npcConf.costPropId, npcConf.costNum)
        }
        user.practice.practiceNpcLv++

        // TODO:同步场景、任务

        return
    }
}
