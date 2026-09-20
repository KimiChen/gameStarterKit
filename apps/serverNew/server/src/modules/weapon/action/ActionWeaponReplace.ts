import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { UserFp } from '../../user/action/UserFp'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqWeaponReplace, ResWeaponReplace } from '../WeaponC2S'
import { WeaponProgression } from './WeaponProgression'

/**
 * 器灵-替换属性
 */
export class ActionWeaponReplace extends GameAction {
    async doAction(req: ReqWeaponReplace, res: ResWeaponReplace) {
        const user = this.user

        const slotId = req.slotId
        const soul = WeaponProgression.getSoul(user, slotId)

        // 未洗练
        if (!soul.newQuality || soul.newAttrs.size() <= 0) {
            throw SystemErrors.SysParamError
        }

        // 替换新属性
        soul.quality = soul.newQuality
        soul.baseFp = soul.newBaseFp
        soul.specialFp = soul.newSpecialFp
        soul.attrs.init(soul.newAttrs.copy())

        // 删除新属性
        soul.newQuality = 0
        soul.newBaseFp = 0
        soul.newSpecialFp = 0
        soul.newAttrs.clear()

        //  更新模块属性
        Attr.updateAttrModItem(user, AttrModDefine.Soul, WeaponProgression.getSoulAttrs(user))

        // 更新法宝模块战力
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_SOUL_BASE)
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_SOUL_SPECIAL)
    }
}
