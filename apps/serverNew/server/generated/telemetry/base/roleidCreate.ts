import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaRoleidCreate } from '../models/TaRoleidCreate'

/**
 * taBase_roleidCreate
 * 事件名:创建角色id
 * 说明:创建角色id后推送
 * @param user User
 */
export function taBase_roleidCreate(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaRoleidCreate()

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
