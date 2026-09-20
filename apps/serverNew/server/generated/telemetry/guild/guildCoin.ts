import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildCoin } from '../models/TaGuildCoin'

/**
 * taGuild_guildCoin
 * 事件名:妖丹
 * 说明:妖丹变更后推送
 * @param user User
 */
export function taGuild_guildCoin(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildCoin()

        // 字段名:妖盟ID,示例:1
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:来辣
        obj.guild_name = ''
        // 字段名:妖盟等级,示例:2
        obj.guild_level = 0
        // 字段名:变更值,示例:500
        obj.change = 0
        // 字段名:变更后,示例:1700
        obj.after = 0
        // 字段名:变更原因,示例:击杀妖盟boss
        obj.reason = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
