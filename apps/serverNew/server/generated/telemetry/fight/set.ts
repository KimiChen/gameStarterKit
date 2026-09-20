import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaSet } from '../models/TaSet'

/**
 * taFight_set
 * 事件名:勾选设置
 * 说明:至宝、时装等勾选状态修改时推送
 * @param user User
 */
export function taFight_set(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaSet()

        // 字段名:勾选类型,示例:神兵/时装
        obj.set_type = ''
        // 字段名:设置前,示例:无勾选
        obj.set_before = ''
        // 字段名:设置后,示例:对玩家生效
        obj.set_after = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
