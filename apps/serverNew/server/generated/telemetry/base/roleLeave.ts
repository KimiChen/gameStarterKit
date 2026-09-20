import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaRoleLeave } from '../models/TaRoleLeave'

/**
 * taBase_roleLeave
 * 事件名:角色登出
 * 说明:角色登出后推送
 * @param user User
 */
export function taBase_roleLeave(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaRoleLeave()

        // 字段名:设备型号,示例:iPhone11
        obj.device_model = ''
        // 字段名:网络状态,示例:WiFi
        obj.network_type = ''
        // 字段名:IP,示例:192.168.1.1
        obj.ip = ''
        // 字段名:登录渠道,示例:1
        obj.login_source = ''
        // 字段名:客户端版本,示例:1.1.1
        obj.client_ver = ''
        // 字段名:服务端版本,示例:2.2.2
        obj.server_ver = ''
        // 字段名:是否付费,示例:是
        obj.is_pay = false
        // 字段名:当次在线时长,示例:1
        obj.online_time = 0
        // 字段名:客户端平台,示例:mac/IOS/WINDOWS/Android
        obj.platform = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
