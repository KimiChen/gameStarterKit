import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaAchieveLabel } from '../models/TaAchieveLabel'

/**
 * taAchieve_achieveLabel
 * 事件名:成就标签
 * 说明:成就标签状态变更时推送
 * @param user User
 */
export function taAchieve_achieveLabel(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaAchieveLabel()

        // 字段名:标签名称,示例:我我我
        obj.label_name = ''
        // 字段名:标签品质,示例:绿色
        obj.label_quality = ''
        // 字段名:标签描述,示例:你你你
        obj.label_describe = ''
        // 字段名:标签状态,示例:穿戴/获取/卸下
        obj.label_stute = ''
        // 字段名:标签坑位,示例:1号位
        obj.label_position = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
