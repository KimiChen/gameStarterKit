import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaClothing } from '../models/TaClothing'

/**
 * taClothing_clothing
 * 事件名:时装
 * 说明:时装获取后推送
 * @param user User
 */
export function taClothing_clothing(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaClothing()

        // 字段名:时装名称,示例:绝世剑
        obj.clothing_name = ''
        // 字段名:时装品质,示例:甲级兵器
        obj.clothing_quality = ''
        // 字段名:时装id,示例:6666
        obj.clothing_id = 0
        // 字段名:变更原因,示例:激活/已拥有转耐久
        obj.reason = ''
        // 字段名:激活原因,示例:万圣节活动激活
        obj.activation_reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
