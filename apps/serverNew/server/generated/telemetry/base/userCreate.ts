import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaUserCreate } from '../models/TaUserCreate'

/**
 * taBase_userCreate
 * 事件名:首次账号登录
 * 说明:首次账号登录后推送(服务端传，需确保创建必然=首次账号登陆)
 * @param user User
 */
export function taBase_userCreate(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaUserCreate()

        // 字段名:设备型号,示例:iPhone11
        obj.device_model = ''
        // 字段名:网络状态,示例:WiFi
        obj.network_type = ''
        // 字段名:IP,示例:192.168.1.1
        obj.ip = ''
        // 字段名:操作系统,示例:如 Android、iOS 等
        obj.os = ''
        // 字段名:操作系统版本,示例:iOS 11.2.2、Android 8.0.0 等
        obj.os_version = ''
        // 字段名:登录渠道,示例:1
        obj.login_source = ''
        // 字段名:客户端版本,示例:1.1.1
        obj.client_ver = ''
        // 字段名:服务端版本,示例:2.2.2
        obj.server_ver = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
