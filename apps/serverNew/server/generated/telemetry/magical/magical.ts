import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaMagical } from '../models/TaMagical'

/**
 * taMagical_magical
 * 事件名:神通
 * 说明:神通获取后推送
 * @param user User
 */
export function taMagical_magical(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaMagical()

        // 字段名:神通名称,示例:绝世剑
        obj.magical_name = ''
        // 字段名:神通品质,示例:甲级兵器
        obj.magical_quality = ''
        // 字段名:神通id,示例:6666
        obj.magical_id = 0
        // 字段名:变更原因,示例:激活/已拥有转耐久
        obj.reason = ''
        // 字段名:激活原因,示例:万圣节活动激活
        obj.activation_reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
