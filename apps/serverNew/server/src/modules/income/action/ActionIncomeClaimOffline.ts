import type {
    IIncomeClaimOfflineReq,
    IIncomeClaimOfflineRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

export class ActionIncomeClaimOffline extends GameAction {
    async doAction(_req: IIncomeClaimOfflineReq, res: IIncomeClaimOfflineRes) {
        if (!this.user) {
            res.copper = 0
            res.offlineSeconds = 0
            res.balance = 0
            return
        }
        const claimed = CopperIncome.claimOffline(this.user)
        res.copper = claimed.copper
        res.offlineSeconds = claimed.offlineSeconds
        res.balance = this.user.copper
    }
}
