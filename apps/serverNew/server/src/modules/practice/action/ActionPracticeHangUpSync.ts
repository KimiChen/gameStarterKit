import { ReqPracticeHangUpSync } from '../PracticeC2S'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ActionPractice } from './ActionPractice'

/**
 * 挂机收益同步
 */
export class ActionPracticeHangUpSync extends ActionPractice {
    async doAction(req: ReqPracticeHangUpSync, res: ResDefault) {
        const user = this.user
        ActionPractice.settlement(user)
        return
    }
}
