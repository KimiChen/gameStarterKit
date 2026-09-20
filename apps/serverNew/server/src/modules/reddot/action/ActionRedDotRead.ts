import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqRedDotRead } from '../RedDotC2S'
import { RedDotDefine } from '../rules/RedDotDefine'
import { RedDotStateSync } from '../state/RedDotStateSync'
import { RedDotList } from '../state/RedDotList'

/**
 *  一次性的红点，客户端手动消除
 */
export class ActionRedDotRead extends GameAction {
    async doAction(req: ReqRedDotRead, res: ResDefault) {
        const user = this.user

        if (!req.type) {
            throw SystemErrors.SysParamError.params({ vars: req })
        }

        if (req.key.length > 0 && RedDotList.REDDOT_MAP.includes(req.type)) {
            RedDotList.clearRedDot(user, req.type, req.key, req.extraId)
        } else if (RedDotDefine.REDDOT_MAP.includes(req.type)) {
            RedDotStateSync.clearRedDot(user, req.type, req.extraId)
        } else {
            throw SystemErrors.SysParamError.params({ vars: req })
        }

        return
    }
}
