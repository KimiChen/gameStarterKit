import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaLimitGift } from '../models/TaLimitGift'

/**
 * taGift_limitGift
 * 事件名:限时礼包
 * 说明:限时礼包触发或购买后推送
 * @param user User
 */
export function taGift_limitGift(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaLimitGift()

        // 字段名:礼包类型,示例:神兵助力礼包
        obj.gift_type = ''
        // 字段名:描述,示例:神兵达到29级
        obj.gift_desc = ''
        // 字段名:礼包名称,示例:神兵助力礼包-1
        obj.gift_name = ''
        // 字段名:价格,示例:12
        obj.gift_price = 0
        // 字段名:礼包内容,示例:武学币x100，杀气x100
        obj.gift_content = []
        // 字段名:变更原因,示例:触发
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
