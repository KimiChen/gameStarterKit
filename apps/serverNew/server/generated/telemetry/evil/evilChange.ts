import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaEvilChange } from '../models/TaEvilChange'

/**
 * taEvil_evilChange
 * 事件名:罪恶值变更
 * 说明:罪恶值变更时推送
 * @param user User
 */
export function taEvil_evilChange(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaEvilChange()

        // 字段名:变更前,示例:1
        obj.before = 0
        // 字段名:变更后,示例:1
        obj.after = 0
        // 字段名:变更值,示例:2
        obj.change = 0
        // 字段名:变更原因,示例:击杀玩家/时间恢复
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
