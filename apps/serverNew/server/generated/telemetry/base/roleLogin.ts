import { timestamp } from '@arthropoda/game-engine'
import { UserLoginProfile } from '../../../src/modules/user/action/UserLoginProfile'
import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaRoleLogin } from '../models/TaRoleLogin'
import { TaUserData } from '../models/TaUserData'

/**
 * taBase_roleLogin
 * 事件名:角色登录
 * 说明:角色登录后推送
 * @param user User
 */
export async function taBase_roleLogin(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const loginInfo = await UserLoginProfile.load(user.openid)

        const obj = new TaRoleLogin()

        // 字段名:设备型号,示例:iPhone11
        obj.device_model = loginInfo.device_model
        // 字段名:网络状态,示例:WiFi
        obj.network_type = loginInfo.netType
        // 字段名:IP,示例:192.168.1.1
        obj.ip = loginInfo.ip
        // 字段名:操作系统,示例:如 Android、iOS 等
        obj.os = loginInfo.os
        // 字段名:操作系统版本,示例:iOS 11.2.2、Android 8.0.0 等
        obj.os_version = loginInfo.osVersion
        // 字段名:登录渠道,示例:1
        obj.login_source = loginInfo.loginType
        // 字段名:客户端版本,示例:1.1.1
        obj.client_ver = loginInfo.clientVer
        // 字段名:服务端版本,示例:2.2.2
        obj.server_ver = ''
        // 字段名:是否付费,示例:是
        obj.is_pay = false
        // 字段名:客户端平台,示例:mac/IOS/WINDOWS/Android
        obj.platform = ''

        UserTelemetryContext.record(obj, user)
        UserTelemetryContext.updateUserProperties(user.id.toString(), {
            [TaUserData.OPEN_ID]: user.openid,
            [TaUserData.SERVER]: user.sId,
            [TaUserData.FIRST_LOGIN_TIME]: timestamp(),
            [TaUserData.LAST_LOGIN_TIME]: timestamp(),
            [TaUserData.TOTAL_LOGIN]: 1,
        })
    } catch (e) {
        Log.error(e)
    }
}
