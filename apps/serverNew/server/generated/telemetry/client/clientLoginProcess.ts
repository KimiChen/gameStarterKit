import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaClientLoginProcess } from '../models/TaClientLoginProcess'

/**
 * taClient_clientLoginProcess
 * 事件名:客户端登录流程
 * 说明:完成各登录流程后推送，登录流程按原需求
 * @param user User
 */
export function taClient_clientLoginProcess(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaClientLoginProcess()

        // 字段名:账号,示例:asdf1234
        obj.open_id = ''
        // 字段名:事件类型,示例:0
        obj.event_type = ''
        // 字段名:大类ID,示例:1
        obj.guide_Id = ''
        // 字段名:客户端事件ID,示例:1
        obj.client_event_id = ''
        // 字段名:客户端事件名称,示例:初始化SDK
        obj.client_event_name = ''
        // 字段名:客户端事件时间,示例:1619147713616
        obj.event_time = 0
        // 字段名:其他参数,示例:0
        obj.other = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
