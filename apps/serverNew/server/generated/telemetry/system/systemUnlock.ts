import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaSystemUnlock } from '../models/TaSystemUnlock'

/**
 * taSystem_systemUnlock
 * 事件名:系统解锁
 * 说明:解锁系统时推送
 * @param user User
 */
export function taSystem_systemUnlock(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaSystemUnlock()

        // 字段名:系统名称,示例:兵器
        obj.system_name = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
