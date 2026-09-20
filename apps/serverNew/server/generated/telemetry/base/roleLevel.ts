import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaRoleLevel } from '../models/TaRoleLevel'

/**
 * taBase_roleLevel
 * 事件名:角色等级
 * 说明:角色等级变更后推送
 * @param user User
 */
export function taBase_roleLevel(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaRoleLevel()

        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更前,示例:1
        obj.before = 0
        // 字段名:变更后,示例:2
        obj.after = 0
        // 字段名:变更原因,示例:升级
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
