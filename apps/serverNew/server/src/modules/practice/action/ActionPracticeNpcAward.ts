import { ReqPracticeNpcAward, ResPracticeNpcAward } from '../PracticeC2S'
import { ActionPractice } from './ActionPractice'

/**
 * 领取NPC身上的奖励
 */
export class ActionPracticeNpcAward extends ActionPractice {
    async doAction(req: ReqPracticeNpcAward, res: ResPracticeNpcAward) {
        const user = this.user
        await ActionPractice.batchOpenBox(user, user.practice.npcPracticeAwards, res.award)
    }
}
