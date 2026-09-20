import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildOut } from '../models/TaGuildOut'

/**
 * taGuild_guildOut
 * 事件名:退出妖盟
 * 说明:退出妖盟后推送
 * @param user User
 */
export function taGuild_guildOut(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildOut()

        // 字段名:妖盟ID,示例:10
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:11
        obj.guild_name = ''
        // 字段名:妖盟等级,示例:1
        obj.guild_level = 0
        // 字段名:妖盟职位,示例:帮主
        obj.guild_position = ''
        // 字段名:帮主角色ID,示例:1
        obj.leader_id = ''
        // 字段名:变更原因,示例:退出妖盟/踢出妖盟/妖盟解锁
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
