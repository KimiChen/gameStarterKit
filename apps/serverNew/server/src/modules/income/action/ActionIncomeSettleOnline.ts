import { timestamp } from '@arthropoda/game-engine'
import type {
    IIncomeSettleOnlineReq,
    IIncomeSettleOnlineRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

export class ActionIncomeSettleOnline extends GameAction {
    async doAction(_req: IIncomeSettleOnlineReq, res: IIncomeSettleOnlineRes) {
        const copper = CopperIncome.settleOnline(this.user, timestamp())
        res.copper = copper
        res.balance = this.user.copper
    }
}
