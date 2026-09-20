import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaAttrChange } from '../models/TaAttrChange'

/**
 * taAttr_attrChange
 * 事件名:属性变更
 * 说明:属性点变更值推送
 * @param user User
 */
export function taAttr_attrChange(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaAttrChange()

        // 字段名:变更前,示例:1
        obj.before = 0
        // 字段名:变更值,示例:1
        obj.change = 0
        // 字段名:变更后,示例:2
        obj.after = 0
        // 字段名:剩余属性点,示例:1
        obj.surplus = 0
        // 字段名:属性,示例:力量
        obj.attr_name = ''
        // 字段名:变更原因,示例:加点/洗点
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
