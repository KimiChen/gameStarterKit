import type {
    IIncomeGetPendingReq,
    IIncomeGetPendingRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

export class ActionIncomeGetPending extends GameAction {
    async doAction(_req: IIncomeGetPendingReq, res: IIncomeGetPendingRes) {
        const pending = CopperIncome.pendingOffline(this.user)
        res.level = this.user.lv
        res.intervalSeconds = CopperIncome.INTERVAL_SECONDS
        res.perInterval = CopperIncome.perInterval(this.user.lv)
        res.offlineSeconds = pending.offlineSeconds
        res.offlineCopper = pending.copper
        res.copper = this.user.copper
    }
}
