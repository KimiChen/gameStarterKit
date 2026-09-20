import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaArm } from '../models/TaArm'

/**
 * taArm_arm
 * 事件名:法宝等级
 * 说明:法宝等级变更后推送
 * @param user User
 */
export function taArm_arm(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaArm()

        // 字段名:法宝名称,示例:锈剑
        obj.arm_name = ''
        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更后,示例:2
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
