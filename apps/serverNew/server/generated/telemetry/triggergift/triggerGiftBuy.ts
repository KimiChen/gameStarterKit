import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaTriggerGiftBuy } from '../models/TaTriggerGiftBuy'

/**
 * taTriggerGift_triggerGiftBuy
 * 事件名:购买日志
 * 说明:购买时推送
 * @param user User
 */
export function taTriggerGift_triggerGiftBuy(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaTriggerGiftBuy()

        // 字段名:礼包id,示例:null
        obj.trigger_gift_id = ''
        // 字段名:礼包名称,示例:null
        obj.trigger_gift_name = ''
        // 字段名:礼包价格,示例:null
        obj.trigger_gift_price = 0
        // 字段名:剩余购买次数,示例:null
        obj.remaining_num = ''
        // 字段名:购买时触发剩余时间,示例:null
        obj.remaining_time = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
