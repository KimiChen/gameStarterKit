import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaOrderFinish } from '../models/TaOrderFinish'

/**
 * taOrder_orderFinish
 * 事件名:订单完成
 * 说明:订单完成时推送
 * @param user User
 */
export function taOrder_orderFinish(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaOrderFinish()

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
        // 字段名:合作方订单号,示例:hzfddh111
        obj.ext_order_id = ''
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
        // 字段名:当日充值次数,示例:4
        obj.daily_recharge_times = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
