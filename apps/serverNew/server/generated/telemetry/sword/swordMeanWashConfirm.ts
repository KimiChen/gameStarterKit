import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaSwordMeanWashConfirm } from '../models/TaSwordMeanWashConfirm'

/**
 * taSword_swordMeanWashConfirm
 * 事件名:洗练确认
 * 说明:洗练确认
 * @param user User
 */
export function taSword_swordMeanWashConfirm(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaSwordMeanWashConfirm()

        // 字段名:器灵品质,示例:绿色
        obj.sword_mean_quality = ''
        // 字段名:孔位,示例:1
        obj.sword_mean_position = 0
        // 字段名:名称,示例:XXX
        obj.sword_mean_name = ''
        // 字段名:属性,示例:力量+1、暴击+10%
        obj.attribute = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
