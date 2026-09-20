import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqPayClick, ResPayClick } from '../PayC2S'
import { GameEndpoint } from '../checkout/GameEndpoint'
import { PayClickFactory } from '../checkout/PayClickFactory'
import { PayCheckoutRules, PayExtraParams } from '../checkout/PayCheckoutRules'

/**
 * 点击充值
 */
export class ActionPayClick extends GameAction {
    async doAction(req: ReqPayClick, res: ResPayClick) {
        const id = req.id
        if (!req.channel) {
            throw SystemErrors.SysParamError
        }

        // 计费点配置
        const config = C.recharge(id)

        // 充值动态参数，方便后续向方法中动态注入参数
        const params: PayExtraParams = {
            giftId: req.giftId ?? 0,
            channel: req.channel,
            activityName: req.activityName ?? '',
        }

        // 校验玩家购买状态
        const user = this.user
        PayCheckoutRules.checkBuyStatus(user, config, params)

        // 创建充值信息
        PayClickFactory.create(user, config, params)

        res.id = id
        res.name = config.name
        res.roleId = this.user.id
        res.price = config.recharge
        res.payback = GameEndpoint.getApiUrl()

        return
    }
}
