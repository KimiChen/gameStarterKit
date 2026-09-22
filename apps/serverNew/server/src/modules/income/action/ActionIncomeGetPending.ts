import type {
    IIncomeGetPendingReq,
    IIncomeGetPendingRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

export class ActionIncomeGetPending extends GameAction {
    async doAction(_req: IIncomeGetPendingReq, res: IIncomeGetPendingRes) {
        if (!this.user) {
            res.level = 0
            res.intervalSeconds = CopperIncome.INTERVAL_SECONDS
            res.perInterval = 0
            res.offlineSeconds = 0
            res.offlineCopper = 0
            res.copper = 0
            return
        }
        const pending = CopperIncome.pendingOffline(this.user)
        res.level = this.user.lv
        res.intervalSeconds = CopperIncome.INTERVAL_SECONDS
        res.perInterval = CopperIncome.perInterval(this.user.lv)
        res.offlineSeconds = pending.offlineSeconds
        res.offlineCopper = pending.copper
        res.copper = this.user.copper
    }
}
