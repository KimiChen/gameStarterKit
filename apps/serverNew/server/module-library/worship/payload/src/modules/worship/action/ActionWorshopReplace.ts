import { GameAction } from '../../../runtime/action/GameAction'
import { UserFp } from '../../user/action/UserFp'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqWorshopReplace, ResWorshopReplace } from '../WorshipC2S'
import { WorshipSkillRollRules } from './WorshipSkillRollRules'

/**
 * 保存洗练
 */
export class ActionWorshopReplace extends GameAction {
    async doAction(req: ReqWorshopReplace, res: ResWorshopReplace) {
        const user = this.user

        const slotId = req.slotId
        const worshipSkill = WorshipSkillRollRules.getWorshipSkillItem(user, slotId)

        // 更新
        worshipSkill.skillId = worshipSkill.newSkillId
        worshipSkill.newSkillId = 0

        // 更新玩家战力
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_WORSHIP)

        // 同步场景
    }
}
