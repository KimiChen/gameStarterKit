import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaSwordMeanWash } from '../models/TaSwordMeanWash'

/**
 * taSword_swordMeanWash
 * 事件名:器灵洗练
 * 说明:器灵洗练后推送
 * @param user User
 */
export function taSword_swordMeanWash(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaSwordMeanWash()

        // 字段名:器灵品质,示例:绿色
        obj.sword_mean_quality = ''
        // 字段名:孔位,示例:1
        obj.sword_mean_position = 0
        // 字段名:名称,示例:XXX
        obj.sword_mean_name = ''
        // 字段名:变更前属性,示例:力量+1、暴击+10%
        obj.attribute_before = ''
        // 字段名:变更后属性,示例:力量+1、暴击+15%
        obj.attribute_after = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
