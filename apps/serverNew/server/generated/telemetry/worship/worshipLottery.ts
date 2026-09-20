import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaWorshipLottery } from '../models/TaWorshipLottery'

/**
 * taWorship_worshipLottery
 * 事件名:供奉洗练
 * 说明:供奉洗练后推送
 * @param user User
 */
export function taWorship_worshipLottery(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaWorshipLottery()

        // 字段名:技能品质,示例:绿色
        obj.quality = ''
        // 字段名:部位,示例:1
        obj.slotId = 0
        // 字段名:名称,示例:XXX
        obj.name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
