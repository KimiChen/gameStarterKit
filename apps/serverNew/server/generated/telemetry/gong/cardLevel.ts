import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaCardLevel } from '../models/TaCardLevel'

/**
 * taGong_cardLevel
 * 事件名:功法等级
 * 说明:功法等级变更后推送
 * @param user User
 */
export function taGong_cardLevel(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaCardLevel()

        // 字段名:功法名称,示例:易筋经一重
        obj.card_name = ''
        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更后,示例:1
        obj.after = 0
        // 字段名:变更原因,示例:功法升级
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
