import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildCreate } from '../models/TaGuildCreate'

/**
 * taGuild_guildCreate
 * 事件名:妖盟创建
 * 说明:妖盟创建后推送
 * @param user User
 */
export function taGuild_guildCreate(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildCreate()

        // 字段名:妖盟ID,示例:10
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:11
        obj.guild_name = ''
        // 字段名:妖盟等级,示例:1
        obj.guild_level = 0
        // 字段名:妖盟职位,示例:帮主
        obj.position = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
