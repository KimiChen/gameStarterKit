import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaActivityFraction } from '../models/TaActivityFraction'

/**
 * taActivity_activityFraction
 * 事件名:活动积分
 * 说明:活动积分变更时推送
 * @param user User
 */
export function taActivity_activityFraction(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaActivityFraction()

        // 字段名:冲榜名称,示例:战力冲榜
        obj.act_name = ''
        // 字段名:变更前,示例:1
        obj.before = 0
        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更后,示例:2
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
