import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { UserFp } from '../../user/action/UserFp'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqWeaponWear, ResWeaponWear } from '../WeaponC2S'
import { WeaponErrors } from '../WeaponErrors'
import { WeaponProgression } from './WeaponProgression'

/**
 * 穿戴至宝
 */
export class ActionWeaponWear extends GameAction {
    async doAction(req: ReqWeaponWear, res: ResWeaponWear) {
        const user = this.user
        const rareId = req.rareId

        // 卸下至宝
        if (!rareId) {
            WeaponProgression.unloadRare(user)
            return
        }

        // 未拥有
        if (!user.weapon.rares.has(rareId)) {
            throw WeaponErrors.WeaponNoRare
        }

        if (user.weapon.rareId === rareId) {
            throw SystemErrors.SysParamError
        }

        // 耐久不足
        if (user.weapon.rares.get(rareId)!.durable <= 0) {
            throw SystemErrors.SysParamError
        }

        user.weapon.rareId = rareId

        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_RARE_WEAR)

        // 同步到场景
    }
}
