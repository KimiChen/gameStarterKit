import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaKill } from '../models/TaKill'

/**
 * taFight_kill
 * 事件名:杀敌数变更
 * 说明:杀敌数变更时推送
 * @param user User
 */
export function taFight_kill(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaKill()

        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更后,示例:2
        obj.after = 0
        // 字段名:变更原因,示例:激活XXboss/挂机获取
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
