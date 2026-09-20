import { timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { TitleErrors } from '../TitleErrors'
import { ReqTitleActivate } from '../TitleC2S'
import { TitleDefine } from '../rules/TitleDefine'
import { ActionTitle } from './ActionTitle'

/**
 * 领取日常类称号
 */
export class ActionTitleActivate extends ActionTitle {
    async doAction(req: ReqTitleActivate, res: ResDefault) {
        const titleId = req.titleId
        if (titleId <= 0) {
            throw SystemErrors.SysParamError.params({ vars: { titleId } })
        }
        if (!C.title().has(titleId)) {
            throw TitleErrors.TitleNotExist.params({ vars: { titleId } })
        }
        // 冲榜类称号的有效期自榜单结算时开始计算，只能由榜单结算发放
        if (C.title(titleId).type !== TitleDefine.TYPE_DAILY) {
            throw TitleErrors.TitleRankNotClaimable.params({ vars: { titleId } })
        }
        ActionTitle.grant(this.user, titleId, timestamp())
    }
}
