import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaMagicalDurability } from '../models/TaMagicalDurability'

/**
 * taMagical_magicalDurability
 * 事件名:神通耐久度
 * 说明:神通耐久度变更后推送
 * @param user User
 */
export function taMagical_magicalDurability(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaMagicalDurability()

        // 字段名:神通名称,示例:龙刀
        obj.magical_name = ''
        // 字段名:神通品质,示例:甲级兵器
        obj.magical_quality = ''
        // 字段名:神通id,示例:6666
        obj.magical_id = 0
        // 字段名:变更值,示例:-1
        obj.change = 0
        // 字段名:变更后,示例:0
        obj.after = 0
        // 字段名:变更原因,示例:恢复/消耗
        obj.reason = ''
        // 字段名:场景,示例:XX地图
        obj.scene = ''

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
