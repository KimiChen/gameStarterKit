import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildWealth } from '../models/TaGuildWealth'

/**
 * taGuild_guildWealth
 * 事件名:妖盟财富
 * 说明:妖盟财富变更后推送
 * @param user User
 */
export function taGuild_guildWealth(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildWealth()

        // 字段名:妖盟ID,示例:1
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:来辣
        obj.guild_name = ''
        // 字段名:妖盟等级,示例:2
        obj.guild_level = 0
        // 字段名:变更值,示例:-2000
        obj.change = 0
        // 字段名:变更后,示例:1200
        obj.after = 0
        // 字段名:变更原因,示例:求贤阁-周芷若
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
