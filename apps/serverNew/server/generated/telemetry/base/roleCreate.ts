import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaRoleCreate } from '../models/TaRoleCreate'

/**
 * taBase_roleCreate
 * 事件名:创建角色
 * 说明:创建角色后推送
 * @param user User
 */
export function taBase_roleCreate(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaRoleCreate()

        // 字段名:设备型号,示例:iPhone11
        obj.device_model = ''
        // 字段名:网络状态,示例:WiFi
        obj.network_type = ''
        // 字段名:IP,示例:192.168.1.1
        obj.ip = ''
        // 字段名:性别,示例:男
        obj.sex = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
