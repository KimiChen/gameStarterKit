import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaBootyUpgrade } from '../models/TaBootyUpgrade'

/**
 * taBooty_bootyUpgrade
 * 事件名:奇珍升级
 * 说明:奇珍升级变更后推送
 * @param user User
 */
export function taBooty_bootyUpgrade(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaBootyUpgrade()

        // 字段名:奇珍名称,示例:九阳盾
        obj.booty_name = ''
        // 字段名:奇珍品质,示例:1
        obj.booty_quality = ''
        // 字段名:奇珍星级,示例:1
        obj.booty_star = 0
        // 字段名:奇珍id,示例:6666
        obj.booty_id = 0
        // 字段名:变更前,示例:1
        obj.before = 0
        // 字段名:变更值,示例:-1
        obj.change = 0
        // 字段名:变更后,示例:2
        obj.after = 0
        // 字段名:变更原因,示例:奇珍穿戴
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
