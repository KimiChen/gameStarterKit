import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaOrderInit } from '../models/TaOrderInit'

/**
 * taOrder_orderInit
 * 事件名:发起订单
 * 说明:用户发起充值订单时推送
 * @param user User
 */
export function taOrder_orderInit(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaOrderInit()

        // 字段名:计费点id,示例:1
        obj.recharge_id = ''
        // 字段名:商品类型,示例:日礼包
        obj.recharge_type = ''
        // 字段名:商品项,示例:1
        obj.gift_id = ''
        // 字段名:礼包名称,示例:6元武学日礼包
        obj.gift_name = ''
        // 字段名:订单号,示例:ddh111
        obj.order_id = ''
        // 字段名:支付金额,示例:10
        obj.pay_amount = 0
        // 字段名:支付美元金额,示例:10
        obj.pay_amount_usd = 0
        // 字段名:充值ip,示例:192.168.1.1
        obj.ip = ''
        // 字段名:是否首次充值,示例:是
        obj.is_first_pay = false
        // 字段名:充值渠道,示例:1
        obj.pay_source = ''
        // 字段名:当前体力值,示例:1
        obj.current_phy = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
