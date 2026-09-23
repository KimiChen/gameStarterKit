import type {
    IIncomeClaimOfflineReq,
    IIncomeClaimOfflineRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

export class ActionIncomeClaimOffline extends GameAction {
    async doAction(_req: IIncomeClaimOfflineReq, res: IIncomeClaimOfflineRes) {
        const claimed = CopperIncome.claimOffline(this.user)
        res.copper = claimed.copper
        res.offlineSeconds = claimed.offlineSeconds
        res.balance = this.user.copper
    }
}
