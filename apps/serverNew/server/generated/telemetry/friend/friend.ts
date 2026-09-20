import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaFriend } from '../models/TaFriend'

/**
 * taFriend_friend
 * 事件名:好友变更
 * 说明:好友变更时推送
 * @param user User
 */
export function taFriend_friend(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaFriend()

        // 字段名:好友角色id,示例:678910
        obj.friend_user_id = ''
        // 字段名:好友角色昵称,示例:小侠
        obj.friend_user_name = ''
        // 字段名:变更原因,示例:添加
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
