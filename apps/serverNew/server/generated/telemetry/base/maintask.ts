import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaMaintask } from '../models/TaMaintask'

/**
 * taBase_maintask
 * 事件名:主线任务
 * 说明:主线任务状态变更后推送
 * @param user User
 */
export function taBase_maintask(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaMaintask()

        // 字段名:主线任务类型,示例:1
        obj.maintask_type = ''
        // 字段名:主线任务ID,示例:1001
        obj.maintask_id = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
