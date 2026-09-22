import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { CopperIncome } from '../../user/action/CopperIncome'

/** 原生 Lobby 认证后的离线收益暂存入口；必须走完整 User Bean Action 生命周期。 */
export class ActionIncomeParkOffline extends GameAction {
    async doAction() {
        if (!this.user) return
        CopperIncome.parkOffline(this.user, timestamp())
    }
}
