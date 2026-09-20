import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildLeader } from '../models/TaGuildLeader'

/**
 * taGuild_guildLeader
 * 事件名:帮主变更
 * 说明:帮主变更后推送
 * @param user User
 */
export function taGuild_guildLeader(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildLeader()

        // 字段名:妖盟ID,示例:1
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:来辣
        obj.guild_name = ''
        // 字段名:新帮主角色ID,示例:1
        obj.new_leader_id = ''
        // 字段名:变更原因,示例:自动转移/帮主转移/妖盟创建
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
