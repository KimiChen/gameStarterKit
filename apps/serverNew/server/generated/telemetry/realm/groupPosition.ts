import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGroupPosition } from '../models/TaGroupPosition'

/**
 * taRealm_groupPosition
 * 事件名:境界提升
 * 说明:境界提升时推送
 * @param user User
 */
export function taRealm_groupPosition(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGroupPosition()

        // 字段名:是否成功,示例:失败/成功
        obj.is_success = false
        // 字段名:变更前职位,示例:教徒
        obj.pos_before = ''
        // 字段名:变更后职位,示例:地字门徒
        obj.pos_after = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
