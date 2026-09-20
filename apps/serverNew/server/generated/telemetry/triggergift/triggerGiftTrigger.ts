import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaTriggerGiftTrigger } from '../models/TaTriggerGiftTrigger'

/**
 * taTriggerGift_triggerGiftTrigger
 * 事件名:触发日志
 * 说明:触发时推送
 * @param user User
 */
export function taTriggerGift_triggerGiftTrigger(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaTriggerGiftTrigger()

        // 字段名:礼包id,示例:null
        obj.trigger_gift_id = ''
        // 字段名:礼包名称,示例:null
        obj.trigger_gift_name = ''
        // 字段名:礼包价格,示例:null
        obj.trigger_gift_price = 0
        // 字段名:购买次数,示例:null
        obj.remaining_num = ''
        // 字段名:礼包限购时间,示例:X小时
        obj.remaining_time = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
