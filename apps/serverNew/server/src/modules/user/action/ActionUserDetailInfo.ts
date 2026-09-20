import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqUserDetailInfo, ResUserDetailInfo } from '../UserC2S'
import { User } from '../bean/User'

/**
 * 用户详情信息
 */
export class ActionUserDetailInfo extends GameAction {
    async doAction(req: ReqUserDetailInfo, res: ResUserDetailInfo) {
        const user = await User.loadOnlyRead(req.uId)
        if (!user) {
            throw SystemErrors.SysParamErr
        }

        res.user = user.toModData() as any
    }
}
