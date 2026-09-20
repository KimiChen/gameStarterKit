import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaArmSkin } from '../models/TaArmSkin'

/**
 * taArmSkin_armSkin
 * 事件名:至宝
 * 说明:至宝获取后推送
 * @param user User
 */
export function taArmSkin_armSkin(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaArmSkin()

        // 字段名:至宝名称,示例:绝世剑
        obj.arm_skin_name = ''
        // 字段名:至宝品质,示例:甲级兵器
        obj.arm_skin_quality = ''
        // 字段名:至宝ID,示例:6666
        obj.arm_skin_id = 0
        // 字段名:变更原因,示例:激活/已拥有转耐久
        obj.reason = ''
        // 字段名:激活原因,示例:万圣节活动激活
        obj.activation_reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
