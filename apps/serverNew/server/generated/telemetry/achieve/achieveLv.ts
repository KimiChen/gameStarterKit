import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaAchieveLv } from '../models/TaAchieveLv'

/**
 * taAchieve_achieveLv
 * 事件名:成就等级
 * 说明:成就等级状态变更时推送
 * @param user User
 */
export function taAchieve_achieveLv(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaAchieveLv()

        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更后,示例:2
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
