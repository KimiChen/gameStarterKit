import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqPracticeNpcSkinIn, ResPracticeNpcSkinIn } from '../PracticeC2S'

/**
 * npc皮肤穿戴
 */
export class ActionPracticeNpcSkinIn extends GameAction {
    async doAction(req: ReqPracticeNpcSkinIn, res: ResPracticeNpcSkinIn) {
        const skinId = req.skinId
        const user = this.user
        const conf = C.sterious_man_through(user.practice.practiceNpcBreakLv)
        if (conf.skinId === skinId) {
            user.practice.practiceNpcSkinId = skinId
            return
        }
        // 未拥有该皮肤
        if (skinId && user.practice.practiceNpcSkins.has(skinId)) {
            throw SystemErrors.SysParamError
        }

        user.practice.practiceNpcSkinId = skinId
        return
    }
}
