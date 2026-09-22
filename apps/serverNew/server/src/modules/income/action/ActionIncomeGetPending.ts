import type {
    IIncomeGetPendingReq,
    IIncomeGetPendingRes,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc/domains/income'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

export class ActionIncomeGetPending extends GameAction {
    async doAction(_req: IIncomeGetPendingReq, res: IIncomeGetPendingRes) {
        if (!this.user) {
            Object.assign(res, {
                level: 0,
                intervalSeconds: CopperIncome.INTERVAL_SECONDS,
                perInterval: 0,
                offlineSeconds: 0,
                offlineCopper: 0,
                copper: 0,
            })
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
