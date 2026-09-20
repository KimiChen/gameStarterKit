import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaGuildTactics } from '../models/TaGuildTactics'

/**
 * taGuild_guildTactics
 * 事件名:妖盟阵法
 * 说明:妖盟阵法等级变更后推送
 * @param user User
 */
export function taGuild_guildTactics(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaGuildTactics()

        // 字段名:妖盟ID,示例:1
        obj.guild_id = ''
        // 字段名:妖盟名称,示例:来辣
        obj.guild_name = ''
        // 字段名:阵法名称,示例:两仪阵
        obj.tactics_name = ''
        // 字段名:变更后,示例:2
        obj.after = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
