import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildMiji } from '../models/TaGuildMiji'

/**
 * taGuild_guildMiji
 * 事件名:妖盟点修
 * 说明:妖盟点修变更后推送
 * @param user User
 */
export function taGuild_guildMiji(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildMiji()

        // 字段名:妖盟ID,示例:1
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:来辣
        obj.guild_name = ''
        // 字段名:秘籍名称,示例:技能名称1
        obj.miji_name = ''
        // 字段名:秘籍类型,示例:增伤
        obj.miji_type = ''
        // 字段名:变更后,示例:1200
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
