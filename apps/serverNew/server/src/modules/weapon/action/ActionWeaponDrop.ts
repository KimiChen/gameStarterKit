import { GameAction } from '../../../runtime/action/GameAction'
import { ReqWeaponDrop, ResWeaponDrop } from '../WeaponC2S'
import { WeaponProgression } from './WeaponProgression'

/**
 * 丢弃洗练
 */
export class ActionWeaponDrop extends GameAction {
    async doAction(req: ReqWeaponDrop, res: ResWeaponDrop) {
        const soul = WeaponProgression.getSoul(this.user, req.slotId)
        soul.newQuality = 0
        soul.newBaseFp = 0
        soul.newSpecialFp = 0
        soul.newAttrs.clear()
    }
}
