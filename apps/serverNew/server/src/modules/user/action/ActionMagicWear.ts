import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqMagicWear, ResMagicWear } from '../UserC2S'
import { UserErrors } from '../UserErrors'
import { PowerScoreRules } from '../rules/PowerScoreRules'
import { UserFp } from './UserFp'
import { UserMagicWear } from './UserMagicWear'

/**
 * 穿戴神通
 */
export class ActionMagicWear extends GameAction {
    async doAction(req: ReqMagicWear, res: ResMagicWear) {
        const user = this.user
        const magicId = req.magicId

        // 卸下神通
        if (magicId == 0) {
            UserMagicWear.unload(user)
            return
        }

        // 未拥有
        const magicItem = user.gong.magics.get(magicId)
        if (magicItem == null) {
            throw UserErrors.MagicNoHave
        }

        // 耐久不足
        if (magicItem.durable <= 0) {
            throw SystemErrors.SysParamError
        }

        if (user.gong.magicId == magicItem.magicId) {
            throw SystemErrors.SysParamError
        }

        user.gong.magicId = magicItem.magicId

        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_WEAPON)

        // 同步到场景
    }
}
