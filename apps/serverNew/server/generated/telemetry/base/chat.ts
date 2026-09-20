import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaChat } from '../models/TaChat'

/**
 * taBase_chat
 * 事件名:聊天
 * 说明:玩家聊天时推送
 * @param user User
 */
export function taBase_chat(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaChat()

        // 字段名:聊天类型,示例:世界聊天/私聊/山头
        obj.chat_type = ''
        // 字段名:聊天对象,示例:XXX
        obj.chat_object = ''
        // 字段名:对象ID,示例:123124
        obj.chat_id = 0
        // 字段名:聊天内容,示例:123
        obj.chat_content = ''
        // 字段名:聊天方式,示例:分享装备/协助分享/正常交流
        obj.share_type = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
